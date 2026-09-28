import { typeName } from '../../lang/types'
import { compareVals, keyOf } from '../compare'
import { CppError } from '../errors'
import { convert, setAdd } from '../init'
import type { Machine } from '../machine'
import { Cell, InitVal, IterVal, type MapVal, PairVal, type R, type SetVal, type Val } from '../values'
import { VOID, boolR, iterR, lvalue, sizeR, unknownMethod } from './common'
import { begin, end, position } from './iterators'
import { orderedKeys, orderedMapEntries } from './ordering'

type Keyed = MapVal | SetVal

const keysOf = (m: Machine, c: Keyed): Val[] => ('entries' in c ? orderedMapEntries(c, m.less).map((e) => e.key) : orderedKeys(c, m.less))

function positionOf(m: Machine, c: Keyed, key: Val): number {
  const k = keyOf(key)
  const at = keysOf(m, c).findIndex((x) => keyOf(x) === k)
  return at === -1 ? ('entries' in c ? c.entries.size : c.keys.size) : at
}

function bound(m: Machine, c: Keyed, key: Val, strict: boolean): IterVal {
  const keys = keysOf(m, c)
  const at = keys.findIndex((x) => {
    const cmp = compareVals(x, key, m.less)
    return strict ? cmp > 0 : cmp >= 0
  })
  return new IterVal(c, at === -1 ? keys.length : at)
}

function eraseAt(m: Machine, c: Keyed, arg: R): R {
  if (arg.value instanceof IterVal) {
    const at = position(arg.value)
    const key = keysOf(m, c)[at]
    if (key === undefined) throw new CppError('erase() with an end() iterator')
    if ('entries' in c) c.entries.delete(keyOf(key))
    else c.keys.delete(keyOf(key))
    return iterR(new IterVal(c, at))
  }
  return sizeR(0)
}

function common(m: Machine, c: Keyed, name: string, args: readonly R[], key: (r: R) => Val): R | null {
  const size = 'entries' in c ? c.entries.size : c.keys.size
  const has = (r: R) => ('entries' in c ? c.entries.has(keyOf(key(r))) : c.keys.has(keyOf(key(r))))
  switch (name) {
    case 'size':
      return sizeR(size)
    case 'empty':
      return boolR(size === 0)
    case 'clear':
      if ('entries' in c) c.entries.clear()
      else c.keys.clear()
      return VOID
    case 'count':
      return sizeR(has(args[0]!) ? 1 : 0)
    case 'contains':
      return boolR(has(args[0]!))
    case 'find':
      return iterR(has(args[0]!) ? new IterVal(c, positionOf(m, c, key(args[0]!))) : end(c))
    case 'begin':
      return iterR(begin(c))
    case 'end':
      return iterR(end(c))
    case 'lower_bound':
    case 'upper_bound':
      return iterR(bound(m, c, key(args[0]!), name === 'upper_bound'))
    case 'erase': {
      if (args[0]?.value instanceof IterVal) return eraseAt(m, c, args[0])
      const k = keyOf(key(args[0]!))
      const removed = 'entries' in c ? c.entries.delete(k) : c.keys.delete(k)
      return sizeR(removed ? 1 : 0)
    }
    default:
      return null
  }
}

/** map and unordered_map. `m[key]` is handled by indexing, which inserts missing keys. */
export function mapMethod(m: Machine, map: MapVal, name: string, args: readonly R[]): R {
  const key = (r: R) => convert(m, r, map.type.key)
  const shared = common(m, map, name, args, key)
  if (shared) return shared
  switch (name) {
    case 'at': {
      const entry = map.entries.get(keyOf(key(args[0]!)))
      if (!entry) throw new CppError(`${typeName(map.type)}::at: key not found`)
      return lvalue(entry.cell)
    }
    case 'insert':
    case 'emplace': {
      const src = args.length === 2 ? args : pairParts(args[0]!)
      const k = key(src[0]!)
      if (!map.entries.has(keyOf(k))) map.entries.set(keyOf(k), { key: k, cell: new Cell(map.type.val, convert(m, src[1]!, map.type.val)) })
      return VOID
    }
    default:
      throw unknownMethod(typeName(map.type), name)
  }
}

function pairParts(r: R): R[] {
  const v = r.value
  if (v instanceof InitVal && v.items.length === 2) return v.items
  if (v instanceof PairVal) return [v.first, v.second].map((c): R => ({ type: c.type, value: c.value }))
  throw new CppError('insert() on a map needs a {key, value} pair')
}

/** set and unordered_set. */
export function setMethod(m: Machine, set: SetVal, name: string, args: readonly R[]): R {
  const key = (r: R) => convert(m, r, set.type.of)
  const shared = common(m, set, name, args, key)
  if (shared) return shared
  if (name === 'insert' || name === 'emplace') {
    setAdd(set, key(args[0]!))
    return VOID
  }
  throw unknownMethod(typeName(set.type), name)
}
