// Structure views: turn raw heap snapshots into trees, grids, graphs, etc.
// Views are chosen per variable name; nothing here guesses silently, it only suggests.

export const VIEW_LABELS = {
  array: 'Array',
  grid: 'Grid',
  list: 'Linked list',
  tree: 'Tree',
  graph: 'Graph',
  stack: 'Stack',
  queue: 'Queue',
  heap: 'Heap',
}

const POINTER_NAMES = new Set(
  'i j l r lo hi low high mid left right start end slow fast p q p1 p2 idx index pos ptr write read top front back'.split(' '),
)
const WINDOW_PAIRS = [
  ['left', 'right'],
  ['l', 'r'],
  ['lo', 'hi'],
  ['low', 'high'],
  ['start', 'end'],
  ['i', 'j'],
]
const CELL_PAIRS = [
  ['r', 'c'],
  ['row', 'col'],
  ['i', 'j'],
  ['nr', 'nc'],
  ['x', 'y'],
]
const VALUE_ATTRS = ['val', 'value', 'data', 'key', 'item']
const VISITED_NAMES = /^(visited|seen|vis|explored|done)$/
const FRONTIER_NAMES = /^(q|queue|stack|stk|frontier|heap|pq|todo)$/
const CURRENT_NAMES = /^(node|cur|curr|current|u|v|nei|neighbor|nxt|start|src)$/

export const deref = (value, heap) => (value && value.t === 'r' ? heap[value.id] : null)

const attr = (obj, name) => obj?.attrs?.find(([k]) => k === name)?.[1]

const seqItems = (obj) => (obj && ['list', 'tuple', 'deque', 'set'].includes(obj.kind) ? obj.items : null)

const isNone = (v) => !v || (v.t === 'p' && v.k === 'NoneType')

// Short text for a value inside a structure cell.
export function compact(value, heap, depth = 0) {
  if (!value) return ''
  if (value.t === 'p') return value.v
  const obj = heap[value.id]
  if (!obj) return '?'
  if (obj.kind === 'instance') {
    const label = nodeLabel(obj)
    return label ?? obj.cls
  }
  const items = seqItems(obj)
  if (items && depth < 1) {
    const inner = items.map((v) => compact(v, heap, depth + 1)).join(', ')
    return obj.kind === 'tuple' ? `(${inner})` : obj.kind === 'set' ? `{${inner}}` : `[${inner}]`
  }
  if (items) return obj.kind === 'tuple' ? '(…)' : '[…]'
  return obj.name ?? obj.kind
}

export function nodeLabel(obj) {
  for (const name of VALUE_ATTRS) {
    const v = attr(obj, name)
    if (v && v.t === 'p') return v.v
  }
  const firstPrim = obj.attrs?.find(([, v]) => v.t === 'p' && v.k !== 'NoneType')
  return firstPrim ? firstPrim[1].v : null
}

// Which views make sense for this value at all.
export function viewsFor(value, heap) {
  if (value.t === 'p') return value.k === 'str' ? ['array'] : []
  const obj = heap[value.id]
  switch (obj?.kind) {
    case 'list':
      return ['array', 'stack', 'queue', 'heap', 'grid', 'graph']
    case 'tuple':
      return ['array']
    case 'deque':
      return ['queue', 'stack', 'array']
    case 'dict':
      return ['graph']
    case 'instance':
      return ['tree', 'list']
    default:
      return []
  }
}

const CELL_NAMES = new Set(CELL_PAIRS.flat())

// Int variables in globals and the running frame (the running frame wins on name clashes).
function pointerCandidates(step, names = POINTER_NAMES) {
  const frames = step.frames.length > 1 ? [step.frames[0], step.frames[step.frames.length - 1]] : step.frames
  const out = new Map()
  for (const f of frames) {
    for (const [name, v] of f.vars) {
      if (v.t === 'p' && v.k === 'int' && names.has(name)) out.set(name, Number(v.v))
    }
  }
  return out
}

// A one-glance guess used for the suggestion pill. Never applied automatically.
export function suggestView(name, value, step) {
  const heap = step.heap
  const lower = name.toLowerCase()
  if (value.t === 'p') {
    if (value.k === 'str' && value.v.length > 3 && pointerCandidates(step).size) return 'array'
    return null
  }
  const obj = heap[value.id]
  if (!obj) return null
  if (obj.kind === 'instance') {
    if (attr(obj, 'left') || attr(obj, 'right') || attr(obj, 'children')) return 'tree'
    if (attr(obj, 'next')) return 'list'
    return null
  }
  if (obj.kind === 'deque') return /stack|stk/.test(lower) ? 'stack' : 'queue'
  if (obj.kind === 'dict') {
    if (/graph|adj/.test(lower)) return 'graph'
    const vals = obj.entries.map(([, v]) => deref(v, heap))
    const looksAdj = vals.length >= 2 && vals.every((o) => seqItems(o))
    return looksAdj ? 'graph' : null
  }
  if (obj.kind === 'list') {
    if (/heap|pq/.test(lower)) return 'heap'
    if (/stack|stk/.test(lower)) return 'stack'
    if (/queue|^q$/.test(lower)) return 'queue'
    if (/graph|adj/.test(lower)) return 'graph'
    const rows = obj.items.map((v) => deref(v, heap))
    if (rows.length >= 2 && rows.every((r) => r?.kind === 'list' && r.items.every((c) => c.t === 'p'))) {
      const widths = new Set(rows.map((r) => r.items.length))
      if (widths.size === 1) return 'grid'
    }
    if (obj.items.length > 1 && obj.items.every((v) => v.t === 'p') && pointerCandidates(step).size) return 'array'
  }
  return null
}

