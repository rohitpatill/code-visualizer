import type { PrimName } from '../lang/types'
import { CompileStop, Fault } from './errors'

// Java primitive arithmetic. int, short, byte and char are JS numbers kept in
// range; long is a BigInt; float is rounded with Math.fround after every step.

export type Num = number | bigint
export type Arith = 'int' | 'long' | 'float' | 'double'
export type PrimValue = number | bigint | boolean

const INT_MIN = -2147483648
const INT_MAX = 2147483647
const LONG_MIN = -(2n ** 63n)
const LONG_MAX = 2n ** 63n - 1n
const COMPARE = new Set(['<', '>', '<=', '>=', '==', '!='])

/** Unary numeric promotion (JLS 5.6.1). */
export const promote1 = (p: PrimName): Arith => (p === 'long' || p === 'float' || p === 'double' ? p : 'int')

/** Binary numeric promotion (JLS 5.6.2). */
export function promote2(a: PrimName, b: PrimName): Arith {
  if (a === 'double' || b === 'double') return 'double'
  if (a === 'float' || b === 'float') return 'float'
  return a === 'long' || b === 'long' ? 'long' : 'int'
}

const isFloating = (p: PrimName) => p === 'float' || p === 'double'

function doubleToInt(x: number): number {
  if (Number.isNaN(x)) return 0
  if (x >= INT_MAX) return INT_MAX
  if (x <= INT_MIN) return INT_MIN
  return Math.trunc(x)
}

function doubleToLong(x: number): bigint {
  if (Number.isNaN(x)) return 0n
  if (x >= 9223372036854775807) return LONG_MAX
  if (x <= -9223372036854775808) return LONG_MIN
  return BigInt(Math.trunc(x))
}

/** The int a value narrows to: the first step of casts to int, short, byte and char. */
function toInt(v: Num, from: PrimName): number {
  if (typeof v === 'bigint') return Number(BigInt.asIntN(32, v))
  return isFloating(from) ? doubleToInt(v) : v | 0
}

/** A primitive cast (JLS 5.1.2 and 5.1.3): widening, narrowing with wraparound, and saturating float-to-int. */
export function castPrim(v: PrimValue, from: PrimName, to: PrimName): PrimValue {
  if (from === to) return v
  if (typeof v === 'boolean' || to === 'boolean') throw new CompileStop(`incompatible types: ${from} cannot be converted to ${to}`)
  switch (to) {
    case 'double':
      return Number(v)
    case 'float':
      return Math.fround(Number(v))
    case 'long':
      if (typeof v === 'bigint') return v
      return isFloating(from) ? doubleToLong(v) : BigInt(v)
    case 'int':
      return toInt(v, from)
    case 'short':
      return (toInt(v, from) << 16) >> 16
    case 'byte':
      return (toInt(v, from) << 24) >> 24
    default:
      return toInt(v, from) & 0xffff
  }
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
      return x == y
    default:
      return x != y
  }
}

const divideByZero = () => new Fault('ArithmeticException', '/ by zero')

function intOp(op: string, x: number, y: number): number {
  switch (op) {
    case '+':
      return (x + y) | 0
    case '-':
      return (x - y) | 0
    case '*':
      return Math.imul(x, y)
    case '/':
      if (y === 0) throw divideByZero()
      return Math.trunc(x / y) | 0
    case '%':
      if (y === 0) throw divideByZero()
      return x % y | 0
    case '&':
      return x & y
    case '|':
      return x | y
    default:
      return x ^ y
  }
}

function longOp(op: string, x: bigint, y: bigint): bigint {
  if ((op === '/' || op === '%') && y === 0n) throw divideByZero()
  switch (op) {
    case '+':
      return BigInt.asIntN(64, x + y)
    case '-':
      return BigInt.asIntN(64, x - y)
    case '*':
      return BigInt.asIntN(64, x * y)
    case '/':
      return BigInt.asIntN(64, x / y)
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
    case '%':
      return x % y
    default:
      throw new CompileStop(`bad operand types for binary operator '${op}'`)
  }
}

/** `x op y` after binary numeric promotion to `t`. Comparisons return booleans. */
export function arith(op: string, x: Num, y: Num, t: Arith): Num | boolean {
  if (COMPARE.has(op)) return compare(op, x, y)
  switch (t) {
    case 'int':
      return intOp(op, x as number, y as number)
    case 'long':
      return longOp(op, x as bigint, y as bigint)
    case 'float':
      return Math.fround(floatOp(op, x as number, y as number))
    default:
      return floatOp(op, x as number, y as number)
  }
}

/** `<<`, `>>` and `>>>`: the shift distance is masked to 5 bits for int and 6 for long, as in Java. */
export function shift(op: string, x: Num, count: Num, t: 'int' | 'long'): Num {
  if (t === 'long') {
    const n = BigInt(Number(BigInt(count) & 63n))
    const v = x as bigint
    if (op === '<<') return BigInt.asIntN(64, v << n)
    if (op === '>>') return v >> n
    return BigInt.asIntN(64, BigInt.asUintN(64, v) >> n)
  }
  const n = Number(BigInt(count) & 31n)
  const v = x as number
  if (op === '<<') return v << n
  if (op === '>>') return v >> n
  return (v >>> n) | 0
}

export function negate(x: Num, t: Arith): Num {
  if (t === 'int') return -(x as number) | 0
  if (t === 'long') return BigInt.asIntN(64, -(x as bigint))
  return t === 'float' ? Math.fround(-(x as number)) : -(x as number)
}

export function bitNot(x: Num, t: 'int' | 'long'): Num {
  return t === 'long' ? ~(x as bigint) : ~(x as number)
}
