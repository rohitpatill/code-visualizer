import { T } from '../../lang/types'
import { primValue, toPrim } from '../convert'
import { CompileStop, Fault } from '../errors'
import type { Machine } from '../machine'
import { boolR, charR, intR, isRawPrim, refR, strR } from '../ops'
import { textOf, valueText } from '../text'
import { BuilderVal, JArray, JStr, type R } from '../values'
import { arity, intArg, noMethod, textArg } from './common'
import { compareStrings, stringHash } from './equality'
import { isCollection, itemsOf } from './iteration'

const CHAR_ARRAY = { t: 'array', of: T.char } as const

/** Java's String.trim: strips every char up to and including the space. */
const javaTrim = (s: string) => s.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '')

function outOfRange(detail: string): Fault {
  return new Fault('StringIndexOutOfBoundsException', detail)
}

/** A char or a String argument, as indexOf and contains accept them. */
function needle(r: R, what: string): string {
  if (r.value instanceof JStr) return r.value.s
  const u = primValue(r)
  if (u && u.p !== 'boolean') return String.fromCharCode(Number(toPrim(r, 'int')))
  return textArg(r, what)
}

function regex(pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'g')
  } catch {
    throw new Fault('PatternSyntaxException', `bad regular expression: ${pattern}`)
  }
}

/** String.split, including Java's rule that trailing empty strings are dropped when the limit is 0. */
export function split(s: string, pattern: string, limit = 0): string[] {
  const re = regex(pattern)
  const parts: string[] = []
  let last = 0
  for (let match = re.exec(s); match; match = re.exec(s)) {
    if (limit > 0 && parts.length === limit - 1) break
    if (match[0].length === 0) {
      re.lastIndex++
      if (match.index === 0 || match.index >= s.length) continue
    }
    parts.push(s.slice(last, match.index))
    last = match.index + match[0].length
  }
  if (!parts.length) return [s]
  parts.push(s.slice(last))
  if (limit === 0) while (parts.length && parts[parts.length - 1] === '') parts.pop()
  return parts
}

function compareIgnoringCase(a: string, b: string): number {
  const fold = (s: string) => [...s].map((ch) => ch.toUpperCase().toLowerCase()).join('')
  return compareStrings(fold(a), fold(b))
}

const range = (from: number, to: number, length: number) => outOfRange(`Range [${from}, ${to}) out of bounds for length ${length}`)
const index = (i: number, length: number) => outOfRange(`Index ${i} out of bounds for length ${length}`)

function substring(s: string, begin: number, end = s.length): string {
  if (begin < 0 || end > s.length || begin > end) throw range(begin, end, s.length)
  return s.slice(begin, end)
}

function charAt(s: string, i: number): R {
  if (i < 0 || i >= s.length) throw index(i, s.length)
  return charR(s.charCodeAt(i))
}

function replaceLiteral(s: string, target: string, replacement: string): string {
  if (!target) return replacement + [...s].join(replacement) + replacement
  return s.split(target).join(replacement)
}

