import { BOX, type JType, typeName } from '../../lang/types'
import { CollectorVal, OptionalVal, StatsVal, type StreamPrim, StreamVal } from '../streamValues'
import { arrayClassName } from '../text'
import { isSubtype } from '../classes'
import { statsClassName } from './statistics'
import type { Machine } from '../machine'
import {
  Boxed, BuilderVal, ClassRef, EntryVal, FnVal, HeapVal, IterVal, JArray, JObject, JStr, type JVal, ListVal, MapVal, SetVal, ViewVal,
} from '../values'

type Test = (v: JVal) => boolean

const implementing = (name: string): Test => (v) => v instanceof JObject && isSubtype(v.cls, name)
const box = (prim: keyof typeof BOX): Test => (v) => v instanceof Boxed && v.prim === prim
const list = (...kinds: ListVal['kind'][]): Test => (v) => v instanceof ListVal && kinds.includes(v.kind)
const map = (...kinds: MapVal['kind'][]): Test => (v) => v instanceof MapVal && (!kinds.length || kinds.includes(v.kind))
const set = (...kinds: SetVal['kind'][]): Test => (v) => (v instanceof SetVal && (!kinds.length || kinds.includes(v.kind))) || (!kinds.length && v instanceof ViewVal && v.part !== 'values')
const collection: Test = (v) => v instanceof ListVal || v instanceof HeapVal || v instanceof SetVal || v instanceof ViewVal
const stream = (prim: StreamPrim): Test => (v) => v instanceof StreamVal && v.prim === prim
const optional = (kind: OptionalVal['kind']): Test => (v) => v instanceof OptionalVal && v.kind === kind
const functional = (name: string): Test => (v) => v instanceof FnVal || implementing(name)(v)

const FUNCTIONAL = [
  'Comparator', 'Runnable', 'Function', 'BiFunction', 'Predicate', 'BiPredicate', 'Consumer', 'BiConsumer', 'Supplier', 'UnaryOperator',
  'BinaryOperator', 'IntBinaryOperator', 'IntUnaryOperator', 'IntPredicate', 'IntFunction', 'ToIntFunction', 'ToLongFunction',
  'ToDoubleFunction', 'IntConsumer', 'Callable', 'IntSupplier', 'LongSupplier', 'DoubleSupplier', 'BooleanSupplier', 'ObjIntConsumer',
  'IntToLongFunction', 'IntToDoubleFunction', 'LongUnaryOperator', 'LongBinaryOperator', 'DoubleUnaryOperator', 'DoubleBinaryOperator',
  'LongFunction', 'DoubleFunction', 'ToIntBiFunction',
]

const BUILTIN: Readonly<Record<string, Test>> = {
  Object: () => true,
  String: (v) => v instanceof JStr,
  CharSequence: (v) => v instanceof JStr || v instanceof BuilderVal,
  Comparable: (v) => v instanceof JStr || v instanceof Boxed || implementing('Comparable')(v),
  Number: (v) => v instanceof Boxed && v.prim !== 'char' && v.prim !== 'boolean',
  Integer: box('int'),
  Long: box('long'),
  Double: box('double'),
  Float: box('float'),
  Short: box('short'),
  Byte: box('byte'),
  Character: box('char'),
  Boolean: box('boolean'),
  StringBuilder: (v) => v instanceof BuilderVal,
  List: list('ArrayList', 'LinkedList', 'Stack', 'List'),
  ArrayList: list('ArrayList'),
  LinkedList: list('LinkedList'),
  Stack: list('Stack'),
  Vector: list('Stack'),
  Deque: list('LinkedList', 'ArrayDeque'),
  ArrayDeque: list('ArrayDeque'),
  Queue: (v) => list('LinkedList', 'ArrayDeque')(v) || v instanceof HeapVal,
  PriorityQueue: (v) => v instanceof HeapVal,
  Collection: collection,
  Iterable: (v) => collection(v) || implementing('Iterable')(v),
  Map: map(),
  HashMap: map('HashMap', 'LinkedHashMap'),
  LinkedHashMap: map('LinkedHashMap'),
  TreeMap: map('TreeMap'),
  EnumMap: map('EnumMap'),
  SortedMap: map('TreeMap'),
  NavigableMap: map('TreeMap'),
  Set: set(),
  HashSet: set('HashSet', 'LinkedHashSet'),
  LinkedHashSet: set('LinkedHashSet'),
  TreeSet: set('TreeSet'),
  EnumSet: set('EnumSet'),
  SortedSet: set('TreeSet'),
  NavigableSet: set('TreeSet'),
  'Map.Entry': (v) => v instanceof EntryVal,
  Entry: (v) => v instanceof EntryVal,
  Iterator: (v) => v instanceof IterVal || implementing('Iterator')(v),
  Stream: stream(null),
  IntStream: stream('int'),
  LongStream: stream('long'),
  DoubleStream: stream('double'),
  Optional: optional('Optional'),
  OptionalInt: optional('OptionalInt'),
  OptionalLong: optional('OptionalLong'),
  OptionalDouble: optional('OptionalDouble'),
  Collector: (v) => v instanceof CollectorVal,
  IntSummaryStatistics: (v) => v instanceof StatsVal && v.prim === 'int',
  LongSummaryStatistics: (v) => v instanceof StatsVal && v.prim === 'long',
  DoubleSummaryStatistics: (v) => v instanceof StatsVal && v.prim === 'double',
  ...Object.fromEntries(FUNCTIONAL.map((name) => [name, functional(name)])),
}

