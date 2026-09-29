import { invokeCallable } from '../calls'
import { toPrim } from '../convert'
import { CompileStop, Fault } from '../errors'
import type { Machine } from '../machine'
import { refR, truthy } from '../ops'
import { type StreamPrim, StreamVal } from '../streamValues'
import { viewItems } from '../text'
import { HeapVal, JArray, JStr, type JVal, ListVal, type R, SetVal, type Store, ViewVal } from '../values'
import { arity, element, noMethod } from './common'

type Items = IterableIterator<JVal>

const PRIM_SAM = { int: 'applyAsInt', long: 'applyAsLong', double: 'applyAsDouble' } as const
const SUPPLIER_SAM = { int: 'getAsInt', long: 'getAsLong', double: 'getAsDouble' } as const

/** An element as a lambda receives it: a primitive for IntStream and friends, a reference otherwise. */
export const elemR = (prim: StreamPrim, v: JVal): R => (prim ? { type: { t: 'prim', name: prim }, value: v } : refR(v))

/** A lambda's result as an element of a stream of `prim`. */
export const fromR = (m: Machine, prim: StreamPrim, r: R): JVal => (prim ? toPrim(r, prim) : element(m, r))

/** The functional method name Java would call for a mapping lambda on this kind of stream. */
export const mapSam = (prim: StreamPrim) => (prim ? PRIM_SAM[prim] : 'apply')

/** A stream's elements, once: a second terminal or intermediate operation is Java's IllegalStateException. */
export function take(s: StreamVal): Items {
  if (s.used) throw new Fault('IllegalStateException', 'stream has already been operated upon or closed')
  s.used = true
  return s.items
}

export const streamR = (s: StreamVal): R => refR(s, { t: 'ref', name: s.prim ? `${s.prim[0]!.toUpperCase()}${s.prim.slice(1)}Stream` : 'Stream', args: [] })

const concurrent = () => new Fault('ConcurrentModificationException')

/** A list's spliterator: binds its length when the pipeline starts, reads the live elements, and fails fast at the end. */
function* listItems(list: ListVal | HeapVal): Items {
  const expected = list.modCount
  const n = list.items.length
  for (let i = 0; i < n; i++) yield list.items[i]!
  if (list.modCount !== expected) throw concurrent()
}

function* storeItems(store: Store, items: () => JVal[]): Items {
  const expected = store.modCount
  yield* items()
  if (store.modCount !== expected) throw concurrent()
}

function* arrayItems(items: readonly JVal[], from: number, to: number): Items {
  for (let i = from; i < to; i++) yield items[i]!
}

/** `collection.stream()` for a list, queue, set or map view; null if the value is not a collection. */
export function collectionStream(m: Machine, v: JVal): StreamVal | null {
  if (v instanceof ListVal || v instanceof HeapVal) return new StreamVal(null, listItems(v), () => v.items.length)
  if (v instanceof SetVal) return new StreamVal(null, storeItems(v.store, () => v.store.entries(m).map((e) => e.key)), () => v.store.size)
  if (v instanceof ViewVal) return new StreamVal(null, storeItems(v.map.store, () => viewItems(m, v)), () => v.map.store.size)
  return null
}

const ARRAY_STREAMS: Readonly<Record<string, StreamPrim>> = { int: 'int', long: 'long', double: 'double' }

/** `Arrays.stream(array)` and `Arrays.stream(array, from, to)`. */
export function arrayStream(args: readonly R[]): R {
  arity('Arrays.stream', args, 1, 3)
  const a = args[0]!.value
  if (!(a instanceof JArray)) throw a === null ? new Fault('NullPointerException') : new CompileStop('Arrays.stream needs an array')
  const of = a.type.of
  if (of.t === 'prim' && !(of.name in ARRAY_STREAMS)) throw new CompileStop(`no suitable method found for stream(${of.name}[])`)
  const prim = of.t === 'prim' ? ARRAY_STREAMS[of.name]! : null
  const from = args[1] ? (toPrim(args[1], 'int') as number) : 0
  const to = args[2] ? (toPrim(args[2], 'int') as number) : a.items.length
  if (from < 0 || to > a.items.length || from > to) throw new Fault('ArrayIndexOutOfBoundsException', `origin(${from}) > fence(${to})`)
  return streamR(new StreamVal(prim, arrayItems(a.items, from, to), () => to - from))
}

