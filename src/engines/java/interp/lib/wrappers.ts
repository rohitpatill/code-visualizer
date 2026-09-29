import { BOX, type PrimName, T } from '../../lang/types'
import { toPrim } from '../convert'
import { Fault } from '../errors'
import type { Machine } from '../machine'
import { type PrimValue, castPrim } from '../numbers'
import { boolR, charR, doubleR, intR, longR, refR, strR } from '../ops'
import { doubleText, floatText, primText } from '../text'
import { Boxed, JStr, type R } from '../values'
import { arity, element, intArg, noMethod, textArg } from './common'
import { characterStatic } from './characters'
import { javaEquals, javaHash, naturalCompare } from './equality'

const INT_MAX = 2147483647
const LONG_MAX = 2n ** 63n - 1n

export const WRAPPER_CONSTANTS: Readonly<Record<string, Readonly<Record<string, R>>>> = {
  Integer: { MAX_VALUE: intR(INT_MAX), MIN_VALUE: intR(-INT_MAX - 1), SIZE: intR(32), BYTES: intR(4) },
  Long: { MAX_VALUE: longR(LONG_MAX), MIN_VALUE: longR(-LONG_MAX - 1n), SIZE: intR(64), BYTES: intR(8) },
  Double: {
    MAX_VALUE: doubleR(Number.MAX_VALUE), MIN_VALUE: doubleR(Number.MIN_VALUE), POSITIVE_INFINITY: doubleR(Infinity),
    NEGATIVE_INFINITY: doubleR(-Infinity), NaN: doubleR(NaN),
  },
  Float: { MAX_VALUE: { type: T.float, value: 3.4028234663852886e38 }, MIN_VALUE: { type: T.float, value: Math.fround(1.4e-45) } },
  Short: { MAX_VALUE: { type: T.short, value: 32767 }, MIN_VALUE: { type: T.short, value: -32768 } },
  Byte: { MAX_VALUE: { type: T.byte, value: 127 }, MIN_VALUE: { type: T.byte, value: -128 } },
  Character: { MAX_VALUE: charR(0xffff), MIN_VALUE: charR(0) },
}

const noInput = (s: string, radix: number) => new Fault('NumberFormatException', `For input string: "${s}"${radix === 10 ? '' : ` under radix ${radix}`}`)

/** Integer.parseInt and Long.parseLong: an optional sign, then digits of the radix, and nothing else. */
function parseIntegral(r: R | undefined, radix: number, bits: 32 | 64): bigint {
  const v = r?.value
  if (v === null) throw new Fault('NumberFormatException', 'Cannot parse null string: null')
  const s = textArg(r, 'parseInt')
  const body = /^[+-]/.test(s) ? s.slice(1) : s
  if (!body) throw noInput(s, radix)
  let n = 0n
  for (const ch of body.toLowerCase()) {
    const d = parseInt(ch, 36)
    if (Number.isNaN(d) || d >= radix) throw noInput(s, radix)
    n = n * BigInt(radix) + BigInt(d)
  }
  if (s.startsWith('-')) n = -n
  const max = bits === 32 ? BigInt(INT_MAX) : LONG_MAX
  if (n > max || n < -max - 1n) throw noInput(s, radix)
  return n
}

