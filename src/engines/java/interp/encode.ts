import type { HeapObject, Prim, Value } from '../../../trace/types'
import type { HeapDraft } from '../../shared/recorder'
import { type JType, type PrimName, typeName } from '../lang/types'
import type { Machine } from './machine'
import type { PrimValue } from './numbers'
import { optionalText } from './lib/optionals'
import { statsClassName, statsMethod } from './lib/statistics'
import { CollectorVal, OptionalVal, PendingVal, StatsVal, StreamVal } from './streamValues'
import { doubleText, floatText, viewItems } from './text'
import {
  Boxed, BuilderVal, ClassRef, EntryVal, FnVal, HeapVal, IterVal, JArray, JObject, JStr, type JVal, ListVal, MapVal, NativeObj,
  SetVal, UNINIT, ViewVal,
} from './values'

const MAX_ITEMS = 100
const MAX_TEXT = 200
const CONTROL = /[\u0000-\u001f\u007f]/
const OBJECT: JType = { t: 'ref', name: 'Object', args: [] }

const clip = (s: string) => (s.length <= MAX_TEXT ? s : `${s.slice(0, MAX_TEXT)}...`)
const prim = (k: Prim['k'], v: string, s?: string): Prim => (s === undefined ? { t: 'p', k, v } : { t: 'p', k, v, s })

const NATIVE_LABELS: Readonly<Record<NativeObj['kind'], string>> = {
  out: 'System.out',
  in: 'System.in',
  scanner: 'Scanner',
  reader: 'BufferedReader',
  tokenizer: 'StringTokenizer',
  writer: 'PrintWriter',
  random: 'Random',
}

function charLiteral(code: number): string {
  const ch = String.fromCharCode(code)
  return `'${CONTROL.test(ch) ? JSON.stringify(ch).slice(1, -1) : ch === "'" ? "\\'" : ch}'`
}

const generic = (name: string, args: readonly JType[]) => (args.length ? `${name}<${args.map(typeName).join(', ')}>` : name)

/** Encodes Java values for the trace. Objects get stable ids by identity; strings and boxed numbers show inline. */
export class Encoder {
  private readonly ids = new WeakMap<object, string>()
  private next = 1

  constructor(private readonly m: Machine) {}

  value(v: JVal, type: JType, heap: HeapDraft): Value {
    if (v === UNINIT) return prim('other', '?')
    if (v === null) return prim('none', 'null')
    if (typeof v === 'boolean') return prim('bool', String(v))
    if (typeof v === 'number' || typeof v === 'bigint') return this.primitive(type.t === 'prim' ? type.name : 'int', v)
    if (v instanceof Boxed) return this.primitive(v.prim, v.v)
    if (v instanceof JStr) return prim('str', clip(JSON.stringify(v.s)), v.s.slice(0, MAX_TEXT))
    if (v instanceof ClassRef) return prim('other', `class ${v.name}`)
    if (v instanceof NativeObj) return prim('other', NATIVE_LABELS[v.kind])
    if (v instanceof IterVal) return prim('other', 'iterator')
    if (v instanceof JObject && v.constant) return prim('other', v.constant.name)
    if (v instanceof StreamVal) return prim('other', v.prim ? `${v.prim[0]!.toUpperCase()}${v.prim.slice(1)}Stream` : 'Stream')
    if (v instanceof CollectorVal || v instanceof PendingVal) return prim('other', 'Collector')
    if (v instanceof OptionalVal && (v.value === undefined || v.kind !== 'Optional')) return prim('other', optionalText(this.m, v))
    return this.ref(v, heap)
  }

  private primitive(p: PrimName, v: PrimValue): Prim {
    switch (p) {
      case 'boolean':
        return prim('bool', String(v))
      case 'char':
        return prim('str', charLiteral(Number(v)), String.fromCharCode(Number(v)))
      case 'double':
        return prim('float', doubleText(Number(v)))
      case 'float':
        return prim('float', floatText(Number(v)))
      default:
        return prim('int', String(v))
    }
  }

