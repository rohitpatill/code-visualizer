import { describe, expect, it } from 'vitest'
import { Trace } from './Trace'
import type { HeapObject, RawTrace, StepRecord } from './types'

const list = (n: number): HeapObject => ({ kind: 'list', type: 'list', items: [{ t: 'p', k: 'int', v: String(n) }], size: 1 })

function synthetic(length: number): RawTrace {
  const steps: StepRecord[] = Array.from({ length }, (_, i) => {
    const set: Record<string, HeapObject> = { '1': list(i) }
    if (i === 100) set['2'] = list(-1)
    return {
      line: i + 1,
      event: 'line',
      frames: [{ id: 0, name: 'module', line: i + 1, global: true, vars: [] }],
      out: i,
      heap: i === 200 ? { set, del: ['2'] } : { set },
    }
  })
  return { steps, truncated: false, error: null, stdout: 'x'.repeat(length), maxSteps: 3000 }
}

describe('Trace', () => {
  const raw = synthetic(300)
  const trace = new Trace(raw)

  it('rebuilds every step exactly as a forward replay does, in any order', () => {
    const expected: [string, HeapObject][][] = []
    trace.scan((_, heap) => expected.push([...heap]))
    const order = Array.from({ length: raw.steps.length }, (_, i) => (i * 7919) % raw.steps.length)
    for (const i of order) expect([...trace.step(i).heap]).toEqual(expected[i])
  })

  it('tracks objects that appear and disappear', () => {
    expect(trace.step(99).heap.has('2')).toBe(false)
    expect(trace.step(150).heap.get('2')).toEqual(list(-1))
    expect(trace.step(200).heap.has('2')).toBe(false)
  })

  it('slices stdout and lists touched ids per step', () => {
    const step = trace.step(100)
    expect(step.stdout).toBe('x'.repeat(100))
    expect([...step.touched].sort()).toEqual(['1', '2'])
  })

  it('returns the same object for a cached step', () => {
    expect(trace.step(42)).toBe(trace.step(42))
  })

  it('rejects out of range steps', () => {
    expect(() => trace.step(300)).toThrow(RangeError)
  })
})
