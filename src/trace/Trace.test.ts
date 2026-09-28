import { describe, expect, it } from 'vitest'
import { Trace } from './Trace'
import type { Frame, HeapObject, RawTrace, WireStep } from './types'

const list = (n: number): HeapObject => ({ kind: 'list', type: 'list', items: [{ t: 'p', k: 'int', v: String(n) }], size: 1 })
const frame = (id: number, line = 1): Frame => ({ id, name: id === 1 ? 'module' : `f${id}`, line, global: id === 1, vars: [] })
const wrap = (steps: WireStep[]): RawTrace => ({ steps, truncated: false, error: null, stdout: 'x'.repeat(steps.length), maxSteps: 3000 })

function synthetic(length: number): RawTrace {
  const steps: WireStep[] = Array.from({ length }, (_, i) => {
    const set: Record<string, HeapObject> = { '1': list(i) }
    if (i === 100) set['2'] = list(-1)
    return {
      line: i + 1,
      event: 'line',
      frames: i === 0 ? { keep: 0, push: [frame(1)] } : { keep: 1, push: [] },
      out: i,
      heap: i === 200 ? { set, del: ['2'] } : { set },
    }
  })
  return wrap(steps)
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

describe('Trace frames', () => {
  const step = (keep: number, push: Frame[]): WireStep => ({ line: 1, event: 'line', frames: { keep, push }, out: 0, heap: {} })

  it('rebuilds the stack from kept frames plus pushed ones', () => {
    const t = new Trace(
      wrap([
        step(0, [frame(1)]),
        step(1, [frame(2)]),
        step(2, [frame(3)]),
        step(2, [frame(3, 5)]),
        step(1, []),
        step(0, [frame(1, 9)]),
      ]),
    )
    const shape = t.records.map((r) => r.frames.map((f) => `${f.id}@${f.line}`).join(' '))
    expect(shape).toEqual(['1@1', '1@1 2@1', '1@1 2@1 3@1', '1@1 2@1 3@5', '1@1', '1@9'])
  })

  it('shares frame objects between steps instead of copying them', () => {
    const t = new Trace(wrap([step(0, [frame(1)]), step(1, [frame(2)]), step(2, [])]))
    expect(t.records[1]!.frames[0]).toBe(t.records[0]!.frames[0])
    expect(t.records[2]!.frames).toBe(t.records[1]!.frames)
  })

  it('refuses a step that keeps more frames than exist', () => {
    expect(() => new Trace(wrap([step(1, [])]))).toThrow(/keeps 1 frames of 0/)
  })
})
