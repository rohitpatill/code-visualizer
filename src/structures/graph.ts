import type { Heap, HeapObject, Step, Value } from '../trace/types'
import { deref, topFrame } from '../trace/values'
import { compact, seqItems } from './common'
import type { GraphData } from './types'

const VISITED_NAMES = /^(visited|seen|vis|explored|done)$/
const FRONTIER_NAMES = /^(q|queue|stack|stk|frontier|heap|pq|todo)$/
const CURRENT_NAMES = /^(node|cur|curr|current|u|v|nei|neighbor|nxt|start|src)$/

type Neighbor = { to: string; weight: string | null }

function readNeighbors(v: Value, heap: Heap, covered: string[]): Neighbor[] {
  if (v.t === 'r') covered.push(v.id)
  const o = deref(v, heap)
  if (o?.kind === 'dict') return o.entries.map(([k, w]) => ({ to: compact(k, heap), weight: compact(w, heap) }))
  return (seqItems(o) ?? []).map((item) => {
    const pair = deref(item, heap)
    if (pair?.kind === 'tuple' && pair.items.length === 2) {
      const [to, weight] = pair.items
      if (to?.t === 'p' && weight?.t === 'p') return { to: to.v, weight: weight.v }
    }
    return { to: compact(item, heap), weight: null }
  })
}

/** Node keys held by visited sets and by queues or stacks waiting to be explored. */
function stateSets(step: Step, heap: Heap, keys: ReadonlySet<string>) {
  const visited = new Set<string>()
  const frontier = new Set<string>()
  const current = new Map<string, string[]>()
  const active = topFrame(step)
  for (const frame of step.frames) {
    for (const [name, v] of frame.vars) {
      const o = deref(v, heap)
      if (o && VISITED_NAMES.test(name)) {
        const members = o.kind === 'dict' ? o.entries.map(([k]) => k) : (seqItems(o) ?? [])
        for (const x of members) visited.add(compact(x, heap))
      }
      if (o && FRONTIER_NAMES.test(name)) {
        for (const x of seqItems(o) ?? []) {
          const t = deref(x, heap)
          // heapq entries are (priority, node) tuples: the node is the last element.
          frontier.add(t?.kind === 'tuple' ? compact(t.items[t.items.length - 1], heap) : compact(x, heap))
        }
      }
      if (frame === active && v.t === 'p' && CURRENT_NAMES.test(name) && keys.has(v.v)) {
        const names = current.get(v.v)
        if (names) names.push(name)
        else current.set(v.v, [name])
      }
    }
  }
  return { visited, frontier, current }
}

export function buildGraph(obj: HeapObject | undefined, heap: Heap, step: Step): GraphData {
  const covered: string[] = []
  const adjacency: [string, Neighbor[]][] =
    obj?.kind === 'dict'
      ? obj.entries.map(([k, v]) => [compact(k, heap), readNeighbors(v, heap, covered)])
      : (seqItems(obj) ?? []).map((v, i) => [String(i), readNeighbors(v, heap, covered)])

  const keySet = new Set<string>()
  for (const [k, ns] of adjacency) {
    keySet.add(k)
    for (const n of ns) keySet.add(n.to)
  }
  const edges = adjacency.flatMap(([from, ns]) => ns.map((n) => ({ from, to: n.to, weight: n.weight })))
  const edgeSet = new Set(edges.map((e) => `${e.from}->${e.to}`))
  const undirected = edges.length > 0 && edges.every((e) => edgeSet.has(`${e.to}->${e.from}`))
  const drawn = undirected ? edges.filter((e) => e.from <= e.to) : edges
  return { keys: [...keySet], edges: drawn, undirected, ...stateSets(step, heap, keySet), covered }
}
