import { useStore } from '../../app/store'
import { engines } from '../../engines/registry'

export function LanguagePicker() {
  const current = useStore((s) => s.engine.id)
  const setEngine = useStore((s) => s.setEngine)
  if (engines.length < 2) return null
  return (
    <select className="picker" value={current} onChange={(e) => setEngine(e.target.value)} aria-label="Language">
      {engines.map((e) => (
        <option key={e.id} value={e.id}>
          {e.label}
        </option>
      ))}
    </select>
  )
}
