import { useContext } from 'react'
import { useStore } from '../../app/store'
import { nodeLabel } from '../../structures/common'
import type { Heap, HeapObject, Value as TraceValue } from '../../trace/types'
import { CoverContext, useIsHot } from './cover'

function inlineLabel(obj: HeapObject): string | null {
  switch (obj.kind) {
    case 'function':
      return `${obj.name}${obj.sig}`
    case 'class':
      return `class ${obj.name}`
    case 'module':
      return `module ${obj.name}`
    default:
      return null
  }
}

function RefValue({ id, heap }: { id: string; heap: Heap }) {
  const { coveredBy, roots } = useContext(CoverContext)
  const hot = useIsHot(id)
  const setHovered = useStore((s) => s.setHovered)
  const obj = heap.get(id)
  const label = obj && inlineLabel(obj)
  if (obj && label) {
    return (
      <span className="inline-ref" title={obj.kind}>
        {label}
      </span>
    )
  }
  // A value inside a structure card draws no arrow; the node carries a name tag instead.
  const inside = coveredBy.has(id) && !roots.has(id)
  return (
    <span className="port-wrap">
      <span
        className={`port${hot ? ' is-hot' : ''}${inside ? ' is-inside' : ''}`}
        data-port={inside ? undefined : id}
        onMouseEnter={() => setHovered(id)}
        onMouseLeave={() => setHovered(null)}
        aria-label="reference to an object in the heap"
      />
      {inside && obj?.kind === 'instance' && <span className="port-note">node {nodeLabel(obj) ?? ''}</span>}
    </span>
  )
}

/** A value in a slot: primitives print inline, objects get a port that an arrow leaves from. */
export function Value({ value, heap }: { value: TraceValue; heap: Heap }) {
  if (value.t === 'p') return <span className={`prim prim-${value.k}`}>{value.v}</span>
  return <RefValue id={value.id} heap={heap} />
}
