import { useLayoutEffect, useState } from 'react'

// Draws a curve from every port to the heap object it points at. Positions are
// measured from the DOM after each render, relative to the shared container.
export function Arrows({ containerRef, deps, hovered }) {
  const [paths, setPaths] = useState([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [tick, setTick] = useState(0)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setTick((t) => t + 1))
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const base = el.getBoundingClientRect()
    const next = []
    el.querySelectorAll('[data-port]').forEach((port, i) => {
      const id = port.dataset.port
      const target = el.querySelector(`[data-heap="${id}"]`)
      if (!target) return
      const p = port.getBoundingClientRect()
      const t = target.getBoundingClientRect()
      const x1 = p.left + p.width / 2 - base.left
      const y1 = p.top + p.height / 2 - base.top
      const x2 = t.left - base.left - 2
      const y2 = t.top - base.top + 14
      const bend = Math.max(36, Math.abs(x2 - x1) * 0.45)
      next.push({ key: `${id}-${i}`, id, d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` })
    })
    setPaths(next)
    setSize({ w: el.scrollWidth, h: el.scrollHeight })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

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
        const dim = hovered && !hot
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
