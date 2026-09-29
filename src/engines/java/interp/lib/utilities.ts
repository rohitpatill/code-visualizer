import { convert, zeroOf } from '../convert'
import { CompileStop, Fault } from '../errors'
import type { Machine } from '../machine'
import { VOID, boolR, intR, refR, strR } from '../ops'
import { valueText } from '../text'
import { EntryVal, JArray, type JVal, ListVal, MapVal, type R, SetVal } from '../values'
import { checkIndex, element, intArg, noMethod } from './common'
import { compareWith, javaEquals, javaHash } from './equality'
import { reversed } from './functional'
import { itemsOf } from './iteration'
import { immutableList } from './lists'
import { immutableMap } from './maps'
import { writable } from './sequences'
import { immutableSet } from './sets'
import { javaSort, sortPrimitives } from './sorting'
import { HashStore } from './stores'
import { arrayStream } from './streamSources'

function arrayArg(r: R | undefined, what: string): JArray {
  const v = r?.value
  if (v instanceof JArray) return v
  if (v === null) throw new Fault('NullPointerException', `${what}: the array is null`)
  throw new CompileStop(`${what} needs an array`)
}

const isPrimArray = (a: JArray) => a.type.of.t === 'prim'

/** Elements of an array as values that can be compared, hashed and printed. */
const elementR = (a: JArray, v: JVal): R => ({ type: a.type.of, value: v })

function arrayText(m: Machine, a: JVal, deep: boolean): string {
  if (!(a instanceof JArray)) return valueText(m, a)
  return `[${a.items.map((v) => (deep && v instanceof JArray ? arrayText(m, v, true) : valueText(m, v, a.type.of))).join(', ')}]`
}

function rangeArgs(a: JArray, args: readonly R[], from: number, what: string): [number, number] {
  if (args.length <= from) return [0, a.items.length]
  const lo = intArg(args[from], what)
  const hi = intArg(args[from + 1], what)
  if (lo > hi) throw new Fault('IllegalArgumentException', `fromIndex(${lo}) > toIndex(${hi})`)
  if (lo < 0) throw new Fault('ArrayIndexOutOfBoundsException', `Array index out of range: ${lo}`)
  if (hi > a.items.length) throw new Fault('ArrayIndexOutOfBoundsException', `Array index out of range: ${hi}`)
  return [lo, hi]
}

function binarySearch(m: Machine, a: JArray, lo0: number, hi0: number, key: R): number {
  let lo = lo0
  let hi = hi0 - 1
  const k = element(m, elementR(a, convert(m, key, a.type.of)))
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const c = compareWith(m, null, element(m, elementR(a, a.items[mid]!)), k)
    if (c < 0) lo = mid + 1
    else if (c > 0) hi = mid - 1
    else return mid
  }
  return -(lo + 1)
}

/** `Arrays.asList(1, 2, 3)` makes a fixed-size list; `Arrays.asList(array)` wraps that array, so writes go through to it. */
function asList(args: readonly R[], m: Machine): ListVal {
  const only = args.length === 1 ? args[0]!.value : undefined
  if (only instanceof JArray && !isPrimArray(only)) return new ListVal('List', only.items, [], 'fixed')
  return new ListVal('List', args.map((a) => element(m, a)), [], 'fixed')
}

function arraysStatic(m: Machine, name: string, args: readonly R[]): R {
  if (name === 'asList') return refR(asList(args, m))
  const a = arrayArg(args[0], `Arrays.${name}`)
  switch (name) {
    case 'toString':
      return strR(arrayText(m, a, false))
    case 'deepToString':
      return strR(arrayText(m, a, true))
    case 'sort': {
      const cmp = args.length === 2 || args.length === 4 ? args[args.length - 1]!.value : null
      const [lo, hi] = rangeArgs(a, args.length >= 3 ? args : [], 1, 'Arrays.sort')
      if (isPrimArray(a)) sortPrimitives(a.items, lo, hi)
      else javaSort(m, a.items, cmp, lo, hi)
      return VOID
    }
    case 'fill': {
      const [lo, hi] = rangeArgs(a, args.length === 4 ? args : [], 1, 'Arrays.fill')
      const value = convert(m, args[args.length - 1]!, a.type.of)
      a.items.fill(value, lo, hi)
      return VOID
    }
    case 'copyOf':
    case 'copyOfRange': {
      const from = name === 'copyOf' ? 0 : intArg(args[1], name)
      const to = name === 'copyOf' ? intArg(args[1], name) : intArg(args[2], name)
      if (name === 'copyOf' && to < 0) throw new Fault('NegativeArraySizeException', String(to))
      if (from > to) throw new Fault('IllegalArgumentException', `${from} > ${to}`)
      if (from < 0 || from > a.items.length) throw new Fault('ArrayIndexOutOfBoundsException', `Array index out of range: ${from}`)
      const items = Array.from({ length: to - from }, (_, i) => (from + i < a.items.length ? a.items[from + i]! : zeroOf(a.type.of)))
      return refR(new JArray(a.type, items), a.type)
    }
    case 'equals':
    case 'deepEquals': {
      const b = args[1]!.value
      if (!(b instanceof JArray)) return boolR(false)
      const same = a.items.length === b.items.length && a.items.every((x, i) => javaEquals(m, element(m, elementR(a, x)), element(m, elementR(b, b.items[i]!))))
      return boolR(same)
    }
    case 'hashCode':
      return intR(a.items.reduce<number>((h, x) => (Math.imul(31, h) + javaHash(m, element(m, elementR(a, x)))) | 0, 1))
    case 'binarySearch': {
      const [lo, hi] = args.length === 4 ? rangeArgs(a, args, 1, name) : [0, a.items.length]
      return intR(binarySearch(m, a, lo, hi, args[args.length - 1]!))
    }
    case 'stream':
      return arrayStream(args)
    default:
      throw noMethod('Arrays', name)
  }
}

