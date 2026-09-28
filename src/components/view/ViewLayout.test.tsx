// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { joinSource } from '../../app/source'
import { useStore } from '../../app/store'
import { samples } from '../../engines/python/samples'
import type { Sample } from '../../engines/types'
import { Trace } from '../../trace/Trace'
import type { RawTrace } from '../../trace/types'
import { Guide } from '../Guide'
import { TopBar } from '../TopBar'
import { ViewLayout } from './ViewLayout'

const goldens = import.meta.glob<RawTrace>('../../engines/python/__golden__/*.json', { eager: true, import: 'default' })
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const traceOf = (sample: Sample) => new Trace(goldens[`../../engines/python/__golden__/${slug(sample.name)}.json`]!)

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
  for (const sample of samples) {
    it(sample.name, () => {
      const trace = traceOf(sample)
      act(() => {
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

describe('view layout states', () => {
  it('draws structure cards for preset views', () => {
    const sample = samples.find((s) => s.name === 'Binary search')!
    act(() => {
      useStore.getState().loadSample(sample)
      useStore.getState().openRun(traceOf(sample), sample.code)
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
    const sample = samples.find((s) => s.name.startsWith('Sliding window'))!
    act(() => {
      useStore.getState().openRun(traceOf(sample), sample.code)
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
    expect(text()).toContain('build_list([1, 2, 3])')
  })
})
