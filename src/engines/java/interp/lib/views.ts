import { invokeCallable } from '../calls'
import type { Machine } from '../machine'
import { VOID, boolR, intR, refR, truthy } from '../ops'
import { valueText, viewItems } from '../text'
import { type EntryVal, IterVal, type JVal, type R, type ViewVal } from '../values'
import { element, noMethod } from './common'
import { javaEquals, javaHash } from './equality'
import { cursorOf } from './iteration'
import { unsupported } from './sequences'
import { collectionStream, streamR } from './streamSources'

/** keySet(), values() and entrySet(): live views that read and remove through the map. */
export function viewMethod(m: Machine, view: ViewVal, name: string, args: readonly R[]): R {
  const map = view.map
  const target = () => element(m, args[0]!)
  switch (name) {
    case 'size':
      return intR(map.store.size)
    case 'isEmpty':
      return boolR(map.store.size === 0)
    case 'contains':
      return boolR(view.part === 'keys' ? !!map.store.find(m, target()) : viewItems(m, view).some((x) => javaEquals(m, target(), x)))
    case 'iterator':
      return refR(new IterVal(cursorOf(m, view)!))
    case 'remove':
    case 'removeIf': {
      if (map.immutable) throw unsupported()
      const test = (x: JVal) => (name === 'remove' ? javaEquals(m, target(), x) : truthy(invokeCallable(m, args[0]!.value, [refR(x)], 'test')))
      const entries = map.store.entries(m)
      const drop = viewItems(m, view)
        .map((x, i) => (test(x) ? entries[i]!.key : undefined))
        .filter((k): k is JVal => k !== undefined)
      for (const k of name === 'remove' ? drop.slice(0, 1) : drop) map.store.remove(m, k)
      return boolR(drop.length > 0)
    }
    case 'forEach':
      for (const x of viewItems(m, view)) invokeCallable(m, args[0]!.value, [refR(x)], 'accept')
      return VOID
    case 'toString':
      return refR(m.intern(valueText(m, view)))
    case 'equals':
      return boolR(javaEquals(m, view, args[0]!.value))
    case 'stream':
    case 'parallelStream':
      return streamR(collectionStream(m, view)!)
    default:
      throw noMethod(view.part === 'keys' ? 'Set' : view.part === 'values' ? 'Collection' : 'Set<Map.Entry>', name)
  }
}

export function entryMethod(m: Machine, entry: EntryVal, name: string, args: readonly R[]): R {
  const e = entry.entry
  switch (name) {
    case 'getKey':
      return refR(e.key)
    case 'getValue':
      return refR(e.value)
    case 'setValue': {
      const old = e.value
      e.value = element(m, args[0]!)
      return refR(old)
    }
    case 'equals':
      return boolR(javaEquals(m, entry, args[0]!.value))
    case 'hashCode':
      return intR(javaHash(m, entry))
    case 'toString':
      return refR(m.intern(valueText(m, entry)))
    default:
      throw noMethod('Map.Entry', name)
  }
}
