import type { HeapObject, Prim, Value } from '../../../trace/types'
import type { HeapDraft } from '../../shared/recorder'
import { type CType, T, typeName } from '../lang/types'
import type { ObjectLess } from './compare'
import { charText } from './io'
import { orderedKeys, orderedMapEntries } from './stl/ordering'
import {
  type Cell, IterVal, MapVal, ObjVal, PairVal, PtrVal, SeqVal, SetVal, StrVal, StreamVal, UNINIT, type Val, isFn,
} from './values'

const MAX_ITEMS = 100
const MAX_TEXT = 200
const CONTROL = /[\u0000-\u001f\u007f]/

const clip = (s: string) => (s.length <= MAX_TEXT ? s : `${s.slice(0, MAX_TEXT)}...`)
const prim = (k: Prim['k'], v: string, s?: string): Prim => (s === undefined ? { t: 'p', k, v } : { t: 'p', k, v, s })

function charLiteral(code: number): string {
  const ch = charText(code)
  return `'${CONTROL.test(ch) ? JSON.stringify(ch).slice(1, -1) : ch === "'" ? "\\'" : ch}'`
}

function floatText(x: number): string {
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return x.toFixed(1)
  return String(x)
}

const SEQ_KIND = { vector: 'list', array: 'list', stack: 'list', pq: 'list', deque: 'deque', queue: 'deque' } as const

/** Encodes C++ values for the trace. Objects get stable ids by identity, so copies show as separate objects. */
export class Encoder {
  private readonly ids = new WeakMap<object, string>()
  private next = 1

  constructor(private readonly less: ObjectLess) {}

  cell(cell: Cell, heap: HeapDraft, names: ReadonlyMap<Cell, string>): Value {
    return this.value(cell.value, cell.type, heap, names)
  }

  value(v: Val, type: CType, heap: HeapDraft, names: ReadonlyMap<Cell, string>): Value {
    if (v === UNINIT) return prim('other', '?')
    if (v === null) return prim('none', 'void')
    if (typeof v === 'boolean') return prim('bool', String(v))
    if (typeof v === 'number' || typeof v === 'bigint') {
      if (type.t === 'char') return prim('str', charLiteral(Number(v)), charText(Number(v)))
      if (type.t === 'float') return prim('float', floatText(Number(v)))
      return prim('int', String(v))
    }
    if (v instanceof StrVal) return prim('str', clip(JSON.stringify(v.s)), v.s.slice(0, MAX_TEXT))
    if (v instanceof PtrVal) return this.pointer(v, heap, names)
    if (v instanceof IterVal) return prim('other', this.iterText(v))
    if (v instanceof StreamVal) return prim('other', v.dir === 'out' ? 'cout' : 'cin')
    return this.ref(v, heap, names)
  }

  private pointer(p: PtrVal, heap: HeapDraft, names: ReadonlyMap<Cell, string>): Value {
    if (p.isNull) return prim('none', 'nullptr')
    if (p.base) return this.ref(p.base, heap, names)
    const target = p.target!
    if (target.freed) return prim('other', 'dangling')
    const v = target.value
    const isObject = typeof v === 'object' && v !== null && !(v instanceof PtrVal) && !(v instanceof IterVal)
    if (isObject) return this.ref(v, heap, names)
    const name = names.get(target)
    if (name) return prim('other', `&${name}`)
    return this.ref(target, heap, names)
  }

  private iterText(it: IterVal): string {
    const size = it.over instanceof StrVal ? it.over.s.length : it.over instanceof SeqVal ? it.over.items.length : it.over instanceof MapVal ? it.over.entries.size : it.over.keys.size
    return it.index >= size ? 'end()' : `iterator at ${it.index}`
  }

  private idOf(obj: object): string {
    let id = this.ids.get(obj)
    if (!id) {
      id = String(this.next++)
      this.ids.set(obj, id)
    }
    return id
  }

  private ref(obj: object, heap: HeapDraft, names: ReadonlyMap<Cell, string>): Value {
    const id = this.idOf(obj)
    if (!(id in heap)) {
      heap[id] = { kind: 'other', type: '', repr: '' }
      heap[id] = this.object(obj, heap, names)
    }
    return { t: 'r', id }
  }

  private cells(cells: readonly Cell[], heap: HeapDraft, names: ReadonlyMap<Cell, string>): Value[] {
    return cells.slice(0, MAX_ITEMS).map((c) => this.cell(c, heap, names))
  }

  private object(obj: object, heap: HeapDraft, names: ReadonlyMap<Cell, string>): HeapObject {
    if (obj instanceof SeqVal) {
      return { kind: SEQ_KIND[obj.type.t], type: typeName(obj.type), items: this.cells(obj.items, heap, names), size: obj.items.length }
    }
    if (obj instanceof MapVal) {
      const entries = orderedMapEntries(obj, this.less)
        .slice(0, MAX_ITEMS)
        .map(({ key, cell }): [Value, Value] => [this.value(key, obj.type.key, heap, names), this.cell(cell, heap, names)])
      return { kind: 'dict', type: typeName(obj.type), entries, size: obj.entries.size }
    }
    if (obj instanceof SetVal) {
      const items = orderedKeys(obj, this.less).slice(0, MAX_ITEMS).map((k) => this.value(k, obj.type.of, heap, names))
      return { kind: 'set', type: typeName(obj.type), items, size: obj.keys.size }
    }
    if (obj instanceof PairVal) {
      return { kind: 'tuple', type: typeName(obj.type), items: this.cells([obj.first, obj.second], heap, names), size: 2 }
    }
    if (obj instanceof ObjVal) {
      const attrs = [...obj.fields].map(([name, c]): [string, Value] => [name, this.cell(c, heap, names)])
      return { kind: 'instance', type: obj.cls.name, attrs }
    }
    if (isFn(obj as Val)) {
      const fn = obj as Extract<Val, { fn: string }>
      const name = fn.fn === 'user' ? fn.defs[0]!.name : fn.fn === 'lambda' ? 'lambda' : fn.fn === 'builtin' ? fn.name : 'comparator'
      const params = fn.fn === 'lambda' ? fn.params : fn.fn === 'user' ? fn.defs[0]!.params : []
      return { kind: 'function', type: 'function', name, sig: `(${params.map((p) => `${typeName(p.type)} ${p.name}`).join(', ')})` }
    }
    const cell = obj as Cell
    const text = this.value(cell.value, cell.type, heap, names)
    return { kind: 'other', type: typeName(cell.type ?? T.int), repr: text.t === 'p' ? text.v : '' }
  }
}