function listArg(r: R | undefined, what: string): ListVal {
  const v = r?.value
  if (v instanceof ListVal) return v
  if (v === null) throw new Fault('NullPointerException')
  throw new CompileStop(`${what} needs a List`)
}

function extreme(m: Machine, name: 'max' | 'min', args: readonly R[]): R {
  const items = itemsOf(m, args[0]!, `Collections.${name}`)
  if (!items.length) throw new Fault('NoSuchElementException')
  const cmp = args[1]?.value ?? null
  return refR(items.reduce((best, x) => ((name === 'max' ? compareWith(m, cmp, x, best) > 0 : compareWith(m, cmp, x, best) < 0) ? x : best)))
}

function collectionsStatic(m: Machine, name: string, args: readonly R[]): R {
  switch (name) {
    case 'sort': {
      const list = listArg(args[0], name)
      writable(list, false)
      javaSort(m, list.items, args[1]?.value ?? null)
      list.modCount++
      return VOID
    }
    case 'reverse': {
      const list = listArg(args[0], name)
      writable(list, false)
      list.items.reverse()
      return VOID
    }
    case 'swap': {
      const list = listArg(args[0], name)
      const i = checkIndex(intArg(args[1], name), list.items.length)
      const j = checkIndex(intArg(args[2], name), list.items.length)
      ;[list.items[i], list.items[j]] = [list.items[j]!, list.items[i]!]
      return VOID
    }
    case 'shuffle': {
      const items = listArg(args[0], name).items
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[items[i], items[j]] = [items[j]!, items[i]!]
      }
      return VOID
    }
    case 'fill': {
      const list = listArg(args[0], name)
      list.items.fill(element(m, args[1]!))
      return VOID
    }
    case 'max':
    case 'min':
      return extreme(m, name, args)
    case 'frequency': {
      const target = element(m, args[1]!)
      return intR(itemsOf(m, args[0]!, name).filter((x) => javaEquals(m, target, x)).length)
    }
    case 'reverseOrder':
      return refR(reversed(args[0]?.value ?? null))
    case 'nCopies':
      return refR(immutableList(Array.from({ length: intArg(args[0], name) }, () => element(m, args[1]!)), true))
    case 'emptyList':
      return refR(immutableList([]))
    case 'singletonList':
      return refR(immutableList([element(m, args[0]!)], true))
    case 'emptySet':
      return refR(immutableSet(m, []))
    case 'singleton':
      return refR(immutableSet(m, [element(m, args[0]!)]))
    case 'emptyMap':
      return refR(immutableMap(m, []))
    case 'unmodifiableList':
    case 'unmodifiableCollection': {
      const list = listArg(args[0], name)
      return refR(new ListVal('List', list.items, list.args, 'immutable'))
    }
    case 'unmodifiableSet': {
      const set = args[0]!.value as SetVal
      return refR(new SetVal(set.kind, set.store, set.args, true))
    }
    case 'unmodifiableMap': {
      const map = args[0]!.value as MapVal
      return refR(new MapVal(map.kind, map.store, map.args, true))
    }
    case 'addAll': {
      const target = args[0]!.value
      const added = args.slice(1).map((a) => element(m, a))
      if (target instanceof SetVal) return boolR(added.map((v) => !target.store.put(m, v, null)).some(Boolean))
      const list = listArg(args[0], name)
      writable(list, true)
      list.items.push(...added)
      list.modCount++
      return boolR(added.length > 0)
    }
    default:
      throw noMethod('Collections', name)
  }
}

function factoryStatic(m: Machine, cls: 'List' | 'Set' | 'Map', name: string, args: readonly R[]): R {
  const values = () => (args.length === 1 && args[0]!.value instanceof JArray ? (args[0]!.value as JArray).items : args.map((a) => element(m, a)))
  if (cls === 'List' && name === 'of') return refR(immutableList(values()))
  if (cls === 'Set' && name === 'of') return refR(immutableSet(m, values()))
  if (name === 'copyOf') {
    const items = cls === 'Map' ? [] : itemsOf(m, args[0]!, `${cls}.copyOf`)
    if (cls === 'List') return refR(immutableList(items))
    if (cls === 'Set') {
      const store = new HashStore(true)
      for (const v of items) store.put(m, v, null)
      return refR(new SetVal('Set', store, [], true))
    }
    return refR(immutableMap(m, (args[0]!.value as MapVal).store.entries(m).map((e) => [e.key, e.value])))
  }
  if (cls === 'Map' && name === 'of') {
    const pairs: [JVal, JVal][] = []
    for (let i = 0; i + 1 < args.length; i += 2) pairs.push([element(m, args[i]!), element(m, args[i + 1]!)])
    return refR(immutableMap(m, pairs))
  }
  if (cls === 'Map' && name === 'entry') return refR(new EntryVal({ key: element(m, args[0]!), value: element(m, args[1]!), hash: 0, seq: 0 }))
  if (cls === 'Map' && name === 'ofEntries') {
    return refR(immutableMap(m, args.map((a) => [(a.value as EntryVal).entry.key, (a.value as EntryVal).entry.value])))
  }
  throw noMethod(cls, name)
}

/** Arrays, Collections, and the List.of / Set.of / Map.of factories. */
export function utilityStatic(m: Machine, cls: string, name: string, args: readonly R[]): R {
  if (cls === 'Arrays') return arraysStatic(m, name, args)
  if (cls === 'Collections') return collectionsStatic(m, name, args)
  return factoryStatic(m, cls as 'List' | 'Set' | 'Map', name, args)
}
