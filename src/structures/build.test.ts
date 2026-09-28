import { describe, expect, it } from 'vitest'
import { samples } from '../engines/python/samples'
import { buildCallTree } from '../model/callTree'
import { describeStep } from '../model/describe'
import { diffSteps } from '../model/diff'
import { layoutHeap } from '../model/heapLayout'
import { Trace } from '../trace/Trace'
import type { RawTrace, Step } from '../trace/types'
import { buildStructures } from './build'
import { buildTags } from './pointers'
import { suggestContext, suggestView } from './suggest'
import type { Structure, ViewName } from './types'

const goldens = import.meta.glob<RawTrace>('../engines/python/__golden__/*.json', { eager: true, import: 'default' })
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function load(name: string) {
  const sample = samples.find((s) => s.name.startsWith(name))
  const raw = sample && goldens[`../engines/python/__golden__/${slug(sample.name)}.json`]
  if (!sample || !raw) throw new Error(`No golden trace for ${name}`)
  const trace = new Trace(raw)
  const steps = Array.from({ length: trace.length }, (_, i) => trace.step(i))
  return { sample, trace, steps }
}

function structuresOf<V extends ViewName>(steps: Step[], views: Record<string, ViewName>, view: V) {
  return steps.flatMap((s) => buildStructures(s, views).structures).filter((s): s is Extract<Structure, { view: V }> => s.view === view)
}

describe('structure builders on every sample', () => {
  for (const sample of samples) {
    it(`${sample.name} builds every step`, () => {
      const { steps, trace } = load(sample.name)
      steps.forEach((step, i) => {
        const prev = steps[i - 1] ?? null
        const built = buildStructures(step, sample.views ?? {})
        expect(describeStep(step).title).not.toBe('')
        diffSteps(prev, step)
        layoutHeap(step, new Set(built.coveredBy.keys()))
        buildTags(step)
        const ctx = suggestContext(step)
        for (const frame of step.frames) for (const [name, v] of frame.vars) suggestView(name, v, ctx)
      })
      expect(buildCallTree(trace).nodes.length).toBeGreaterThan(0)
    })
  }
})

describe('structure builders', () => {
  it('marks binary search pointers and the lo..hi window', () => {
    const { steps, sample } = load('Binary search')
    const arrays = structuresOf(steps, sample.views!, 'array')
    expect(arrays.some((a) => a.data.pointers.some(([n]) => n === 'mid'))).toBe(true)
    expect(arrays.some((a) => a.data.window?.names.join() === 'lo,hi')).toBe(true)
  })

  it('draws a string as characters with a two pointer window', () => {
    const { steps, sample } = load('Two pointers')
    const arrays = structuresOf(steps, sample.views!, 'array')
    expect(arrays[arrays.length - 1]!.data.items.map((v) => (v.t === 'p' ? v.s : ''))).toEqual([...'racecar'])
    expect(arrays.some((a) => a.data.window?.names.join() === 'left,right')).toBe(true)
  })

  it('follows a linked list and a binary tree', () => {
    const list = load('Reverse a linked list')
    expect(Math.max(...structuresOf(list.steps, list.sample.views!, 'list').map((s) => s.data.nodes.length))).toBe(4)
    const tree = load('Max depth')
    const trees = structuresOf(tree.steps, tree.sample.views!, 'tree')
    expect(Math.max(...trees.map((t) => t.data.nodes.length))).toBe(5)
  })

  it('draws one tree for a recursive function with root in every frame', () => {
    const { steps, sample } = load('Max depth')
    const deepest = steps.reduce((a, b) => (b.frames.length > a.frames.length ? b : a))
    expect(buildStructures(deepest, sample.views!).structures.filter((s) => s.view === 'tree')).toHaveLength(1)
  })

  it('marks grid cells and graph state', () => {
    const grid = load('Count islands')
    const grids = structuresOf(grid.steps, grid.sample.views!, 'grid')
    expect(grids.some((g) => g.data.marks.some((m) => m.label === 'r,c'))).toBe(true)
    const bfs = load('Breadth-first search')
    const graphs = structuresOf(bfs.steps, bfs.sample.views!, 'graph')
    const last = graphs[graphs.length - 1]!.data
    expect(last.keys).toHaveLength(5)
    expect(last.undirected).toBe(true)
    expect(last.visited.size).toBe(5)
  })

  it('counts every call in the call tree', () => {
    expect(buildCallTree(load('Factorial').trace).callCount).toBe(4)
    expect(buildCallTree(load('Fibonacci').trace).callCount).toBe(9)
  })
})
