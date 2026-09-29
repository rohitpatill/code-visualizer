import { toPrim } from '../convert'
import type { Machine } from '../machine'
import { VOID, doubleR, intR, longR, refR, strR } from '../ops'
import { StatsVal } from '../streamValues'
import type { JVal, R } from '../values'
import { noMethod } from './common'
import { javaFormat } from './format'

/** Collectors.sumWithCompensation: Kahan summation, so 0.1 + 0.2 + 0.3 sums to 0.6 as Java's streams report it. */
export function addCompensated(s: number[], v: number): void {
  const tmp = v - s[1]!
  const sum = s[0]!
  const velvel = sum + tmp
  s[1] = velvel - sum - tmp
  s[0] = velvel
}

/** Collectors.computeFinalSum: the compensated sum, or the plain sum's infinity when compensation turned it into NaN. */
export function compensatedTotal(s: readonly number[]): number {
  const tmp = s[0]! - s[1]!
  const simple = s[s.length - 1]!
  return Number.isNaN(tmp) && (simple === Infinity || simple === -Infinity) ? simple : tmp
}

const wrapLong = (v: bigint) => BigInt.asIntN(64, v)

/** IntSummaryStatistics.accept and its long and double versions. */
export function acceptStat(st: StatsVal, v: JVal): void {
  st.count++
  if (st.prim === 'double') {
    const x = Number(v)
    const sum = st.sum as number[]
    sum[2]! += x
    addCompensated(sum, x)
    st.min = Math.min(st.min as number, x)
    st.max = Math.max(st.max as number, x)
    return
  }
  const x = BigInt(v as number | bigint)
  st.sum = wrapLong((st.sum as bigint) + x)
  const asPrim = st.prim === 'int' ? Number(x) : x
  if (asPrim < st.min) st.min = asPrim
  if (asPrim > st.max) st.max = asPrim
}

function statSum(st: StatsVal): R {
  return st.prim === 'double' ? doubleR(compensatedTotal(st.sum as number[])) : longR(st.sum as bigint)
}

function statAverage(st: StatsVal): number {
  if (!st.count) return 0
  return st.prim === 'double' ? compensatedTotal(st.sum as number[]) / Number(st.count) : Number(st.sum as bigint) / Number(st.count)
}

const edge = (st: StatsVal, v: number | bigint): R => (st.prim === 'int' ? intR(v as number) : st.prim === 'long' ? longR(v as bigint) : doubleR(v as number))

const NAMES = { int: 'IntSummaryStatistics', long: 'LongSummaryStatistics', double: 'DoubleSummaryStatistics' } as const

export const statsClassName = (st: StatsVal) => NAMES[st.prim]

/** `IntSummaryStatistics{count=3, sum=6, min=1, average=2.000000, max=3}`. */
export function statsText(m: Machine, st: StatsVal): string {
  const whole = st.prim === 'double' ? '%f' : '%d'
  const format = `%s{count=%d, sum=${whole}, min=${whole}, average=%f, max=${whole}}`
  return javaFormat(m, format, [strR(NAMES[st.prim]), longR(st.count), statSum(st), edge(st, st.min), doubleR(statAverage(st)), edge(st, st.max)])
}

export function statsMethod(m: Machine, st: StatsVal, name: string, args: readonly R[]): R {
  switch (name) {
    case 'getCount':
      return longR(st.count)
    case 'getSum':
      return statSum(st)
    case 'getMin':
      return edge(st, st.min)
    case 'getMax':
      return edge(st, st.max)
    case 'getAverage':
      return doubleR(statAverage(st))
    case 'accept':
      acceptStat(st, toPrim(args[0]!, st.prim))
      return VOID
    case 'toString':
      return strR(statsText(m, st))
    default:
      throw noMethod(NAMES[st.prim], name)
  }
}

/** `new IntSummaryStatistics()` and friends. */
export function newStats(name: string): R | null {
  const prim = name === 'IntSummaryStatistics' ? 'int' : name === 'LongSummaryStatistics' ? 'long' : name === 'DoubleSummaryStatistics' ? 'double' : null
  return prim ? refR(new StatsVal(prim), { t: 'ref', name, args: [] }) : null
}
