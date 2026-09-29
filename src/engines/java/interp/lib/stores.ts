import type { Machine } from '../machine'
import type { Entry, JVal, Store } from '../values'
import { compareWith, javaEquals, javaHash } from './equality'

const MAX_CAPACITY = 1 << 30
const LOAD_FACTOR = 0.75

/** HashMap.tableSizeFor: the power of two a requested capacity rounds up to. */
export function tableSizeFor(cap: number): number {
  let n = 1
  while (n < cap && n < MAX_CAPACITY) n *= 2
  return n
}

const spread = (h: number) => h ^ (h >>> 16)

/**
 * java.util.HashMap's layout, so iteration order matches a real run: entries
 * go in bucket order for the current table size (which grows exactly as
 * Java's does), and in insertion order within a bucket. LinkedHashMap keeps
 * plain insertion order.
 */
export class HashStore implements Store {
  modCount = 0
  private readonly buckets = new Map<number, Entry[]>()
  private readonly order = new Set<Entry>()
  private seq = 0
  private capacity = 0
  private threshold: number
  private ordered: Entry[] | null = null

  constructor(
    private readonly linked: boolean,
    initialCapacity?: number,
  ) {
    this.threshold = initialCapacity === undefined ? 0 : tableSizeFor(Math.max(initialCapacity, 1))
  }

  get size(): number {
    return this.order.size
  }

  find(m: Machine, key: JVal): Entry | undefined {
    const bucket = this.buckets.get(javaHash(m, key))
    return bucket?.find((e) => e.key === key || javaEquals(m, key, e.key))
  }

  put(m: Machine, key: JVal, value: JVal): Entry | undefined {
    const hash = javaHash(m, key)
    const bucket = this.buckets.get(hash)
    const found = bucket?.find((e) => e.key === key || javaEquals(m, key, e.key))
    if (found) {
      const before = { ...found }
      found.value = value
      return before
    }
    if (!this.capacity) this.resize()
    const entry: Entry = { key, value, hash, seq: this.seq++ }
    if (bucket) bucket.push(entry)
    else this.buckets.set(hash, [entry])
    this.order.add(entry)
    this.changed()
    if (this.size > this.threshold) this.resize()
    return undefined
  }

  remove(m: Machine, key: JVal): Entry | undefined {
    const hash = javaHash(m, key)
    const bucket = this.buckets.get(hash)
    const at = bucket ? bucket.findIndex((e) => e.key === key || javaEquals(m, key, e.key)) : -1
    if (at === -1) return undefined
    const [entry] = bucket!.splice(at, 1)
    if (!bucket!.length) this.buckets.delete(hash)
    this.order.delete(entry!)
    this.changed()
    return entry
  }

  clear(): void {
    if (!this.size) return
    this.buckets.clear()
    this.order.clear()
    this.changed()
  }

  entries(): readonly Entry[] {
    if (this.ordered) return this.ordered
    const list = [...this.order]
    if (!this.linked) {
      const mask = this.capacity - 1
      list.sort((a, b) => (spread(a.hash) & mask) - (spread(b.hash) & mask) || a.seq - b.seq)
    }
    this.ordered = list
    return list
  }

  /** HashMap.putAll and the copy constructors grow the table once for everything they add. */
  reserve(count: number): void {
    if (!this.capacity) {
      const wanted = Math.floor(count / LOAD_FACTOR + 1)
      if (wanted > this.threshold) this.threshold = tableSizeFor(wanted)
    } else while (count > this.threshold && this.capacity < MAX_CAPACITY) this.resize()
  }

  private resize(): void {
    this.capacity = this.capacity ? this.capacity * 2 : this.threshold || 16
    this.threshold = this.capacity < MAX_CAPACITY ? Math.floor(this.capacity * LOAD_FACTOR) : Number.MAX_SAFE_INTEGER
    this.ordered = null
  }

  private changed(): void {
    this.modCount++
    this.ordered = null
  }
}

/** java.util.TreeMap's ordering, kept as a sorted array. Keys are compared with the comparator or compareTo, as Java does. */
export class TreeStore implements Store {
  modCount = 0
  private readonly sorted: Entry[] = []
  private seq = 0

  constructor(readonly cmp: JVal) {}

  get size(): number {
    return this.sorted.length
  }

  /** Binary search: the index of `key`, or where it would go. */
  search(m: Machine, key: JVal): { index: number; found: boolean } {
    let lo = 0
    let hi = this.sorted.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      const c = compareWith(m, this.cmp, key, this.sorted[mid]!.key)
      if (c < 0) hi = mid - 1
      else if (c > 0) lo = mid + 1
      else return { index: mid, found: true }
    }
    return { index: lo, found: false }
  }

  find(m: Machine, key: JVal): Entry | undefined {
    const { index, found } = this.search(m, key)
    return found ? this.sorted[index] : undefined
  }

  put(m: Machine, key: JVal, value: JVal): Entry | undefined {
    if (!this.sorted.length) compareWith(m, this.cmp, key, key)
    const { index, found } = this.search(m, key)
    if (found) {
      const entry = this.sorted[index]!
      const before = { ...entry }
      entry.value = value
      return before
    }
    this.sorted.splice(index, 0, { key, value, hash: 0, seq: this.seq++ })
    this.modCount++
    return undefined
  }

  remove(m: Machine, key: JVal): Entry | undefined {
    const { index, found } = this.search(m, key)
    if (!found) return undefined
    this.modCount++
    return this.sorted.splice(index, 1)[0]
  }

  clear(): void {
    if (!this.sorted.length) return
    this.sorted.length = 0
    this.modCount++
  }

  entries(): readonly Entry[] {
    return this.sorted
  }

  /** The entry for floorKey, ceilingKey, lowerKey and higherKey. */
  nearest(m: Machine, key: JVal, which: 'floor' | 'ceiling' | 'lower' | 'higher'): Entry | undefined {
    const { index, found } = this.search(m, key)
    let at: number
    if (which === 'floor') at = found ? index : index - 1
    else if (which === 'ceiling') at = index
    else if (which === 'lower') at = index - 1
    else at = found ? index + 1 : index
    return this.sorted[at]
  }
}
