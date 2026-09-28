import type { HeapObject, Prim, Value } from '../../../trace/types'
import type { HeapDraft } from '../../shared/recorder'

export const MAX_ITEMS = 100
const MAX_REPR = 200
const GETTER: Prim = { t: 'p', k: 'other', v: '[getter]' }

const clip = (text: string) => (text.length <= MAX_REPR ? text : `${text.slice(0, MAX_REPR)}...`)

function primitive(value: unknown): Prim | null {
  switch (typeof value) {
    case 'undefined':
      return { t: 'p', k: 'none', v: 'undefined' }
    case 'boolean':
      return { t: 'p', k: 'bool', v: String(value) }
    case 'number':
      return { t: 'p', k: Number.isInteger(value) ? 'int' : 'float', v: Object.is(value, -0) ? '-0' : String(value) }
    case 'bigint':
      return { t: 'p', k: 'int', v: `${value}n` }
    case 'string':
      return { t: 'p', k: 'str', v: clip(JSON.stringify(value)), s: value.slice(0, MAX_REPR) }
    case 'symbol':
      return { t: 'p', k: 'other', v: String(value) }
    default:
      return value === null ? { t: 'p', k: 'none', v: 'null' } : null
  }
}

/** `(a, b = 2)` from a function's source, without evaluating anything. */
function signature(source: string): string {
  const bare = /^\s*([A-Za-z_$][\w$]*)\s*=>/.exec(source)
  if (bare) return `(${bare[1]})`
  const open = source.indexOf('(')
  if (open === -1) return '()'
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++
    else if (source[i] === ')' && --depth === 0) return clip(source.slice(open, i + 1).replace(/\s+/g, ' '))
  }
  return '(...)'
}

function constructorOf(obj: object): Function | null {
  const proto: unknown = Object.getPrototypeOf(obj)
  if (proto === null || proto === Object.prototype) return null
  const ctor: unknown = Object.getOwnPropertyDescriptor(proto, 'constructor')?.value
  return typeof ctor === 'function' ? ctor : null
}

/** Encodes JavaScript values into the shared trace format with stable object ids. */
export class Encoder {
  private readonly ids = new WeakMap<object, string>()
  private next = 1

  value(value: unknown, heap: HeapDraft): Value {
    const prim = primitive(value)
    if (prim) return prim
    const obj = value as object
    let oid = this.ids.get(obj)
    if (!oid) {
      oid = String(this.next++)
      this.ids.set(obj, oid)
    }
    if (!(oid in heap)) {
      heap[oid] = { kind: 'other', type: '', repr: '' }
      heap[oid] = this.object(obj, heap)
    }
    return { t: 'r', id: oid }
  }

  private items(values: Iterable<unknown>, heap: HeapDraft): Value[] {
    const out: Value[] = []
    for (const v of values) {
      if (out.length >= MAX_ITEMS) break
      out.push(this.value(v, heap))
    }
    return out
  }

  private ownData(obj: object, heap: HeapDraft): [string, Value][] {
    return Object.keys(obj)
      .slice(0, MAX_ITEMS)
      .map((key) => {
        const desc = Object.getOwnPropertyDescriptor(obj, key)
        return [key, desc && 'value' in desc ? this.value(desc.value, heap) : GETTER]
      })
  }

  private arrayItems(arr: ArrayLike<unknown>, heap: HeapDraft): Value[] {
    const n = Math.min(arr.length, MAX_ITEMS)
    const out: Value[] = []
    for (let i = 0; i < n; i++) out.push(this.value(arr[i], heap))
    return out
  }

  private object(obj: object, heap: HeapDraft): HeapObject {
    if (typeof obj === 'function') return this.fn(obj)
    if (Array.isArray(obj)) return { kind: 'list', type: 'Array', items: this.arrayItems(obj, heap), size: obj.length }
    if (ArrayBuffer.isView(obj) && 'length' in obj) {
      const typed = obj as unknown as ArrayLike<unknown>
      return { kind: 'list', type: obj.constructor.name, items: this.arrayItems(typed, heap), size: typed.length }
    }
    if (obj instanceof Map) {
      const entries: [Value, Value][] = []
      for (const [k, v] of obj) {
        if (entries.length >= MAX_ITEMS) break
        entries.push([this.value(k, heap), this.value(v, heap)])
      }
      return { kind: 'dict', type: 'Map', entries, size: obj.size }
    }
    if (obj instanceof Set) return { kind: 'set', type: 'Set', items: this.items(obj, heap), size: obj.size }
    if (obj instanceof Error) return { kind: 'other', type: obj.name, repr: clip(`${obj.name}: ${obj.message}`) }
    if (obj instanceof Date || obj instanceof RegExp) return { kind: 'other', type: obj.constructor.name, repr: clip(String(obj)) }
    const ctor = constructorOf(obj)
    if (!ctor) {
      const entries = this.ownData(obj, heap).map(([k, v]): [Value, Value] => [primitive(k)!, v])
      return { kind: 'dict', type: 'Object', entries, size: Object.keys(obj).length }
    }
    return { kind: 'instance', type: ctor.name || 'Object', attrs: this.ownData(obj, heap) }
  }

  private fn(fn: Function): HeapObject {
    const source = Function.prototype.toString.call(fn)
    const name = fn.name || '(anonymous)'
    if (!source.startsWith('class')) return { kind: 'function', type: 'function', name, sig: signature(source) }
    const parent: unknown = Object.getPrototypeOf(fn)
    const bases = typeof parent === 'function' && parent !== Function.prototype && parent.name ? [parent.name] : []
    return { kind: 'class', type: 'class', name, bases, attrs: [] }
  }
}
