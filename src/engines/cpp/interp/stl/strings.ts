import { T } from '../../lang/types'
import { CppError } from '../errors'
import { charText } from '../io'
import type { Machine } from '../machine'
import { CharCell, IterVal, type R, StrVal } from '../values'
import { NPOS, VOID, boolR, intArg, intR, iterR, lvalue, sizeR, unknownMethod } from './common'
import { begin, end, position } from './iterators'

const str = (s: string): R => ({ type: T.string, value: new StrVal(s) })

function textArg(r: R | undefined, what: string): string {
  const v = r?.value
  if (v instanceof StrVal) return v.s
  if (r && r.type.t === 'char' && typeof v === 'number') return charText(v)
  throw new CppError(`${what} needs a string or a char`)
}

const found = (i: number): R => ({ type: T.sizeT, value: i === -1 ? NPOS : BigInt(i) })

function pos(r: R | undefined, fallback: number, what: string): number {
  if (!r) return fallback
  const v = r.value
  if (v === NPOS) return Number.MAX_SAFE_INTEGER
  return intArg(r, what)
}

/** Member functions of std::string. */
export function stringMethod(_m: Machine, s: StrVal, name: string, args: readonly R[]): R {
  const what = `string::${name}`
  const n = s.s.length
  const nonEmpty = () => {
    if (!n) throw new CppError(`${name}() on an empty string (undefined behavior in real C++)`)
  }
  const inRange = (p: number) => {
    if (p < 0 || p > n) throw new CppError(`${what}: position ${p} is out of range for a string of length ${n}`)
    return p
  }
  switch (name) {
    case 'size':
    case 'length':
      return sizeR(n)
    case 'empty':
      return boolR(n === 0)
    case 'front':
      nonEmpty()
      return lvalue(new CharCell(s, 0))
    case 'back':
      nonEmpty()
      return lvalue(new CharCell(s, n - 1))
    case 'at': {
      const i = intArg(args[0], what)
      if (i < 0 || i >= n) throw new CppError(`${what}: index ${i} is out of range for a string of length ${n}`)
      return lvalue(new CharCell(s, i))
    }
    case 'push_back':
      s.s += textArg(args[0], what)
      return VOID
    case 'pop_back':
      nonEmpty()
      s.s = s.s.slice(0, -1)
      return VOID
    case 'append':
      s.s += args.length === 2 ? textArg(args[1], what).repeat(intArg(args[0], what)) : textArg(args[0], what)
      return { type: T.string, value: s }
    case 'substr': {
      const from = inRange(pos(args[0], 0, what))
      return str(s.s.substr(from, pos(args[1], n, what)))
    }
    case 'find':
      return found(s.s.indexOf(textArg(args[0], what), pos(args[1], 0, what)))
    case 'rfind':
      return found(s.s.lastIndexOf(textArg(args[0], what), pos(args[1], n, what)))
    case 'insert': {
      const at = inRange(intArg(args[0], what))
      const add = args.length === 3 ? textArg(args[2], what).repeat(intArg(args[1], what)) : textArg(args[1], what)
      s.s = s.s.slice(0, at) + add + s.s.slice(at)
      return { type: T.string, value: s }
    }
    case 'erase': {
      if (args[0]?.value instanceof IterVal) {
        const at = position(args[0].value)
        s.s = s.s.slice(0, at) + s.s.slice(at + 1)
        return iterR(new IterVal(s, at))
      }
      const from = inRange(pos(args[0], 0, what))
      s.s = s.s.slice(0, from) + s.s.slice(from + pos(args[1], n, what))
      return { type: T.string, value: s }
    }
    case 'replace': {
      const from = inRange(intArg(args[0], what))
      s.s = s.s.slice(0, from) + textArg(args[2], what) + s.s.slice(from + intArg(args[1], what))
      return { type: T.string, value: s }
    }
    case 'resize': {
      const size = intArg(args[0], what)
      s.s = size <= n ? s.s.slice(0, size) : s.s + (args[1] ? textArg(args[1], what) : '\0').repeat(size - n)
      return VOID
    }
    case 'clear':
      s.s = ''
      return VOID
    case 'compare': {
      const other = textArg(args[0], what)
      return intR(s.s < other ? -1 : s.s > other ? 1 : 0)
    }
    case 'c_str':
    case 'data':
      return { type: T.string, value: s }
    case 'begin':
      return iterR(begin(s))
    case 'end':
      return iterR(end(s))
    case 'rbegin':
      return iterR(begin(s, true))
    case 'rend':
      return iterR(end(s, true))
    default:
      throw unknownMethod('string', name)
  }
}
