import type { NumLit } from '../lang/lexer'
import { type CType, type IntType, T } from '../lang/types'
import { CppError } from './errors'
import type { R, Val } from './values'

const COMPARE = new Set(['<', '>', '<=', '>=', '==', '!='])
const INT32_MAX = 2n ** 31n - 1n
const UINT32_MAX = 2n ** 32n - 1n

export type Num = number | bigint

/** The numeric payload of an arithmetic value (bool becomes 0 or 1). */
export function num(v: Val): Num {
  if (typeof v === 'number' || typeof v === 'bigint') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  throw new CppError('expected a number here')
}

export function wrapInt(n: Num, t: IntType): Num {
  if (t.bits === 64) {
    const b = typeof n === 'bigint' ? n : BigInt(Math.trunc(Number.isFinite(n) ? n : 0))
    return t.unsigned ? BigInt.asUintN(64, b) : BigInt.asIntN(64, b)
  }
  const x = typeof n === 'bigint' ? Number(BigInt.asIntN(32, n)) : n
  switch (t.bits) {
    case 32:
      return t.unsigned ? x >>> 0 : x | 0
    case 16:
      return t.unsigned ? x & 0xffff : (x << 16) >> 16
    default:
      return t.unsigned ? x & 0xff : (x << 24) >> 24
  }
}

const promote = (t: CType): CType => (t.t === 'bool' || t.t === 'char' || (t.t === 'int' && t.bits < 32) ? T.int : t)

/** The usual arithmetic conversions: the type both operands are converted to. */
export function commonType(a: CType, b: CType): CType {
  if (a.t === 'float' || b.t === 'float') {
    const single = (a.t !== 'float' || a.name === 'float') && (b.t !== 'float' || b.name === 'float')
    return single ? T.float : T.double
  }
  const pa = promote(a)
  const pb = promote(b)
  if (pa.t !== 'int' || pb.t !== 'int') return T.int
  if (pa.bits !== pb.bits) return pa.bits > pb.bits ? pa : pb
  return pa.unsigned ? pa : pb
}

export function convertArith(v: Val, from: CType, to: CType): Val {
  const n = num(v)
  switch (to.t) {
    case 'bool':
      return n !== 0 && n !== 0n
    case 'char':
      return wrapInt(from.t === 'float' ? Math.trunc(Number(n)) : n, { t: 'int', name: 'char', bits: 8, unsigned: false })
    case 'int':
      return wrapInt(from.t === 'float' ? Math.trunc(Number(n)) : n, to)
    case 'float':
      return to.name === 'float' ? Math.fround(Number(n)) : Number(n)
    default:
      throw new CppError('cannot convert a number to this type')
  }
}

export function literal(lit: NumLit): R {
  if (lit.float) return { type: lit.single ? T.float : T.double, value: lit.single ? Math.fround(lit.value) : lit.value }
  const v = lit.value
  if (lit.unsigned) return v <= UINT32_MAX && !lit.longs ? { type: T.unsigned, value: Number(v) } : { type: T.unsignedLongLong, value: BigInt.asUintN(64, v) }
  if (!lit.longs && v <= INT32_MAX) return { type: T.int, value: Number(v) }
  return { type: T.longLong, value: BigInt.asIntN(64, v) }
}

function compare(op: string, x: Num, y: Num): boolean {
  switch (op) {
    case '<':
      return x < y
    case '>':
      return x > y
    case '<=':
      return x <= y
    case '>=':
      return x >= y
    case '==':
      return x === y
    default:
      return x !== y
  }
}

function floatOp(op: string, x: number, y: number): number {
  switch (op) {
    case '+':
      return x + y
    case '-':
      return x - y
    case '*':
      return x * y
    case '/':
      return x / y
    default:
      throw new CppError(`operator ${op} needs integer operands`)
  }
}

function bigOp(op: string, x: bigint, y: bigint): bigint {
  if ((op === '/' || op === '%') && y === 0n) throw new CppError('division by zero')
  switch (op) {
    case '+':
      return x + y
    case '-':
      return x - y
    case '*':
      return x * y
    case '/':
      return x / y
    case '%':
      return x % y
    case '&':
      return x & y
    case '|':
      return x | y
    default:
      return x ^ y
  }
}

function smallOp(op: string, x: number, y: number): number {
  if ((op === '/' || op === '%') && y === 0) throw new CppError('division by zero')
  switch (op) {
    case '+':
      return x + y
    case '-':
      return x - y
    case '*':
      return Math.imul(x, y)
    case '/':
      return Math.trunc(x / y)
    case '%':
      return x % y
    case '&':
      return x & y
    case '|':
      return x | y
    default:
      return x ^ y
  }
}

function shift(op: string, a: R, b: R): R {
  const type = promote(a.type) as IntType
  if (type.t !== 'int') throw new CppError(`operator ${op} needs integer operands`)
  const x = convertArith(a.value, a.type, type) as Num
  const count = Number(num(b.value))
  if (count < 0 || count >= type.bits) throw new CppError(`shift by ${count} is out of range for ${type.name}`)
  if (typeof x === 'bigint') return { type, value: wrapInt(op === '<<' ? x << BigInt(count) : x >> BigInt(count), type) }
  const value = op === '<<' ? x * 2 ** count : type.unsigned ? x >>> count : x >> count
  return { type, value: wrapInt(value, type) }
}

/** `a op b` for arithmetic operands, with C++ promotion, wraparound and truncating division. */
export function arith(op: string, a: R, b: R): R {
  if (op === '<<' || op === '>>') return shift(op, a, b)
  const type = commonType(a.type, b.type)
  const x = convertArith(a.value, a.type, type) as Num
  const y = convertArith(b.value, b.type, type) as Num
  if (COMPARE.has(op)) return { type: T.bool, value: compare(op, x, y) }
  if (type.t === 'float') {
    const r = floatOp(op, Number(x), Number(y))
    return { type, value: type.name === 'float' ? Math.fround(r) : r }
  }
  const it = type as IntType
  if (typeof x === 'bigint') return { type, value: wrapInt(bigOp(op, x, y as bigint), it) }
  return { type, value: wrapInt(smallOp(op, x, y as number), it) }
}

export function unaryArith(op: string, a: R): R {
  if (op === '!') return { type: T.bool, value: !convertArith(a.value, a.type, T.bool) }
  const type = a.type.t === 'float' ? a.type : promote(a.type)
  const x = convertArith(a.value, a.type, type) as Num
  if (op === '+') return { type, value: x }
  if (type.t === 'float') return { type, value: -Number(x) }
  const it = type as IntType
  const value = typeof x === 'bigint' ? (op === '-' ? -x : ~x) : op === '-' ? -x : ~x
  return { type, value: wrapInt(value, it) }
}

export function isZero(v: Val): boolean {
  return v === 0 || v === 0n || v === false
}
