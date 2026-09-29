import type { Machine } from '../machine'
import type { Entry, JVal, Store } from '../values'
import { compareWith, javaEquals, javaHash } from './equality'

const MAX_CAPACITY = 1 << 30
const LOAD_FACTOR = 0.75

/** HashMap.tableSizeFor: the power of two a requested capacity rounds up to. */
function tableSizeFor(cap: number): number {
  let n = 1
  while (n < cap && n < MAX_CAPACITY) n *= 2
  return n
}

const spread = (h: number) => h ^ (h >>> 16)

/**
 * java.util.HashMap's table, so iteration order matches a real run: buckets
 * in index order for the current table size (which grows exactly as Java's
 * does), each bucket in its own order. put appends to a bucket; merge,
 * compute and computeIfAbsent prepend, as Java's do. A resize splits each
 * bucket in two, keeping order. LinkedHashMap keeps insertion order, or
 * access order when made with accessOrder = true (the LRU cache pattern).
 */
export class HashStore implements Store {
  modCount = 0
  private readonly table = new Map<number, Entry[]>()
  private readonly order = new Set<Entry>()
  private seq = 0
  private capacity = 0
  private threshold: number
  private ordered: Entry[] | null = null

  constructor(
    private readonly linked: boolean,
    initialCapacity?: number,
    private readonly accessOrder = false,
  ) {
    this.threshold = initialCapacity === undefined ? 0 : tableSizeFor(Math.max(initialCapacity, 1))
  }

  get size(): number {
    return this.order.size
  }

  private bucketOf(hash: number): number {
    return spread(hash) & (this.capacity - 1)
  }

  private locate(m: Machine, key: JVal): { hash: number; bucket: Entry[] | undefined; at: number } {
    const hash = javaHash(m, key)
    const bucket = this.capacity ? this.table.get(this.bucketOf(hash)) : undefined
    const at = bucket ? bucket.findIndex((e) => e.hash === hash && (e.key === key || javaEquals(m, key, e.key))) : -1
    return { hash, bucket, at }
  }

  find(m: Machine, key: JVal): Entry | undefined {
    const { bucket, at } = this.locate(m, key)
    return at === -1 ? undefined : bucket![at]
  }

  put(m: Machine, key: JVal, value: JVal, first = false): Entry | undefined {
    const { hash, bucket, at } = this.locate(m, key)
    if (at !== -1) {
      const found = bucket![at]!
      const before = { ...found }
      found.value = value
      this.access(found)
      return before
    }
    if (!this.capacity) this.resize()
    const entry: Entry = { key, value, hash, seq: this.seq++ }
    const index = this.bucketOf(hash)
    const list = this.table.get(index)
    if (!list) this.table.set(index, [entry])
    else if (first) list.unshift(entry)
    else list.push(entry)
    this.order.add(entry)
    this.changed()
    if (this.size > this.threshold) this.resize()
    return undefined
  }

  remove(m: Machine, key: JVal): Entry | undefined {
    const { hash, bucket, at } = this.locate(m, key)
    if (at === -1) return undefined
    const [entry] = bucket!.splice(at, 1)
    if (!bucket!.length) this.table.delete(this.bucketOf(hash))
    this.order.delete(entry!)
    this.changed()
    return entry
  }

  /** A LinkedHashMap in access order moves an entry to the end whenever it is read or written. */
  access(entry: Entry): void {
    if (!this.accessOrder) return
    this.order.delete(entry)
    this.order.add(entry)
    this.changed()
  }

  clear(): void {
    if (!this.size) return
    this.table.clear()
    this.order.clear()
    this.changed()
  }

  entries(): readonly Entry[] {
    if (!this.ordered) {
      this.ordered = this.linked
        ? [...this.order]
        : [...this.table.keys()].sort((a, b) => a - b).flatMap((index) => this.table.get(index)!)
    }
    return this.ordered
  }

  /** HashMap.putAll and the copy constructors grow the table once for everything they add. */
  reserve(count: number): void {
    if (!this.capacity) {
      const wanted = Math.floor(count / LOAD_FACTOR + 1)
      if (wanted > this.threshold) this.threshold = tableSizeFor(wanted)
    } else while (count > this.threshold && this.capacity < MAX_CAPACITY) this.resize()
  }

  private resize(): void {
    const old = this.capacity
    this.capacity = old ? old * 2 : this.threshold || 16
    this.threshold = this.capacity < MAX_CAPACITY ? Math.floor(this.capacity * LOAD_FACTOR) : Number.MAX_SAFE_INTEGER
    if (old) {
      for (const [index, list] of [...this.table]) {
        const high = list.filter((e) => spread(e.hash) & old)
        if (!high.length) continue
        const low = list.filter((e) => !(spread(e.hash) & old))
        if (low.length) this.table.set(index, low)
        else this.table.delete(index)
        this.table.set(index + old, high)
      }
    }
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
