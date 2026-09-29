import { T } from '../../lang/types'
import { toPrim } from '../convert'
import type { Machine } from '../machine'
import { boolR, charR, intR, isRawPrim, refR, strR } from '../ops'
import { textOf } from '../text'
import { BuilderVal, JArray, type R } from '../values'
import { arity, intArg, noMethod, textArg } from './common'
import { compareStrings } from './equality'
import { indexError, rangeError, substring } from './strings'

function builderText(m: Machine, r: R): string {
  const v = r.value
  if (v instanceof JArray && v.type.of.t === 'prim' && v.type.of.name === 'char') return String.fromCharCode(...(v.items as number[]))
  return textOf(m, r)
}

/** StringBuilder (and StringBuffer). Changes happen in place and most methods return the builder itself. */
export function builderMethod(m: Machine, sb: BuilderVal, name: string, args: readonly R[]): R {
  const self = refR(sb, { t: 'ref', name: 'StringBuilder', args: [] })
  const int = (i: number) => intArg(args[i], `StringBuilder.${name}`)
  const s = sb.s
  const at = (i: number) => {
    if (i < 0 || i >= s.length) throw indexError(i, s.length)
    return i
  }
  switch (name) {
    case 'append':
      sb.s += builderText(m, args[0]!)
      return self
    case 'insert': {
      const offset = int(0)
      if (offset < 0 || offset > s.length) throw rangeError(offset, s.length, s.length)
      sb.s = s.slice(0, offset) + builderText(m, args[1]!) + s.slice(offset)
      return self
    }
    case 'reverse':
      sb.s = [...s].reverse().join('')
      return self
    case 'toString':
      return strR(s)
    case 'length':
      return intR(s.length)
    case 'isEmpty':
      return boolR(!s.length)
    case 'charAt':
      return charR(s.charCodeAt(at(int(0))))
    case 'setCharAt': {
      const i = at(int(0))
      sb.s = s.slice(0, i) + String.fromCharCode(toPrim(args[1]!, 'char') as number) + s.slice(i + 1)
      return { type: T.void, value: null }
    }
    case 'deleteCharAt': {
      const i = at(int(0))
      sb.s = s.slice(0, i) + s.slice(i + 1)
      return self
    }
    case 'delete':
    case 'replace': {
      const start = int(0)
      const end = Math.min(int(1), s.length)
      if (start < 0 || start > end) throw rangeError(start, int(1), s.length)
      sb.s = s.slice(0, start) + (name === 'replace' ? textArg(args[2], 'StringBuilder.replace') : '') + s.slice(end)
      return self
    }
    case 'setLength': {
      const n = int(0)
      if (n < 0) throw indexError(n, s.length)
      sb.s = n <= s.length ? s.slice(0, n) : s + '\u0000'.repeat(n - s.length)
      return { type: T.void, value: null }
    }
    case 'indexOf':
      return intR(s.indexOf(textArg(args[0], name), args[1] ? int(1) : 0))
    case 'lastIndexOf':
      return intR(s.lastIndexOf(textArg(args[0], name)))
    case 'substring':
      return strR(substring(s, int(0), args[1] ? int(1) : undefined))
    case 'compareTo':
      return intR(compareStrings(s, (args[0]!.value as BuilderVal).s))
    case 'equals':
      return boolR(args[0]!.value === sb)
    default:
      throw noMethod('StringBuilder', name)
  }
}

/** `new StringBuilder()`, `new StringBuilder("text")`, `new StringBuilder(capacity)`. */
export function newBuilder(m: Machine, args: readonly R[]): R {
  arity('new StringBuilder', args, 0, 1)
  const a = args[0]
  const text = !a || isRawPrim(a) ? '' : textOf(m, a)
  return refR(new BuilderVal(text), { t: 'ref', name: 'StringBuilder', args: [] })
}
