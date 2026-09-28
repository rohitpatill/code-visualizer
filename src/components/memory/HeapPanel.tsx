import { useMemo } from 'react'
import { useStore } from '../../app/store'
import type { StepDiff } from '../../model/diff'
import { layoutHeap } from '../../model/heapLayout'
import type { BuiltStructures, Structure, Tag } from '../../structures/types'
import type { Step } from '../../trace/types'
import { StructureCard } from '../structures/StructureCard'
import { HeapObject } from './HeapObject'

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

interface Props {
  step: Step
  prevStep: Step | null
  changed: StepDiff
  built: BuiltStructures
  prevStructures: readonly Structure[]
  tags: ReadonlyMap<string, Tag[]>
}

export function HeapPanel({ step, prevStep, changed, built, prevStructures, tags }: Props) {
  const setView = useStore((s) => s.setView)
  const containers = useStore((s) => s.engine.copy.containers)
  const rows = useMemo(() => layoutHeap(step, new Set(built.coveredBy.keys())), [step, built])
  const prevByKey = useMemo(() => new Map(prevStructures.map((s) => [s.key, s])), [prevStructures])
  return (
    <div className="heap">
      <h2 className="column-title">Heap</h2>
      {built.structures.map((s) => (
        <StructureCard
          key={s.key}
          struct={s}
          prevStruct={prevByKey.get(s.key)}
          heap={step.heap}
          tags={tags}
          onClose={() => setView(s.name, null)}
        />
      ))}
      {rows.length === 0 && built.structures.length === 0 && (
        <p className="heap-empty">{sentence(containers)} appear here once a variable points at one.</p>
      )}
      {rows.map((row) => (
        <div className="heap-row" key={row[0]}>
          {row.map((id) => {
            const obj = step.heap.get(id)
            if (!obj) return null
            return (
              <HeapObject
                key={id}
                id={id}
                obj={obj}
                prev={prevStep?.heap.get(id)}
                isNew={!!prevStep && !prevStep.heap.has(id)}
                isChanged={changed.heap.has(id)}
                heap={step.heap}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
