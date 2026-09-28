import { useMemo } from 'react'
import { useStore } from '../../app/store'
import type { Sample } from '../../engines/types'

function groupSamples(samples: readonly Sample[]): [string, [number, Sample][]][] {
  const groups = new Map<string, [number, Sample][]>()
  samples.forEach((s, i) => {
    const list = groups.get(s.group)
    if (list) list.push([i, s])
    else groups.set(s.group, [[i, s]])
  })
  return [...groups]
}

export function SamplePicker() {
  const samples = useStore((s) => s.engine.samples)
  const loadSample = useStore((s) => s.loadSample)
  const groups = useMemo(() => groupSamples(samples), [samples])
  return (
    <select
      className="sample-picker"
      value=""
      onChange={(e) => {
        const sample = samples[Number(e.target.value)]
        if (sample) loadSample(sample)
      }}
      aria-label="Load an example"
    >
      <option value="">Load an example</option>
      {groups.map(([group, items]) => (
        <optgroup key={group} label={group}>
          {items.map(([i, s]) => (
            <option key={s.name} value={i}>
              {s.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
