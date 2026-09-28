import { engines } from '../engines/registry'
import type { Engine, Sample } from '../engines/types'
import type { RawTrace } from '../trace/types'

const files = import.meta.glob<RawTrace>('../engines/*/__golden__/*.json', { eager: true, import: 'default' })

export const goldenPath = (engineId: string, sampleId: string) => `../engines/${engineId}/__golden__/${sampleId}.json`

export function golden(engine: Engine, sample: Sample): RawTrace {
  const raw = files[goldenPath(engine.id, sample.id)]
  if (!raw) throw new Error(`No golden trace for ${engine.id}/${sample.id}. Run the ${engine.id} tracer tests first.`)
  return raw
}

/** Every sample of every registered engine. */
export const allSamples: readonly [Engine, Sample][] = engines.flatMap((e) => e.samples.map((s): [Engine, Sample] => [e, s]))

export function sampleOf(engine: Engine, id: Sample['id']): Sample {
  const sample = engine.samples.find((s) => s.id === id)
  if (!sample) throw new Error(`${engine.id} has no sample ${id}`)
  return sample
}
