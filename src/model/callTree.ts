import type { Trace } from '../trace/Trace'
import { topFrame } from '../trace/values'
import { shortValue } from './describe'

export const ROOT_CALL = -1

export interface CallNode {
  /** The frame id of the call, or ROOT_CALL. */
  id: number
  label: string
  parent: number | null
  children: CallNode[]
  callStep: number
  returnStep?: number
  ret?: string
  depth: number
  x: number
}

export interface CallTree {
  nodes: CallNode[]
  byId: ReadonlyMap<number, CallNode>
  width: number
  depth: number
  callCount: number
}

function layout(root: CallNode): { width: number; depth: number } {
  let leaf = 0
  let maxDepth = 0
  const place = (node: CallNode, depth: number) => {
    node.depth = depth
    maxDepth = Math.max(maxDepth, depth)
    if (!node.children.length) {
      node.x = leaf++
      return
    }
    for (const child of node.children) place(child, depth + 1)
    node.x = (node.children[0]!.x + node.children[node.children.length - 1]!.x) / 2
  }
  place(root, 0)
  return { width: leaf, depth: maxDepth }
}

/** One node per call over the whole run, laid out once so nodes never move. */
export function buildCallTree(trace: Trace): CallTree {
  const root: CallNode = { id: ROOT_CALL, label: 'start', parent: null, children: [], callStep: 0, depth: 0, x: 0 }
  const byId = new Map<number, CallNode>([[ROOT_CALL, root]])
  trace.scan((record, heap, i) => {
    const top = topFrame(record)
    if (!top) return
    if (record.event === 'call') {
      const caller = record.frames[record.frames.length - 2]
      const parent = (caller && !caller.global && byId.get(caller.id)) || root
      const args = top.vars.map(([, v]) => shortValue(v, heap)).join(', ')
      const label = `${top.name.split('.').pop()}(${args})`
      const node: CallNode = { id: top.id, label, parent: parent.id, children: [], callStep: i, depth: 0, x: 0 }
      byId.set(top.id, node)
      parent.children.push(node)
    } else if (record.event === 'return' && !top.global) {
      const node = byId.get(top.id)
      if (!node) return
      node.returnStep = i
      node.ret = record.ret ? shortValue(record.ret, heap) : undefined
    }
  })
  const { width, depth } = layout(root)
  return { nodes: [...byId.values()], byId, width, depth, callCount: byId.size - 1 }
}
