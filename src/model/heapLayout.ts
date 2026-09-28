import type { Heap, HeapObject, Step, Value } from '../trace/types'

const INLINE_KINDS: ReadonlySet<HeapObject['kind']> = new Set(['function', 'class', 'module'])

/** Functions, classes and modules print as a label beside their variable, not as heap boxes. */
export const isInlineRef = (value: Value, heap: Heap): boolean =>
  value.t === 'r' && INLINE_KINDS.has(heap.get(value.id)?.kind ?? 'other')

function childRefs(obj: HeapObject | undefined): readonly Value[] {
  switch (obj?.kind) {
    case 'list':
    case 'tuple':
    case 'set':
    case 'deque':
      return obj.items
    case 'dict':
      return obj.entries.flat()
    case 'class':
    case 'instance':
      return obj.attrs.map(([, v]) => v)
    default:
      return []
  }
}

// One row per object a variable points at, with everything that object
// points at placed to its right, so arrows run mostly left to right.
export function layoutHeap(step: Step, skip: ReadonlySet<string>): string[][] {
  const placed = new Set(skip)
  const rows: string[][] = []
  const place = (value: Value, row: string[]) => {
    if (value.t !== 'r' || placed.has(value.id) || isInlineRef(value, step.heap)) return
    placed.add(value.id)
    row.push(value.id)
    for (const child of childRefs(step.heap.get(value.id))) place(child, row)
  }
  const roots = step.frames.flatMap((f) => f.vars.map(([, v]) => v))
  if (step.ret) roots.push(step.ret)
  for (const value of roots) {
    const row: string[] = []
    place(value, row)
    if (row.length) rows.push(row)
  }
  return rows
}
