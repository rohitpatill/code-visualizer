import type { JType } from '../../lang/types'
import { invokeCallable } from '../calls'
import { CompileStop, Fault } from '../errors'
import type { Machine } from '../machine'
import { VOID, boolR, intR, isRawPrim, refR } from '../ops'
import { type JVal, ListVal, type R } from '../values'
import { arity, checkIndex, element, intArg, noMethod } from './common'
import { itemsOf, removeFromList } from './iteration'
import { addAll, elementArg, indexOfValue, lastIndexOfValue, sequenceMethod, writable } from './sequences'
import { javaSort } from './sorting'

/** `list.remove(i)` removes by index only for an int-like argument; anything else is removed by value. */
const INDEX_TYPES: ReadonlySet<string> = new Set(['int', 'short', 'char', 'byte'])

const isDeque = (list: ListVal) => list.kind === 'LinkedList' || list.kind === 'ArrayDeque'
const empty = () => new Fault('NoSuchElementException')

function add(list: ListVal, v: JVal, at = list.items.length): void {
  writable(list, true)
  if (v === null && list.kind === 'ArrayDeque') throw new Fault('NullPointerException')
  list.items.splice(at, 0, v)
  list.modCount++
}

function take(list: ListVal, fromFront: boolean): JVal {
  writable(list, true)
  if (!list.items.length) throw list.kind === 'Stack' ? new Fault('EmptyStackException') : empty()
  const v = fromFront ? list.items.shift()! : list.items.pop()!
  list.modCount++
  return v
}

const end = (list: ListVal, front: boolean): JVal | undefined => (front ? list.items[0] : list.items[list.items.length - 1])

/** `new ArrayList<>()`, `new ArrayList<>(n)`, `new ArrayList<>(other)`, and the same for LinkedList, ArrayDeque and Stack. */
export function constructList(m: Machine, kind: ListVal['kind'], typeArgs: JType[], args: readonly R[]): R {
  arity(`new ${kind}`, args, 0, 1)
  const [a] = args
  const items = a && !isRawPrim(a) ? itemsOf(m, a, `new ${kind}`) : []
  if (a && isRawPrim(a) && intArg(a, kind) < 0) throw new Fault('IllegalArgumentException', `Illegal Capacity: ${intArg(a, kind)}`)
  if (kind === 'ArrayDeque' && items.includes(null)) throw new Fault('NullPointerException')
  return refR(new ListVal(kind, items, typeArgs), { t: 'ref', name: kind, args: typeArgs })
}

/** A read-only list (List.of, Collections.nCopies); nulls are refused as List.of refuses them. */
export function immutableList(items: JVal[], allowNull = false): ListVal {
  if (!allowNull && items.includes(null)) throw new Fault('NullPointerException')
  return new ListVal('List', items, [], 'immutable')
}

/** push, pop and peek: at the end for Stack, at the front for deques. */
function stackOrDequeMethod(m: Machine, list: ListVal, name: string, args: readonly R[]): R | null {
  const front = isDeque(list)
  switch (name) {
    case 'push': {
      const v = elementArg(m, args, name)
      add(list, v, front ? 0 : list.items.length)
      return front ? VOID : refR(v)
    }
    case 'pop':
      return refR(take(list, front))
    case 'peek':
      if (!list.items.length && list.kind === 'Stack') throw new Fault('EmptyStackException')
      return refR(end(list, front) ?? null)
    case 'empty':
      if (list.kind !== 'Stack') return null
      return boolR(!list.items.length)
    case 'search': {
      if (list.kind !== 'Stack') return null
      const at = lastIndexOfValue(m, list.items, element(m, args[0]!))
      return intR(at === -1 ? -1 : list.items.length - at)
    }
    default:
      return null
  }
}

/** Queue and Deque operations of LinkedList and ArrayDeque. */
function dequeMethod(m: Machine, list: ListVal, name: string, args: readonly R[]): R | null {
  switch (name) {
    case 'offer':
    case 'offerLast':
      add(list, elementArg(m, args, name))
      return boolR(true)
    case 'offerFirst':
      add(list, elementArg(m, args, name), 0)
      return boolR(true)
    case 'poll':
    case 'pollFirst':
    case 'pollLast':
      if (!list.items.length) return refR(null)
      return refR(take(list, name !== 'pollLast'))
    case 'peekFirst':
    case 'peekLast':
      return refR(end(list, name === 'peekFirst') ?? null)
    case 'element':
      if (!list.items.length) throw empty()
      return refR(list.items[0]!)
    case 'descendingIterator':
      throw new CompileStop('descendingIterator is not supported yet: loop over the indices backwards')
    default:
      return null
  }
}

