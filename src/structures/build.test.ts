import { describe, expect, it } from 'vitest'
import { engines } from '../engines/registry'
import type { Engine } from '../engines/types'
import { buildCallTree } from '../model/callTree'
import { describeStep } from '../model/describe'
import { diffSteps } from '../model/diff'
import { layoutHeap } from '../model/heapLayout'
import type { SampleId } from '../samples/catalog'
import { allSamples, golden, sampleOf } from '../test/goldens'
import { Trace } from '../trace/Trace'
import type { Step } from '../trace/types'
import { buildStructures } from './build'
import { buildTags } from './pointers'
import { suggestContext, suggestView } from './suggest'
import type { Structure, ViewName } from './types'

function load(engine: Engine, id: SampleId) {
  const sample = sampleOf(engine, id)
  const trace = new Trace(golden(engine, sample))
  const steps = Array.from({ length: trace.length }, (_, i) => trace.step(i))
  return { sample, trace, steps, views: sample.views ?? {} }
}

function structuresOf<V extends ViewName>(steps: Step[], views: Record<string, ViewName>, view: V) {
  return steps
    .flatMap((s) => buildStructures(s, views).structures)
    .filter((s): s is Extract<Structure, { view: V }> => s.view === view)
}

describe('structure builders on every sample', () => {
  for (const [engine, sample] of allSamples) {
    it(`${engine.id}: ${sample.name} builds every step`, () => {
      const { steps, trace, views } = load(engine, sample.id)
      steps.forEach((step, i) => {
        const built = buildStructures(step, views)
        expect(describeStep(step).title).not.toBe('')
        diffSteps(steps[i - 1] ?? null, step)
        layoutHeap(step, new Set(built.coveredBy.keys()))
        buildTags(step)
        const ctx = suggestContext(step)
        for (const frame of step.frames) for (const [name, v] of frame.vars) suggestView(name, v, ctx)
      })
      expect(buildCallTree(trace).nodes.length).toBeGreaterThan(0)
    })

    it(`${engine.id}: ${sample.name} uses the variable names its preset views expect`, () => {
      const { steps, views } = load(engine, sample.id)
      const seen = new Set(steps.flatMap((s) => s.frames.flatMap((f) => f.vars.map(([n]) => n))))
      for (const name of Object.keys(views)) expect(seen).toContain(name)
    })
  }
})

describe.each(engines)('structure builders: $label', (engine) => {
  it('marks binary search pointers and the lo..hi window', () => {
    const { steps, views } = load(engine, 'binary-search')
    const arrays = structuresOf(steps, views, 'array')
    expect(arrays.some((a) => a.data.pointers.some(([n]) => n === 'mid'))).toBe(true)
    expect(arrays.some((a) => a.data.window?.names.join() === 'lo,hi')).toBe(true)
  })

  it('draws a string as characters with a two pointer window', () => {
    const { steps, views } = load(engine, 'two-pointers')
    const arrays = structuresOf(steps, views, 'array')
    expect(arrays[arrays.length - 1]!.data.items.map((v) => (v.t === 'p' ? v.s : ''))).toEqual([...'racecar'])
    expect(arrays.some((a) => a.data.window?.names.join() === 'left,right')).toBe(true)
  })

  it('follows a linked list and a binary tree', () => {
    const list = load(engine, 'reverse-list')
    expect(Math.max(...structuresOf(list.steps, list.views, 'list').map((s) => s.data.nodes.length))).toBe(4)
    const tree = load(engine, 'tree-depth')
    expect(Math.max(...structuresOf(tree.steps, tree.views, 'tree').map((t) => t.data.nodes.length))).toBe(5)
  })

  it('draws one tree for a recursive function with root in every frame', () => {
    const { steps, views } = load(engine, 'tree-depth')
    const deepest = steps.reduce((a, b) => (b.frames.length > a.frames.length ? b : a))
    expect(buildStructures(deepest, views).structures.filter((s) => s.view === 'tree')).toHaveLength(1)
  })

  it('marks grid cells and graph state', () => {
    const grid = load(engine, 'islands')
    expect(structuresOf(grid.steps, grid.views, 'grid').some((g) => g.data.marks.some((m) => m.label === 'r,c'))).toBe(true)
    const bfs = load(engine, 'bfs')
    const graphs = structuresOf(bfs.steps, bfs.views, 'graph')
    const last = graphs[graphs.length - 1]!.data
    expect(last.keys).toHaveLength(5)
    expect(last.undirected).toBe(true)
    expect(last.visited.size).toBe(5)
  })

  it('counts every call in the call tree', () => {
    const calls = (id: SampleId) => buildCallTree(load(engine, id).trace).nodes.filter((n) => n.parent !== null && !n.label.startsWith('main(')).length
    expect(calls('factorial')).toBe(4)
    expect(calls('fibonacci')).toBe(9)
  })
})