  private ref(obj: object, heap: HeapDraft): Value {
    let id = this.ids.get(obj)
    if (!id) {
      id = String(this.next++)
      this.ids.set(obj, id)
    }
    if (!(id in heap)) {
      heap[id] = { kind: 'other', type: '', repr: '' }
      heap[id] = this.object(obj, heap)
    }
    return { t: 'r', id }
  }

  private stats(st: StatsVal, heap: HeapDraft): HeapObject {
    const m = this.m
    const attr = (name: string): [string, Value] => {
      const r = statsMethod(m, st, name, [])
      return [name.slice(3).toLowerCase(), this.value(r.value, r.type, heap)]
    }
    return { kind: 'instance', type: statsClassName(st), attrs: ['getCount', 'getSum', 'getMin', 'getAverage', 'getMax'].map(attr) }
  }

  private items(values: readonly JVal[], type: JType, heap: HeapDraft): Value[] {
    return values.slice(0, MAX_ITEMS).map((v) => this.value(v, type, heap))
  }

  private object(obj: object, heap: HeapDraft): HeapObject {
    const m = this.m
    if (obj instanceof JArray) return { kind: 'list', type: typeName(obj.type), items: this.items(obj.items, obj.type.of, heap), size: obj.items.length }
    if (obj instanceof JObject) {
      const base = obj.base
      if (base !== undefined && !obj.fields.size && !(base instanceof NativeObj)) return { ...this.object(base as object, heap), type: obj.cls.name }
      const attrs = [...obj.fields].map(([name, slot]): [string, Value] => [name, this.value(slot.value, slot.type, heap)])
      if (base !== undefined) attrs.push(['super', this.value(base, OBJECT, heap)])
      return { kind: 'instance', type: obj.cls.name, attrs }
    }
    if (obj instanceof ListVal) {
      const type = generic(obj.kind, obj.args)
      const items = this.items(obj.items, OBJECT, heap)
      if (obj.kind === 'LinkedList' || obj.kind === 'ArrayDeque') return { kind: 'deque', type, items, size: obj.items.length, stackTop: 'first' }
      return { kind: 'list', type, items, size: obj.items.length }
    }
    if (obj instanceof HeapVal) {
      return { kind: 'list', type: generic('PriorityQueue', obj.args), items: this.items(obj.items, OBJECT, heap), size: obj.items.length }
    }
    if (obj instanceof MapVal) {
      const entries = obj.store
        .entries(m)
        .slice(0, MAX_ITEMS)
        .map((e): [Value, Value] => [this.value(e.key, OBJECT, heap), this.value(e.value, OBJECT, heap)])
      return { kind: 'dict', type: generic(obj.kind, obj.args), entries, size: obj.store.size }
    }
    if (obj instanceof SetVal) {
      const items = this.items(obj.store.entries(m).map((e) => e.key), OBJECT, heap)
      return { kind: 'set', type: generic(obj.kind, obj.args), items, size: obj.store.size }
    }
    if (obj instanceof ViewVal) {
      const items = this.items(viewItems(m, obj), OBJECT, heap)
      const type = obj.part === 'keys' ? 'keySet' : obj.part === 'values' ? 'values' : 'entrySet'
      return { kind: obj.part === 'values' ? 'list' : 'set', type, items, size: obj.map.store.size }
    }
    if (obj instanceof EntryVal) {
      return { kind: 'tuple', type: 'Map.Entry', items: [this.value(obj.entry.key, OBJECT, heap), this.value(obj.entry.value, OBJECT, heap)], size: 2 }
    }
    if (obj instanceof BuilderVal) return { kind: 'other', type: 'StringBuilder', repr: clip(JSON.stringify(obj.s)) }
    if (obj instanceof OptionalVal) return { kind: 'instance', type: 'Optional', attrs: [['value', this.value(obj.value!, OBJECT, heap)]] }
    if (obj instanceof StatsVal) return this.stats(obj, heap)
    const fn = obj as FnVal
    return { kind: 'function', type: 'lambda', name: fn.label, sig: `(${fn.params.join(', ')})` }
  }
}
