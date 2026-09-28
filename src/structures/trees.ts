import type { Heap, HeapObject } from '../trace/types'
import { deref, isNone } from '../trace/values'
import { attr, compact, nodeLabel, seqItems } from './common'
import type { HeapTreeData, TreeData } from './types'

const MAX_TREE_NODES = 200

export function buildTree(rootId: string, heap: Heap): TreeData {
  const nodes: TreeData['nodes'] = []
  const edges: TreeData['edges'] = []
  const seen = new Set<string>()
  let leafX = 0
  let maxDepth = 0

  const visit = (id: string, depth: number): TreeData['nodes'][number] | null => {
    const obj = heap.get(id)
    if (seen.has(id) || nodes.length >= MAX_TREE_NODES || obj?.kind !== 'instance') return null
    seen.add(id)
    maxDepth = Math.max(maxDepth, depth)
    const node = { id, label: nodeLabel(obj) ?? '?', depth, x: 0 }
    nodes.push(node)
    const children = attr(obj, 'children')
    if (children) {
      const placed = (seqItems(deref(children, heap)) ?? []).flatMap((k) => (k.t === 'r' ? (visit(k.id, depth + 1) ?? []) : []))
      for (const c of placed) edges.push({ from: id, to: c.id })
      node.x = placed.length ? (placed[0]!.x + placed[placed.length - 1]!.x) / 2 : leafX++
      return node
    }
    // In-order x keeps left subtrees left of their parent and right subtrees right.
    const left = attr(obj, 'left')
    const right = attr(obj, 'right')
    const l = left?.t === 'r' && !isNone(left) ? visit(left.id, depth + 1) : null
    node.x = leafX++
    const r = right?.t === 'r' && !isNone(right) ? visit(right.id, depth + 1) : null
    if (l) edges.push({ from: id, to: l.id })
    if (r) edges.push({ from: id, to: r.id })
    return node
  }

  visit(rootId, 0)
  return { nodes, edges, width: leafX, depth: maxDepth, covered: nodes.map((n) => n.id) }
}

/** Array-backed binary heap: node i sits at its slot within a full level. */
export function buildHeapTree(obj: HeapObject | undefined, heap: Heap): HeapTreeData {
  const items = seqItems(obj) ?? []
  const depthOf = (i: number) => Math.floor(Math.log2(i + 1))
  const maxDepth = items.length ? depthOf(items.length - 1) : 0
  const width = 2 ** maxDepth
  const nodes = items.map((v, i) => {
    const depth = depthOf(i)
    const slot = i - (2 ** depth - 1)
    return { i, label: compact(v, heap), depth, x: ((slot + 0.5) / 2 ** depth) * width }
  })
  return { items, nodes, width, depth: maxDepth }
}
