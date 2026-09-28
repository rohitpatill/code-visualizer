import { useShallow } from 'zustand/react/shallow'
import { SPEEDS, type Store, useStore } from '../../app/store'

const select = (s: Store) => ({
  index: s.index,
  playing: s.playing,
  speed: s.speed,
  guessMode: s.guessMode,
  score: s.score,
  hasBreakpoints: s.breakpoints.size > 0,
  go: s.go,
  next: s.next,
  togglePlay: s.togglePlay,
  stepOver: s.stepOver,
  stepOut: s.stepOut,
  nextBreakpoint: s.nextBreakpoint,
  toggleGuess: s.toggleGuess,
  setSpeed: s.setSpeed,
})

export function Transport({ last, depth }: { last: number; depth: number }) {
  const s = useStore(useShallow(select))
  const atStart = s.index === 0
  const atEnd = s.index >= last

  return (
    <div className="transport">
      <div className="buttons">
        <button className="btn icon" onClick={() => s.go(0)} disabled={atStart} aria-label="First step" title="First step (Home)">
          ⏮
        </button>
        <button className="btn icon" onClick={() => s.go(s.index - 1)} disabled={atStart} aria-label="Back" title="Back (←)">
          ◀
        </button>
        <button className="btn btn-primary play" onClick={s.togglePlay} title="Play or pause (Space)">
          {s.playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
        </button>
        <button className="btn icon" onClick={s.next} disabled={atEnd} aria-label="Next" title="Next (→)">
          ▶
        </button>
        <button className="btn icon" onClick={() => s.go(last)} disabled={atEnd} aria-label="Last step" title="Last step (End)">
          ⏭
        </button>
      </div>
      <div className="buttons">
        <button className="btn" onClick={s.stepOver} disabled={atEnd} title="Run until the next line at this depth, skipping calls (Shift + →)">
          Step over
        </button>
        <button className="btn" onClick={s.stepOut} disabled={atEnd || depth <= 1} title="Run until the current function returns (Shift + ↑)">
          Step out
        </button>
        {s.hasBreakpoints && (
          <button className="btn" onClick={s.nextBreakpoint} disabled={atEnd}>
            Next breakpoint
          </button>
        )}
      </div>
      <span className="counter">
        Step {s.index + 1} of {last + 1}
      </span>
      <div className="speed">
        <button
          className={`chip${s.guessMode ? ' is-on' : ''}`}
          onClick={s.toggleGuess}
          aria-pressed={s.guessMode}
          title="Predict each change before it happens"
        >
          Guess mode{s.guessMode && s.score.total > 0 ? `: ${s.score.right}/${s.score.total}` : ''}
        </button>
        <span className="speed-sep" />
        {SPEEDS.map((speed, i) => (
          <button key={speed.label} className={`chip${s.speed === i ? ' is-on' : ''}`} onClick={() => s.setSpeed(i)} aria-pressed={s.speed === i}>
            {speed.label}
          </button>
        ))}
      </div>
    </div>
  )
}
