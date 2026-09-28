import { type CType, T, typeName } from '../lang/types'
import { num } from './arith'
import { keyOf } from './compare'
import { CppError } from './errors'
import { convert, defaultValue } from './init'
import type { Machine } from './machine'
import { deref as derefIter } from './stl/iterators'
import { Cell, CharCell, IterVal, MapVal, ObjVal, PairVal, PtrVal, type R, SeqVal, StrVal } from './values'

const lvalue = (cell: Cell): R => ({ type: cell.type, value: cell.value, cell })

/** `*p` and `*it`. */
export function deref(m: Machine, r: R): R {
  const v = r.value
  if (v instanceof IterVal) return lvalue(derefIter(m, v))
  if (!(v instanceof PtrVal)) throw new CppError(`cannot dereference a ${typeName(r.type)}`)
  if (v.isNull) throw new CppError('dereferenced a null pointer (this crashes a real program with a segmentation fault)')
  if (v.base) {
    const cell = v.base.items[v.index]
    if (!cell) throw new CppError(`pointer points outside its array (index ${v.index}, size ${v.base.items.length})`)
    if (cell.freed) throw new CppError('used memory after delete')
    return lvalue(cell)
  }
  if (v.target!.freed) throw new CppError('used memory after delete')
  return lvalue(v.target!)
}

function checkedIndex(i: number, size: number, what: string): number {
  if (!Number.isInteger(i) || i < 0 || i >= size) {
    throw new CppError(`index ${i} is out of range for a ${what} of size ${size} (undefined behavior in real C++)`)
  }
  return i
}

/** `a[i]`: containers, strings, maps (which insert a missing key, as C++ does) and pointers into arrays. */
export function index(m: Machine, target: R, at: R): R {
  const v = target.value
  if (v instanceof MapVal) {
    const key = convert(m, at, v.type.key)
    const k = keyOf(key)
    let entry = v.entries.get(k)
    if (!entry) {
      entry = { key, cell: new Cell(v.type.val, defaultValue(m, v.type.val, true)) }
      v.entries.set(k, entry)
    }
    return lvalue(entry.cell)
  }
  const i = Number(num(at.value))
  if (v instanceof SeqVal) return lvalue(v.items[checkedIndex(i, v.items.length, typeName(v.type))]!)
  if (v instanceof StrVal) return lvalue(new CharCell(v, checkedIndex(i, v.s.length, 'string')))
  if (v instanceof PtrVal) {
    if (v.base) return deref(m, { type: target.type, value: new PtrVal(null, v.base, v.index + i) })
    if (i === 0) return deref(m, target)
  }
  throw new CppError(`cannot index a ${typeName(target.type)}`)
}

/** `obj.name` and `ptr->name` for struct fields and `pair::first` / `second`. */
export function member(m: Machine, target: R, name: string, arrow: boolean): R {
  const obj = arrow ? deref(m, target) : target
  const v = obj.value
  if (v instanceof ObjVal) {
    const cell = v.fields.get(name)
    if (!cell) throw new CppError(`${v.cls.name} has no member named '${name}'`)
    return lvalue(cell)
  }
  if (v instanceof PairVal && (name === 'first' || name === 'second')) return lvalue(v[name])
  throw new CppError(`${typeName(obj.type)} has no member named '${name}'`)
}

export const sizeT = (n: number): R => ({ type: T.sizeT, value: BigInt(n) })

export const elementType = (t: CType, fallback: CType = T.int): CType => ('of' in t ? t.of : fallback)
