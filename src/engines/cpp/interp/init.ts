import { type CType, elementOf, typeName } from '../lang/types'
import { convertArith } from './arith'
import { constructObject } from './calls'
import { keyOf } from './compare'
import { CppError } from './errors'
import type { Machine } from './machine'
import { heapify } from './stl/heap'
import { rangeValues } from './stl/iterators'
import {
  Cell, InitVal, IterVal, MapVal, NULL_PTR, ObjVal, PairVal, PtrVal, type R, SeqVal, SetVal, StrVal, UNINIT, type Val,
} from './values'

export function copyValue(v: Val): Val {
  if (v instanceof StrVal) return new StrVal(v.s)
  if (v instanceof SeqVal) return new SeqVal(v.type, v.items.map(copyCell))
  if (v instanceof PairVal) return new PairVal(v.type, copyCell(v.first), copyCell(v.second))
  if (v instanceof ObjVal) return new ObjVal(v.cls, new Map([...v.fields].map(([n, c]) => [n, copyCell(c)])))
  if (v instanceof IterVal) return new IterVal(v.over, v.index, v.reverse)
  if (v instanceof MapVal) {
    const m = new MapVal(v.type)
    for (const [k, e] of v.entries) m.entries.set(k, { key: copyValue(e.key), cell: copyCell(e.cell) })
    return m
  }
  if (v instanceof SetVal) {
    const s = new SetVal(v.type)
    for (const [k, key] of v.keys) s.keys.set(k, copyValue(key))
    return s
  }
  return v
}

export const copyCell = (c: Cell): Cell => new Cell(c.type, copyValue(c.value))

export function zeroOf(type: CType): Val {
  if (type.t === 'int') return type.bits === 64 ? 0n : 0
  if (type.t === 'bool') return false
  return 0
}

/** The value a fresh object of `type` holds. With `zero`, scalars are 0 (value-initialized); without, they are uninitialized. */
export function defaultValue(m: Machine, type: CType, zero: boolean): Val {
  switch (type.t) {
    case 'bool':
    case 'char':
    case 'int':
    case 'float':
      return zero ? zeroOf(type) : UNINIT
    case 'string':
      return new StrVal('')
    case 'vector':
    case 'deque':
    case 'queue':
    case 'stack':
    case 'pq':
      return new SeqVal(type, [])
    case 'array':
      return new SeqVal(type, Array.from({ length: type.size }, () => new Cell(type.of, defaultValue(m, type.of, zero))))
    case 'map':
      return new MapVal(type)
    case 'set':
      return new SetVal(type)
    case 'pair':
      return new PairVal(type, new Cell(type.a, defaultValue(m, type.a, zero)), new Cell(type.b, defaultValue(m, type.b, zero)))
    case 'ptr':
      return zero ? NULL_PTR : UNINIT
    case 'class':
      return constructObject(m, m.classDef(type.name), [])
    case 'cmp':
      return { fn: 'cmp', greater: type.greater }
    case 'void':
      return null
    default:
      return UNINIT
  }
}

export function setAdd(set: SetVal, key: Val): boolean {
  const k = keyOf(key)
  if (set.keys.has(k)) return false
  set.keys.set(k, key)
  return true
}

function fromList(m: Machine, to: CType, items: readonly R[]): Val {
  const elem = elementOf(to)
  switch (to.t) {
    case 'vector':
    case 'deque':
    case 'queue':
    case 'stack':
    case 'pq': {
      const seq = new SeqVal(to, items.map((it) => new Cell(elem!, convert(m, it, elem!))))
      if (to.t === 'pq') heapify(m, seq)
      return seq
    }
    case 'array': {
      if (items.length > to.size) throw new CppError(`too many initializers for ${typeName(to)}`)
      const cells = items.map((it) => new Cell(to.of, convert(m, it, to.of)))
      while (cells.length < to.size) cells.push(new Cell(to.of, defaultValue(m, to.of, true)))
      return new SeqVal(to, cells)
    }
    case 'set': {
      const set = new SetVal(to)
      for (const it of items) setAdd(set, convert(m, it, to.of))
      return set
    }
    case 'map': {
      const map = new MapVal(to)
      for (const it of items) {
        const pair = it.value instanceof InitVal ? it.value.items : it.value instanceof PairVal ? [it.value.first, it.value.second].map((c): R => ({ type: c.type, value: c.value })) : null
        if (!pair || pair.length !== 2) throw new CppError('each map entry needs a key and a value, like {key, value}')
        const key = convert(m, pair[0]!, to.key)
        const k = keyOf(key)
        if (!map.entries.has(k)) map.entries.set(k, { key, cell: new Cell(to.val, convert(m, pair[1]!, to.val)) })
      }
      return map
    }
    case 'pair':
      if (items.length !== 2) throw new CppError('a pair needs exactly two values')
      return new PairVal(to, new Cell(to.a, convert(m, items[0]!, to.a)), new Cell(to.b, convert(m, items[1]!, to.b)))
    case 'class':
      return constructObject(m, m.classDef(to.name), items, true)
    default:
      if (items.length === 0) return defaultValue(m, to, true)
      if (items.length === 1) return convert(m, items[0]!, to)
      throw new CppError(`too many values in braces for ${typeName(to)}`)
  }
}

