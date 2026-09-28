import type { Heap, HeapObject, Value } from '../trace/types'
import type { ViewName } from './types'

export const VIEW_LABELS: Readonly<Record<ViewName, string>> = {
  array: 'Array',
  grid: 'Grid',
  list: 'Linked list',
  tree: 'Tree',
  graph: 'Graph',
  stack: 'Stack',
  queue: 'Queue',
  heap: 'Heap',
}

const VALUE_ATTRS = ['val', 'value', 'data', 'key', 'item']

export const attr = (obj: HeapObject | undefined, name: string): Value | undefined =>
  obj && 'attrs' in obj ? obj.attrs.find(([k]) => k === name)?.[1] : undefined

export const seqItems = (obj: HeapObject | undefined): Value[] | null => {
  switch (obj?.kind) {
    case 'list':
    case 'tuple':
    case 'deque':
    case 'set':
      return obj.items
    default:
      return null
  }
}

export function nodeLabel(obj: HeapObject): string | null {
  if (obj.kind !== 'instance') return null
  for (const name of VALUE_ATTRS) {
    const v = attr(obj, name)
    if (v?.t === 'p') return v.v
  }
  const first = obj.attrs.find(([, v]) => v.t === 'p' && v.k !== 'none')?.[1]
  return first?.t === 'p' ? first.v : null
}

/** Short text for a value inside a structure cell. */
export function compact(value: Value | undefined, heap: Heap, depth = 0): string {
  if (!value) return ''
  if (value.t === 'p') return value.v
  const obj = heap.get(value.id)
  if (!obj) return '?'
  if (obj.kind === 'instance') return nodeLabel(obj) ?? obj.type
  const items = seqItems(obj)
  if (!items) return 'name' in obj ? obj.name : obj.kind
  const [open, close] = obj.kind === 'tuple' ? ['(', ')'] : obj.kind === 'set' ? ['{', '}'] : ['[', ']']
  if (depth >= 1) return `${open}…${close}`
  return `${open}${items.map((v) => compact(v, heap, depth + 1)).join(', ')}${close}`
}

const CONTROL = /[\u0000-\u001f\u007f]/

/** One character of a string as it should read in a cell. */
export const displayChar = (ch: string): string => {
  if (ch === ' ') return '␣'
  return CONTROL.test(ch) ? JSON.stringify(ch).slice(1, -1) : ch
}
