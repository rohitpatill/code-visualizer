// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { joinSource } from '../../app/source'
import { useStore } from '../../app/store'
import { engines } from '../../engines/registry'
import type { Engine, Sample } from '../../engines/types'
import { allSamples, golden, sampleOf } from '../../test/goldens'
import { Trace } from '../../trace/Trace'
import { Guide } from '../Guide'
import { TopBar } from '../TopBar'
import { ViewLayout } from './ViewLayout'

const traceOf = (engine: Engine, sample: Sample) => new Trace(golden(engine, sample))

const initial = useStore.getState()
let container: HTMLDivElement
let root: Root

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView = () => {}
})

beforeEach(() => {
  useStore.setState(initial, true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const show = () =>
  act(() => {
    const { run } = useStore.getState()
    if (!run) throw new Error('No run open')
    root.render(<ViewLayout run={run} />)
  })

const text = () => container.textContent ?? ''

describe('view layout renders every sample', () => {
  for (const [engine, sample] of allSamples) {
    it(`${engine.id}: ${sample.name}`, () => {
      const trace = traceOf(engine, sample)
      act(() => {
        useStore.getState().setEngine(engine.id)
        useStore.getState().loadSample(sample)
        useStore.getState().openRun(trace, joinSource(sample.code, sample.call ?? ''))
      })
      show()
      for (let i = 0; i < trace.length; i++) {
        act(() => useStore.getState().go(i))
        expect(text()).toContain(`Step ${i + 1} of ${trace.length}`)
      }
      act(() => useStore.getState().setTab('calls'))
      expect(container.querySelector('.memory-inner')).toBeNull()
      act(() => useStore.getState().setTab('memory'))
      expect(container.querySelector('.stack')).not.toBeNull()
    })
  }
})

describe.each(engines)('view layout states: $label', (engine) => {
  beforeEach(() => act(() => useStore.getState().setEngine(engine.id)))

  it('draws structure cards for preset views', () => {
    const sample = sampleOf(engine, 'binary-search')
    act(() => {
      useStore.getState().loadSample(sample)
      useStore.getState().openRun(traceOf(engine, sample), sample.code)
      useStore.getState().go(10)
    })
    show()
    expect(container.querySelector('.struct')?.textContent).toContain('nums as array')
  })

  it('shows the error for a run with no steps', () => {
    act(() => useStore.getState().openRun(Trace.failed('SyntaxError: bad'), 'x = (\n'))
    show()
    expect(text()).toContain('SyntaxError: bad')
  })

  it('asks a question in guess mode', () => {
    const sample = sampleOf(engine, 'sliding-window')
    act(() => {
      useStore.getState().openRun(traceOf(engine, sample), sample.code)
      useStore.getState().toggleGuess()
    })
    show()
    act(() => useStore.getState().next())
    act(() => useStore.getState().next())
    expect(text()).toContain('What will')
  })

  it('renders the top bar and guide', () => {
    act(() =>
      root.render(
        <>
          <TopBar status="ready" onVisualize={() => {}} />
          <Guide />
        </>,
      ),
    )
    expect(text()).toContain('Visualize')
    for (const helper of engine.copy.helpers) expect(text()).toContain(helper)
  })
})