export function stringMethod(m: Machine, str: JStr, name: string, args: readonly R[]): R {
  const s = str.s
  const text = (i: number) => textArg(args[i], `String.${name}`)
  const int = (i: number) => intArg(args[i], `String.${name}`)
  switch (name) {
    case 'length':
      return intR(s.length)
    case 'charAt':
      return charAt(s, int(0))
    case 'isEmpty':
      return boolR(!s.length)
    case 'isBlank':
      return boolR(!s.trim().length)
    case 'substring':
    case 'subSequence': {
      const begin = int(0)
      const end = args[1] ? int(1) : s.length
      return begin === 0 && end === s.length ? refR(str, T.string) : strR(substring(s, begin, end))
    }
    case 'indexOf':
      return intR(s.indexOf(needle(args[0]!, name), args[1] ? Math.max(0, int(1)) : 0))
    case 'lastIndexOf':
      return intR(args[1] ? s.lastIndexOf(needle(args[0]!, name), int(1)) : s.lastIndexOf(needle(args[0]!, name)))
    case 'contains':
      return boolR(s.includes(needle(args[0]!, name)))
    case 'startsWith':
      return boolR(s.startsWith(text(0), args[1] ? int(1) : 0))
    case 'endsWith':
      return boolR(s.endsWith(text(0)))
    case 'equals':
      return boolR(args[0]!.value instanceof JStr && args[0]!.value.s === s)
    case 'equalsIgnoreCase':
      return boolR(args[0]!.value instanceof JStr && compareIgnoringCase(s, args[0]!.value.s) === 0)
    case 'compareTo':
      return intR(compareStrings(s, text(0)))
    case 'compareToIgnoreCase':
      return intR(compareIgnoringCase(s, text(0)))
    case 'toUpperCase':
      return strR(s.toUpperCase())
    case 'toLowerCase':
      return strR(s.toLowerCase())
    case 'trim':
      return strR(javaTrim(s))
    case 'strip':
      return strR(s.trim())
    case 'stripLeading':
      return strR(s.trimStart())
    case 'stripTrailing':
      return strR(s.trimEnd())
    case 'toCharArray':
      return refR(new JArray(CHAR_ARRAY, Array.from(s, (ch) => ch.charCodeAt(0))), CHAR_ARRAY)
    case 'split': {
      const parts = split(s, text(0), args[1] ? int(1) : 0)
      const type = { t: 'array', of: T.string } as const
      return refR(new JArray(type, parts.map((p) => new JStr(p))), type)
    }
    case 'replace':
      return strR(replaceLiteral(s, needle(args[0]!, name), needle(args[1]!, name)))
    case 'replaceAll':
      return strR(s.replace(regex(text(0)), text(1)))
    case 'replaceFirst':
      return strR(s.replace(new RegExp(regex(text(0)).source), text(1)))
    case 'matches':
      return boolR(new RegExp(`^(?:${regex(text(0)).source})$`).test(s))
    case 'concat':
      return strR(s + text(0))
    case 'repeat': {
      const n = int(0)
      if (n < 0) throw new Fault('IllegalArgumentException', `count is negative: ${n}`)
      return strR(s.repeat(n))
    }
    case 'hashCode':
      return intR(stringHash(str))
    case 'intern':
      return refR(m.intern(s), T.string)
    case 'toString':
      return refR(str, T.string)
    case 'chars':
    case 'lines':
      throw new CompileStop('streams are not supported by the visualizer yet: use a loop over s.toCharArray()')
    default:
      throw noMethod('String', name)
  }
}

/** `new String(chars)`, `new String(chars, offset, count)`, `new String(other)`. */
export function newString(m: Machine, args: readonly R[]): R {
  arity('new String', args, 0, 3)
  const [a] = args
  if (!a) return strR('')
  if (a.value instanceof JArray) {
    const codes = a.value.items as number[]
    const from = args[1] ? intArg(args[1], 'new String') : 0
    const count = args[2] ? intArg(args[2], 'new String') : codes.length - from
    return strR(String.fromCharCode(...codes.slice(from, from + count)))
  }
  return strR(textOf(m, a))
}

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
    if (i < 0 || i >= s.length) throw index(i, s.length)
    return i
  }
  switch (name) {
    case 'append':
      sb.s += builderText(m, args[0]!)
      return self
    case 'insert': {
      const offset = int(0)
      if (offset < 0 || offset > s.length) throw range(offset, s.length, s.length)
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
      if (start < 0 || start > end) throw range(start, int(1), s.length)
      sb.s = s.slice(0, start) + (name === 'replace' ? textArg(args[2], 'StringBuilder.replace') : '') + s.slice(end)
      return self
    }
    case 'setLength': {
      const n = int(0)
      if (n < 0) throw index(n, s.length)
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

/** String.valueOf, String.join and String.format. */
export function stringStatic(m: Machine, name: string, args: readonly R[], format: (fmt: string, rest: readonly R[]) => string): R {
  switch (name) {
    case 'valueOf':
    case 'copyValueOf':
      return args[0]?.value instanceof JArray ? newString(m, args) : strR(textOf(m, args[0]!))
    case 'join': {
      const delimiter = textArg(args[0], 'String.join')
      const only = args.length === 2 ? args[1]!.value : null
      const parts = only instanceof JArray ? only.items : isCollection(only) ? itemsOf(m, args[1]!, 'String.join') : args.slice(1).map((a) => a.value)
      return strR(parts.map((v) => valueText(m, v)).join(delimiter))
    }
    case 'format':
      return strR(format(textArg(args[0], 'String.format'), args.slice(1)))
    default:
      throw noMethod('String', name)
  }
}
