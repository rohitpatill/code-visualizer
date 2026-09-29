import { type JType, T } from '../../lang/types'
import { invokeCallable } from '../calls'
import { toPrim } from '../convert'
import { CompileStop, Fault } from '../errors'
import type { Machine } from '../machine'
import { VOID, boolR, doubleR, intR, longR, refR, truthy } from '../ops'
import { StatsVal, type StreamPrim, type StreamVal } from '../streamValues'
import { type Cursor, IterVal, JArray, type JVal, type R } from '../values'
import { noMethod } from './common'
import { specOf } from './collectors'
import { immutableList } from './lists'
import { optionalOf, optionalR } from './optionals'
import { acceptStat, addCompensated, compensatedTotal } from './statistics'
import { elemR, fromR, mapSam, take } from './streamSources'

type Items = IterableIterator<JVal>
type ArrayType = Extract<JType, { t: 'array' }>
type Fold = (m: Machine, a: JVal, b: JVal) => JVal

const streamName = (prim: StreamPrim) => (prim ? `${prim[0]!.toUpperCase()}${prim.slice(1)}Stream` : 'Stream')

function fold(m: Machine, items: Items, op: Fold, identity?: JVal): JVal | undefined {
  let acc = identity
  for (const v of items) acc = acc === undefined ? v : op(m, acc, v)
  return acc
}

const lambdaFold = (fn: JVal, prim: StreamPrim): Fold => (m, a, b) => fromR(m, prim, invokeCallable(m, fn, [elemR(prim, a), elemR(prim, b)], mapSam(prim)))

/** Integer::sum, Long::sum and Math.min/max for the primitive streams' sum, min and max. */
function primFold(prim: Exclude<StreamPrim, null>, op: 'sum' | 'min' | 'max'): Fold {
  if (prim === 'double') return (_m, a, b) => (op === 'min' ? Math.min(a as number, b as number) : Math.max(a as number, b as number))
  if (prim === 'long') {
    if (op === 'sum') return (_m, a, b) => BigInt.asIntN(64, (a as bigint) + (b as bigint))
    return (_m, a, b) => ((op === 'min' ? (a as bigint) < (b as bigint) : (a as bigint) > (b as bigint)) ? a : b)
  }
  if (op === 'sum') return (_m, a, b) => ((a as number) + (b as number)) | 0
  return (_m, a, b) => (op === 'min' ? Math.min(a as number, b as number) : Math.max(a as number, b as number))
}

function doubleSum(items: Items, average: boolean): number | undefined {
  const s = [0, 0, 0]
  let count = 0
  for (const v of items) {
    count++
    addCompensated(s, v as number)
    s[2]! += v as number
  }
  if (!average) return compensatedTotal(s)
  return count ? compensatedTotal(s) / count : undefined
}

function integralAverage(items: Items): number | undefined {
  let sum = 0n
  let count = 0
  for (const v of items) {
    count++
    sum = BigInt.asIntN(64, sum + BigInt(v as number))
  }
  return count ? Number(sum) / count : undefined
}

function toArray(m: Machine, prim: StreamPrim, items: JVal[], generator: JVal | undefined): R {
  if (prim) {
    const type: ArrayType = { t: 'array', of: { t: 'prim', name: prim } }
    return refR(new JArray(type, items), type)
  }
  if (generator === undefined) {
    const type: ArrayType = { t: 'array', of: T.object }
    return refR(new JArray(type, items), type)
  }
  const made = invokeCallable(m, generator, [intR(items.length)], 'apply')
  const array = made.value
  if (!(array instanceof JArray)) throw new CompileStop('toArray needs an array constructor, such as String[]::new')
  if (array.items.length !== items.length) throw new Fault('IllegalStateException', `Begin size ${items.length} is not equal to fixed size ${array.items.length}`)
  array.items.splice(0, items.length, ...items)
  return made
}

function iterator(items: Items): IterVal {
  let ahead: IteratorResult<JVal> | null = null
  const peek = () => (ahead ??= items.next())
  const cursor: Cursor = {
    hasNext: () => !peek().done,
    next: () => {
      const r = peek()
      ahead = null
      if (r.done) throw new Fault('NoSuchElementException')
      return r.value
    },
    remove: () => {
      throw new Fault('UnsupportedOperationException', 'remove')
    },
  }
  return new IterVal(cursor)
}

