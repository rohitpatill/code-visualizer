import { primValue, toPrim } from '../convert'
import type { Machine } from '../machine'
import { boolR, charR, intR, refR, strR } from '../ops'
import type { R } from '../values'
import { intArg, noMethod } from './common'

const isWhitespace = (c: number) => (c >= 9 && c <= 13) || (c >= 28 && c <= 32) || (/\p{Z}/u.test(String.fromCharCode(c)) && ![0xa0, 0x2007, 0x202f].includes(c))

function numericValue(c: number): number {
  const ch = String.fromCharCode(c)
  if (/\p{Nd}/u.test(ch)) return Number.parseInt(ch.normalize('NFKD'), 10) || Number(ch)
  if (/[a-z]/i.test(ch)) return ch.toLowerCase().charCodeAt(0) - 87
  return -1
}

const CHARACTER_TESTS: Readonly<Record<string, (c: number) => boolean>> = {
  isDigit: (c) => /\p{Nd}/u.test(String.fromCharCode(c)),
  isLetter: (c) => /\p{L}/u.test(String.fromCharCode(c)),
  isLetterOrDigit: (c) => /[\p{L}\p{Nd}]/u.test(String.fromCharCode(c)),
  isAlphabetic: (c) => /\p{Alphabetic}/u.test(String.fromCharCode(c)),
  isUpperCase: (c) => /\p{Lu}/u.test(String.fromCharCode(c)),
  isLowerCase: (c) => /\p{Ll}/u.test(String.fromCharCode(c)),
  isWhitespace,
  isSpaceChar: (c) => /\p{Z}/u.test(String.fromCharCode(c)),
}

export function characterStatic(m: Machine, name: string, args: readonly R[]): R {
  const code = () => toPrim(args[0]!, 'int') as number
  const asChar = args[0] && primValue(args[0])?.p === 'char'
  const test = CHARACTER_TESTS[name]
  if (test) return boolR(test(code()))
  switch (name) {
    case 'toUpperCase':
    case 'toLowerCase': {
      const ch = String.fromCharCode(code())
      const mapped = name === 'toUpperCase' ? ch.toUpperCase() : ch.toLowerCase()
      const out = mapped.length === 1 ? mapped.charCodeAt(0) : code()
      return asChar ? charR(out) : intR(out)
    }
    case 'getNumericValue':
      return intR(numericValue(code()))
    case 'digit': {
      const d = numericValue(code())
      return intR(d >= 0 && d < intArg(args[1], name) ? d : -1)
    }
    case 'forDigit': {
      const d = intArg(args[0], name)
      const radix = intArg(args[1], name)
      return charR(d >= 0 && d < radix ? d.toString(radix).charCodeAt(0) : 0)
    }
    case 'valueOf':
      return refR(m.box('char', toPrim(args[0]!, 'char')))
    case 'toString':
      return strR(String.fromCharCode(code()))
    case 'compare':
      return intR(code() - (toPrim(args[1]!, 'int') as number))
    case 'hashCode':
      return intR(code())
    default:
      throw noMethod('Character', name)
  }
}
