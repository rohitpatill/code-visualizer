import { useEffect, useRef } from 'react'
import { type CallNode, type CallTree, ROOT_CALL } from '../../model/callTree'

const W = 128
const H = 78
const TOP = 24
const EDGE_GAP = 14

const px = (n: CallNode) => n.x * W + W / 2
const py = (n: CallNode) => n.depth * H + TOP

interface Props {
  tree: CallTree
  index: number
  activeFrameId: number | undefined
  onSeek: (i: number) => void
}

export function CallTreeView({ tree, index, activeFrameId, onSeek }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null)
  const visible = tree.nodes.filter((n) => n.callStep <= index)

  // The chain from the running call back to the root is highlighted.
  const path = new Set<number>()
  const start = (activeFrameId !== undefined && tree.byId.get(activeFrameId)) || tree.byId.get(ROOT_CALL)
  for (let cur = start; cur; cur = cur.parent === null ? undefined : tree.byId.get(cur.parent)) {
    path.add(cur.id)
  }

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeFrameId])

  const w = Math.max(1, tree.width) * W
  const h = (tree.depth + 1) * H + 20

  return (
    <div className="calltree">
      <p className="calltree-note">Every call made so far. Amber is the path to the running call. Click a call to jump to it.</p>
      <div className="calltree-canvas" style={{ width: w, height: h }}>
        <svg width={w} height={h}>
          {visible.map((n) => {
            const p = n.parent === null ? undefined : tree.byId.get(n.parent)
            if (!p) return null
            const hot = path.has(n.id) && path.has(p.id)
            return (
              <line
                key={n.id}
                x1={px(p)}
                y1={py(p) + EDGE_GAP}
                x2={px(n)}
                y2={py(n) - EDGE_GAP}
                className={hot ? 'ct-edge is-hot' : 'ct-edge'}
              />
            )
          })}
        </svg>
        {visible.map((n) => {
          const done = n.returnStep !== undefined && n.returnStep <= index
          const active = n.id === activeFrameId
          const cls = ['ct-node', active && 'is-active', path.has(n.id) && !active && 'is-path', done && 'is-done']
          return (
            <button
              key={n.id}
              ref={active ? activeRef : null}
              className={cls.filter(Boolean).join(' ')}
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
