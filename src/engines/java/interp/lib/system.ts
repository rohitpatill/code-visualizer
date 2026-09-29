import { T } from '../../lang/types'
import { primValue, toPrim } from '../convert'
import { CompileStop, ExitSignal, Fault } from '../errors'
import type { Machine } from '../machine'
import { type Arith, promote2 } from '../numbers'
import { VOID, boolR, doubleR, intR, longR, refR, strR } from '../ops'
import { valueText } from '../text'
import { JArray, JStr, type R } from '../values'
import { arity, element, intArg, noMethod } from './common'
import { javaEquals, javaHash } from './equality'

export const MATH_CONSTANTS: Readonly<Record<string, R>> = { PI: doubleR(Math.PI), E: doubleR(Math.E) }

const DOUBLE_FUNCTIONS: Readonly<Record<string, (...xs: number[]) => number>> = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, pow: Math.pow, exp: Math.exp, expm1: Math.expm1, log: Math.log, log10: Math.log10, log1p: Math.log1p,
  floor: Math.floor, ceil: Math.ceil, hypot: Math.hypot, sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos,
  atan: Math.atan, atan2: Math.atan2, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, signum: Math.sign,
  toRadians: (x) => (x / 180) * Math.PI, toDegrees: (x) => (x * 180) / Math.PI,
  rint: (x) => (Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : Math.round(x)),
}

const LIMITS = { int: [-(2 ** 31), 2 ** 31 - 1], long: [-(2n ** 63n), 2n ** 63n - 1n] } as const

function exact(op: string, t: 'int' | 'long', x: bigint, y: bigint): R {
  const r = op === 'add' ? x + y : op === 'subtract' ? x - y : x * y
  const [lo, hi] = LIMITS[t]
  if (r < BigInt(lo) || r > BigInt(hi)) throw new Fault('ArithmeticException', `${t === 'int' ? 'integer' : 'long'} overflow`)
  return t === 'int' ? intR(Number(r)) : longR(r)
}

/** The type Math.max, min and abs keep: their arguments' promoted type. */
function numericType(args: readonly R[]): Arith {
  const ps = args.map((a) => {
    const u = primValue(a)
    if (!u || u.p === 'boolean') throw new CompileStop('Math needs number arguments')
    return u.p
  })
  return ps.reduce<Arith>((t, p) => promote2(t, p), 'int')
}

function mathStatic(name: string, args: readonly R[]): R {
  if (name in DOUBLE_FUNCTIONS) return doubleR(DOUBLE_FUNCTIONS[name]!(...args.map((a) => toPrim(a, 'double') as number)))
  switch (name) {
    case 'abs':
    case 'max':
    case 'min': {
      const t = numericType(args)
      const xs = args.map((a) => toPrim(a, t))
      if (t === 'float' || t === 'double') {
        const nums = xs as number[]
        const v = name === 'abs' ? Math.abs(nums[0]!) : name === 'max' ? Math.max(nums[0]!, nums[1]!) : Math.min(nums[0]!, nums[1]!)
        return { type: T[t], value: t === 'float' ? Math.fround(v) : v }
      }
      const [a, b] = xs.map((x) => BigInt(x as number | bigint)) as [bigint, bigint]
      const v = name === 'abs' ? (a < 0n ? -a : a) : name === 'max' ? (a > b ? a : b) : a < b ? a : b
      return t === 'int' ? intR(Number(BigInt.asIntN(32, v))) : longR(BigInt.asIntN(64, v))
    }
    case 'round': {
      const u = primValue(args[0]!)
      const x = toPrim(args[0]!, 'double') as number
      const r = Number.isNaN(x) ? 0 : Math.round(x)
      if (u?.p === 'float') return intR(Math.max(-(2 ** 31), Math.min(2 ** 31 - 1, r)))
      if (r >= 9223372036854775807) return longR(LIMITS.long[1])
      return longR(r <= -9223372036854775808 ? LIMITS.long[0] : BigInt(r))
    }
    case 'random':
      return doubleR(Math.random())
    case 'floorDiv':
    case 'floorMod': {
      const t = numericType(args) === 'long' ? 'long' : 'int'
      const [a, b] = args.map((x) => BigInt(toPrim(x, t) as number | bigint)) as [bigint, bigint]
      if (b === 0n) throw new Fault('ArithmeticException', '/ by zero')
      let q = a / b
      if ((a % b !== 0n) && (a < 0n) !== (b < 0n)) q -= 1n
      const v = name === 'floorDiv' ? q : a - q * b
      return t === 'int' ? intR(Number(BigInt.asIntN(32, v))) : longR(BigInt.asIntN(64, v))
    }
    case 'addExact':
    case 'subtractExact':
    case 'multiplyExact': {
      const t = numericType(args) === 'long' ? 'long' : 'int'
      const [a, b] = args.map((x) => BigInt(toPrim(x, t) as number | bigint)) as [bigint, bigint]
      return exact(name.slice(0, -5), t, a, b)
    }
    case 'negateExact':
    case 'incrementExact':
    case 'decrementExact': {
      const t = numericType(args) === 'long' ? 'long' : 'int'
      const a = BigInt(toPrim(args[0]!, t) as number | bigint)
      return name === 'negateExact' ? exact('subtract', t, 0n, a) : exact(name === 'incrementExact' ? 'add' : 'subtract', t, a, 1n)
    }
    case 'toIntExact': {
      const v = toPrim(args[0]!, 'long') as bigint
      if (v < -(2n ** 31n) || v >= 2n ** 31n) throw new Fault('ArithmeticException', 'integer overflow')
      return intR(Number(v))
    }
    default:
      throw noMethod('Math', name)
  }
}

