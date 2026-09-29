import { type JType, T, typeName } from '../lang/types'
import { primValue, unboxNull } from './convert'
import { CompileStop } from './errors'
import type { Machine } from './machine'
import { arith, bitNot, castPrim, negate, promote1, promote2, shift } from './numbers'
import { textOf } from './text'
import { JStr, type R } from './values'

export const VOID: R = { type: T.void, value: null }
export const boolR = (value: boolean): R => ({ type: T.boolean, value })
export const intR = (value: number): R => ({ type: T.int, value: value | 0 })
export const longR = (value: bigint): R => ({ type: T.long, value })
export const doubleR = (value: number): R => ({ type: T.double, value })
export const charR = (code: number): R => ({ type: T.char, value: code & 0xffff })
/** A String made at run time: never interned, so `==` against a literal is false, as in Java. */
export const strR = (s: string): R => ({ type: T.string, value: new JStr(s) })
export const refR = (value: R['value'], type: JType = T.object): R => ({ type, value })

/** A primitive held directly, not boxed. */
export const isRawPrim = (r: R) => r.type.t === 'prim' && (typeof r.value === 'number' || typeof r.value === 'bigint' || typeof r.value === 'boolean')

const describe = (r: R) => (r.value instanceof JStr ? 'String' : r.value === null ? '<null>' : typeName(r.type))

function numeric(r: R, op: string, other: R) {
  const u = primValue(r)
  if (u && u.p !== 'boolean') return u
  if (r.value === null && !(other.value instanceof JStr)) throw unboxNull('int')
  throw new CompileStop(`bad operand types for binary operator '${op}': ${describe(r)} and ${describe(other)}`)
}

export function truthy(r: R): boolean {
  const u = primValue(r)
  if (u?.p === 'boolean') return u.v as boolean
  if (r.value === null) throw unboxNull('boolean')
  throw new CompileStop(`incompatible types: ${describe(r)} cannot be converted to boolean`)
}

function equality(op: string, a: R, b: R): R {
  let same: boolean
  if (!isRawPrim(a) && !isRawPrim(b)) same = a.value === b.value
  else {
    const x = primValue(a)
    const y = primValue(b)
    if (!x || !y) {
      if (a.value === null || b.value === null) throw unboxNull(x?.p ?? y!.p)
      throw new CompileStop(`incomparable types: ${describe(a)} and ${describe(b)}`)
    }
    if (x.p === 'boolean' || y.p === 'boolean') {
      if (x.p !== y.p) throw new CompileStop(`incomparable types: ${x.p} and ${y.p}`)
      same = x.v === y.v
    } else {
      const t = promote2(x.p, y.p)
      same = castPrim(x.v, x.p, t) == castPrim(y.v, y.p, t)
    }
  }
  return boolR(op === '==' ? same : !same)
}

/** `a op b` with Java's rules: string concatenation, reference `==`, unboxing and numeric promotion. */
export function binary(m: Machine, op: string, a: R, b: R): R {
  if (op === '+' && (a.value instanceof JStr || b.value instanceof JStr)) return strR(textOf(m, a) + textOf(m, b))
  if (op === '==' || op === '!=') return equality(op, a, b)
  const x = primValue(a)
  const y = primValue(b)
  if ((op === '&' || op === '|' || op === '^') && x?.p === 'boolean' && y?.p === 'boolean') {
    const p = x.v as boolean
    const q = y.v as boolean
    return boolR(op === '&' ? p && q : op === '|' ? p || q : p !== q)
  }
  const nx = numeric(a, op, b)
  const ny = numeric(b, op, a)
  if (op === '<<' || op === '>>' || op === '>>>') {
    const t = promote1(nx.p)
    if (t !== 'int' && t !== 'long') throw new CompileStop(`bad operand types for binary operator '${op}'`)
    return { type: T[t], value: shift(op, castPrim(nx.v, nx.p, t) as number | bigint, ny.v as number | bigint, t) }
  }
  const t = promote2(nx.p, ny.p)
  if ((op === '&' || op === '|' || op === '^') && (t === 'float' || t === 'double')) {
    throw new CompileStop(`bad operand types for binary operator '${op}'`)
  }
  const value = arith(op, castPrim(nx.v, nx.p, t) as number | bigint, castPrim(ny.v, ny.p, t) as number | bigint, t)
  return typeof value === 'boolean' ? boolR(value) : { type: T[t], value }
}

export function unary(op: string, r: R): R {
  if (op === '!') return boolR(!truthy(r))
  const u = primValue(r)
  if (!u || u.p === 'boolean') {
    if (r.value === null) throw unboxNull('int')
    throw new CompileStop(`bad operand type ${describe(r)} for unary operator '${op}'`)
  }
  const t = promote1(u.p)
  const x = castPrim(u.v, u.p, t) as number | bigint
  if (op === '+') return { type: T[t], value: x }
  if (op === '-') return { type: T[t], value: negate(x, t) }
  if (t === 'float' || t === 'double') throw new CompileStop(`bad operand type ${t} for unary operator '~'`)
  return { type: T[t], value: bitNot(x, t) }
}
