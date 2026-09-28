import { useCallback } from 'react'
import { EditPane } from '../components/edit/EditPane'
import { Guide } from '../components/Guide'
import { TopBar } from '../components/TopBar'
import { ViewLayout } from '../components/view/ViewLayout'
import { useRunner } from '../engines/useRunner'
import { useStore } from './store'
import { useKeyboard } from './useKeyboard'
import { usePlayback } from './usePlayback'

export default function App() {
  const engine = useStore((s) => s.engine)
  const run = useStore((s) => s.run)
  const guideOpen = useStore((s) => s.guideOpen)
  const { status, error: loadError, run: execute } = useRunner(engine)
  usePlayback()
  useKeyboard()

  const visualize = useCallback(async () => {
    const { code, call, stdin, openRun } = useStore.getState()
    const source = engine.buildProgram(code, call)
    openRun(await execute(source, stdin), source)
  }, [engine, execute])

  return (
    <div className="app">
      <TopBar status={status} onVisualize={visualize} />
      {status === 'failed' && (
        <p className="banner banner-error">
          {engine.label} could not load: {loadError}. Check your internet connection and reload.
        </p>
      )}
      {run ? <ViewLayout run={run} /> : <EditPane />}
      {guideOpen && <Guide />}
    </div>
  )
}