function sameElements(m: Machine, from: SeqVal, to: Extract<CType, { of: CType }>): Cell[] {
  return from.items.map((c) => new Cell(to.of, convert(m, { type: c.type, value: c.value }, to.of)))
}

/** The value stored when `r` is assigned to, passed as, or initializes something of type `to`. Always a copy. */
export function convert(m: Machine, r: R, to: CType): Val {
  const v = r.value
  if (v === UNINIT) throw new CppError('used a variable before giving it a value (uninitialized)')
  if (v instanceof InitVal) return fromList(m, to, v.items)
  switch (to.t) {
    case 'bool':
      if (v instanceof PtrVal) return !v.isNull
      return convertArith(v, r.type, to)
    case 'char':
    case 'int':
    case 'float':
      if (typeof v !== 'number' && typeof v !== 'bigint' && typeof v !== 'boolean') throw new CppError(`cannot convert ${typeName(r.type)} to ${typeName(to)}`)
      return convertArith(v, r.type, to)
    case 'string':
      if (v instanceof StrVal) return new StrVal(v.s)
      throw new CppError(`cannot convert ${typeName(r.type)} to string`)
    case 'ptr':
      if (v instanceof PtrVal) return v
      if (v === 0 || v === 0n) return NULL_PTR
      throw new CppError(`cannot convert ${typeName(r.type)} to a pointer`)
    case 'vector':
    case 'deque':
    case 'queue':
    case 'stack':
    case 'pq':
    case 'array':
      if (v instanceof SeqVal) return new SeqVal(to, sameElements(m, v, to))
      break
    case 'class':
      if (v instanceof ObjVal) return copyValue(v)
      return constructObject(m, m.classDef(to.name), [r])
    case 'pair':
      if (v instanceof PairVal) return fromList(m, to, [{ type: v.first.type, value: v.first.value }, { type: v.second.type, value: v.second.value }])
      break
    case 'map':
    case 'set':
      if (v instanceof MapVal || v instanceof SetVal) return copyValue(v)
      break
    default:
      return copyValue(v)
  }
  throw new CppError(`cannot convert ${typeName(r.type)} to ${typeName(to)}`)
}

const isNumber = (r: R | undefined) => typeof r?.value === 'number' || typeof r?.value === 'bigint'
const count = (r: R) => {
  const n = Number(r.value)
  if (n < 0) throw new CppError(`cannot make a container of negative size ${n}`)
  return n
}

/** `T(args)` and `T x(args)`: constructors of the standard types and user classes. */
export function construct(m: Machine, type: CType, args: readonly R[]): Val {
  const [a, b] = args
  if (args.length === 1 && a!.value instanceof InitVal) return fromList(m, type, a!.value.items)
  if (a?.value instanceof IterVal && b?.value instanceof IterVal) {
    return fromList(m, type, rangeValues(m, a.value, b.value).map((c): R => ({ type: c.type, value: c.value })))
  }
  switch (type.t) {
    case 'class':
      return constructObject(m, m.classDef(type.name), args)
    case 'vector':
    case 'deque':
      if (args.length === 0) return new SeqVal(type, [])
      if (isNumber(a) && args.length <= 2) {
        const n = count(a!)
        return new SeqVal(type, Array.from({ length: n }, () => new Cell(type.of, b ? convert(m, b, type.of) : defaultValue(m, type.of, true))))
      }
      break
    case 'string':
      if (args.length === 0) return new StrVal('')
      if (isNumber(a) && b) return new StrVal(String.fromCharCode(Number(b.value)).repeat(count(a!)))
      break
    case 'pair':
      if (args.length === 2) return fromList(m, type, args)
      break
    default:
      break
  }
  if (args.length === 0) return defaultValue(m, type, true)
  if (args.length === 1) return convert(m, a!, type)
  throw new CppError(`no constructor of ${typeName(type)} takes ${args.length} arguments`)
}
