import { CppError } from './errors'
import { type Cell, ObjVal, PairVal, PtrVal, SeqVal, StrVal, type Val } from './values'

/** Orders two objects of a user class; supplied by the machine, since it runs `operator<`. */
export type ObjectLess = (a: ObjVal, b: ObjVal) => boolean

const identities = new WeakMap<object, number>()
let nextIdentity = 1

export function identity(obj: object): number {
  let id = identities.get(obj)
  if (id === undefined) {
    id = nextIdentity++
    identities.set(obj, id)
  }
  return id
}

function pointerKey(p: PtrVal): string {
  if (p.isNull) return 'p0'
  return p.target ? `p${identity(p.target)}` : `p${identity(p.base!)}:${p.index}`
}

/** A string that is equal for equal values: the hash key for unordered containers. */
export function keyOf(v: Val): string {
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (v instanceof StrVal) return `s${v.s}`
  if (v instanceof PairVal) return `(${keyOf(v.first.value)},${keyOf(v.second.value)})`
  if (v instanceof SeqVal) return `[${v.items.map((c) => keyOf(c.value)).join(',')}]`
  if (v instanceof PtrVal) return pointerKey(v)
  if (v instanceof ObjVal) return `o${identity(v)}`
  throw new CppError('this value cannot be used as a key')
}

function compareCells(a: readonly Cell[], b: readonly Cell[], less: ObjectLess): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const c = compareVals(a[i]!.value, b[i]!.value, less)
    if (c) return c
  }
  return a.length - b.length
}

/** Negative, zero or positive, like C++'s `<` applied both ways. */
export function compareVals(a: Val, b: Val, less: ObjectLess): number {
  if ((typeof a === 'number' || typeof a === 'bigint') && (typeof b === 'number' || typeof b === 'bigint')) {
    return a < b ? -1 : a > b ? 1 : 0
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  if (a instanceof StrVal && b instanceof StrVal) return a.s < b.s ? -1 : a.s > b.s ? 1 : 0
  if (a instanceof PairVal && b instanceof PairVal) return compareCells([a.first, a.second], [b.first, b.second], less)
  if (a instanceof SeqVal && b instanceof SeqVal) return compareCells(a.items, b.items, less)
  if (a instanceof PtrVal && b instanceof PtrVal) return pointerKey(a) < pointerKey(b) ? -1 : pointerKey(a) > pointerKey(b) ? 1 : 0
  if (a instanceof ObjVal && b instanceof ObjVal) return less(a, b) ? -1 : less(b, a) ? 1 : 0
  throw new CppError('these values cannot be compared with <')
}

export function equalVals(a: Val, b: Val, less: ObjectLess): boolean {
  if (a instanceof ObjVal && b instanceof ObjVal) return a === b || compareVals(a, b, less) === 0
  return compareVals(a, b, less) === 0
}
