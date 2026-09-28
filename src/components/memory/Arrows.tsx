import { type RefObject, useLayoutEffect, useState } from 'react'
import { useStore } from '../../app/store'

interface Path {
  key: string
  id: string
  d: string
}

const MIN_BEND = 36
const TARGET_Y = 14

function measure(el: HTMLElement): Path[] {
  const base = el.getBoundingClientRect()
  const targets = new Map<string, DOMRect>()
  for (const t of el.querySelectorAll<HTMLElement>('[data-heap]')) {
    const id = t.dataset.heap
    if (id && !targets.has(id)) targets.set(id, t.getBoundingClientRect())
  }
  const paths: Path[] = []
  el.querySelectorAll<HTMLElement>('[data-port]').forEach((port, i) => {
    const id = port.dataset.port
    const t = id ? targets.get(id) : undefined
    if (!id || !t) return
    const p = port.getBoundingClientRect()
    const x1 = p.left + p.width / 2 - base.left
    const y1 = p.top + p.height / 2 - base.top
    const x2 = t.left - base.left - 2
    const y2 = t.top - base.top + TARGET_Y
    const bend = Math.max(MIN_BEND, Math.abs(x2 - x1) * 0.45)
    paths.push({ key: `${id}-${i}`, id, d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` })
  })
  return paths
}

/** Curves from every port to the heap object it points at, measured from the DOM after each layout. */
export function Arrows({ containerRef, layoutKey }: { containerRef: RefObject<HTMLDivElement>; layoutKey: unknown }) {
  const hovered = useStore((s) => s.hovered)
  const [paths, setPaths] = useState<Path[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [resized, setResized] = useState(0)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setResized((n) => n + 1))
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    setPaths(measure(el))
    setSize({ w: el.scrollWidth, h: el.scrollHeight })
  }, [containerRef, layoutKey, resized])

  return (
    <svg className="arrows" width={size.w} height={size.h} aria-hidden="true">
      <defs>
        <marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" className="head" />
        </marker>
        <marker id="head-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" className="head-hot" />
        </marker>
      </defs>
      {paths.map((p) => {
        const hot = hovered === p.id
        const dim = hovered !== null && !hot
        return (
          <path
            key={p.key}
            d={p.d}
            className={`arrow${hot ? ' is-hot' : ''}${dim ? ' is-dim' : ''}`}
            markerEnd={`url(#${hot ? 'head-hot' : 'head'})`}
          />
        )
      })}
    </svg>
  )
}