function objectsStatic(m: Machine, name: string, args: readonly R[]): R {
  const v = (i: number) => (args[i] ? element(m, args[i]) : null)
  switch (name) {
    case 'equals':
      return boolR(javaEquals(m, v(0), v(1)))
    case 'hash':
      return intR(args.map((a) => element(m, a)).reduce<number>((h, x) => (Math.imul(31, h) + javaHash(m, x)) | 0, 1))
    case 'hashCode':
      return intR(v(0) === null ? 0 : javaHash(m, v(0)))
    case 'isNull':
    case 'nonNull':
      return boolR((v(0) === null) === (name === 'isNull'))
    case 'requireNonNull':
      if (v(0) === null) throw new Fault('NullPointerException', args[1]?.value instanceof JStr ? args[1].value.s : null)
      return args[0]!
    case 'requireNonNullElse':
      return v(0) === null ? args[1]! : args[0]!
    case 'toString':
      return strR(v(0) === null && args[1] ? valueText(m, v(1)) : valueText(m, v(0)))
    default:
      throw noMethod('Objects', name)
  }
}

function arraycopy(args: readonly R[]): R {
  arity('System.arraycopy', args, 5)
  const [src, , dest] = args.map((a) => a.value)
  if (!(src instanceof JArray) || !(dest instanceof JArray)) throw new Fault('NullPointerException')
  const from = intArg(args[1], 'arraycopy')
  const to = intArg(args[3], 'arraycopy')
  const n = intArg(args[4], 'arraycopy')
  if (from < 0 || to < 0 || n < 0 || from + n > src.items.length || to + n > dest.items.length) {
    const bad = from + n > src.items.length ? `last source index ${from + n} out of bounds for length ${src.items.length}` : `last destination index ${to + n} out of bounds for length ${dest.items.length}`
    throw new Fault('ArrayIndexOutOfBoundsException', `arraycopy: ${bad}`)
  }
  const part = src.items.slice(from, from + n)
  dest.items.splice(to, n, ...part)
  return VOID
}

function systemStatic(m: Machine, name: string, args: readonly R[]): R {
  switch (name) {
    case 'currentTimeMillis':
      return longR(BigInt(Date.now()))
    case 'nanoTime':
      return longR(BigInt(Math.round(performance.now() * 1e6)))
    case 'exit':
      throw new ExitSignal()
    case 'arraycopy':
      return arraycopy(args)
    case 'lineSeparator':
      return refR(m.intern('\n'), T.string)
    case 'identityHashCode':
      return intR(args[0]!.value === null ? 0 : m.identityHash(args[0]!.value as object))
    default:
      throw noMethod('System', name)
  }
}

/** Math, Objects, System and Thread statics. */
export function systemClassStatic(m: Machine, cls: string, name: string, args: readonly R[]): R {
  if (cls === 'Math' || cls === 'StrictMath') return mathStatic(name, args)
  if (cls === 'Objects') return objectsStatic(m, name, args)
  if (cls === 'Thread' && name === 'sleep') return VOID
  return systemStatic(m, name, args)
}
