import { useEffect, useMemo, useRef } from 'react'
import { shortValue } from '../lib.js'

const W = 128
const H = 78

// One node per function call across the whole run. Layout is computed once for
// the full run so nodes never jump; only calls made so far are shown.
export function buildCallTree(steps) {
  const nodes = new Map()
  const root = { id: 'root', label: 'start', children: [], callStep: 0, parent: null }
  nodes.set('root', root)
  steps.forEach((s, i) => {
    const top = s.frames[s.frames.length - 1]
    if (s.event === 'call') {
      const parentFrame = s.frames[s.frames.length - 2]
      const parent = nodes.get(parentFrame && parentFrame.name !== 'Globals' ? parentFrame.id : 'root') || root
      const args = top.vars.map(([, v]) => shortValue(v, s.heap)).join(', ')
      const node = { id: top.id, label: `${top.name.split('.').pop()}(${args})`, children: [], callStep: i, parent: parent.id }
      nodes.set(top.id, node)
      parent.children.push(node)
    }
    if (s.event === 'return' && s.func !== '<module>' && nodes.has(top.id)) {
      const node = nodes.get(top.id)
      node.returnStep = i
      node.ret = shortValue(s.ret, s.heap)
    }
  })
  let leaf = 0
  let maxDepth = 0
  const place = (node, depth) => {
    node.depth = depth
    maxDepth = Math.max(maxDepth, depth)
    if (!node.children.length) node.x = leaf++
    else {
      node.children.forEach((c) => place(c, depth + 1))
      node.x = (node.children[0].x + node.children[node.children.length - 1].x) / 2
    }
  }
  place(root, 0)
  return { nodes: [...nodes.values()], width: leaf, depth: maxDepth, callCount: nodes.size - 1 }
}

export function CallTree({ tree, index, activeFrameId, onSeek }) {
  const activeRef = useRef(null)
  const visible = tree.nodes.filter((n) => n.callStep <= index)
  const byId = useMemo(() => new Map(tree.nodes.map((n) => [n.id, n])), [tree])

  // the chain from the current call back to the root is highlighted
  const path = new Set()
  let cur = byId.get(activeFrameId) || byId.get('root')
  while (cur) {
    path.add(cur.id)
    cur = byId.get(cur.parent)
  }

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeFrameId])

  const w = Math.max(1, tree.width) * W
  const h = (tree.depth + 1) * H + 20
  const px = (n) => n.x * W + W / 2
  const py = (n) => n.depth * H + 24

  return (
    <div className="calltree">
      <p className="calltree-note">
        Every call made so far. Amber is the path to the running call. Click a call to jump to it.
      </p>
      <div className="calltree-canvas" style={{ width: w, height: h }}>
        <svg width={w} height={h}>
          {visible
            .filter((n) => n.parent)
            .map((n) => {
              const p = byId.get(n.parent)
              const hot = path.has(n.id) && path.has(p.id)
              return <line key={n.id} x1={px(p)} y1={py(p) + 14} x2={px(n)} y2={py(n) - 14} className={hot ? 'ct-edge is-hot' : 'ct-edge'} />
            })}
        </svg>
        {visible.map((n) => {
          const done = n.returnStep !== undefined && n.returnStep <= index
          const active = n.id === activeFrameId
          const cls = ['ct-node', active && 'is-active', path.has(n.id) && !active && 'is-path', done && 'is-done'].filter(Boolean).join(' ')
          return (
            <button
              key={n.id}
              ref={active ? activeRef : null}
              className={cls}
              style={{ left: px(n), top: py(n) }}
              onClick={() => onSeek(n.callStep)}
              title={n.label}
            >
              <span className="ct-label">{n.label}</span>
              {done && <span className="ct-ret">→ {n.ret}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
