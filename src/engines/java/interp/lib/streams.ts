import { invokeCallable } from '../calls'
import { toPrim } from '../convert'
import { CompileStop, Fault } from '../errors'
import type { Machine } from '../machine'
import { truthy } from '../ops'
import { type StreamPrim, StreamVal } from '../streamValues'
import type { JVal, R } from '../values'
import { arity } from './common'
import { javaSort, sortPrimitives } from './sorting'
import { HashStore } from './stores'
import { elemR, fromR, mapSam, streamR, take } from './streamSources'
import { terminalMethod } from './terminals'

type Items = IterableIterator<JVal>
type Size = StreamVal['size']

function* mapItems(m: Machine, up: Items, fn: JVal, from: StreamPrim, to: StreamPrim, sam: string): Items {
  for (const v of up) yield fromR(m, to, invokeCallable(m, fn, [elemR(from, v)], sam))
}

function* filterItems(m: Machine, up: Items, test: JVal, prim: StreamPrim, keep: boolean): Items {
  for (const v of up) if (truthy(invokeCallable(m, test, [elemR(prim, v)], 'test')) === keep) yield v
}

function* peekItems(m: Machine, up: Items, fn: JVal, prim: StreamPrim): Items {
  for (const v of up) {
    invokeCallable(m, fn, [elemR(prim, v)], 'accept')
    yield v
  }
}

function* flatMapItems(m: Machine, up: Items, fn: JVal, from: StreamPrim): Items {
  for (const v of up) {
    const inner = invokeCallable(m, fn, [elemR(from, v)], 'apply').value
    if (inner === null) continue
    if (!(inner instanceof StreamVal)) throw new CompileStop('flatMap needs a function that returns a stream')
    yield* take(inner)
  }
}

function* distinctItems(m: Machine, up: Items, prim: StreamPrim): Items {
  const seen = new HashStore(false)
  for (const v of up) if (!seen.put(m, prim ? m.box(prim, v as number) : v, null)) yield v
}

function* sortedItems(m: Machine, up: Items, prim: StreamPrim, cmp: JVal): Items {
  const all = [...up]
  if (prim) sortPrimitives(all)
  else javaSort(m, all, cmp)
  yield* all
}

function* limitItems(up: Items, n: bigint): Items {
  if (n <= 0n) return
  let taken = 0n
  for (const v of up) {
    yield v
    if (++taken >= n) return
  }
}

function* skipItems(up: Items, n: bigint): Items {
  let skipped = 0n
  for (const v of up) {
    if (skipped < n) skipped++
    else yield v
  }
}

function* whileItems(m: Machine, up: Items, test: JVal, prim: StreamPrim, take: boolean): Items {
  let passing = true
  for (const v of up) {
    if (passing) passing = truthy(invokeCallable(m, test, [elemR(prim, v)], 'test'))
    if (take && !passing) return
    if (take || !passing) yield v
  }
}

function* convertItems(m: Machine, up: Items, from: StreamPrim, to: StreamPrim): Items {
  for (const v of up) yield to === null ? m.box(from!, v as number) : to === 'long' ? BigInt(v as number) : Number(v)
}

function count(args: readonly R[], name: string): bigint {
  arity(name, args, 1)
  const n = BigInt(toPrim(args[0]!, 'long'))
  if (n < 0n) throw new Fault('IllegalArgumentException', String(n))
  return n
}

const MAP_TO: Readonly<Record<string, [StreamPrim, string]>> = {
  mapToInt: ['int', 'applyAsInt'],
  mapToLong: ['long', 'applyAsLong'],
  mapToDouble: ['double', 'applyAsDouble'],
  mapToObj: [null, 'apply'],
}

/** An intermediate operation: a new stream over this one's elements, which it takes. Terminal operations go to terminals.ts. */
export function streamMethod(m: Machine, s: StreamVal, name: string, args: readonly R[]): R {
  const prim = s.prim
  const fn = () => {
    arity(name, args, 1)
    return args[0]!.value
  }
  const next = (to: StreamPrim, items: (up: Items) => Items, size: Size = null) => streamR(new StreamVal(to, items(take(s)), size))
  switch (name) {
    case 'filter':
      return next(prim, (up) => filterItems(m, up, fn(), prim, true))
    case 'map':
      return next(prim, (up) => mapItems(m, up, fn(), prim, prim, mapSam(prim)), s.size)
    case 'mapToInt':
    case 'mapToLong':
    case 'mapToDouble':
    case 'mapToObj': {
      const [to, sam] = MAP_TO[name]!
      return next(to, (up) => mapItems(m, up, fn(), prim, to, sam), s.size)
    }
    case 'boxed':
      return next(null, (up) => convertItems(m, up, prim, null), s.size)
    case 'asLongStream':
    case 'asDoubleStream':
      return next(name === 'asLongStream' ? 'long' : 'double', (up) => convertItems(m, up, prim, name === 'asLongStream' ? 'long' : 'double'), s.size)
    case 'flatMap':
    case 'flatMapToInt':
    case 'flatMapToObj':
      return next(name === 'flatMapToInt' ? 'int' : name === 'flatMapToObj' ? null : prim, (up) => flatMapItems(m, up, fn(), prim))
    case 'distinct':
      return next(prim, (up) => distinctItems(m, up, prim))
    case 'sorted':
      return next(prim, (up) => sortedItems(m, up, prim, args[0]?.value ?? null), s.size)
    case 'peek':
      return next(prim, (up) => peekItems(m, up, fn(), prim), s.size)
    case 'limit': {
      const n = count(args, name)
      const size = s.size
      return next(prim, (up) => limitItems(up, n), size && (() => Math.min(size(), Number(n))))
    }
    case 'skip': {
      const n = count(args, name)
      const size = s.size
      return next(prim, (up) => skipItems(up, n), size && (() => Math.max(0, size() - Number(n))))
    }
    case 'takeWhile':
    case 'dropWhile':
      return next(prim, (up) => whileItems(m, up, fn(), prim, name === 'takeWhile'))
    case 'parallel':
    case 'sequential':
    case 'unordered':
    case 'onClose':
      return next(prim, (up) => up, s.size)
    default:
      return terminalMethod(m, s, name, args)
  }
}
