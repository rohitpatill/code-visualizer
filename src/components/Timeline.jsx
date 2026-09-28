// Depth map of the whole run: one bar per step, bar height = call depth.
// Recursion shows up as a mountain; click or drag anywhere to jump there.
export function Timeline({ steps, index, onSeek }) {
  const maxDepth = Math.max(1, ...steps.map((s) => s.frames.length))
  const n = steps.length

  const seekFromEvent = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    onSeek(Math.min(n - 1, Math.floor(ratio * n)))
  }

  return (
    <div
      className="timeline"
      role="slider"
      tabIndex={0}
      aria-label="Step"
      aria-valuemin={1}
      aria-valuemax={n}
      aria-valuenow={index + 1}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        seekFromEvent(e)
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) seekFromEvent(e)
      }}
    >
      <svg viewBox={`0 0 ${n} ${maxDepth}`} preserveAspectRatio="none">
        {steps.map((s, i) => (
          <rect
            key={i}
            x={i}
            y={maxDepth - s.frames.length}
            width={1}
            height={s.frames.length}
            className={i === index ? 'bar is-current' : i < index ? 'bar is-past' : s.event === 'exception' ? 'bar is-error' : 'bar'}
          />
        ))}
      </svg>
      <div className="playhead" style={{ left: `${((index + 0.5) / n) * 100}%` }} />
    </div>
  )
}
