import { type JType, T } from '../../lang/types'
import { invokeCallable } from '../calls'
import { CompileStop, Fault } from '../errors'
import type { Machine } from '../machine'
import { VOID, boolR, intR, refR, truthy } from '../ops'
import { valueText } from '../text'
import { HeapVal, IterVal, JArray, type JVal, ListVal, type R } from '../values'
import { arity, element } from './common'
import { javaEquals, javaHash } from './equality'
import { cursorOf, itemsOf } from './iteration'

// Methods every array-backed collection shares: ArrayList, LinkedList,
// ArrayDeque, Stack and PriorityQueue.

export type Sequence = ListVal | HeapVal

export const unsupported = () => new Fault('UnsupportedOperationException')

/** Refuses changes to List.of and friends; `structural` changes are refused by Arrays.asList too. */
export function writable(seq: Sequence, structural: boolean): void {
  if (seq instanceof ListVal && (seq.mode === 'immutable' || (structural && seq.mode === 'fixed'))) throw unsupported()
}

export const indexOfValue = (m: Machine, items: readonly JVal[], o: JVal): number => items.findIndex((x) => javaEquals(m, o, x))

export function lastIndexOfValue(m: Machine, items: readonly JVal[], o: JVal): number {
  for (let i = items.length - 1; i >= 0; i--) if (javaEquals(m, o, items[i]!)) return i
  return -1
}

function toArray(m: Machine, items: readonly JVal[], arg: R | undefined): R {
  let type: Extract<JType, { t: 'array' }> = { t: 'array', of: T.object }
  const a = arg?.value
  if (a instanceof JArray) type = a.type
  else if (arg) type = (invokeCallable(m, a ?? null, [intR(0)]).value as JArray).type
  return refR(new JArray(type, [...items]), type)
}

/** Iterates with the fail-fast checks of the real iterator, calling `fn` on each element. */
export function forEachItem(m: Machine, seq: Sequence, fn: (v: JVal) => void): void {
  const cursor = cursorOf(m, seq)!
  while (cursor.hasNext()) fn(cursor.next())
}

/** Removes the elements `drop` picks, as removeIf, removeAll and retainAll do. Returns whether anything went. */
export function removeWhere(seq: Sequence, drop: (v: JVal) => boolean): boolean {
  writable(seq, true)
  const keep = seq.items.filter((v) => !drop(v))
  if (keep.length === seq.items.length) return false
  seq.items.splice(0, seq.items.length, ...keep)
  seq.modCount++
  return true
}

/** Methods shared by all sequences; null when `name` is not one of them. */
export function sequenceMethod(m: Machine, seq: Sequence, name: string, args: readonly R[]): R | null {
  const items = seq.items
  switch (name) {
    case 'size':
      arity(name, args, 0)
      return intR(items.length)
    case 'isEmpty':
      return boolR(items.length === 0)
    case 'contains':
      arity(name, args, 1)
      return boolR(indexOfValue(m, items, element(m, args[0]!)) !== -1)
    case 'containsAll':
      return boolR(itemsOf(m, args[0]!, name).every((x) => indexOfValue(m, items, x) !== -1))
    case 'iterator':
      return refR(new IterVal(cursorOf(m, seq)!))
    case 'forEach':
      forEachItem(m, seq, (v) => void invokeCallable(m, args[0]!.value, [refR(v)], 'accept'))
      return VOID
    case 'toArray':
      return toArray(m, items, args[0])
    case 'removeIf': {
      const pred = args[0]!.value
      const verdicts = items.map((v) => truthy(invokeCallable(m, pred, [refR(v)], 'test')))
      let i = 0
      return boolR(removeWhere(seq, () => verdicts[i++]!))
    }
    case 'removeAll': {
      const drop = itemsOf(m, args[0]!, name)
      return boolR(removeWhere(seq, (v) => indexOfValue(m, drop, v) !== -1))
    }
    case 'retainAll': {
      const keep = itemsOf(m, args[0]!, name)
      return boolR(removeWhere(seq, (v) => indexOfValue(m, keep, v) === -1))
    }
    case 'clear':
      writable(seq, true)
      if (items.length) {
        items.length = 0
        seq.modCount++
      }
      return VOID
    case 'equals':
      return boolR(javaEquals(m, seq, element(m, args[0]!)))
    case 'hashCode':
      return intR(javaHash(m, seq))
    case 'toString':
      return refR(m.intern(valueText(m, seq)))
    case 'stream':
    case 'parallelStream':
      throw new CompileStop('streams are not supported by the visualizer yet: use a loop')
    default:
      return null
  }
}

/** addAll(c) for any sequence: every element, in the collection's iteration order. */
export function addAll(m: Machine, arg: R, add: (v: JVal) => void): R {
  const added = itemsOf(m, arg, 'addAll')
  for (const v of added) add(v)
  return boolR(added.length > 0)
}

export const elementArg = (m: Machine, args: readonly R[], what: string, count = 1): JVal => {
  arity(what, args, count)
  return element(m, args[count - 1]!)
}
