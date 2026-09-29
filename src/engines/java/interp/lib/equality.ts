import { T } from '../../lang/types'
import { toPrim, toRef } from '../convert'
import { methodsNamed } from '../classes'
import { callObjectMethod, invokeCallable } from '../calls'
import { Fault } from '../errors'
import type { Machine } from '../machine'
import { refR, truthy } from '../ops'
import { Boxed, EntryVal, JObject, JStr, type JVal, ListVal, MapVal, SetVal, ViewVal, entryVal } from '../values'
import { runtimeClassName } from './types'

// Java's equals, hashCode and compareTo for every value. HashMap, HashSet and
// TreeMap call them (and so the user's own overrides) exactly where Java would.

const stringHashes = new WeakMap<JStr, number>()
const view = new DataView(new ArrayBuffer(8))

export function stringHash(s: JStr): number {
  let h = stringHashes.get(s)
  if (h === undefined) {
    h = 0
    for (let i = 0; i < s.s.length; i++) h = (Math.imul(31, h) + s.s.charCodeAt(i)) | 0
    stringHashes.set(s, h)
  }
  return h
}

const foldLong = (v: bigint) => Number(BigInt.asIntN(32, BigInt.asUintN(64, v) ^ (BigInt.asUintN(64, v) >> 32n)))

function doubleBits(x: number): bigint {
  if (Number.isNaN(x)) return 0x7ff8000000000000n
  view.setFloat64(0, x)
  return view.getBigInt64(0)
}

function floatBits(x: number): number {
  if (Number.isNaN(x)) return 0x7fc00000
  view.setFloat32(0, x)
  return view.getInt32(0)
}

function boxHash(b: Boxed): number {
  switch (b.prim) {
    case 'boolean':
      return b.v ? 1231 : 1237
    case 'long':
      return foldLong(b.v as bigint)
    case 'double':
      return foldLong(doubleBits(b.v as number))
    case 'float':
      return floatBits(b.v as number)
    default:
      return Number(b.v)
  }
}

const isList = (v: JVal): v is ListVal => v instanceof ListVal && v.kind !== 'ArrayDeque'
const isSet = (v: JVal) => v instanceof SetVal || (v instanceof ViewVal && v.part !== 'values')

function userMethod(obj: JObject, name: string, params: number) {
  return methodsNamed(obj.cls, name).find((x) => x.decl.params.length === params && x.decl.body && !x.decl.isStatic)
}

function keysOf(m: Machine, v: JVal): JVal[] {
  if (v instanceof SetVal) return v.store.entries(m).map((e) => e.key)
  const entries = (v as ViewVal).map.store.entries(m)
  return (v as ViewVal).part === 'keys' ? entries.map((e) => e.key) : entries.map(entryVal)
}

function setContains(m: Machine, s: JVal, key: JVal): boolean {
  if (s instanceof SetVal) return !!s.store.find(m, key)
  return keysOf(m, s).some((k) => javaEquals(m, key, k))
}

/** A record component as an object: primitives boxed, so they hash and compare like Java's. */
function component(m: Machine, obj: JObject, name: string): JVal {
  const slot = obj.fields.get(name)!
  return toRef(m, { type: slot.type, value: slot.value }, T.object)
}

function recordEquals(m: Machine, a: JObject, b: JObject): boolean {
  return a.cls === b.cls && a.cls.decl.components.every((c) => javaEquals(m, component(m, a, c.name), component(m, b, c.name)))
}