export function charStream(s: string): StreamVal {
  const codes = Array.from({ length: s.length }, (_, i) => s.charCodeAt(i))
  return new StreamVal('int', arrayItems(codes, 0, codes.length), () => codes.length)
}

/** String.lines(): split at line breaks, without an empty last line. */
export function lineStream(s: string): StreamVal {
  const lines: JVal[] = s.split(/\r\n|\r|\n/).map((line) => new JStr(line))
  if (lines.length && (lines[lines.length - 1] as JStr).s === '') lines.pop()
  return new StreamVal(null, arrayItems(lines, 0, lines.length), () => lines.length)
}

function* range(prim: 'int' | 'long', lo: bigint, hi: bigint): Items {
  for (let i = lo; i < hi; i++) yield prim === 'int' ? Number(i) : i
}

function* iterateItems(m: Machine, prim: StreamPrim, seed: JVal, hasNext: JVal | null, next: JVal): Items {
  let v = seed
  for (let first = true; ; first = false) {
    if (!first) v = fromR(m, prim, invokeCallable(m, next, [elemR(prim, v)], mapSam(prim)))
    if (hasNext !== null && !truthy(invokeCallable(m, hasNext, [elemR(prim, v)], 'test'))) return
    yield v
  }
}

function* generateItems(m: Machine, prim: StreamPrim, supplier: JVal): Items {
  for (;;) yield fromR(m, prim, invokeCallable(m, supplier, [], prim ? SUPPLIER_SAM[prim] : 'get'))
}

function* concatItems(a: Items, b: Items): Items {
  yield* a
  yield* b
}

/** The elements of `Stream.of(values...)`: a single array argument is spread, as the varargs call does. */
function ofItems(m: Machine, prim: StreamPrim, args: readonly R[]): JVal[] {
  const only = args[0]?.value
  if (args.length === 1 && only instanceof JArray && (prim === null) === (only.type.of.t !== 'prim')) return [...only.items]
  return args.map((a) => fromR(m, prim, a))
}

const STREAM_CLASSES: Readonly<Record<string, StreamPrim>> = { Stream: null, IntStream: 'int', LongStream: 'long', DoubleStream: 'double' }

export const isStreamClass = (name: string) => name in STREAM_CLASSES

/** Stream.of, IntStream.range and the other static factories of the four stream classes. */
export function streamStatic(m: Machine, cls: string, name: string, args: readonly R[]): R {
  const prim = STREAM_CLASSES[cls]!
  switch (name) {
    case 'of': {
      const items = ofItems(m, prim, args)
      return streamR(new StreamVal(prim, arrayItems(items, 0, items.length), () => items.length))
    }
    case 'ofNullable': {
      const items: JVal[] = args[0]!.value === null ? [] : [args[0]!.value]
      return streamR(new StreamVal(prim, arrayItems(items, 0, items.length), () => items.length))
    }
    case 'empty':
      return streamR(new StreamVal(prim, arrayItems([], 0, 0), () => 0))
    case 'range':
    case 'rangeClosed': {
      if (prim !== 'int' && prim !== 'long') break
      arity(`${cls}.${name}`, args, 2)
      const lo = BigInt(toPrim(args[0]!, prim))
      const hi = BigInt(toPrim(args[1]!, prim)) + (name === 'rangeClosed' ? 1n : 0n)
      return streamR(new StreamVal(prim, range(prim, lo, hi), () => Number(hi > lo ? hi - lo : 0n)))
    }
    case 'iterate': {
      arity(`${cls}.iterate`, args, 2, 3)
      const seed = fromR(m, prim, args[0]!)
      const [hasNext, next]: [JVal, JVal] = args.length === 3 ? [args[1]!.value, args[2]!.value] : [null, args[1]!.value]
      return streamR(new StreamVal(prim, iterateItems(m, prim, seed, hasNext, next), null))
    }
    case 'generate':
      return streamR(new StreamVal(prim, generateItems(m, prim, args[0]!.value), null))
    case 'concat': {
      const [a, b] = args.map((x) => x.value)
      if (!(a instanceof StreamVal) || !(b instanceof StreamVal)) throw new CompileStop(`${cls}.concat needs two streams`)
      const size = a.size && b.size ? () => a.size!() + b.size!() : null
      return streamR(new StreamVal(prim, concatItems(take(a), take(b)), size))
    }
    default:
      break
  }
  throw noMethod(cls, name)
}
