import type { GraphData } from '../../structures/types'
import { Tags } from './Tags'
import { NODE } from './TreeLayout'

interface Point {
  x: number
  y: number
}

const MIN_RADIUS = 70
const RADIUS_PER_NODE = 16
const MARGIN = 80

function circleLayout(keys: readonly string[]): { size: number; pos: Map<string, Point> } {
  const n = keys.length
  const radius = Math.max(MIN_RADIUS, n * RADIUS_PER_NODE)
  const size = radius * 2 + MARGIN
  const pos = new Map(
    keys.map((k, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2
      return [k, { x: size / 2 + radius * Math.cos(a), y: size / 2 + radius * Math.sin(a) }]
    }),
  )
  return { size, pos }
}

function shorten(a: Point, b: Point, by: number): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  return { x: b.x - (dx / len) * by, y: b.y - (dy / len) * by }
}

const stripQuotes = (k: string) => k.replace(/^['"]|['"]$/g, '')

export function GraphView({ data }: { data: GraphData }) {
  const { keys, edges, undirected, visited, frontier, current } = data
  if (!keys.length) return <div className="struct-empty">empty graph</div>
  const { size, pos } = circleLayout(keys)
  return (
    <div className="graph-wrap">
      <div className="graph" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <defs>
            <marker id="g-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" className="g-head" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const a = pos.get(e.from)
            const b = pos.get(e.to)
            if (!a || !b) return null
            const end = undirected ? b : shorten(a, b, NODE / 2 + 2)
            return (
              <g key={i}>
                <line x1={a.x} y1={a.y} x2={end.x} y2={end.y} className="g-edge" markerEnd={undirected ? undefined : 'url(#g-head)'} />
                {e.weight !== null && (
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} className="g-weight">
                    {e.weight}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        {keys.map((k) => {
          const p = pos.get(k)!
          const names = current.get(k)
          const cls = ['gnode', visited.has(k) && 'is-visited', frontier.has(k) && 'is-frontier', names && 'is-current']
          return (
            <div key={k} className="tree-node-wrap" style={{ left: p.x, top: p.y }}>
              {names && <Tags tags={names.map((name) => ({ name, active: true }))} />}
              <div className={cls.filter(Boolean).join(' ')}>{stripQuotes(k)}</div>
            </div>
          )
        })}
      </div>
      <div className="legend">
        <span>
          <i className="sw sw-current" /> current
        </span>
        <span>
          <i className="sw sw-frontier" /> waiting (queue / stack)
        </span>
        <span>
          <i className="sw sw-visited" /> visited
        </span>
      </div>
    </div>
  )
}