/** `a.equals(b)`. */
export function javaEquals(m: Machine, a: JVal, b: JVal): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (a instanceof JStr) return b instanceof JStr && a.s === b.s
  if (a instanceof Boxed) return b instanceof Boxed && a.prim === b.prim && Object.is(a.v, b.v)
  if (isList(a)) return isList(b) && a.items.length === b.items.length && a.items.every((x, i) => javaEquals(m, x, b.items[i]!))
  if (isSet(a)) {
    const keys = keysOf(m, a)
    return isSet(b) && keys.length === keysOf(m, b).length && keys.every((k) => setContains(m, b, k))
  }
  if (a instanceof MapVal) {
    if (!(b instanceof MapVal) || a.store.size !== b.store.size) return false
    return a.store.entries(m).every((e) => {
      const other = b.store.find(m, e.key)
      return !!other && javaEquals(m, e.value, other.value)
    })
  }
  if (a instanceof EntryVal) return b instanceof EntryVal && javaEquals(m, a.entry.key, b.entry.key) && javaEquals(m, a.entry.value, b.entry.value)
  if (a instanceof JObject) {
    if (userMethod(a, 'equals', 1)) return truthy(callObjectMethod(m, a, 'equals', [refR(b)]))
    return a.cls.decl.kind === 'record' && b instanceof JObject && recordEquals(m, a, b)
  }
  return false
}

/** `v.hashCode()`: the bucket a HashMap puts it in. */
export function javaHash(m: Machine, v: JVal): number {
  if (v === null) return 0
  if (v instanceof JStr) return stringHash(v)
  if (v instanceof Boxed) return boxHash(v)
  if (isList(v)) return v.items.reduce<number>((h, x) => (Math.imul(31, h) + javaHash(m, x)) | 0, 1)
  if (isSet(v)) return keysOf(m, v).reduce<number>((h, k) => (h + javaHash(m, k)) | 0, 0)
  if (v instanceof MapVal) return v.store.entries(m).reduce<number>((h, e) => (h + (javaHash(m, e.key) ^ javaHash(m, e.value))) | 0, 0)
  if (v instanceof EntryVal) return javaHash(m, v.entry.key) ^ javaHash(m, v.entry.value)
  if (v instanceof JObject) {
    if (userMethod(v, 'hashCode', 0)) return toPrim(callObjectMethod(m, v, 'hashCode', []), 'int') as number
    if (v.cls.decl.kind === 'record') {
      return v.cls.decl.components.reduce<number>((h, c) => (Math.imul(31, h) + javaHash(m, component(m, v, c.name))) | 0, 0)
    }
  }
  return m.identityHash(v as object)
}

function compareBoxes(a: Boxed, b: Boxed): number {
  if (a.prim === 'char') return Number(a.v) - Number(b.v)
  if (a.prim === 'boolean') return a.v === b.v ? 0 : a.v ? 1 : -1
  if (a.prim === 'double' || a.prim === 'float') {
    const x = a.v as number
    const y = b.v as number
    if (x < y) return -1
    if (x > y) return 1
    const bx = doubleBits(x)
    const by = doubleBits(y)
    return bx === by ? 0 : bx < by ? -1 : 1
  }
  return a.v < b.v ? -1 : a.v > b.v ? 1 : 0
}

/** String.compareTo: the difference of the first differing chars, or of the lengths. */
export function compareStrings(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const d = a.charCodeAt(i) - b.charCodeAt(i)
    if (d) return d
  }
  return a.length - b.length
}

/** `a.compareTo(b)`: natural ordering. */
export function naturalCompare(m: Machine, a: JVal, b: JVal): number {
  if (a === null || b === null) throw new Fault('NullPointerException', 'Cannot compare a null value')
  if (a instanceof JStr && b instanceof JStr) return compareStrings(a.s, b.s)
  if (a instanceof Boxed && b instanceof Boxed && a.prim === b.prim) return compareBoxes(a, b)
  if (a instanceof JObject && a.constant && b instanceof JObject && b.constant) return a.constant.ordinal - b.constant.ordinal
  if (a instanceof JObject && userMethod(a, 'compareTo', 1)) return toPrim(callObjectMethod(m, a, 'compareTo', [refR(b)]), 'int') as number
  throw new Fault('ClassCastException', `class ${runtimeClassName(a)} cannot be cast to class java.lang.Comparable`)
}

/** `cmp.compare(a, b)`, or natural ordering when there is no comparator. */
export function compareWith(m: Machine, cmp: JVal, a: JVal, b: JVal): number {
  if (cmp === null) return naturalCompare(m, a, b)
  return toPrim(invokeCallable(m, cmp, [refR(a), refR(b)], 'compare'), 'int') as number
}
