import { type PointerEvent, useId, useMemo } from 'react'
import type { StepRecord } from '../../trace/types'

function barsPath(records: readonly StepRecord[], maxDepth: number, keep: (r: StepRecord) => boolean): string {
  let d = ''
  records.forEach((r, i) => {
    if (keep(r)) d += `M${i} ${maxDepth - r.frames.length}h1v${r.frames.length}h-1z`
  })
  return d
}

// One bar per step, height = call depth, so recursion reads as a mountain.
// The bars are drawn once per run; moving the playhead only moves a clip and one rect.
export function Timeline({ records, index, onSeek }: { records: readonly StepRecord[]; index: number; onSeek: (i: number) => void }) {
  const clipId = useId()
  const n = records.length
  const maxDepth = useMemo(() => records.reduce((m, r) => Math.max(m, r.frames.length), 1), [records])
  const all = useMemo(() => barsPath(records, maxDepth, () => true), [records, maxDepth])
  const errors = useMemo(() => barsPath(records, maxDepth, (r) => r.event === 'exception'), [records, maxDepth])
  const depth = records[index]?.frames.length ?? 0

  const seek = (e: PointerEvent<HTMLDivElement>) => {
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
        seek(e)
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) seek(e)
      }}
    >
      <svg viewBox={`0 0 ${n} ${maxDepth}`} preserveAspectRatio="none">
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={index} height={maxDepth} />
          </clipPath>
        </defs>
        <path d={all} className="bar" />
        {errors && <path d={errors} className="bar is-error" />}
        <path d={all} className="bar is-past" clipPath={`url(#${clipId})`} />
        <rect x={index} y={maxDepth - depth} width={1} height={depth} className="bar is-current" />
      </svg>
      <div className="playhead" style={{ left: `${((index + 0.5) / n) * 100}%` }} />
    </div>
  )
}
