import type { Input } from '../../shared/input'
import type { Expr, LambdaParam, Stmt } from '../lang/ast'
import type { JType, PrimName } from '../lang/types'
import type { ClassInfo } from './classes'
import type { Machine } from './machine'
import type { Scope } from './scope'

/** A local declared without a value. Reading it is Java's "might not have been initialized" error. */
export const UNINIT = Symbol('uninitialized')

/** A variable, parameter, field or array element: its declared type and what it holds. */
export class Slot {
  private stored: JVal

  constructor(
    public type: JType,
    value: JVal,
  ) {
    this.stored = value
  }

  get value(): JVal {
    return this.stored
  }

  set value(v: JVal) {
    this.stored = v
  }
}

/** java.lang.String. An object, so `==` compares identity as in Java; literals are interned. */
export class JStr {
  constructor(readonly s: string) {}
}

/** Integer, Character and the other wrappers. Small values are cached like Java's, which is why `==` on them can surprise. */
export class Boxed {
  constructor(
    readonly prim: PrimName,
    readonly v: number | bigint | boolean,
  ) {}
}

export class JArray {
  constructor(
    readonly type: Extract<JType, { t: 'array' }>,
    readonly items: JVal[],
  ) {}
}

/** One element of an array as an assignable slot. */
export class ElementSlot extends Slot {
  constructor(
    private readonly array: JArray,
    private readonly index: number,
  ) {
    super(array.type.of, null)
  }

  override get value(): JVal {
    return this.array.items[this.index] ?? null
  }

  override set value(v: JVal) {
    this.array.items[this.index] = v
  }
}

/** An instance of a user or prelude class. Inner and anonymous classes keep their enclosing instance and captured locals. */
export class JObject {
  readonly fields = new Map<string, Slot>()

  constructor(
    readonly cls: ClassInfo,
    readonly outer: JObject | null,
    readonly env: Scope | null,
  ) {}
}

export type ListKind = 'ArrayList' | 'LinkedList' | 'ArrayDeque' | 'Stack' | 'List'

/** ArrayList, LinkedList, ArrayDeque, Stack and the fixed or immutable lists. Deques keep their front at index 0. */
export class ListVal {
  modCount = 0

  constructor(
    readonly kind: ListKind,
    readonly items: JVal[],
    public args: JType[] = [],
    readonly mode: 'mutable' | 'fixed' | 'immutable' = 'mutable',
  ) {}
}

/** java.util.PriorityQueue: a binary heap in an array, kept exactly as Java keeps it. */
export class HeapVal {
  modCount = 0

  constructor(
    readonly items: JVal[],
    readonly cmp: JVal,
    public args: JType[] = [],
  ) {}
}

export interface Entry {
  key: JVal
  value: JVal
  hash: number
  /** Insertion order, for LinkedHashMap and for order inside one hash bucket. */
  seq: number
}

/** The storage behind a map or set: hash buckets or a sorted array. */
export interface Store {
  readonly size: number
  modCount: number
  find(m: Machine, key: JVal): Entry | undefined
  /** Inserts or updates; returns the entry as it was before (undefined if the key is new). */
  put(m: Machine, key: JVal, value: JVal): Entry | undefined
  remove(m: Machine, key: JVal): Entry | undefined
  clear(): void
  /** Entries in iteration order. */
  entries(m: Machine): readonly Entry[]
}

export type MapKind = 'HashMap' | 'LinkedHashMap' | 'TreeMap' | 'Map'
export type SetKind = 'HashSet' | 'LinkedHashSet' | 'TreeSet' | 'Set'

export class MapVal {
  constructor(
    readonly kind: MapKind,
    readonly store: Store,
    public args: JType[] = [],
    readonly immutable = false,
  ) {}
}

export class SetVal {
  constructor(
    readonly kind: SetKind,
    readonly store: Store,
    public args: JType[] = [],
    readonly immutable = false,
  ) {}
}

/** A live `keySet()`, `values()` or `entrySet()` of a map. */
export class ViewVal {
  constructor(
    readonly map: MapVal,
    readonly part: 'keys' | 'values' | 'entries',
  ) {}
}

/** A Map.Entry: reads and writes go to the map. */
export class EntryVal {
  constructor(readonly entry: Entry) {}
}

const entryVals = new WeakMap<Entry, EntryVal>()

/** The one Map.Entry object for a map entry, so it keeps its identity from step to step. */
export function entryVal(entry: Entry): EntryVal {
  let v = entryVals.get(entry)
  if (!v) {
    v = new EntryVal(entry)
    entryVals.set(entry, v)
  }
  return v
}

export class BuilderVal {
  constructor(public s: string) {}
}

export interface Cursor {
  hasNext(): boolean
  next(): JVal
  remove(): void
}

/** An Iterator the program holds. */
export class IterVal {
  constructor(readonly cursor: Cursor) {}
}

/** A class name used as a value, as in `Math.max` or `Solution.helper()`. */
export class ClassRef {
  constructor(
    readonly name: string,
    readonly cls: ClassInfo | null,
  ) {}
}

/** System.out, Scanner, BufferedReader, StringTokenizer, PrintWriter and Random. */
export class NativeObj {
  constructor(
    readonly kind: 'out' | 'in' | 'scanner' | 'reader' | 'tokenizer' | 'writer' | 'random',
    readonly state: { tokens?: string[]; index?: number; source?: Input; buffer?: string[]; autoFlush?: boolean; seed?: bigint },
  ) {}
}

export type FnImpl =
  | { kind: 'lambda'; params: LambdaParam[]; body: Expr | Stmt[]; scope: Scope; self: JObject | null; cls: ClassInfo | null; line: number; endLine: number }
  | { kind: 'native'; call: (m: Machine, args: readonly R[]) => R }

/** A lambda, method reference or built-in comparator. */
export class FnVal {
  constructor(
    readonly impl: FnImpl,
    readonly label: string,
    readonly params: readonly string[],
  ) {}
}

export type JVal =
  | number
  | bigint
  | boolean
  | null
  | typeof UNINIT
  | JStr
  | Boxed
  | JArray
  | JObject
  | ListVal
  | HeapVal
  | MapVal
  | SetVal
  | ViewVal
  | EntryVal
  | BuilderVal
  | IterVal
  | ClassRef
  | NativeObj
  | FnVal

/** An evaluated expression. For primitives `type` is exact; for references the object carries its own class. */
export interface R {
  type: JType
  value: JVal
}
