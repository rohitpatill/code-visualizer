import type { JType } from '../../lang/types'
import { invokeCallable } from '../calls'
import { CompileStop, Fault } from '../errors'
import type { Machine } from '../machine'
import { VOID, boolR, intR, isRawPrim, refR, truthy } from '../ops'
import { valueText } from '../text'
import { type EntryVal, type JVal, MapVal, type R, ViewVal, entryVal } from '../values'
import { arity, element, intArg, noMethod } from './common'
import { compareWith, javaEquals, javaHash } from './equality'
import { cursorOf } from './iteration'
import { unsupported } from './sequences'
import { HashStore, TreeStore } from './stores'

const noSuchElement = () => new Fault('NoSuchElementException')

function writable(map: MapVal): void {
  if (map.immutable) throw unsupported()
}

function put(m: Machine, map: MapVal, key: JVal, value: JVal, first = false): JVal {
  writable(map)
  return map.store.put(m, key, value, first)?.value ?? null
}

function remove(m: Machine, map: MapVal, key: JVal): JVal {
  writable(map)
  return map.store.remove(m, key)?.value ?? null
}

/** `new HashMap<>()`, `new TreeMap<>(comparator)`, `new LinkedHashMap<>(other)` and the other constructors. */
export function constructMap(m: Machine, kind: MapVal['kind'], typeArgs: JType[], args: readonly R[]): R {
  arity(`new ${kind}`, args, 0, 3)
  const [a] = args
  const source = a?.value instanceof MapVal ? a.value : null
  let map: MapVal
  if (kind === 'TreeMap') {
    const cmp = source?.store instanceof TreeStore ? source.store.cmp : source ? null : (a?.value ?? null)
    map = new MapVal(kind, new TreeStore(cmp), typeArgs)
  } else {
    if (a && isRawPrim(a) && intArg(a, kind) < 0) throw new Fault('IllegalArgumentException', `Illegal initial capacity: ${intArg(a, kind)}`)
    const accessOrder = kind === 'LinkedHashMap' && args[2]?.value === true
    const store = new HashStore(kind === 'LinkedHashMap', a && isRawPrim(a) ? intArg(a, kind) : undefined, accessOrder)
    if (source) store.reserve(source.store.size)
    map = new MapVal(kind, store, typeArgs)
  }
  if (source) for (const e of source.store.entries(m)) map.store.put(m, e.key, e.value)
  return refR(map, { t: 'ref', name: kind, args: typeArgs })
}

/** Map.of and Map.entry-style immutable maps. Java randomizes Map.of's order per run; insertion order is shown. */
export function immutableMap(m: Machine, pairs: readonly [JVal, JVal][]): MapVal {
  const store = new HashStore(true)
  for (const [k, v] of pairs) {
    if (k === null || v === null) throw new Fault('NullPointerException')
    if (store.put(m, k, v)) throw new Fault('IllegalArgumentException', `duplicate key: ${valueText(m, k)}`)
  }
  return new MapVal('Map', store, [], true)
}

function computeMethod(m: Machine, map: MapVal, name: string, args: readonly R[]): R | null {
  const key = args[0] ? element(m, args[0]) : null
  const current = () => map.store.find(m, key)?.value ?? null
  const settle = (v: JVal): R => {
    if (v === null) remove(m, map, key)
    else put(m, map, key, v, true)
    return refR(v)
  }
  switch (name) {
    case 'computeIfAbsent': {
      const old = current()
      if (old !== null) return refR(old)
      const v = element(m, invokeCallable(m, args[1]!.value, [refR(key)], 'apply'))
      if (v !== null) put(m, map, key, v, true)
      return refR(v)
    }
    case 'computeIfPresent': {
      const old = current()
      if (old === null) return refR(null)
      return settle(element(m, invokeCallable(m, args[1]!.value, [refR(key), refR(old)], 'apply')))
    }
    case 'compute':
      return settle(element(m, invokeCallable(m, args[1]!.value, [refR(key), refR(current())], 'apply')))
    case 'merge': {
      const old = current()
      const value = element(m, args[1]!)
      return settle(old === null ? value : element(m, invokeCallable(m, args[2]!.value, [refR(old), refR(value)], 'apply')))
    }
    default:
      return null
  }
}

