import type { RefType } from '../../lang/types'
import { CompileStop } from '../errors'
import type { Machine } from '../machine'
import { refR } from '../ops'
import {
  Boxed, BuilderVal, EntryVal, FnVal, HeapVal, IterVal, JArray, JStr, ListVal, MapVal, NativeObj, type R, SetVal, ViewVal,
} from '../values'
import { element, noMethod } from './common'
import { builtinClass } from './types'
import { javaEquals, javaHash } from './equality'
import { OptionalVal, StatsVal, StreamVal } from '../streamValues'
import { collectorsStatic } from './collectors'
import { constructEnumMap, enumSetStatic } from './enumCollections'
import { optionalMethod, optionalStatic } from './optionals'
import { newStats, statsMethod } from './statistics'
import { isStreamClass, streamStatic } from './streamSources'
import { streamMethod } from './streams'
import { javaFormat } from './format'
import { IDENTITY, comparatorStatic, entryStatic, fnMethod } from './functional'
import { constructHeap, heapMethod } from './heaps'
import { constructNative, nativeMethod, systemIn, systemOut } from './io'
import { constructList, listMethod } from './lists'
import { constructMap, mapMethod } from './maps'
import { newRandom, randomMethod } from './random'
import { constructSet, setMethod } from './sets'
import { builderMethod, newBuilder } from './builder'
import { newString, stringMethod, stringStatic } from './strings'
import { MATH_CONSTANTS, systemClassStatic } from './system'
import { utilityStatic } from './utilities'
import { entryMethod, viewMethod } from './views'
import { WRAPPER_CONSTANTS, boxedMethod, wrapperStatic } from './wrappers'

const WRAPPERS = new Set(['Integer', 'Long', 'Double', 'Float', 'Short', 'Byte', 'Character', 'Boolean'])
const SYSTEM = new Set(['Math', 'StrictMath', 'Objects', 'System', 'Thread'])
const UTILITIES = new Set(['Arrays', 'Collections', 'List', 'Set', 'Map'])
const OPTIONALS = new Set(['Optional', 'OptionalInt', 'OptionalLong', 'OptionalDouble'] as const)
const FUNCTIONS = new Set(['Function', 'UnaryOperator'])
const ENTRY = new Set(['Map.Entry', 'Entry'])
const OTHER_STATICS = new Set(['String', 'Comparator', 'EnumSet', 'Collectors'])

/** Built-in classes whose static members a program may name, as in `Math.max` or `Integer.MAX_VALUE`. */
export const isLibClass = (name: string): boolean =>
  WRAPPERS.has(name) || SYSTEM.has(name) || UTILITIES.has(name) || OTHER_STATICS.has(name) || isStreamClass(name) || OPTIONALS.has(name as 'Optional') ||
  FUNCTIONS.has(name) || ENTRY.has(name)

export function libStaticField(m: Machine, cls: string, name: string): R {
  if (cls === 'System' && (name === 'out' || name === 'err')) return refR(systemOut)
  if (cls === 'System' && name === 'in') return refR(systemIn)
  if (cls === 'Boolean' && (name === 'TRUE' || name === 'FALSE')) return refR(m.box('boolean', name === 'TRUE'))
  const constant = (cls === 'Math' ? MATH_CONSTANTS : WRAPPER_CONSTANTS[cls])?.[name]
  if (!constant) throw new CompileStop(`cannot find symbol: variable ${name} in class ${cls}`)
  return constant
}

export function callLibStatic(m: Machine, cls: string, name: string, args: readonly R[]): R {
  if (WRAPPERS.has(cls)) return wrapperStatic(m, cls, name, args)
  if (SYSTEM.has(cls)) return systemClassStatic(m, cls, name, args)
  if (UTILITIES.has(cls)) return utilityStatic(m, cls, name, args)
  if (cls === 'String') return stringStatic(m, name, args, (format, rest) => javaFormat(m, format, rest))
  if (cls === 'Comparator') return comparatorStatic(name, args)
  if (cls === 'EnumSet') return enumSetStatic(m, name, args)
  if (cls === 'Collectors') return collectorsStatic(m, name, args)
  if (isStreamClass(cls)) return streamStatic(m, cls, name, args)
  if (OPTIONALS.has(cls as 'Optional')) return optionalStatic(m, cls as 'Optional', name, args)
  if (FUNCTIONS.has(cls) && name === 'identity' && !args.length) return refR(IDENTITY)
  if (ENTRY.has(cls)) return entryStatic(name, args)
  throw noMethod(cls, name)
}

