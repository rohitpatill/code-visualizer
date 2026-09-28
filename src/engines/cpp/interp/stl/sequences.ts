import { typeName } from '../../lang/types'
import { CppError } from '../errors'
import { construct, convert, defaultValue } from '../init'
import type { Machine } from '../machine'
import { Cell, IterVal, type R, SeqVal } from '../values'
import { VOID, arity, boolR, intArg, iterR, lvalue, sizeR, unknownMethod } from './common'
import { begin, end, position, rangeValues } from './iterators'

function iterArg(r: R | undefined, seq: SeqVal, what: string): number {
  const it = r?.value
  if (!(it instanceof IterVal) || it.over !== seq) throw new CppError(`${what} needs an iterator into this container`)
  return position(it)
}

/** Member functions of vector, deque and C++ arrays. */
export function sequenceMethod(m: Machine, seq: SeqVal, name: string, args: readonly R[]): R {
  const t = seq.type
  const what = `${typeName(t)}::${name}`
  const elem = 'of' in t ? t.of : t
  const items = seq.items
  const make = (r: R) => new Cell(elem, convert(m, r, elem))
  const nonEmpty = () => {
    if (!items.length) throw new CppError(`${name}() on an empty ${typeName(t)} (undefined behavior in real C++)`)
  }
  const growable = () => {
    if (t.t === 'array') throw unknownMethod(typeName(t), name)
  }
  switch (name) {
    case 'size':
      return sizeR(items.length)
    case 'empty':
      return boolR(items.length === 0)
    case 'front':
      nonEmpty()
      return lvalue(items[0]!)
    case 'back':
      nonEmpty()
      return lvalue(items[items.length - 1]!)
    case 'at': {
      const i = intArg(args[0], what)
      if (i < 0 || i >= items.length) throw new CppError(`${what}: index ${i} is out of range for size ${items.length}`)
      return lvalue(items[i]!)
    }
    case 'begin':
    case 'cbegin':
      return iterR(begin(seq))
    case 'end':
    case 'cend':
      return iterR(end(seq))
    case 'rbegin':
      return iterR(begin(seq, true))
    case 'rend':
      return iterR(end(seq, true))
    case 'reserve':
    case 'shrink_to_fit':
      return VOID
  }
  growable()
  switch (name) {
    case 'push_back':
      arity(what, args, 1)
      items.push(make(args[0]!))
      return VOID
    case 'emplace_back':
      items.push(new Cell(elem, args.length === 1 ? convert(m, args[0]!, elem) : construct(m, elem, args)))
      return VOID
    case 'push_front':
    case 'emplace_front':
      if (t.t !== 'deque') throw unknownMethod(typeName(t), name)
      items.unshift(new Cell(elem, args.length === 1 ? convert(m, args[0]!, elem) : construct(m, elem, args)))
      return VOID
    case 'pop_back':
      nonEmpty()
      items.pop()
      return VOID
    case 'pop_front':
      if (t.t !== 'deque') throw unknownMethod(typeName(t), name)
      nonEmpty()
      items.shift()
      return VOID
    case 'clear':
      items.length = 0
      return VOID
    case 'resize': {
      const n = intArg(args[0], what)
      if (n < items.length) items.length = n
      while (items.length < n) items.push(args[1] ? make(args[1]) : new Cell(elem, defaultValue(m, elem, true)))
      return VOID
    }
    case 'assign': {
      const n = intArg(args[0], what)
      items.length = 0
      for (let i = 0; i < n; i++) items.push(make(args[1]!))
      return VOID
    }
    case 'insert': {
      const at = iterArg(args[0], seq, what)
      let added: Cell[]
      if (args.length === 2) added = [make(args[1]!)]
      else if (args[1]?.value instanceof IterVal && args[2]?.value instanceof IterVal) added = rangeValues(m, args[1].value, args[2].value).map((c) => make(c))
      else added = Array.from({ length: intArg(args[1], what) }, () => make(args[2]!))
      items.splice(at, 0, ...added)
      return iterR(new IterVal(seq, at))
    }
    case 'erase': {
      const from = iterArg(args[0], seq, what)
      const to = args[1] ? iterArg(args[1], seq, what) : from + 1
      if (from < 0 || to > items.length || from >= to) throw new CppError(`${what}: iterator out of range`)
      items.splice(from, to - from)
      return iterR(new IterVal(seq, from))
    }
    case 'swap': {
      const other = args[0]?.value
      if (!(other instanceof SeqVal)) throw new CppError(`${what} needs another container`)
      const mine = [...items]
      items.splice(0, items.length, ...other.items)
      other.items.splice(0, other.items.length, ...mine)
      return VOID
    }
    default:
      throw unknownMethod(typeName(t), name)
  }
}