function treeMethod(m: Machine, map: MapVal, name: string, args: readonly R[]): R | null {
  const store = map.store
  if (!(store instanceof TreeStore)) return null
  const entries = store.entries()
  const edge = (last: boolean) => (last ? entries[entries.length - 1] : entries[0])
  switch (name) {
    case 'firstKey':
    case 'lastKey': {
      const e = edge(name === 'lastKey')
      if (!e) throw noSuchElement()
      return refR(e.key)
    }
    case 'firstEntry':
    case 'lastEntry': {
      const e = edge(name === 'lastEntry')
      return refR(e ? entryVal(e) : null)
    }
    case 'pollFirstEntry':
    case 'pollLastEntry': {
      const e = edge(name === 'pollLastEntry')
      if (!e) return refR(null)
      store.remove(m, e.key)
      return refR(entryVal(e))
    }
    case 'floorKey':
    case 'ceilingKey':
    case 'lowerKey':
    case 'higherKey':
      return refR(store.nearest(m, element(m, args[0]!), name.slice(0, -3) as 'floor')?.key ?? null)
    case 'floorEntry':
    case 'ceilingEntry':
    case 'lowerEntry':
    case 'higherEntry': {
      const e = store.nearest(m, element(m, args[0]!), name.slice(0, -5) as 'floor')
      return refR(e ? entryVal(e) : null)
    }
    case 'headMap':
    case 'tailMap': {
      const bound = element(m, args[0]!)
      const inclusive = args[1] ? truthy(args[1]) : name === 'tailMap'
      const copy = new MapVal('TreeMap', new TreeStore(store.cmp), map.args)
      for (const e of entries) {
        const c = compareWith(m, store.cmp, e.key, bound)
        if ((name === 'headMap' ? c < 0 : c > 0) || (inclusive && c === 0)) copy.store.put(m, e.key, e.value)
      }
      return refR(copy)
    }
    default:
      return null
  }
}

export function mapMethod(m: Machine, map: MapVal, name: string, args: readonly R[]): R {
  const store = map.store
  const arg = (i: number) => {
    if (!args[i]) throw new CompileStop(`${map.kind}.${name} is missing an argument`)
    return element(m, args[i])
  }
  switch (name) {
    case 'put':
      arity(name, args, 2)
      return refR(put(m, map, arg(0), arg(1)))
    case 'get':
    case 'getOrDefault': {
      arity(name, args, name === 'get' ? 1 : 2)
      const e = store.find(m, arg(0))
      if (e && store instanceof HashStore) store.access(e)
      return e ? refR(e.value) : name === 'get' ? refR(null) : args[1]!
    }
    case 'containsKey':
      return boolR(!!store.find(m, arg(0)))
    case 'containsValue':
      return boolR(store.entries(m).some((e) => javaEquals(m, arg(0), e.value)))
    case 'remove':
      if (args.length === 2) {
        const e = store.find(m, arg(0))
        if (!e || !javaEquals(m, arg(1), e.value)) return boolR(false)
        remove(m, map, e.key)
        return boolR(true)
      }
      return refR(remove(m, map, arg(0)))
    case 'putIfAbsent': {
      const e = store.find(m, arg(0))
      if (e?.value != null) return refR(e.value)
      return refR(put(m, map, arg(0), arg(1)))
    }
    case 'replace': {
      const e = store.find(m, arg(0))
      return refR(e ? put(m, map, e.key, arg(1)) : null)
    }
    case 'putAll': {
      const source = args[0]!.value
      if (!(source instanceof MapVal)) throw new CompileStop('putAll needs a Map')
      writable(map)
      if (store instanceof HashStore) store.reserve(source.store.size)
      for (const e of source.store.entries(m)) store.put(m, e.key, e.value)
      return VOID
    }
    case 'size':
      return intR(store.size)
    case 'isEmpty':
      return boolR(store.size === 0)
    case 'clear':
      writable(map)
      store.clear()
      return VOID
    case 'keySet':
    case 'navigableKeySet':
      return refR(new ViewVal(map, 'keys'))
    case 'values':
      return refR(new ViewVal(map, 'values'))
    case 'entrySet':
      return refR(new ViewVal(map, 'entries'))
    case 'forEach': {
      const cursor = cursorOf(m, new ViewVal(map, 'entries'))!
      while (cursor.hasNext()) {
        const e = (cursor.next() as EntryVal).entry
        invokeCallable(m, args[0]!.value, [refR(e.key), refR(e.value)], 'accept')
      }
      return VOID
    }
    case 'equals':
      return boolR(javaEquals(m, map, arg(0)))
    case 'hashCode':
      return intR(javaHash(m, map))
    case 'toString':
      return refR(m.intern(valueText(m, map)))
    default: {
      const result = computeMethod(m, map, name, args) ?? treeMethod(m, map, name, args)
      if (!result) throw noMethod(map.kind, name)
      return result
    }
  }
}
