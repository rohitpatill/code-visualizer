import { useMemo, useRef } from 'react'
import { useStore } from '../../app/store'
import { buildCallTree } from '../../model/callTree'
import { diffSteps } from '../../model/diff'
import { scanAccesses } from '../../structures/accesses'
import { buildStructures } from '../../structures/build'
import { buildIndexMarks } from '../../structures/indexMarks'
import { buildTags } from '../../structures/pointers'
import type { Trace } from '../../trace/Trace'
import type { Step } from '../../trace/types'
import { topFrame } from '../../trace/values'
import { Arrows } from '../memory/Arrows'
import { type Cover, CoverContext } from '../memory/cover'
import { HeapPanel } from '../memory/HeapPanel'
import { StackPanel } from '../memory/StackPanel'
import { CallTreeView } from './CallTreeView'

interface Props {
  trace: Trace
  index: number
  step: Step
  prevStep: Step | null
}

function Memory({ step, prevStep }: { step: Step; prevStep: Step | null }) {
  const views = useStore((s) => s.views)
  const source = useStore((s) => s.run?.source ?? '')
  const lineComment = useStore((s) => s.engine.lineComment)
  const memoryRef = useRef<HTMLDivElement>(null)
  const accesses = useMemo(() => scanAccesses(source, lineComment), [source, lineComment])
  const marks = useMemo(() => buildIndexMarks(step, accesses), [step, accesses])
  const prevMarks = useMemo(() => (prevStep ? buildIndexMarks(prevStep, accesses) : null), [prevStep, accesses])
  const changed = useMemo(() => diffSteps(prevStep, step), [prevStep, step])
  const built = useMemo(() => buildStructures(step, views, marks), [step, views, marks])
  const prevStructures = useMemo(
    () => (prevStep && prevMarks ? buildStructures(prevStep, views, prevMarks).structures : []),
    [prevStep, prevMarks, views],
  )
  const tags = useMemo(() => buildTags(step), [step])
  const cover = useMemo<Cover>(
    () => ({ coveredBy: built.coveredBy, roots: new Set(built.structures.flatMap((s) => (s.rootId ? [s.rootId] : []))) }),
    [built],
  )
  return (
    <CoverContext.Provider value={cover}>
      <div className="memory-inner" ref={memoryRef}>
        <StackPanel step={step} changed={changed} />
        <HeapPanel step={step} prevStep={prevStep} changed={changed} built={built} prevStructures={prevStructures} tags={tags} marks={marks} />
        <Arrows containerRef={memoryRef} layoutKey={built} />
      </div>
    </CoverContext.Provider>
  )
}

export function MemoryPane({ trace, index, step, prevStep }: Props) {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const go = useStore((s) => s.go)
  const callTree = useMemo(() => buildCallTree(trace), [trace])
  const noCalls = callTree.callCount === 0

  return (
    <section className="memory-pane">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'memory'} className={`tab${tab === 'memory' ? ' is-on' : ''}`} onClick={() => setTab('memory')}>
          Memory
        </button>
        <button
          role="tab"
          aria-selected={tab === 'calls'}
          className={`tab${tab === 'calls' ? ' is-on' : ''}`}
          onClick={() => setTab('calls')}
          disabled={noCalls}
          title={noCalls ? 'This code makes no function calls' : 'Every function call as a tree'}
        >
          Call tree {!noCalls && <span className="tab-count">{callTree.callCount}</span>}
        </button>
      </div>
      <div className="memory">
        {tab === 'memory' ? (
          <Memory step={step} prevStep={prevStep} />
        ) : (
          <CallTreeView tree={callTree} index={index} activeFrameId={topFrame(step)?.id} onSeek={go} />
        )}
      </div>
    </section>
  )
}
