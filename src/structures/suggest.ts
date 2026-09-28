import type { Heap, SequenceObject, Step, Value } from '../trace/types'
import { deref } from '../trace/values'
import { attr, seqItems } from './common'
import { pointerCandidates } from './pointers'
import type { ViewName } from './types'

/** Which views make sense for this value at all. */
export function viewsFor(value: Value, heap: Heap): readonly ViewName[] {
  if (value.t === 'p') return value.k === 'str' ? ['array'] : []
  switch (heap.get(value.id)?.kind) {
    case 'list':
      return ['array', 'stack', 'queue', 'heap', 'grid', 'graph']
    case 'tuple':
      return ['array']
    case 'deque':
      return ['queue', 'stack', 'array']
    case 'dict':
      return ['graph']
    case 'instance':
      return ['tree', 'list']
    default:
      return []
  }
}

export interface SuggestContext {
  heap: Heap
  hasPointers: boolean
}

export const suggestContext = (step: Step): SuggestContext => ({
  heap: step.heap,
  hasPointers: pointerCandidates(step.frames).size > 0,
})

const isGrid = (obj: SequenceObject, heap: Heap): boolean => {
  if (obj.items.length < 2) return false
  let width = -1
  for (const v of obj.items) {
    const row = deref(v, heap)
    if (row?.kind !== 'list' || !row.items.every((c) => c.t === 'p')) return false
    if (width !== -1 && row.items.length !== width) return false
    width = row.items.length
  }
  return true
}

function suggestForList(obj: SequenceObject, lower: string, ctx: SuggestContext): ViewName | null {
  if (/heap|pq/.test(lower)) return 'heap'
  if (/stack|stk/.test(lower)) return 'stack'
  if (/queue|^q$/.test(lower)) return 'queue'
  if (/graph|adj/.test(lower)) return 'graph'
  if (isGrid(obj, ctx.heap)) return 'grid'
  return obj.items.length > 1 && ctx.hasPointers && obj.items.every((v) => v.t === 'p') ? 'array' : null
}

/** A one-glance guess for the suggestion pill. Never applied automatically. */
export function suggestView(name: string, value: Value, ctx: SuggestContext): ViewName | null {
  if (value.t === 'p') return value.k === 'str' && (value.s?.length ?? 0) > 1 && ctx.hasPointers ? 'array' : null
  const obj = ctx.heap.get(value.id)
  const lower = name.toLowerCase()
  switch (obj?.kind) {
    case 'instance':
      if (attr(obj, 'left') || attr(obj, 'right') || attr(obj, 'children')) return 'tree'
      return attr(obj, 'next') ? 'list' : null
    case 'deque':
      return /stack|stk/.test(lower) ? 'stack' : 'queue'
    case 'dict': {
      if (/graph|adj/.test(lower)) return 'graph'
      return obj.entries.length >= 2 && obj.entries.every(([, v]) => seqItems(deref(v, ctx.heap))) ? 'graph' : null
    }
    case 'list':
      return suggestForList(obj, lower, ctx)
    default:
      return null
  }
}