// Tags: which variable names (active frame and globals) point at each heap id.
export function buildTags(step) {
  const tags = new Map()
  const frames = step.frames.length > 1 ? [step.frames[0], step.frames[step.frames.length - 1]] : step.frames
  frames.forEach((f, fi) => {
    const active = fi === frames.length - 1
    for (const [name, v] of f.vars) {
      if (v.t !== 'r') continue
      if (!tags.has(v.id)) tags.set(v.id, [])
      tags.get(v.id).push({ name, active })
    }
  })
  return tags
}

function buildArray(value, heap, step) {
  const items =
    value.t === 'p'
      ? [...value.v.slice(1, -1)].map((ch) => ({ t: 'p', k: 'str', v: ch }))
      : seqItems(heap[value.id]) || []
  const pointers = pointerCandidates(step)
  const n = items.length
  const onArray = [...pointers].filter(([, v]) => v >= 0 && v <= n)
  const offArray = [...pointers].filter(([, v]) => v < 0 || v > n)
  let window = null
  for (const [a, b] of WINDOW_PAIRS) {
    if (pointers.has(a) && pointers.has(b)) {
      const lo = Math.min(pointers.get(a), pointers.get(b))
      const hi = Math.max(pointers.get(a), pointers.get(b))
      window = { lo: Math.max(0, lo), hi: Math.min(n - 1, hi), names: [a, b] }
      break
    }
  }
  return { items, pointers: onArray, offArray, window, isString: value.t === 'p' }
}

function buildGrid(obj, heap, step) {
  const rowIds = []
  const rows = obj.items.map((v) => {
    const r = deref(v, heap)
    if (v.t === 'r') rowIds.push(v.id)
    return seqItems(r) || [v]
  })
  const pointers = pointerCandidates(step, CELL_NAMES)
  const marks = []
  for (const [a, b] of CELL_PAIRS) {
    if (pointers.has(a) && pointers.has(b)) marks.push({ r: pointers.get(a), c: pointers.get(b), label: `${a},${b}` })
  }
  return { rows, marks, covered: rowIds }
}

function buildLinkedList(rootId, heap) {
  const nodes = []
  const index = new Map()
  let id = rootId
  let cycleTo = null
  while (id && nodes.length < 60) {
    if (index.has(id)) {
      cycleTo = index.get(id)
      break
    }
    const obj = heap[id]
    if (!obj || obj.kind !== 'instance') break
    index.set(id, nodes.length)
    nodes.push({ id, label: nodeLabel(obj) ?? '?' })
    const next = attr(obj, 'next')
    id = next && next.t === 'r' ? next.id : null
  }
  return { nodes, cycleTo, covered: nodes.map((n) => n.id) }
}

function buildTree(rootId, heap) {
  const nodes = []
  const edges = []
  const seen = new Set()
  let leafX = 0
  let maxDepth = 0

  const visit = (id, depth) => {
    if (seen.has(id) || nodes.length > 200) return null
    const obj = heap[id]
    if (!obj || obj.kind !== 'instance') return null
    seen.add(id)
    maxDepth = Math.max(maxDepth, depth)
    const node = { id, label: nodeLabel(obj) ?? '?', depth, x: 0 }
    nodes.push(node)
    const childrenAttr = attr(obj, 'children')
    if (childrenAttr) {
      const kids = (seqItems(deref(childrenAttr, heap)) || []).filter((v) => v.t === 'r')
      const placed = kids.map((k) => visit(k.id, depth + 1)).filter(Boolean)
      placed.forEach((c) => edges.push({ from: id, to: c.id }))
      node.x = placed.length ? (placed[0].x + placed[placed.length - 1].x) / 2 : leafX++
      return node
    }
    // binary: in-order x keeps left children left and right children right
    const left = attr(obj, 'left')
    const right = attr(obj, 'right')
    const l = !isNone(left) && left.t === 'r' ? visit(left.id, depth + 1) : null
    node.x = leafX++
    const r = !isNone(right) && right.t === 'r' ? visit(right.id, depth + 1) : null
    if (l) edges.push({ from: id, to: l.id, side: 'L' })
    if (r) edges.push({ from: id, to: r.id, side: 'R' })
    return node
  }
  visit(rootId, 0)
  return { nodes, edges, width: leafX, depth: maxDepth, covered: nodes.map((n) => n.id) }
}

