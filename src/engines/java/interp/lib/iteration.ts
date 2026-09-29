import type { Expr } from '../../lang/ast'
import { type JType, T } from '../../lang/types'
import { callMethod } from '../calls'
import { CompileStop, Fault } from '../errors'
import { describeNull } from '../names'
import type { Machine } from '../machine'
import { truthy } from '../ops'
import { viewItems } from '../text'
import {
  type Cursor, HeapVal, builtinPart, IterVal, JArray, JObject, JStr, type JVal, ListVal, MapVal, type R, SetVal, type Store, ViewVal,
} from '../values'

const concurrent = () => new Fault('ConcurrentModificationException')
const exhausted = () => new Fault('NoSuchElementException')

/** ArrayList.Itr: fail-fast on changes made behind its back, and safe to remove through. */
function listCursor(list: ListVal | HeapVal, removeAt: (i: number) => void): Cursor {
  let cursor = 0
  let lastRet = -1
  let expected = list.modCount
  return {
    hasNext: () => cursor !== list.items.length,
    next: () => {
      if (list.modCount !== expected) throw concurrent()
      if (cursor >= list.items.length) throw exhausted()
      lastRet = cursor
      return list.items[cursor++]!
    },
    remove: () => {
      if (lastRet < 0) throw new Fault('IllegalStateException')
      if (list.modCount !== expected) throw concurrent()
      removeAt(lastRet)
      cursor = lastRet
      lastRet = -1
      expected = list.modCount
    },
  }
}

/** Iterates a snapshot of a map or set, failing fast if the store changes, like HashMap's iterators. */
function storeCursor(m: Machine, store: Store, items: () => JVal[], keyOf: (i: number) => JVal): Cursor {
  const snapshot = items()
  let index = 0
  let expected = store.modCount
  return {
    hasNext: () => index < snapshot.length,
    next: () => {
      if (store.modCount !== expected) throw concurrent()
      if (index >= snapshot.length) throw exhausted()
      return snapshot[index++]!
    },
    remove: () => {
      if (index === 0) throw new Fault('IllegalStateException')
      if (store.modCount !== expected) throw concurrent()
      store.remove(m, keyOf(index - 1))
      expected = store.modCount
    },
  }
}

/** A user Iterable or Iterator, driven through its own hasNext and next. */
function userCursor(m: Machine, it: R): Cursor {
  if (it.value instanceof IterVal) return it.value.cursor
  return {
    hasNext: () => truthy(callMethod(m, it, 'hasNext', [])),
    next: () => callMethod(m, it, 'next', []).value,
    remove: () => void callMethod(m, it, 'remove', []),
  }
}

export function removeFromList(list: ListVal, i: number): void {
  list.items.splice(i, 1)
  list.modCount++
}

/** A fresh iterator over any Iterable value, as `iterator()` returns it. */
export function cursorOf(m: Machine, value: JVal): Cursor | null {
  const v = builtinPart(value)
  if (v instanceof ListVal) return listCursor(v, (i) => removeFromList(v, i))
  if (v instanceof HeapVal) return listCursor(v, (i) => {
    v.items.splice(i, 1)
    v.modCount++
  })
  if (v instanceof SetVal) {
    const keys = v.store.entries(m).map((e) => e.key)
    return storeCursor(m, v.store, () => keys, (i) => keys[i]!)
  }
  if (v instanceof ViewVal) {
    const store = v.map.store
    const keys = store.entries(m).map((e) => e.key)
    return storeCursor(m, store, () => viewItems(m, v), (i) => keys[i]!)
  }
  return null
}

/** What a for-each loop walks, and the element type it binds. */
export function iterate(m: Machine, r: R, source: Expr): { cursor: Cursor; elem: JType } {
  const v = r.value
  if (v === null) throw new Fault('NullPointerException', `Cannot iterate because ${describeNull(source)} is null`)
  if (v instanceof JArray) {
    let i = 0
    return { cursor: { hasNext: () => i < v.items.length, next: () => v.items[i++]!, remove: () => {} }, elem: v.type.of }
  }
  const cursor = cursorOf(m, v)
  if (cursor) return { cursor, elem: T.object }
  if (v instanceof JObject) return { cursor: userCursor(m, callMethod(m, r, 'iterator', [])), elem: T.object }
  if (v instanceof JStr) throw new CompileStop('for-each not applicable to expression type String: loop over s.toCharArray() instead')
  if (v instanceof MapVal) throw new CompileStop('for-each not applicable to a Map: loop over keySet(), values() or entrySet()')
  throw new CompileStop('for-each not applicable to this expression type')
}

export function isCollection(value: JVal): boolean {
  const v = builtinPart(value)
  return v instanceof ListVal || v instanceof HeapVal || v instanceof SetVal || v instanceof ViewVal
}

/** Every element of a collection argument, in iteration order (for constructors, addAll and friends). */
export function itemsOf(m: Machine, r: R, what: string): JVal[] {
  const v = builtinPart(r.value)
  if (v instanceof ListVal || v instanceof HeapVal) return [...v.items]
  if (v instanceof SetVal) return v.store.entries(m).map((e) => e.key)
  if (v instanceof ViewVal) return viewItems(m, v)
  if (v === null) throw new Fault('NullPointerException', `${what}: the collection is null`)
  throw new CompileStop(`${what} needs a collection`)
}
