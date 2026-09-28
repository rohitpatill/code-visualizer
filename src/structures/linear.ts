import type { Heap, HeapObject, Step, Value } from '../trace/types'
import { deref } from '../trace/values'
import { attr, displayChar, nodeLabel, seqItems } from './common'
import { CELL_NAMES, CELL_PAIRS, WINDOW_PAIRS, pointerCandidates } from './pointers'
import type { ArrayData, GridData, LinkedListData, Pointer } from './types'

const MAX_LIST_NODES = 60

function charItems(text: string): Value[] {
  return Array.from(text, (ch) => ({ t: 'p', k: 'str', v: displayChar(ch), s: ch }))
}

export function buildArray(value: Value, heap: Heap, step: Step): ArrayData {
  const items = value.t === 'p' ? charItems(value.s ?? '') : (seqItems(heap.get(value.id)) ?? [])
  const pointers = pointerCandidates(step.frames)
  const n = items.length
  const onArray: Pointer[] = []
  const offArray: Pointer[] = []
  for (const p of pointers) (p[1] >= 0 && p[1] <= n ? onArray : offArray).push(p)
  let window: ArrayData['window'] = null
  for (const [a, b] of WINDOW_PAIRS) {
    const pa = pointers.get(a)
    const pb = pointers.get(b)
    if (pa === undefined || pb === undefined) continue
    window = { lo: Math.max(0, Math.min(pa, pb)), hi: Math.min(n - 1, Math.max(pa, pb)), names: [a, b] }
    break
  }
  return { items, pointers: onArray, offArray, window }
}

export function buildGrid(obj: HeapObject | undefined, heap: Heap, step: Step): GridData {
  const covered: string[] = []
  const rows = (seqItems(obj) ?? []).map((v) => {
    if (v.t === 'r') covered.push(v.id)
    return seqItems(deref(v, heap)) ?? [v]
  })
  const pointers = pointerCandidates(step.frames, CELL_NAMES)
  const marks: GridData['marks'] = []
  for (const [a, b] of CELL_PAIRS) {
    const r = pointers.get(a)
    const c = pointers.get(b)
    if (r !== undefined && c !== undefined) marks.push({ r, c, label: `${a},${b}` })
  }
  return { rows, marks, covered }
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
