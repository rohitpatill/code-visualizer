import type { Heap, HeapObject, Step, Value } from '../trace/types'
import { attr, displayChar, nodeLabel, seqItems } from './common'
import { CELL_NAMES, CELL_PAIRS, WINDOW_PAIRS, pointerCandidates } from './pointers'
import type { ArrayData, GridData, IndexMark, IndexMarks, LinkedListData } from './types'

const MAX_LIST_NODES = 60

function charItems(text: string): Value[] {
  return Array.from(text, (ch) => ({ t: 'p', k: 'str', v: displayChar(ch), s: ch }))
}

/** Name-based pointers, for containers the code never indexes with a plain variable. */
function namedPointers(step: Step, names?: ReadonlySet<string>): IndexMark[] {
  return [...pointerCandidates(step.frames, names)].map(([name, index]) => ({ name, index, active: true }))
}

export function buildArray(value: Value, heap: Heap, step: Step, marks: readonly IndexMark[] | undefined): ArrayData {
  const items = value.t === 'p' ? charItems(value.s ?? '') : (seqItems(heap.get(value.id)) ?? [])
  const all = marks ?? namedPointers(step)
  const n = items.length
  const onArray: IndexMark[] = []
  const offArray: IndexMark[] = []
  for (const p of all) (p.index >= 0 && p.index <= n ? onArray : offArray).push(p)
  const byName = new Map(all.map((p) => [p.name, p.index]))
  let window: ArrayData['window'] = null
  for (const [a, b] of WINDOW_PAIRS) {
    const pa = byName.get(a)
    const pb = byName.get(b)
    if (pa === undefined || pb === undefined) continue
    window = { lo: Math.max(0, Math.min(pa, pb)), hi: Math.min(n - 1, Math.max(pa, pb)), names: [a, b] }
    break
  }
  return { items, pointers: onArray, offArray, window }
}

function namedCells(step: Step): GridData['marks'] {
  const pointers = new Map(namedPointers(step, CELL_NAMES).map((p) => [p.name, p.index]))
  const marks: GridData['marks'] = []
  for (const [a, b] of CELL_PAIRS) {
    const r = pointers.get(a)
    const c = pointers.get(b)
    if (r !== undefined && c !== undefined) marks.push({ r, c, label: `${a},${b}` })
  }
  return marks
}

const namesAt = (marks: readonly IndexMark[] | undefined, index: number): string[] =>
  (marks ?? []).filter((m) => m.index === index).map((m) => m.name)

export function buildGrid(obj: HeapObject | undefined, heap: Heap, step: Step, marks: IndexMarks, key: string | null): GridData {
  const covered: string[] = []
  const outer = key ? marks.get(key) : undefined
  const cells: GridData['marks'] = []
  const rowMarks = new Map<number, string[]>()
  const rows = (seqItems(obj) ?? []).map((v, r) => {
    const across = namesAt(outer, r)
    if (across.length) rowMarks.set(r, across)
    if (v.t !== 'r') return [v]
    covered.push(v.id)
    for (const m of marks.get(v.id) ?? []) {
      cells.push({ r, c: m.index, label: across.length ? `${across.join('/')},${m.name}` : m.name })
    }
    return seqItems(heap.get(v.id)) ?? [v]
  })
  const indexed = outer !== undefined || cells.length > 0
  return { rows, marks: indexed ? cells : namedCells(step), rowMarks, covered }
}

export function buildLinkedList(rootId: string, heap: Heap): LinkedListData {
  const nodes: LinkedListData['nodes'] = []
  const position = new Map<string, number>()
  let id: string | null = rootId
  let cycleTo: number | null = null
  while (id !== null && nodes.length < MAX_LIST_NODES) {
    const seenAt = position.get(id)
    if (seenAt !== undefined) {
      cycleTo = seenAt
      break
    }
    const obj = heap.get(id)
    if (obj?.kind !== 'instance') break
    position.set(id, nodes.length)
    nodes.push({ id, label: nodeLabel(obj) ?? '?' })
    const next = attr(obj, 'next')
    id = next?.t === 'r' ? next.id : null
  }
  return { nodes, cycleTo, covered: nodes.map((n) => n.id) }
}
