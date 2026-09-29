import type { Machine } from '../machine'
import type { JVal } from '../values'
import { compareWith } from './equality'

// Java sorts objects with TimSort. Below 32 elements that is a binary
// insertion sort after the first run, reproduced exactly here so a traced
// comparator is called with the same pairs a real run would pass it. Larger
// ranges use a stable merge sort: the same result, fewer identical calls.

const MIN_MERGE = 32

type Compare = (a: JVal, b: JVal) => number

function reverseRange(a: JVal[], lo: number, hi: number): void {
  for (let i = lo, j = hi - 1; i < j; i++, j--) [a[i], a[j]] = [a[j]!, a[i]!]
}

function countRunAndMakeAscending(a: JVal[], lo: number, hi: number, c: Compare): number {
  let runHi = lo + 1
  if (runHi === hi) return 1
  if (c(a[runHi++]!, a[lo]!) < 0) {
    while (runHi < hi && c(a[runHi]!, a[runHi - 1]!) < 0) runHi++
    reverseRange(a, lo, runHi)
  } else {
    while (runHi < hi && c(a[runHi]!, a[runHi - 1]!) >= 0) runHi++
  }
  return runHi - lo
}

function binarySort(a: JVal[], lo: number, hi: number, start: number, c: Compare): void {
  for (let s = start === lo ? start + 1 : start; s < hi; s++) {
    const pivot = a[s]!
    let left = lo
    let right = s
    while (left < right) {
      const mid = (left + right) >>> 1
      if (c(pivot, a[mid]!) < 0) right = mid
      else left = mid + 1
    }
    a.copyWithin(left + 1, left, s)
    a[left] = pivot
  }
}

function mergeSort(a: JVal[], c: Compare): JVal[] {
  if (a.length < 2) return a
  const mid = a.length >>> 1
  const left = mergeSort(a.slice(0, mid), c)
  const right = mergeSort(a.slice(mid), c)
  const out: JVal[] = []
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) out.push(c(right[j]!, left[i]!) < 0 ? right[j++]! : left[i++]!)
  return out.concat(left.slice(i), right.slice(j))
}

/** Sorts `items[from, to)` in place, stably, with a comparator (null for natural ordering). */
export function javaSort(m: Machine, items: JVal[], cmp: JVal, from = 0, to = items.length): void {
  const c: Compare = (a, b) => compareWith(m, cmp, a, b)
  const n = to - from
  if (n < 2) return
  if (n < MIN_MERGE) {
    binarySort(items, from, to, from + countRunAndMakeAscending(items, from, to, c), c)
    return
  }
  items.splice(from, n, ...mergeSort(items.slice(from, to), c))
}

/** Arrays.sort for primitive arrays: numeric order, with -0.0 before 0.0 and NaN last, as Double.compare orders them. */
export function sortPrimitives(items: JVal[], from = 0, to = items.length): void {
  const part = items.slice(from, to) as (number | bigint | boolean)[]
  part.sort((a, b) => {
    if (typeof a === 'bigint' || typeof b === 'bigint') return a < b ? -1 : a > b ? 1 : 0
    const x = a as number
    const y = b as number
    if (Number.isNaN(x) || Number.isNaN(y)) return Number.isNaN(x) ? (Number.isNaN(y) ? 0 : 1) : -1
    if (x === y) return Object.is(x, -0) && !Object.is(y, -0) ? -1 : Object.is(y, -0) && !Object.is(x, -0) ? 1 : 0
    return x - y
  })
  items.splice(from, part.length, ...part)
}
