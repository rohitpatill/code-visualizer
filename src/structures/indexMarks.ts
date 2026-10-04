import type { Frame, Heap, Step, Value } from '../trace/types'
import { sameValue, scopeFrames } from '../trace/values'
import type { Access } from './accesses'
import { attr } from './common'
import { POINTER_NAMES } from './pointers'
import type { IndexMark, IndexMarks } from './types'

type Vars = ReadonlyMap<string, Value>

interface Context {
  own: Vars
  globals: Vars
  /** Frame id of `own`, for keying strings, which have no heap id. */
  frameId: number
  globalId: number
  running: boolean
}

interface Found {
  value: Value
  /** Whether the name lives in the running frame. */
  local: boolean
  key: string | null
}

const THIS_NAMES = ['this', 'self']

function lookup(name: string, ctx: Context, heap: Heap): Found | undefined {
  const own = ctx.own.get(name)
  if (own) return { value: own, local: ctx.running, key: `${ctx.frameId}:${name}` }
  for (const self of THIS_NAMES) {
    const ref = ctx.own.get(self)
    const field = ref?.t === 'r' ? attr(heap.get(ref.id), name) : undefined
    if (field) return { value: field, local: ctx.running, key: null }
  }
  const global = ctx.globals.get(name)
  return global && { value: global, local: ctx.running && ctx.frameId === ctx.globalId, key: `${ctx.globalId}:${name}` }
}

/** The heap id of an object, or `frame:name` for a string held directly in a variable. */
const containerKey = (v: Value, nameKey: string | null): string | null =>
  v.t === 'r' ? v.id : v.k === 'str' ? nameKey : null

function resolveBase(base: readonly string[], ctx: Context, heap: Heap): { value: Value; key: string } | null {
  const first = lookup(base[0]!, ctx, heap)
  if (!first) return null
  let value = first.value
  for (const seg of base.slice(1)) {
    const next = value.t === 'r' ? attr(heap.get(value.id), seg) : undefined
    if (!next) return null
    value = next
  }
  const key = containerKey(value, base.length === 1 ? first.key : null)
  return key ? { value, key } : null
}

/** Where `index` lands in a container (a dict matches it against its keys), and the value found there. */
function position(container: Value, index: Value, heap: Heap): { pos: number; item: Value | undefined } | null {
  if (container.t === 'p') return index.t === 'p' && index.k === 'int' ? { pos: Number(index.v), item: undefined } : null
  const obj = heap.get(container.id)
  if (obj?.kind === 'dict') {
    const pos = obj.entries.findIndex(([k]) => sameValue(k, index))
    return pos < 0 ? null : { pos, item: obj.entries[pos]![1] }
  }
  if (!obj || !('items' in obj) || obj.kind === 'set' || index.t !== 'p' || index.k !== 'int') return null
  const pos = Number(index.v)
  return { pos, item: obj.items[pos] }
}

class MarkSet {
  readonly byKey = new Map<string, Map<string, IndexMark>>()

  add(key: string, mark: IndexMark): void {
    let marks = this.byKey.get(key)
    if (!marks) this.byKey.set(key, (marks = new Map()))
    const old = marks.get(mark.name)
    if (!old || (mark.active && !old.active)) marks.set(mark.name, mark)
  }
}

function markAccess(access: Access, ctx: Context, heap: Heap, out: MarkSet, indexed: Set<string>): void {
  const base = resolveBase(access.base, ctx, heap)
  if (!base) return
  indexed.add(base.key)
  let container: Value = base.value
  let key: string | null = base.key
  for (const level of access.levels) {
    let next: Value | undefined
    for (const name of level.names) {
      const found = lookup(name, ctx, heap)
      const at = found && position(container, found.value, heap)
      if (!found || !at) continue
      out.add(key, { name, index: at.pos, active: found.local })
      if (name === level.follow) next = at.item
    }
    key = next ? containerKey(next, null) : null
    if (!next || !key) return
    container = next
  }
}

const varMap = (frame: Frame): Vars => new Map(frame.vars)

/**
 * Which index variables point into which containers on this step, from the
 * subscripts the code really uses (`grid[r][c]`, `list.get(i)`, `counts[w]`),
 * at any nesting depth. Common pointer names the code never uses as an index
 * (`lo`, `hi` around `nums[mid]`) are added to every container the code indexes.
 */
export function buildIndexMarks(step: Step, accesses: readonly Access[]): IndexMarks {
  const frames = scopeFrames(step.frames)
  if (!frames.length) return new Map()
  const globalFrame = frames[0]!
  const running = frames[frames.length - 1]!
  const globals = varMap(globalFrame)
  const contexts: Context[] = [{ own: varMap(running), globals, frameId: running.id, globalId: globalFrame.id, running: true }]
  if (running !== globalFrame) contexts.push({ own: globals, globals, frameId: globalFrame.id, globalId: globalFrame.id, running: false })
  const out = new MarkSet()
  const indexed = new Set<string>()
  for (const ctx of contexts) for (const access of accesses) markAccess(access, ctx, step.heap, out, indexed)
  addNamedPointers(contexts, accesses, step.heap, indexed, out)
  return new Map([...out.byKey].map(([key, marks]) => [key, [...marks.values()]]))
}

/** Named pointers make sense on sequences and strings, not on dict rows. */
const isSequence = (key: string, heap: Heap): boolean => {
  const kind = heap.get(key)?.kind
  return kind === undefined ? key.includes(':') : kind === 'list' || kind === 'tuple' || kind === 'deque'
}

function addNamedPointers(contexts: readonly Context[], accesses: readonly Access[], heap: Heap, indexed: ReadonlySet<string>, out: MarkSet): void {
  const targets = [...indexed].filter((key) => isSequence(key, heap))
  if (!targets.length) return
  const bound = new Set(accesses.flatMap((a) => a.levels.flatMap((l) => l.names)))
  for (const ctx of contexts) {
    for (const [name, v] of ctx.own) {
      if (v.t !== 'p' || v.k !== 'int' || bound.has(name) || !POINTER_NAMES.has(name)) continue
      for (const key of targets) out.add(key, { name, index: Number(v.v), active: ctx.running })
    }
  }
}

export interface PlacedMarks {
  at: ReadonlyMap<number, IndexMark[]>
  /** Marks on the slot just past the last item (`i == len`). */
  end: IndexMark[]
  /** Marks on no drawn cell: negative, too far, or past the items shown. */
  off: IndexMark[]
}

/** Groups marks by cell for a container drawing `shown` of its `size` items, running frame first. */
export function placeMarks(marks: readonly IndexMark[], shown: number, size: number): PlacedMarks {
  const at = new Map<number, IndexMark[]>()
  const end: IndexMark[] = []
  const off: IndexMark[] = []
  const sorted = [...marks].sort((a, b) => Number(b.active) - Number(a.active))
  for (const m of sorted) {
    if (m.index >= 0 && m.index < shown) {
      const list = at.get(m.index)
      if (list) list.push(m)
      else at.set(m.index, [m])
    } else if (m.index === size && shown === size) end.push(m)
    else off.push(m)
  }
  return { at, end, off }
}
