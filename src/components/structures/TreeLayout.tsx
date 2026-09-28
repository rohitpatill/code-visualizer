import type { ReactNode } from 'react'
import type { LaidOutNode } from '../../structures/types'

export const NODE = 38
const GAP_X = 50
const GAP_Y = 70
const TOP = 18

interface Props<N extends LaidOutNode, K> {
  nodes: readonly N[]
  edges: readonly { from: K; to: K }[]
  width: number
  depth: number
  nodeKey: (n: N) => K
  renderNode: (n: N) => ReactNode
}

export function TreeLayout<N extends LaidOutNode, K extends string | number>({ nodes, edges, width, depth, nodeKey, renderNode }: Props<N, K>) {
  const w = Math.max(1, width) * GAP_X
  const h = (depth + 1) * GAP_Y
  const pos = new Map(nodes.map((n) => [nodeKey(n), { x: n.x * GAP_X + GAP_X / 2, y: n.depth * GAP_Y + NODE / 2 + TOP }]))
  return (
    <div className="tree" style={{ width: w, height: h }}>
      <svg width={w} height={h} className="tree-edges">
        {edges.map((e) => {
          const a = pos.get(e.from)
          const b = pos.get(e.to)
          return a && b ? <line key={`${e.from}-${e.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null
        })}
      </svg>
      {nodes.map((n) => {
        const key = nodeKey(n)
        const p = pos.get(key)!
        return (
          <div key={key} className="tree-node-wrap" style={{ left: p.x, top: p.y }}>
            {renderNode(n)}
          </div>
        )
      })}
    </div>
  )
}