/** Double.parseDouble: surrounding whitespace is fine, as are NaN, Infinity and a d or f suffix. */
function parseFloating(r: R | undefined): number {
  if (r?.value === null) throw new Fault('NullPointerException')
  const raw = textArg(r, 'parseDouble')
  const s = raw.trim()
  if (!s) throw new Fault('NumberFormatException', 'empty String')
  const m = /^[+-]?(NaN|Infinity|(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[fFdD]?)$/.exec(s)
  if (!m) throw new Fault('NumberFormatException', `For input string: "${raw}"`)
  return Number(s.replace(/[fFdD]$/, ''))
}

const popCount = (n: bigint) => [...BigInt.asUintN(64, n).toString(2)].filter((b) => b === '1').length
const unsignedText = (v: PrimValue, bits: 32 | 64, radix: number) => BigInt.asUintN(bits, BigInt(v as number | bigint)).toString(radix)

/** Integer and Long statics, which differ only in width. */
function integralStatic(m: Machine, cls: 'Integer' | 'Long', name: string, args: readonly R[]): R {
  const bits = cls === 'Integer' ? 32 : 64
  const p: PrimName = bits === 32 ? 'int' : 'long'
  const make = (n: bigint): R => (bits === 32 ? intR(Number(n)) : longR(n))
  const arg = (i: number) => BigInt(toPrim(args[i]!, p) as number | bigint)
  const radix = () => (args[1] ? intArg(args[1], name) : 10)
  switch (name) {
    case 'parseInt':
    case 'parseLong':
      return make(parseIntegral(args[0], radix(), bits))
    case 'valueOf':
      return refR(m.box(p, args[0]?.value instanceof JStr ? castPrim(parseIntegral(args[0], radix(), bits), 'long', p) : toPrim(args[0]!, p)))
    case 'toString':
      return strR(args[1] ? arg(0).toString(radix()) : primText(p, toPrim(args[0]!, p)))
    case 'toBinaryString':
      return strR(unsignedText(toPrim(args[0]!, p), bits, 2))
    case 'toHexString':
      return strR(unsignedText(toPrim(args[0]!, p), bits, 16))
    case 'toOctalString':
      return strR(unsignedText(toPrim(args[0]!, p), bits, 8))
    case 'bitCount':
      return intR(popCount(BigInt.asUintN(bits, arg(0))))
    case 'compare':
      return intR(arg(0) < arg(1) ? -1 : arg(0) > arg(1) ? 1 : 0)
    case 'signum':
      return intR(arg(0) < 0n ? -1 : arg(0) > 0n ? 1 : 0)
    case 'sum':
      return make(BigInt.asIntN(bits, arg(0) + arg(1)))
    case 'max':
    case 'min':
      return make(name === 'max' ? (arg(0) > arg(1) ? arg(0) : arg(1)) : arg(0) < arg(1) ? arg(0) : arg(1))
    case 'hashCode':
      return intR(javaHash(m, m.box(p, toPrim(args[0]!, p))))
    case 'numberOfTrailingZeros': {
      const v = BigInt.asUintN(bits, arg(0))
      return intR(v === 0n ? bits : v.toString(2).length - 1 - v.toString(2).lastIndexOf('1'))
    }
    case 'numberOfLeadingZeros': {
      const v = BigInt.asUintN(bits, arg(0))
      return intR(v === 0n ? bits : bits - v.toString(2).length)
    }
    case 'highestOneBit':
    case 'lowestOneBit': {
      const v = BigInt.asUintN(bits, arg(0))
      if (v === 0n) return make(0n)
      const bit = name === 'highestOneBit' ? v.toString(2).length - 1 : v.toString(2).length - 1 - v.toString(2).lastIndexOf('1')
      return make(BigInt.asIntN(bits, 1n << BigInt(bit)))
    }
    default:
      throw noMethod(cls, name)
  }
}

function floatingStatic(m: Machine, cls: 'Double' | 'Float', name: string, args: readonly R[]): R {
  const p: PrimName = cls === 'Double' ? 'double' : 'float'
  const make = (x: number): R => ({ type: T[p], value: p === 'float' ? Math.fround(x) : x })
  const num = (i: number) => toPrim(args[i]!, p) as number
  switch (name) {
    case 'parseDouble':
    case 'parseFloat':
      return make(parseFloating(args[0]))
    case 'valueOf':
      return refR(m.box(p, args[0]?.value instanceof JStr ? make(parseFloating(args[0])).value as number : num(0)))
    case 'toString':
      return strR(p === 'double' ? doubleText(num(0)) : floatText(num(0)))
    case 'compare':
      return intR(naturalCompare(m, m.box(p, num(0)), m.box(p, num(1))))
    case 'isNaN':
      return boolR(Number.isNaN(num(0)))
    case 'isInfinite':
      return boolR(Math.abs(num(0)) === Infinity)
    case 'isFinite':
      return boolR(Number.isFinite(num(0)))
    case 'sum':
      return make(num(0) + num(1))
    case 'max':
      return make(Math.max(num(0), num(1)))
    case 'min':
      return make(Math.min(num(0), num(1)))
    case 'hashCode':
      return intR(javaHash(m, m.box(p, num(0))))
    default:
      throw noMethod(cls, name)
  }
}

function booleanStatic(m: Machine, name: string, args: readonly R[]): R {
  const b = (i: number) => toPrim(args[i]!, 'boolean') as boolean
  switch (name) {
    case 'parseBoolean':
      return boolR(args[0]?.value instanceof JStr && args[0].value.s.toLowerCase() === 'true')
    case 'valueOf':
      return refR(m.box('boolean', args[0]?.value instanceof JStr ? args[0].value.s.toLowerCase() === 'true' : b(0)))
    case 'toString':
      return strR(String(b(0)))
    case 'compare':
      return intR(b(0) === b(1) ? 0 : b(0) ? 1 : -1)
    case 'logicalAnd':
      return boolR(b(0) && b(1))
    case 'logicalOr':
      return boolR(b(0) || b(1))
    case 'logicalXor':
      return boolR(b(0) !== b(1))
    default:
      throw noMethod('Boolean', name)
  }
}

/** Statics of Integer, Long, Double, Float, Short, Byte, Character and Boolean. */
export function wrapperStatic(m: Machine, cls: string, name: string, args: readonly R[]): R {
  switch (cls) {
    case 'Integer':
    case 'Long':
      return integralStatic(m, cls, name, args)
    case 'Double':
    case 'Float':
      return floatingStatic(m, cls, name, args)
    case 'Character':
      return characterStatic(m, name, args)
    case 'Boolean':
      return booleanStatic(m, name, args)
    default: {
      const p = cls === 'Short' ? 'short' : 'byte'
      if (name === 'parseShort' || name === 'parseByte') return { type: T[p], value: castPrim(parseIntegral(args[0], 10, 32), 'long', 'int') }
      if (name === 'valueOf') return refR(m.box(p, toPrim(args[0]!, p)))
      throw noMethod(cls, name)
    }
  }
}

/** Methods on an Integer, Character, Double and the other wrapper objects. */
export function boxedMethod(m: Machine, b: Boxed, name: string, args: readonly R[]): R {
  const value = (to: PrimName): R => ({ type: T[to as 'int'], value: castPrim(b.v, b.prim, to) })
  switch (name) {
    case 'intValue':
    case 'longValue':
    case 'doubleValue':
    case 'floatValue':
    case 'shortValue':
    case 'byteValue':
      return value(name.slice(0, -5) as PrimName)
    case 'charValue':
    case 'booleanValue':
      return { type: T[b.prim as 'int'], value: b.v }
    case 'compareTo':
      arity(name, args, 1)
      return intR(naturalCompare(m, b, element(m, args[0]!)))
    case 'equals':
      return boolR(javaEquals(m, b, element(m, args[0]!)))
    case 'hashCode':
      return intR(javaHash(m, b))
    case 'toString':
      return strR(primText(b.prim, b.v))
    case 'isNaN':
      return boolR(Number.isNaN(b.v))
    default:
      throw noMethod(BOX[b.prim], name)
  }
}