/** Is `name` a class or interface the runtime knows, rather than a type parameter such as `T`? */
export const isKnownType = (m: Machine, name: string): boolean => name in BUILTIN || !!m.classes.resolve(name, m.frame?.cls ?? null)

function arrayMatches(actual: JType, wanted: JType): boolean {
  if (wanted.t === 'array') return actual.t === 'array' && arrayMatches(actual.of, wanted.of)
  if (wanted.t === 'prim' || actual.t === 'prim') return actual.t === wanted.t && typeName(actual) === typeName(wanted)
  return true
}

/** `v instanceof type`, and the check a reference cast makes. Unknown names (type parameters) accept anything. */
export function instanceOfType(m: Machine, v: JVal, type: JType): boolean {
  if (type.t === 'array') return v instanceof JArray && arrayMatches(v.type, type)
  if (type.t !== 'ref') return false
  const cls = m.classes.resolve(type.name, m.frame?.cls ?? null)
  if (cls) return v instanceof JObject && isSubtype(v.cls, cls.name)
  return BUILTIN[type.name]?.(v) ?? true
}

const LANG = new Set(['String', 'Integer', 'Long', 'Double', 'Float', 'Short', 'Byte', 'Character', 'Boolean', 'StringBuilder'])

/** `value.getClass()` for a built-in value: its simple name, and the qualified name getName() reports. */
export function builtinClass(v: JVal): ClassRef {
  if (v instanceof JArray) return new ClassRef(typeName(v.type), null, arrayClassName(v.type))
  const qualified = runtimeClassName(v)
  return new ClassRef(qualified.slice(qualified.lastIndexOf('.') + 1), null, qualified)
}

/** A value's class as Java names it in ClassCastException messages. */
export function runtimeClassName(v: JVal): string {
  let name: string
  if (v instanceof JStr) name = 'String'
  else if (v instanceof Boxed) name = BOX[v.prim]
  else if (v instanceof BuilderVal) name = 'StringBuilder'
  else if (v instanceof JArray) return typeName(v.type)
  else if (v instanceof JObject) return v.cls.name
  else if (v instanceof ListVal) return `java.util.${v.kind === 'List' ? 'ImmutableCollections$ListN' : v.kind}`
  else if (v instanceof MapVal) return `java.util.${v.kind}`
  else if (v instanceof SetVal) return `java.util.${v.kind}`
  else if (v instanceof HeapVal) return 'java.util.PriorityQueue'
  else if (v instanceof OptionalVal) return `java.util.${v.kind}`
  else if (v instanceof StatsVal) return `java.util.${statsClassName(v)}`
  else return typeof v === 'object' && v ? v.constructor.name : String(v)
  return LANG.has(name) ? `java.lang.${name}` : name
}
