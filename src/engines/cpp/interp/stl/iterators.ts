import type { CType } from '../../lang/types'
import { CppError } from '../errors'
import type { Machine } from '../machine'
import { Cell, CharCell, IterVal, MapVal, PairVal, SeqVal, SetVal, StrVal } from '../values'
import { orderedKeys, orderedMapEntries } from './ordering'

export function sizeOf(over: IterVal['over']): number {
  if (over instanceof StrVal) return over.s.length
  if (over instanceof SeqVal) return over.items.length
  if (over instanceof MapVal) return over.entries.size
  return over.keys.size
}

/** Every element cell of a container, in iteration order. Writing a cell writes the container. */
export function elementCells(m: Machine, over: IterVal['over']): Cell[] {
  if (over instanceof SeqVal) return over.items
  if (over instanceof StrVal) return Array.from({ length: over.s.length }, (_, i) => new CharCell(over, i))
  if (over instanceof MapVal) {
    const pairType: CType = { t: 'pair', a: over.type.key, b: over.type.val }
    return orderedMapEntries(over, m.less).map(({ key, cell }) => new Cell(pairType, new PairVal(pairType, new Cell(over.type.key, key), cell)))
  }
  return orderedKeys(over as SetVal, m.less).map((key) => new Cell((over as SetVal).type.of, key))
}

export function begin(over: IterVal['over'], reverse = false): IterVal {
  return new IterVal(over, 0, reverse)
}

export function end(over: IterVal['over'], reverse = false): IterVal {
  return new IterVal(over, sizeOf(over), reverse)
}

/** The container position an iterator's step `index` refers to. */
export function position(it: IterVal): number {
  return it.reverse ? sizeOf(it.over) - 1 - it.index : it.index
}

export function deref(m: Machine, it: IterVal): Cell {
  const n = sizeOf(it.over)
  if (it.index < 0 || it.index >= n) throw new CppError('dereferenced an end() iterator')
  return elementCells(m, it.over)[position(it)]!
}

export function advance(it: IterVal, by: number): IterVal {
  return new IterVal(it.over, it.index + by, it.reverse)
}

function sameContainer(a: IterVal, b: IterVal): void {
  if (a.over !== b.over || a.reverse !== b.reverse) throw new CppError('these iterators come from different containers')
}

export function distance(a: IterVal, b: IterVal): number {
  sameContainer(a, b)
  return b.index - a.index
}

/** The cells in [first, last), in iteration order. */
export function rangeValues(m: Machine, first: IterVal, last: IterVal): Cell[] {
  sameContainer(first, last)
  const n = sizeOf(first.over)
  if (first.index < 0 || last.index > n || first.index > last.index) throw new CppError('iterator range is out of bounds')
  const cells = elementCells(m, first.over)
  const ordered = first.reverse ? [...cells].reverse() : cells
  return ordered.slice(first.index, last.index)
}