const LISTS = { ArrayList: 'ArrayList', LinkedList: 'LinkedList', ArrayDeque: 'ArrayDeque', Stack: 'Stack', Vector: 'ArrayList' } as const
const MAPS = new Set(['HashMap', 'LinkedHashMap', 'TreeMap'] as const)
const SETS = new Set(['HashSet', 'LinkedHashSet', 'TreeSet'] as const)

/** `new` for a built-in class. */
export function constructLib(m: Machine, type: RefType, args: readonly R[]): R {
  const name = type.name
  if (name in LISTS) return constructList(m, LISTS[name as keyof typeof LISTS], type.args, args)
  if (name === 'PriorityQueue') return constructHeap(m, type.args, args)
  if (name === 'EnumMap') return constructEnumMap(m, type.args, args)
  if (MAPS.has(name as 'HashMap')) return constructMap(m, name as 'HashMap', type.args, args)
  if (SETS.has(name as 'HashSet')) return constructSet(m, name as 'HashSet', type.args, args)
  if (name === 'StringBuilder' || name === 'StringBuffer') return newBuilder(m, args)
  if (name === 'String') return newString(m, args)
  if (WRAPPERS.has(name) && args.length === 1) {
    const boxed = element(m, args[0]!) as Boxed
    return refR(new Boxed(boxed.prim, boxed.v))
  }
  if (name === 'AbstractMap.SimpleEntry' || name === 'SimpleEntry') {
    return refR(new EntryVal({ key: element(m, args[0]!), value: element(m, args[1]!), hash: 0, seq: 0 }))
  }
  if (name === 'Random') return newRandom(args)
  const stats = newStats(name)
  if (stats) return stats
  const native = constructNative(m, name, args)
  if (native) return native
  throw new CompileStop(`cannot find symbol: class ${name} (it is not declared, or not supported by the visualizer yet)`)
}

function iteratorMethod(it: IterVal, name: string): R {
  switch (name) {
    case 'hasNext':
      return { type: { t: 'prim', name: 'boolean' }, value: it.cursor.hasNext() }
    case 'next':
      return refR(it.cursor.next())
    case 'remove':
      it.cursor.remove()
      return { type: { t: 'void' }, value: null }
    default:
      throw noMethod('Iterator', name)
  }
}

function arrayMethod(m: Machine, a: JArray, name: string, args: readonly R[]): R {
  if (name === 'clone') return refR(new JArray(a.type, [...a.items]), a.type)
  if (name === 'equals') return { type: { t: 'prim', name: 'boolean' }, value: a === args[0]!.value }
  if (name === 'hashCode') return { type: { t: 'prim', name: 'int' }, value: javaHash(m, a) }
  throw noMethod('array', name)
}

/** A method called on a value of a built-in type. */
export function callLibMethod(m: Machine, target: R, name: string, args: readonly R[]): R {
  const v = target.value
  if (name === 'getClass' && !args.length && typeof v === 'object' && v !== null) return refR(builtinClass(v))
  if (v instanceof JStr) return stringMethod(m, v, name, args)
  if (v instanceof Boxed) return boxedMethod(m, v, name, args)
  if (v instanceof ListVal) return listMethod(m, v, name, args)
  if (v instanceof HeapVal) return heapMethod(m, v, name, args)
  if (v instanceof MapVal) return mapMethod(m, v, name, args)
  if (v instanceof SetVal) return setMethod(m, v, name, args)
  if (v instanceof ViewVal) return viewMethod(m, v, name, args)
  if (v instanceof EntryVal) return entryMethod(m, v, name, args)
  if (v instanceof BuilderVal) return builderMethod(m, v, name, args)
  if (v instanceof IterVal) return iteratorMethod(v, name)
  if (v instanceof NativeObj) return v.kind === 'random' ? randomMethod(m, v, name, args) : nativeMethod(m, v, name, args)
  if (v instanceof FnVal) return fnMethod(m, v, name, args)
  if (v instanceof JArray) return arrayMethod(m, v, name, args)
  if (v instanceof StreamVal) return streamMethod(m, v, name, args)
  if (v instanceof OptionalVal) return optionalMethod(m, v, name, args)
  if (v instanceof StatsVal) return statsMethod(m, v, name, args)
  if (name === 'equals' && args[0]) return { type: { t: 'prim', name: 'boolean' }, value: javaEquals(m, element(m, target), element(m, args[0])) }
  throw new CompileStop(`${target.type.t === 'prim' ? target.type.name : 'this value'} cannot be dereferenced`)
}