function buildHeapTree(obj, heap) {
  const items = obj.items
  const nodes = items.map((v, i) => ({ i, label: compact(v, heap), depth: Math.floor(Math.log2(i + 1)) }))
  const maxDepth = nodes.length ? nodes[nodes.length - 1].depth : 0
  // place node i at its slot within a full level
  nodes.forEach((n) => {
    const levelStart = 2 ** n.depth - 1
    const slot = n.i - levelStart
    const slots = 2 ** n.depth
    n.x = ((slot + 0.5) / slots) * 2 ** maxDepth
  })
  return { items, nodes, width: 2 ** maxDepth, depth: maxDepth }
}

function buildGraph(obj, heap, step) {
  const adjacency = [] // [key, [{to, weight}]]
  const covered = []
  const readNeighbors = (v) => {
    const o = deref(v, heap)
    if (v.t === 'r') covered.push(v.id)
    const items = o?.kind === 'dict' ? o.entries.map(([k, w]) => ({ to: compact(k, heap), weight: compact(w, heap) })) : seqItems(o)
    if (!items) return []
    if (o.kind === 'dict') return items
    return items.map((item) => {
      const pair = deref(item, heap)
      if (pair?.kind === 'tuple' && pair.items.length === 2 && pair.items.every((x) => x.t === 'p')) {
        return { to: pair.items[0].v, weight: pair.items[1].v }
      }
      return { to: compact(item, heap), weight: null }
    })
  }
  if (obj.kind === 'dict') obj.entries.forEach(([k, v]) => adjacency.push([compact(k, heap), readNeighbors(v)]))
  else obj.items.forEach((v, i) => adjacency.push([String(i), readNeighbors(v)]))

  const keys = []
  const addKey = (k) => !keys.includes(k) && keys.push(k)
  adjacency.forEach(([k, ns]) => {
    addKey(k)
    ns.forEach((n) => addKey(n.to))
  })
  const edgeSet = new Set()
  const edges = []
  adjacency.forEach(([k, ns]) => ns.forEach((n) => {
    edges.push({ from: k, to: n.to, weight: n.weight })
    edgeSet.add(`${k}->${n.to}`)
  }))
  const undirected = edges.length > 0 && edges.every((e) => edgeSet.has(`${e.to}->${e.from}`))
  const drawn = undirected ? edges.filter((e) => e.from <= e.to || !keys.includes(e.from)) : edges

  // state highlights from other variables in scope
  const visited = new Set()
  const frontier = new Set()
  const current = new Map()
  const keySet = new Set(keys)
  const active = step.frames[step.frames.length - 1]
  for (const f of step.frames) {
    for (const [name, v] of f.vars) {
      const o = deref(v, heap)
      if (o && VISITED_NAMES.test(name)) {
        const items = o.kind === 'dict' ? o.entries.map(([k]) => k) : seqItems(o) || []
        items.forEach((x) => visited.add(compact(x, heap)))
      }
      if (o && FRONTIER_NAMES.test(name)) {
        for (const x of seqItems(o) || []) {
          const t = deref(x, heap)
          // (dist, node) tuples from heapq: the node is the last element
          frontier.add(t?.kind === 'tuple' ? compact(t.items[t.items.length - 1], heap) : compact(x, heap))
        }
      }
      if (f === active && v.t === 'p' && CURRENT_NAMES.test(name) && keySet.has(v.v)) {
        if (!current.has(v.v)) current.set(v.v, [])
        current.get(v.v).push(name)
      }
    }
  }
  return { keys, edges: drawn, undirected, visited, frontier, current, covered }
}

// Build every structure the chosen views ask for, outermost frames first.
// A subtree already drawn inside an earlier tree is skipped, so recursive
// calls with `root` in every frame render one tree, not one per frame.
export function buildStructures(step, views) {
  const structures = []
  const coveredBy = new Map() // heap id -> structure key
  const heap = step.heap
  for (const frame of step.frames) {
    for (const [name, value] of frame.vars) {
      const view = views[name]
      if (!view || !viewsFor(value, heap).includes(view)) continue
      const rootId = value.t === 'r' ? value.id : null
      const key = `${rootId ?? `${frame.id}:${name}`}:${view}`
      if (structures.some((s) => s.key === key) || (rootId && coveredBy.has(rootId))) continue
      const obj = heap[rootId]
      let data
      if (view === 'array') data = buildArray(value, heap, step)
      else if (view === 'grid') data = buildGrid(obj, heap, step)
      else if (view === 'list') data = buildLinkedList(rootId, heap)
      else if (view === 'tree') data = buildTree(rootId, heap)
      else if (view === 'graph') data = buildGraph(obj, heap, step)
      else if (view === 'heap') data = buildHeapTree(obj, heap)
      else data = { items: seqItems(obj) || [] }
      const struct = { key, name, view, rootId, frameName: frame.name, data }
      structures.push(struct)
      if (rootId) coveredBy.set(rootId, key)
      for (const id of data.covered || []) coveredBy.set(id, key)
    }
  }
  return { structures, coveredBy }
}
