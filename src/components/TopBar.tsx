import { useStore } from '../app/store'
import type { EngineStatus } from '../engines/useEngine'
import { SamplePicker } from './edit/SamplePicker'

interface Props {
  status: EngineStatus
  onVisualize: () => void
}

function visualizeLabel(status: EngineStatus, language: string): string {
  if (status === 'loading') return `Loading ${language}…`
  if (status === 'running') return 'Running…'
  return 'Visualize'
}

export function TopBar({ status, onVisualize }: Props) {
  const viewing = useStore((s) => s.run !== null)
  const language = useStore((s) => s.engine.label)
  const closeRun = useStore((s) => s.closeRun)
  const setGuideOpen = useStore((s) => s.setGuideOpen)
  return (
    <header className="topbar">
      <h1 className="brand">Stepthrough</h1>
      <div className="topbar-actions">
        {!viewing && <SamplePicker />}
        <button className="btn" onClick={() => setGuideOpen(true)}>
          How to use
        </button>
        {viewing ? (
          <button className="btn" onClick={closeRun}>
            Edit code
          </button>
        ) : (
          <button className="btn btn-primary" onClick={onVisualize} disabled={status !== 'ready'}>
            {visualizeLabel(status, language)}
          </button>
        )}
      </div>
    </header>
  )
}