/** getFirst, addLast and the other end operations every list and deque has. */
function endMethod(m: Machine, list: ListVal, name: string, args: readonly R[]): R | null {
  switch (name) {
    case 'addFirst':
    case 'addLast':
      add(list, elementArg(m, args, name), name === 'addFirst' ? 0 : list.items.length)
      return VOID
    case 'getFirst':
    case 'getLast':
      if (!list.items.length) throw empty()
      return refR(end(list, name === 'getFirst')!)
    case 'removeFirst':
    case 'removeLast':
      if (!list.items.length) throw empty()
      return refR(take(list, name === 'removeFirst'))
    default:
      return null
  }
}

/** The index-based List methods: ArrayList, LinkedList, Stack and the fixed lists. */
function indexedMethod(m: Machine, list: ListVal, name: string, args: readonly R[]): R | null {
  const items = list.items
  switch (name) {
    case 'get':
      arity(name, args, 1)
      return refR(items[checkIndex(intArg(args[0], name), items.length)]!)
    case 'set': {
      arity(name, args, 2)
      writable(list, false)
      const i = checkIndex(intArg(args[0], name), items.length)
      const old = items[i]!
      items[i] = element(m, args[1]!)
      return refR(old)
    }
    case 'indexOf':
      return intR(indexOfValue(m, items, element(m, args[0]!)))
    case 'lastIndexOf':
      return intR(lastIndexOfValue(m, items, element(m, args[0]!)))
    case 'sort':
      writable(list, false)
      javaSort(m, items, args[0]?.value ?? null)
      list.modCount++
      return VOID
    case 'replaceAll':
      writable(list, false)
      items.forEach((v, i) => (items[i] = element(m, invokeCallable(m, args[0]!.value, [refR(v)], 'apply'))))
      return VOID
    case 'subList': {
      const from = intArg(args[0], name)
      const to = intArg(args[1], name)
      if (from < 0 || to > items.length || from > to) throw new Fault('IndexOutOfBoundsException', `fromIndex: ${from}, toIndex: ${to}, size: ${items.length}`)
      return refR(new ListVal('ArrayList', items.slice(from, to), list.args))
    }
    default:
      return null
  }
}

/** `list.add(e)`, `list.add(i, e)` and the two kinds of remove: by index for an int, by value for an object. */
function addOrRemove(m: Machine, list: ListVal, name: string, args: readonly R[]): R | null {
  const indexed = !isDeque(list) || list.kind === 'LinkedList'
  switch (name) {
    case 'add':
      if (args.length === 2 && indexed) {
        const i = intArg(args[0], name)
        if (i < 0 || i > list.items.length) throw new Fault('IndexOutOfBoundsException', `Index: ${i}, Size: ${list.items.length}`)
        add(list, element(m, args[1]!), i)
        return VOID
      }
      add(list, elementArg(m, args, name))
      return boolR(true)
    case 'addAll':
      writable(list, true)
      if (args.length === 2) {
        const at = intArg(args[0], name)
        const added = itemsOf(m, args[1]!, name)
        list.items.splice(at, 0, ...added)
        list.modCount++
        return boolR(added.length > 0)
      }
      return addAll(m, args[0]!, (v) => add(list, v))
    case 'remove': {
      if (!args.length) return refR(take(list, true))
      const arg = args[0]!
      if (indexed && isRawPrim(arg) && arg.type.t === 'prim' && INDEX_TYPES.has(arg.type.name)) {
        writable(list, true)
        const i = checkIndex(intArg(arg, name), list.items.length)
        const old = list.items[i]!
        removeFromList(list, i)
        return refR(old)
      }
      const at = indexOfValue(m, list.items, element(m, arg))
      if (at === -1) return boolR(false)
      writable(list, true)
      removeFromList(list, at)
      return boolR(true)
    }
    default:
      return null
  }
}

export function listMethod(m: Machine, list: ListVal, name: string, args: readonly R[]): R {
  const result =
    sequenceMethod(m, list, name, args) ??
    addOrRemove(m, list, name, args) ??
    endMethod(m, list, name, args) ??
    (list.kind === 'Stack' || isDeque(list) ? stackOrDequeMethod(m, list, name, args) : null) ??
    (isDeque(list) ? dequeMethod(m, list, name, args) : null) ??
    (list.kind !== 'ArrayDeque' ? indexedMethod(m, list, name, args) : null)
  if (!result) throw noMethod(list.kind === 'List' ? 'List' : list.kind, name)
  return result
}
