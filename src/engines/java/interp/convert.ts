import { BOX, type JType, type PrimName, primOf, typeName, widens } from '../lang/types'
import { CompileStop, Fault } from './errors'
import type { Machine } from './machine'
import { type PrimValue, castPrim } from './numbers'
import { Boxed, HeapVal, JStr, type JVal, ListVal, MapVal, type R, SetVal } from './values'

const RANGE: Partial<Record<PrimName, [number, number]>> = { byte: [-128, 127], short: [-32768, 32767], char: [0, 65535] }

/** The value a field, array element or `new` object starts with. */
export function zeroOf(t: JType): JVal {
  if (t.t !== 'prim') return null
  if (t.name === 'boolean') return false
  return t.name === 'long' ? 0n : 0
}

/** The primitive inside a value, unboxing a wrapper. Null for values that are not primitives or wrappers. */
export function primValue(r: R): { p: PrimName; v: PrimValue } | null {
  const v = r.value
  if (r.type.t === 'prim' && (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean')) return { p: r.type.name, v }
  if (v instanceof Boxed) return { p: v.prim, v: v.v }
  return null
}

export function unboxNull(p: PrimName): Fault {
  return new Fault('NullPointerException', `Cannot invoke "java.lang.${BOX[p]}.${p}Value()" because the value is null`)
}

/** javac accepts `byte b = 10;` and `char c = 65;`: an int constant that fits narrows on assignment. */
function narrowsAsConstant(p: PrimName, v: PrimValue, to: PrimName): boolean {
  const range = RANGE[to]
  return !!range && (p === 'int' || p === 'short' || p === 'char' || p === 'byte') && typeof v === 'number' && v >= range[0] && v <= range[1]
}

const describe = (r: R) => (r.value instanceof JStr ? 'String' : r.value === null ? '<null>' : typeName(r.type))

/** Converts to a primitive: unboxing and widening, or any primitive conversion for a cast. */
export function toPrim(r: R, to: PrimName, cast = false): PrimValue {
  const u = primValue(r)
  if (!u) {
    if (r.value === null) throw unboxNull(to)
    throw new CompileStop(`incompatible types: ${describe(r)} cannot be converted to ${to}`)
  }
  if (cast || widens(u.p, to) || narrowsAsConstant(u.p, u.v, to)) return castPrim(u.v, u.p, to)
  if (u.p === 'boolean' || to === 'boolean') throw new CompileStop(`incompatible types: ${u.p} cannot be converted to ${to}`)
  throw new CompileStop(`incompatible types: possible lossy conversion from ${u.p} to ${to}`)
}

/** Remembers `List<Integer>` from the declaration on an object made with `new ArrayList<>()`, for display. */
function adoptArgs(v: JVal, args: JType[]): void {
  if ((v instanceof ListVal || v instanceof MapVal || v instanceof SetVal || v instanceof HeapVal) && !v.args.length) v.args = args
}

/** Converts for a reference-typed variable: primitives are boxed, as Java's autoboxing does. */
export function toRef(m: Machine, r: R, to: JType): JVal {
  const v = r.value
  if (r.type.t === 'prim' && (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean')) {
    const target = primOf(to)
    const from = r.type.name
    if (to.t === 'ref' && to.name === 'String') throw new CompileStop(`incompatible types: ${from} cannot be converted to String`)
    if (!target || target === from) return m.box(from, v)
    if (narrowsAsConstant(from, v, target)) return m.box(target, castPrim(v, from, target))
    throw new CompileStop(`incompatible types: ${from} cannot be converted to ${BOX[target]}`)
  }
  if (to.t === 'ref' && to.args.length) adoptArgs(v, to.args)
  return v
}

/** What storing `r` in a slot of type `to` stores: the conversions of assignment, parameter passing and return. */
export function convert(m: Machine, r: R, to: JType): JVal {
  return to.t === 'prim' ? toPrim(r, to.name) : toRef(m, r, to)
}
