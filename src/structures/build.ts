import type { Frame, Step, Value } from '../trace/types'
import { seqItems } from './common'
import { buildGraph } from './graph'
import { buildArray, buildGrid, buildLinkedList } from './linear'
import { viewsFor } from './suggest'
import { buildHeapTree, buildTree } from './trees'
import type { BuiltStructures, Structure, StructureView, ViewName, Views } from './types'

function buildView(view: ViewName, value: Value, step: Step): StructureView | null {
  const rootId = value.t === 'r' ? value.id : null
  const obj = rootId ? step.heap.get(rootId) : undefined
  switch (view) {
    case 'array':
      return { view, data: buildArray(value, step.heap, step) }
    case 'grid':
      return { view, data: buildGrid(obj, step.heap, step) }
    case 'graph':
      return { view, data: buildGraph(obj, step.heap, step) }
    case 'heap':
      return { view, data: buildHeapTree(obj, step.heap) }
    case 'stack':
    case 'queue':
      return { view, data: { items: seqItems(obj) ?? [] } }
    case 'list':
      return rootId ? { view, data: buildLinkedList(rootId, step.heap) } : null
    case 'tree':
      return rootId ? { view, data: buildTree(rootId, step.heap) } : null
  }
}

const coveredIds = (s: StructureView): readonly string[] => ('covered' in s.data ? s.data.covered : [])

// Frames are walked outermost first and a root already drawn is skipped, so a
// recursive call with `root` in every frame renders one tree, not one per frame.
export function buildStructures(step: Step, views: Views): BuiltStructures {
  const structures: Structure[] = []
  const keys = new Set<string>()
  const coveredBy = new Map<string, string>()
  const add = (frame: Frame, name: string, value: Value) => {
    const view = views[name]
    if (!view || !viewsFor(value, step.heap).includes(view)) return
    const rootId = value.t === 'r' ? value.id : null
    const key = `${rootId ?? `${frame.id}:${name}`}:${view}`
    if (keys.has(key) || (rootId && coveredBy.has(rootId))) return
    const built = buildView(view, value, step)
    if (!built) return
    keys.add(key)
    structures.push({ ...built, key, name, rootId, frameLabel: frame.global ? null : `${frame.name}()` })
    if (rootId) coveredBy.set(rootId, key)
    for (const id of coveredIds(built)) coveredBy.set(id, key)
  }
  for (const frame of step.frames) for (const [name, value] of frame.vars) add(frame, name, value)
  return { structures, coveredBy }
}
