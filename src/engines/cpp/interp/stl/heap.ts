import { compareVals } from '../compare'
import { CppError } from '../errors'
import type { Machine } from '../machine'
import type { Cell, SeqVal } from '../values'

// priority_queue keeps a binary heap in an array, exactly as the standard
// library does, so the Heap view shows the real layout.

function below(m: Machine, seq: SeqVal): (a: Cell, b: Cell) => boolean {
  const greater = seq.type.t === 'pq' && seq.type.greater
  return (a, b) => {
    const c = compareVals(a.value, b.value, m.less)
    return greater ? c > 0 : c < 0
  }
}

function siftUp(items: Cell[], from: number, lower: (a: Cell, b: Cell) => boolean): void {
  let i = from
  while (i > 0) {
    const parent = (i - 1) >> 1
    if (!lower(items[parent]!, items[i]!)) return
    ;[items[parent], items[i]] = [items[i]!, items[parent]!]
    i = parent
  }
}

function siftDown(items: Cell[], from: number, lower: (a: Cell, b: Cell) => boolean): void {
  let i = from
  for (;;) {
    const l = 2 * i + 1
    const r = l + 1
    let top = i
    if (l < items.length && lower(items[top]!, items[l]!)) top = l
    if (r < items.length && lower(items[top]!, items[r]!)) top = r
    if (top === i) return
    ;[items[top], items[i]] = [items[i]!, items[top]!]
    i = top
  }
}

export function heapify(m: Machine, seq: SeqVal): void {
  const lower = below(m, seq)
  for (let i = (seq.items.length >> 1) - 1; i >= 0; i--) siftDown(seq.items, i, lower)
}

export function heapPush(m: Machine, seq: SeqVal, cell: Cell): void {
  seq.items.push(cell)
  siftUp(seq.items, seq.items.length - 1, below(m, seq))
}

export function heapPop(m: Machine, seq: SeqVal): void {
  const last = seq.items.pop()
  if (!last) throw new CppError('pop() on an empty priority_queue')
  if (!seq.items.length) return
  seq.items[0] = last
  siftDown(seq.items, 0, below(m, seq))
}
