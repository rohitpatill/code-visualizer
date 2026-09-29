import type { JType } from '../../lang/types'
import { invokeCallable } from '../calls'
import { CompileStop, Fault } from '../errors'
import type { Machine } from '../machine'
import { VOID, boolR, intR, isRawPrim, refR, truthy } from '../ops'
import { valueText } from '../text'
import { IterVal, type JVal, type R, SetVal } from '../values'
import { arity, element, intArg, noMethod } from './common'
import { compareWith, javaEquals, javaHash } from './equality'
import { cursorOf, isCollection, itemsOf } from './iteration'
import { unsupported } from './sequences'
import { HashStore, TreeStore } from './stores'

function add(m: Machine, set: SetVal, v: JVal): boolean {
  if (set.immutable) throw unsupported()
  return !set.store.put(m, v, null)
}

function remove(m: Machine, set: SetVal, v: JVal): boolean {
  if (set.immutable) throw unsupported()
  return !!set.store.remove(m, v)
}

/** `new HashSet<>()`, `new HashSet<>(list)`, `new TreeSet<>(comparator)` and friends. */
export function constructSet(m: Machine, kind: SetVal['kind'], typeArgs: JType[], args: readonly R[]): R {
  arity(`new ${kind}`, args, 0, 2)
  const [a] = args
  const items = a && isCollection(a.value) ? itemsOf(m, a, `new ${kind}`) : null
  let set: SetVal
  if (kind === 'TreeSet') {
    const source = a?.value instanceof SetVal && a.value.store instanceof TreeStore ? a.value.store.cmp : null
    set = new SetVal(kind, new TreeStore(items ? source : (a?.value ?? null)), typeArgs)
  } else {
    if (a && isRawPrim(a) && intArg(a, kind) < 0) throw new Fault('IllegalArgumentException', `Illegal initial capacity: ${intArg(a, kind)}`)
    const capacity = items ? Math.max(Math.floor(items.length / 0.75) + 1, 16) : a && isRawPrim(a) ? intArg(a, kind) : undefined
    set = new SetVal(kind, new HashStore(kind === 'LinkedHashSet', capacity), typeArgs)
  }
  for (const v of items ?? []) set.store.put(m, v, null)
  return refR(set, { t: 'ref', name: kind, args: typeArgs })
}

/** Set.of: read-only, and it refuses duplicates and nulls. Java randomizes its order per run; insertion order is shown. */
export function immutableSet(m: Machine, items: readonly JVal[]): SetVal {
  const store = new HashStore(true)
  for (const v of items) {
    if (v === null) throw new Fault('NullPointerException')
    if (store.put(m, v, null)) throw new Fault('IllegalArgumentException', `duplicate element: ${valueText(m, v)}`)
  }
  return new SetVal('Set', store, [], true)
}

function treeSetMethod(m: Machine, set: SetVal, name: string, args: readonly R[]): R | null {
  const store = set.store
  if (!(store instanceof TreeStore)) return null
  const entries = store.entries()
  switch (name) {
    case 'first':
    case 'last': {
      const e = name === 'first' ? entries[0] : entries[entries.length - 1]
      if (!e) throw new Fault('NoSuchElementException')
      return refR(e.key)
    }
    case 'pollFirst':
    case 'pollLast': {
      const e = name === 'pollFirst' ? entries[0] : entries[entries.length - 1]
      if (!e) return refR(null)
      store.remove(m, e.key)
      return refR(e.key)
    }
    case 'floor':
    case 'ceiling':
    case 'lower':
    case 'higher':
      return refR(store.nearest(m, element(m, args[0]!), name)?.key ?? null)
    case 'headSet':
    case 'tailSet': {
      const bound = element(m, args[0]!)
      const inclusive = args[1] ? truthy(args[1]) : name === 'tailSet'
      const copy = new SetVal('TreeSet', new TreeStore(store.cmp), set.args)
      for (const e of entries) {
        const c = compareWith(m, store.cmp, e.key, bound)
        if ((name === 'headSet' ? c < 0 : c > 0) || (inclusive && c === 0)) copy.store.put(m, e.key, null)
      }
      return refR(copy)
    }
    default:
      return null
  }
}

export function setMethod(m: Machine, set: SetVal, name: string, args: readonly R[]): R {
  const keys = () => set.store.entries(m).map((e) => e.key)
  const arg = () => {
    arity(`${set.kind}.${name}`, args, 1)
    return element(m, args[0]!)
  }
  switch (name) {
    case 'add':
      return boolR(add(m, set, arg()))
    case 'remove':
      return boolR(remove(m, set, arg()))
    case 'contains':
      return boolR(!!set.store.find(m, arg()))
    case 'size':
      return intR(set.store.size)
    case 'isEmpty':
      return boolR(set.store.size === 0)
    case 'clear':
      if (set.immutable) throw unsupported()
      set.store.clear()
      return VOID
    case 'addAll':
      return boolR(itemsOf(m, args[0]!, name).map((v) => add(m, set, v)).some(Boolean))
    case 'removeAll':
      return boolR(itemsOf(m, args[0]!, name).map((v) => remove(m, set, v)).some(Boolean))
    case 'containsAll':
      return boolR(itemsOf(m, args[0]!, name).every((v) => !!set.store.find(m, v)))
    case 'retainAll': {
      const keep = itemsOf(m, args[0]!, name)
      const drop = keys().filter((k) => !keep.some((x) => javaEquals(m, x, k)))
      for (const k of drop) remove(m, set, k)
      return boolR(drop.length > 0)
    }
    case 'removeIf': {
      const drop = keys().filter((k) => truthy(invokeCallable(m, args[0]!.value, [refR(k)], 'test')))
      for (const k of drop) remove(m, set, k)
      return boolR(drop.length > 0)
    }
    case 'iterator':
      return refR(new IterVal(cursorOf(m, set)!))
    case 'forEach': {
      const cursor = cursorOf(m, set)!
      while (cursor.hasNext()) invokeCallable(m, args[0]!.value, [refR(cursor.next())], 'accept')
      return VOID
    }
    case 'equals':
      return boolR(javaEquals(m, set, args[0]!.value))
    case 'hashCode':
      return intR(javaHash(m, set))
    case 'toString':
      return refR(m.intern(valueText(m, set)))
    case 'stream':
      throw new CompileStop('streams are not supported by the visualizer yet: use a loop')
    default: {
      const result = treeSetMethod(m, set, name, args)
      if (!result) throw noMethod(set.kind, name)
      return result
    }
  }
}
