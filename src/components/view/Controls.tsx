import { useStore } from '../../app/store'
import { describeStep } from '../../model/describe'
import type { Trace } from '../../trace/Trace'
import type { Step } from '../../trace/types'
import { QuizForm } from './QuizForm'
import { Timeline } from './Timeline'
import { Transport } from './Transport'

export function ErrorBanner({ trace }: { trace: Trace }) {
  if (!trace.error) return null
  return (
    <p className="banner banner-error">
      {trace.error.message}
      {trace.error.line ? ` (line ${trace.error.line})` : ''}
    </p>
  )
}

export function Controls({ trace, index, step }: { trace: Trace; index: number; step: Step }) {
  const quiz = useStore((s) => s.quiz)
  const go = useStore((s) => s.go)
  const last = trace.length - 1
  const atEnd = index >= last
  const narration = describeStep(step)

  return (
    <footer className="controls">
      {quiz ? (
        <QuizForm quiz={quiz} line={step.line} />
      ) : (
        <div className={`narration event-${step.event}`} aria-live="polite">
          <strong>{narration.title}</strong>
          <span>{narration.detail}</span>
        </div>
      )}
      <Timeline records={trace.records} index={index} onSeek={go} />
      <Transport last={last} depth={step.frames.length} />
      {atEnd && <ErrorBanner trace={trace} />}
      {atEnd && trace.truncated && (
        <p className="banner banner-warn">Stopped at {trace.maxSteps} steps. The code may loop forever, or it is just long.</p>
      )}
    </footer>
  )
}
