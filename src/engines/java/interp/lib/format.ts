import { BOX, type PrimName } from '../../lang/types'
import { primValue } from '../convert'
import { Fault } from '../errors'
import type { Machine } from '../machine'
import type { PrimValue } from '../numbers'
import { valueText } from '../text'
import { Boxed, type R } from '../values'
import { javaHash } from './equality'
import { runtimeClassName } from './types'

// java.util.Formatter for printf and String.format. Floating-point output
// rounds half-up from the shortest decimal (Java prints %.1f of 0.15 as 0.2).

const SPEC = /(\d+\$)?([-#+ 0,(]*)(\d+)?(?:\.(\d+))?([a-zA-Z%])/y

interface Spec {
  flags: string
  width: number
  precision: number | null
  conv: string
}

/** The shortest digits of a positive number and where its decimal point goes: 0.0123 is 123 with point -1. */
function decimalOf(x: number): { digits: string; point: number } {
  const [mantissa, exp] = x.toExponential().split('e')
  return { digits: mantissa!.replace('.', ''), point: Number(exp) + 1 }
}

/** Keeps the first `keep` digits, rounding half-up; returns whether the rounding added a digit in front (9.9 to 10). */
function roundDigits(digits: string, keep: number): { digits: string; carried: boolean } {
  if (keep < 0) return { digits: '', carried: false }
  if (digits.length <= keep) return { digits: digits.padEnd(keep, '0'), carried: false }
  const kept = digits.slice(0, keep).split('').map(Number)
  let carried = false
  if (Number(digits[keep]) >= 5) {
    let i = kept.length - 1
    while (i >= 0 && kept[i] === 9) kept[i--] = 0
    if (i >= 0) kept[i]!++
    else {
      kept.unshift(1)
      carried = true
    }
  }
  return { digits: kept.join(''), carried }
}

function fixedText(x: number, precision: number): string {
  if (x === 0) return precision ? `0.${'0'.repeat(precision)}` : '0'
  const { digits, point } = decimalOf(x)
  const { digits: rounded, carried } = roundDigits(digits, point + precision)
  const intLength = point + (carried ? 1 : 0)
  const all = intLength <= 0 ? '0'.repeat(1 - intLength) + rounded : rounded
  const cut = Math.max(intLength, 1)
  const int = all.slice(0, cut) || '0'
  const frac = all.slice(cut).padEnd(precision, '0').slice(0, precision)
  return precision ? `${int}.${frac}` : int
}

function scientificText(x: number, precision: number, upper: boolean): string {
  let digits = '0'.repeat(precision + 1)
  let exp = 0
  if (x !== 0) {
    const d = decimalOf(x)
    const r = roundDigits(d.digits, precision + 1)
    digits = r.carried ? r.digits.slice(0, -1) : r.digits
    exp = d.point - 1 + (r.carried ? 1 : 0)
  }
  const mantissa = precision ? `${digits[0]}.${digits.slice(1)}` : digits[0]!
  const e = `e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`
  return upper ? `${mantissa}${e}`.toUpperCase() : `${mantissa}${e}`
}

function generalText(x: number, precision: number, upper: boolean): string {
  const p = precision === 0 ? 1 : precision
  if (x !== 0 && Number.isFinite(x)) {
    const rounded = Number(scientificText(x, p - 1, false))
    if (rounded >= 1e-4 && rounded < 10 ** p) return fixedText(x, Math.max(0, p - 1 - Math.floor(Math.log10(rounded))))
    return scientificText(x, p - 1, upper)
  }
  return fixedText(x, p - 1)
}

const group = (int: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** Signs, grouping, parentheses and zero padding for d, f, e and g. */
function signed(body: string, negative: boolean, spec: Spec): string {
  let text = body
  if (spec.flags.includes(',')) {
    const [int, frac] = text.split('.')
    text = frac === undefined ? group(int!) : `${group(int!)}.${frac}`
  }
  let prefix = negative ? '-' : spec.flags.includes('+') ? '+' : spec.flags.includes(' ') ? ' ' : ''
  let suffix = ''
  if (negative && spec.flags.includes('(')) {
    prefix = '('
    suffix = ')'
  }
  if (spec.flags.includes('0') && !spec.flags.includes('-')) text = text.padStart(spec.width - prefix.length - suffix.length, '0')
  return prefix + text + suffix
}

function mismatch(conv: string, r: R): Fault {
  const u = primValue(r)
  const name = u ? `java.lang.${BOX[u.p]}` : runtimeClassName(r.value)
  return new Fault('IllegalFormatConversionException', `${conv} != ${name}`)
}

function integral(r: R, spec: Spec): { p: PrimName; v: PrimValue } {
  const u = primValue(r)
  if (!u || !['int', 'long', 'short', 'byte'].includes(u.p)) throw mismatch(spec.conv, r)
  return u
}

function convert(m: Machine, spec: Spec, r: R): string {
  const { conv } = spec
  const lower = conv.toLowerCase()
  if (r.value === null && lower !== 'b') return 'null'
  switch (lower) {
    case 's':
      return valueText(m, r.value, r.type)
    case 'b':
      return String(r.value instanceof Boxed && r.value.prim === 'boolean' ? r.value.v : typeof r.value === 'boolean' ? r.value : r.value !== null)
    case 'h':
      return (javaHash(m, r.value) >>> 0).toString(16)
    case 'c': {
      const u = primValue(r)
      if (!u || u.p === 'boolean' || u.p === 'long' || u.p === 'float' || u.p === 'double') throw mismatch(conv, r)
      return String.fromCharCode(Number(u.v))
    }
    case 'd': {
      const u = integral(r, spec)
      const n = BigInt(u.v as number | bigint)
      return signed((n < 0n ? -n : n).toString(), n < 0n, spec)
    }
    case 'x':
    case 'o': {
      const u = integral(r, spec)
      const text = BigInt.asUintN(u.p === 'long' ? 64 : 32, BigInt(u.v as number | bigint)).toString(lower === 'x' ? 16 : 8)
      const prefixed = spec.flags.includes('#') ? (lower === 'x' ? `0x${text}` : `0${text}`) : text
      return spec.flags.includes('0') ? prefixed.padStart(spec.width, '0') : prefixed
    }
    case 'f':
    case 'e':
    case 'g': {
      const u = primValue(r)
      if (!u || (u.p !== 'double' && u.p !== 'float')) throw mismatch(conv, r)
      const x = Number(u.v)
      if (!Number.isFinite(x)) return Number.isNaN(x) ? 'NaN' : x > 0 ? (spec.flags.includes('+') ? '+Infinity' : 'Infinity') : '-Infinity'
      const precision = spec.precision ?? 6
      const abs = Math.abs(x)
      const body = lower === 'f' ? fixedText(abs, precision) : lower === 'e' ? scientificText(abs, precision, false) : generalText(abs, precision, false)
      return signed(body, x < 0 || Object.is(x, -0), spec)
    }
    default:
      throw new Fault('UnknownFormatConversionException', `Conversion = '${conv}'`)
  }
}

/** String.format(format, args...). */
export function javaFormat(m: Machine, format: string, args: readonly R[]): string {
  let out = ''
  let next = 0
  for (let i = 0; i < format.length; i++) {
    const ch = format[i]!
    if (ch !== '%') {
      out += ch
      continue
    }
    SPEC.lastIndex = i + 1
    const match = SPEC.exec(format)
    if (!match) throw new Fault('UnknownFormatConversionException', `Conversion = '${format[i + 1] ?? '%'}'`)
    i = SPEC.lastIndex - 1
    const [text, index, flags = '', width, precision, conv] = match
    const spec: Spec = { flags, width: width ? Number(width) : 0, precision: precision === undefined ? null : Number(precision), conv: conv! }
    let piece: string
    if (conv === 'n') piece = '\n'
    else if (conv === '%') piece = '%'
    else {
      const arg = args[index ? Number(index.slice(0, -1)) - 1 : next++]
      if (!arg) throw new Fault('MissingFormatArgumentException', `Format specifier '%${text}'`)
      piece = convert(m, spec, arg)
      if (spec.precision !== null && 'sSbBhHcC'.includes(conv!)) piece = piece.slice(0, spec.precision)
      if (conv !== conv!.toLowerCase()) piece = piece.toUpperCase()
    }
    out += spec.flags.includes('-') ? piece.padEnd(spec.width) : piece.padStart(spec.width)
  }
  return out
}
