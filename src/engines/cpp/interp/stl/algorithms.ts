import { T } from '../../lang/types'
import { invoke } from '../calls'
import { compareVals, equalVals } from '../compare'
import { CppError } from '../errors'
import { convert, copyValue } from '../init'
import type { Machine } from '../machine'
import { binary, truthy } from '../ops'
import { Cell, IterVal, type R, type Val, isFn } from '../values'
import { VOID, boolR, intR, iterR } from './common'
import { rangeValues } from './iterators'

type Less = (a: Cell, b: Cell) => boolean

function range(m: Machine, first: R | undefined, last: R | undefined, what: string): { cells: Cell[]; start: IterVal } {
  if (!(first?.value instanceof IterVal) || !(last?.value instanceof IterVal)) throw new CppError(`${what} needs two iterators, like v.begin(), v.end()`)
  return { cells: rangeValues(m, first.value, last.value), start: first.value }
}

function lessOf(m: Machine, comp: R | undefined): Less {
  if (!comp) return (a, b) => compareVals(a.value, b.value, m.less) < 0
  if (!isFn(comp.value)) throw new CppError('the comparator must be a function or a lambda')
  const fn = comp.value
  return (a, b) => truthy(m, invoke(m, fn, [{ type: a.type, value: a.value, cell: a }, { type: b.type, value: b.value, cell: b }]))
}

const at = (start: IterVal, offset: number): R => iterR(new IterVal(start.over, start.index + offset, start.reverse))

function mergeSort(cells: Cell[], less: Less): Cell[] {
  if (cells.length < 2) return cells
  const mid = cells.length >> 1
  const left = mergeSort(cells.slice(0, mid), less)
  const right = mergeSort(cells.slice(mid), less)
  const out: Cell[] = []
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) out.push(less(right[j]!, left[i]!) ? right[j++]! : left[i++]!)
  return out.concat(left.slice(i), right.slice(j))
}

/** Writes values back into the range's cells, so sorting a string or a reversed range works too. */
function writeBack(cells: readonly Cell[], values: readonly Val[]): void {
  values.forEach((v, i) => (cells[i]!.value = v))
}

function snapshot(cells: readonly Cell[]): Cell[] {
  return cells.map((c) => new Cell(c.type, copyValue(c.value)))
}

function nextPermutation(cells: Cell[], less: Less): boolean {
  const n = cells.length
  let i = n - 2
  while (i >= 0 && !less(cells[i]!, cells[i + 1]!)) i--
  const values = cells.map((c) => c.value)
  if (i < 0) {
    writeBack(cells, values.reverse())
    return false
  }
  let j = n - 1
  while (!less(cells[i]!, cells[j]!)) j--
  const swap = values[i]!
  values[i] = values[j]!
  values[j] = swap
  writeBack(cells, [...values.slice(0, i + 1), ...values.slice(i + 1).reverse()])
  return true
}

export const ALGORITHMS = new Set([
  'sort', 'stable_sort', 'reverse', 'find', 'count', 'accumulate', 'max_element', 'min_element', 'lower_bound', 'upper_bound',
  'binary_search', 'fill', 'iota', 'unique', 'distance', 'next_permutation', 'find_if', 'count_if', 'all_of', 'any_of', 'none_of',
])

export function algorithm(m: Machine, name: string, args: readonly R[]): R {
  const { cells, start } = range(m, args[0], args[1], name)
  const pred = (i: number) => {
    const fn = args[2]?.value ?? null
    if (!isFn(fn)) throw new CppError(`${name} needs a predicate function or lambda`)
    return truthy(m, invoke(m, fn, [{ type: cells[i]!.type, value: cells[i]!.value, cell: cells[i] }]))
  }
  const matches = (c: Cell) => equalVals(c.value, args[2]!.value, m.less)
  switch (name) {
    case 'sort':
    case 'stable_sort':
      writeBack(cells, mergeSort(snapshot(cells), lessOf(m, args[2])).map((c) => c.value))
      return VOID
    case 'reverse':
      writeBack(cells, cells.map((c) => c.value).reverse())
      return VOID
    case 'find': {
      const i = cells.findIndex(matches)
      return at(start, i === -1 ? cells.length : i)
    }
    case 'count':
      return intR(cells.filter(matches).length)
    case 'find_if': {
      const i = cells.findIndex((_, k) => pred(k))
      return at(start, i === -1 ? cells.length : i)
    }
    case 'count_if':
      return intR(cells.filter((_, k) => pred(k)).length)
    case 'all_of':
      return boolR(cells.every((_, k) => pred(k)))
    case 'any_of':
      return boolR(cells.some((_, k) => pred(k)))
    case 'none_of':
      return boolR(!cells.some((_, k) => pred(k)))
    case 'accumulate': {
      const init = args[2]
      if (!init) throw new CppError('accumulate needs a starting value')
      let acc: R = { type: init.type, value: copyValue(init.value) }
      for (const c of cells) {
        const next = args[3] && isFn(args[3].value) ? invoke(m, args[3].value, [acc, { type: c.type, value: c.value }]) : binary(m, '+', acc, c)
        acc = { type: init.type, value: convert(m, next, init.type) }
      }
      return acc
    }
    case 'max_element':
    case 'min_element': {
      if (!cells.length) return at(start, 0)
      const less = lessOf(m, args[2])
      let best = 0
      cells.forEach((c, i) => {
        if (name === 'max_element' ? less(cells[best]!, c) : less(c, cells[best]!)) best = i
      })
      return at(start, best)
    }
    case 'lower_bound':
    case 'upper_bound':
    case 'binary_search': {
      const target = new Cell(args[2]!.type, args[2]!.value)
      const less = lessOf(m, args[3])
      const upper = name === 'upper_bound'
      let lo = 0
      let hi = cells.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (upper ? !less(target, cells[mid]!) : less(cells[mid]!, target)) lo = mid + 1
        else hi = mid
      }
      if (name === 'binary_search') return boolR(lo < cells.length && !less(target, cells[lo]!))
      return at(start, lo)
    }
    case 'fill':
      for (const c of cells) c.value = convert(m, args[2]!, c.type)
      return VOID
    case 'iota': {
      let v: R = args[2]!
      for (const c of cells) {
        c.value = convert(m, v, c.type)
        v = binary(m, '+', v, { type: T.int, value: 1 })
      }
      return VOID
    }
    case 'unique': {
      const kept: Val[] = []
      for (const c of cells) if (!kept.length || !equalVals(kept[kept.length - 1]!, c.value, m.less)) kept.push(c.value)
      writeBack(cells, kept)
      return at(start, kept.length)
    }
    case 'distance':
      return intR(cells.length)
    case 'next_permutation':
      return boolR(nextPermutation(cells, lessOf(m, args[2])))
    default:
      throw new CppError(`${name} is not supported`)
  }
}
