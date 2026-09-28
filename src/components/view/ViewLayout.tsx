import { useMemo } from 'react'
import { type Run, useStore } from '../../app/store'
import { isProgramEnd } from '../../trace/values'
import { CodeView } from './CodeView'
import { Controls, ErrorBanner } from './Controls'
import { MemoryPane } from './MemoryPane'
import { OutputPanel } from './OutputPanel'

function EmptyRun({ run }: { run: Run }) {
  const highlight = useStore((s) => s.engine.highlight)
  const { trace } = run
  return (
    <main className="empty-run">
      {trace.error ? <ErrorBanner trace={trace} /> : <p className="banner banner-error">Nothing ran.</p>}
      <CodeView code={run.source} highlight={highlight} nextLine={null} errorLine={trace.error?.line} />
    </main>
  )
}

export function ViewLayout({ run }: { run: Run }) {
  const index = useStore((s) => s.index)
  const breakpoints = useStore((s) => s.breakpoints)
  const toggleBreakpoint = useStore((s) => s.toggleBreakpoint)
  const highlight = useStore((s) => s.engine.highlight)
  const { trace } = run
  const step = useMemo(() => (trace.length ? trace.step(index) : null), [trace, index])
  const prevStep = useMemo(() => (index > 0 ? trace.step(index - 1) : null), [trace, index])

  if (!step) return <EmptyRun run={run} />
  const atEnd = index === trace.length - 1
  return (
    <main className="view-layout">
      <section className="code-pane">
        <CodeView
          code={run.source}
          highlight={highlight}
          nextLine={isProgramEnd(step) ? null : step.line}
          prevLine={prevStep?.line}
          errorLine={atEnd ? trace.error?.line : null}
          breakpoints={breakpoints}
          onToggleBreakpoint={toggleBreakpoint}
        />
        <OutputPanel stdout={step.stdout} prevStdout={prevStep?.stdout ?? ''} />
      </section>
      <MemoryPane trace={trace} index={index} step={step} prevStep={prevStep} />
      <Controls trace={trace} index={index} step={step} />
    </main>
  )
}
