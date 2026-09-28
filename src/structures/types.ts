import type { Value } from '../trace/types'

export type ViewName = 'array' | 'grid' | 'list' | 'tree' | 'graph' | 'stack' | 'queue' | 'heap'

/** Variable name to the view chosen for it. */
export type Views = Readonly<Record<string, ViewName>>

export type Pointer = [name: string, index: number]

export interface ArrayData {
  items: Value[]
  pointers: Pointer[]
  offArray: Pointer[]
  window: { lo: number; hi: number; names: [string, string] } | null
  isString: boolean
}

export interface GridData {
  rows: Value[][]
  marks: { r: number; c: number; label: string }[]
  covered: string[]
}

export interface LinkedListData {
  nodes: { id: string; label: string }[]
  cycleTo: number | null
  covered: string[]
}

export interface LaidOutNode {
  depth: number
  x: number
  label: string
}

export interface TreeData {
  nodes: (LaidOutNode & { id: string })[]
  edges: { from: string; to: string }[]
  width: number
  depth: number
  covered: string[]
}

export interface HeapTreeData {
  items: Value[]
  nodes: (LaidOutNode & { i: number })[]
  width: number
  depth: number
}

export interface GraphData {
  keys: string[]
  edges: { from: string; to: string; weight: string | null }[]
  undirected: boolean
  visited: ReadonlySet<string>
  frontier: ReadonlySet<string>
  current: ReadonlyMap<string, string[]>
  covered: string[]
}

export interface SequenceData {
  items: Value[]
}

export type StructureView =
  | { view: 'array'; data: ArrayData }
  | { view: 'grid'; data: GridData }
  | { view: 'list'; data: LinkedListData }
  | { view: 'tree'; data: TreeData }
  | { view: 'graph'; data: GraphData }
  | { view: 'heap'; data: HeapTreeData }
  | { view: 'stack' | 'queue'; data: SequenceData }

export type Structure = StructureView & {
  key: string
  name: string
  rootId: string | null
  /** Label of the owning frame, or null for globals. */
  frameLabel: string | null
}

export interface BuiltStructures {
  structures: Structure[]
  /** Heap id drawn inside a structure card, mapped to that card's key. */
  coveredBy: ReadonlyMap<string, string>
}

export interface Tag {
  name: string
  active: boolean
}
