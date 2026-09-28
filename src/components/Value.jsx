import { createContext, useContext } from 'react'
import { isInlineRef } from '../lib.js'
import { nodeLabel } from '../structures.js'

// Which heap ids are drawn inside a structure view (tree nodes, list nodes, ...).
export const CoverContext = createContext({ coveredBy: new Map(), roots: new Set() })

// A value in a slot: primitives print inline, objects get a port that an arrow leaves from.
export function Value({ value, heap, hovered, onHover }) {
  const { coveredBy, roots } = useContext(CoverContext)
  if (value.t === 'p') {
    return <span className={`prim prim-${value.k}`}>{value.v}</span>
  }
  if (isInlineRef(value, heap)) {
    const obj = heap[value.id]
    const label = obj.kind === 'function' ? `${obj.name}${obj.sig}` : obj.kind === 'class' ? `class ${obj.name}` : `module ${obj.name}`
    return <span className="inline-ref" title={obj.kind}>{label}</span>
  }
  // Points inside a structure view: no arrow, the node carries a name tag instead.
  const inside = coveredBy.has(value.id) && !roots.has(value.id)
  const obj = heap[value.id]
  return (
    <span className="port-wrap">
      <span
        className={`port${hovered === value.id ? ' is-hot' : ''}${inside ? ' is-inside' : ''}`}
        data-port={inside ? undefined : value.id}
        onMouseEnter={() => onHover(value.id)}
        onMouseLeave={() => onHover(null)}
        aria-label="reference to an object in the heap"
      />
      {inside && obj?.kind === 'instance' && <span className="port-note">node {nodeLabel(obj) ?? ''}</span>}
    </span>
  )
}
