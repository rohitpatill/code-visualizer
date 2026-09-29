import type { JType } from '../../lang/types'
import { Fault } from '../errors'
import type { Machine } from '../machine'
import { toPrim } from '../convert'
import { boolR, isRawPrim, refR } from '../ops'
import { HeapVal, type JVal, type R } from '../values'
import { arity, element, noMethod } from './common'
import { compareWith } from './equality'
import { isCollection, itemsOf } from './iteration'
import { addAll, indexOfValue, sequenceMethod } from './sequences'

// java.util.PriorityQueue's own sift routines, so the array (and the Heap view)
// matches a real run step for step, and a comparator sees the same calls.

function siftUp(m: Machine, q: HeapVal, start: number, x: JVal): void {
  const es = q.items
  let k = start
  while (k > 0) {
    const parent = (k - 1) >>> 1
    const e = es[parent]!
    if (compareWith(m, q.cmp, x, e) >= 0) break
    es[k] = e
    k = parent
  }
  es[k] = x
}

function siftDown(m: Machine, q: HeapVal, start: number, x: JVal, n: number): void {
  const es = q.items
  const half = n >>> 1
  let k = start
  while (k < half) {
    let child = (k << 1) + 1
    let c = es[child]!
    const right = child + 1
    if (right < n && compareWith(m, q.cmp, c, es[right]!) > 0) c = es[(child = right)]!
    if (compareWith(m, q.cmp, x, c) <= 0) break
    es[k] = c
    k = child
  }
  es[k] = x
}

function offer(m: Machine, q: HeapVal, x: JVal): void {
  if (x === null) throw new Fault('NullPointerException')
  q.modCount++
  q.items.push(x)
  siftUp(m, q, q.items.length - 1, x)
}

function poll(m: Machine, q: HeapVal): JVal {
  const es = q.items
  if (!es.length) return null
  const result = es[0]!
  q.modCount++
  const x = es.pop()!
  if (es.length) siftDown(m, q, 0, x, es.length)
  return result
}

function removeAt(m: Machine, q: HeapVal, i: number): void {
  const es = q.items
  q.modCount++
  const moved = es.pop()!
  if (i === es.length) return
  siftDown(m, q, i, moved, es.length)
  if (es[i] === moved) siftUp(m, q, i, moved)
}

/** `new PriorityQueue<>()`, with an initial capacity, a comparator, or a collection to heapify. */
export function constructHeap(m: Machine, typeArgs: JType[], args: readonly R[]): R {
  arity('new PriorityQueue', args, 0, 2)
  let cmp: JVal = null
  let source: R | null = null
  for (const a of args) {
    if (isRawPrim(a)) {
      if ((toPrim(a, 'int') as number) < 1) throw new Fault('IllegalArgumentException')
    } else if (isCollection(a.value)) source = a
    else cmp = a.value
  }
  if (source?.value instanceof HeapVal) cmp = source.value.cmp
  const q = new HeapVal(source ? itemsOf(m, source, 'new PriorityQueue') : [], cmp, typeArgs)
  if (q.items.includes(null)) throw new Fault('NullPointerException')
  if (!(source?.value instanceof HeapVal)) for (let i = (q.items.length >>> 1) - 1; i >= 0; i--) siftDown(m, q, i, q.items[i]!, q.items.length)
  return refR(q, { t: 'ref', name: 'PriorityQueue', args: typeArgs })
}

export function heapMethod(m: Machine, q: HeapVal, name: string, args: readonly R[]): R {
  const shared = sequenceMethod(m, q, name, args)
  if (shared) return shared
  switch (name) {
    case 'add':
    case 'offer':
      arity(name, args, 1)
      offer(m, q, element(m, args[0]!))
      return boolR(true)
    case 'addAll':
      return addAll(m, args[0]!, (v) => offer(m, q, v))
    case 'poll':
      return refR(poll(m, q))
    case 'peek':
      return refR(q.items[0] ?? null)
    case 'element':
    case 'remove': {
      if (name === 'remove' && args.length) {
        const i = indexOfValue(m, q.items, element(m, args[0]!))
        if (i === -1) return boolR(false)
        removeAt(m, q, i)
        return boolR(true)
      }
      if (!q.items.length) throw new Fault('NoSuchElementException')
      return refR(name === 'element' ? q.items[0]! : poll(m, q))
    }
    case 'comparator':
      return refR(q.cmp)
    default:
      throw noMethod('PriorityQueue', name)
  }
}