function match(m: Machine, s: StreamVal, test: JVal, kind: string): boolean {
  for (const v of take(s)) {
    const passes = truthy(invokeCallable(m, test, [elemR(s.prim, v)], 'test'))
    if (kind === 'anyMatch' && passes) return true
    if (kind === 'allMatch' && !passes) return false
    if (kind === 'noneMatch' && passes) return false
  }
  return kind !== 'anyMatch'
}

function minMax(m: Machine, s: StreamVal, name: 'min' | 'max', args: readonly R[]): R {
  const prim = s.prim
  if (prim) return optionalR(optionalOf(prim, fold(m, take(s), primFold(prim, name))))
  const cmp = args[0]?.value
  if (cmp === undefined) throw new CompileStop(`Stream.${name} needs a Comparator, as in ${name}(Comparator.naturalOrder())`)
  const pick: Fold = (mm, a, b) => {
    const c = toPrim(invokeCallable(mm, cmp, [refR(a), refR(b)], 'compare'), 'int') as number
    return (name === 'min' ? c <= 0 : c >= 0) ? a : b
  }
  const found = fold(m, take(s), pick)
  if (found === null) throw new Fault('NullPointerException')
  return optionalR(optionalOf(null, found))
}

function reduce(m: Machine, s: StreamVal, args: readonly R[]): R {
  const prim = s.prim
  if (args.length === 1) {
    const found = fold(m, take(s), lambdaFold(args[0]!.value, prim))
    if (found === null) throw new Fault('NullPointerException')
    return optionalR(optionalOf(prim, found))
  }
  const identity = fromR(m, prim, args[0]!)
  const op = args[1]!.value
  const acc: Fold = args.length === 3 ? (mm, a, b) => fromR(mm, null, invokeCallable(mm, op, [refR(a), refR(b)], 'apply')) : lambdaFold(op, prim)
  return elemR(prim, fold(m, take(s), acc, identity)!)
}

function collect(m: Machine, s: StreamVal, args: readonly R[]): R {
  if (args.length === 1) {
    if (s.prim) throw new CompileStop(`${streamName(s.prim)} has no collect(Collector): call boxed() first`)
    const spec = specOf(args[0], 'collect')
    const acc = spec.start(m)
    for (const v of take(s)) spec.add(m, acc, v)
    return refR(spec.finish(m, acc))
  }
  const container = invokeCallable(m, args[0]!.value, [], 'get')
  for (const v of take(s)) invokeCallable(m, args[1]!.value, [container, elemR(s.prim, v)], 'accept')
  return container
}

/** A terminal operation: runs the pipeline. */
export function terminalMethod(m: Machine, s: StreamVal, name: string, args: readonly R[]): R {
  const prim = s.prim
  switch (name) {
    case 'forEach':
    case 'forEachOrdered':
      for (const v of take(s)) invokeCallable(m, args[0]!.value, [elemR(prim, v)], 'accept')
      return VOID
    case 'toList':
      if (prim) break
      return refR(immutableList([...take(s)], true))
    case 'toArray':
      return toArray(m, prim, [...take(s)], args[0]?.value)
    case 'collect':
      return collect(m, s, args)
    case 'reduce':
      return reduce(m, s, args)
    case 'count': {
      const size = s.size
      const items = take(s)
      if (size) return longR(BigInt(size()))
      let n = 0n
      for (const _ of items) n++
      return longR(n)
    }
    case 'sum':
      if (!prim) break
      if (prim === 'double') return doubleR(doubleSum(take(s), false)!)
      return elemR(prim, fold(m, take(s), primFold(prim, 'sum'), prim === 'long' ? 0n : 0)!)
    case 'average': {
      if (!prim) break
      const avg = prim === 'double' ? doubleSum(take(s), true) : integralAverage(take(s))
      return optionalR(optionalOf('double', avg))
    }
    case 'min':
    case 'max':
      return minMax(m, s, name, args)
    case 'anyMatch':
    case 'allMatch':
    case 'noneMatch':
      return boolR(match(m, s, args[0]!.value, name))
    case 'findFirst':
    case 'findAny': {
      const first = take(s).next()
      if (!first.done && first.value === null) throw new Fault('NullPointerException')
      return optionalR(optionalOf(prim, first.done ? undefined : first.value))
    }
    case 'summaryStatistics': {
      if (!prim) break
      const stats = new StatsVal(prim)
      for (const v of take(s)) acceptStat(stats, v)
      return refR(stats, { t: 'ref', name: `${streamName(prim).replace('Stream', '')}SummaryStatistics`, args: [] })
    }
    case 'iterator':
      return refR(iterator(take(s)))
    case 'close':
      return VOID
    default:
      break
  }
  throw noMethod(streamName(prim), name)
}
