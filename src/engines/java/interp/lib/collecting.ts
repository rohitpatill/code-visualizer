import { callMethod, invokeCallable } from '../calls'
import { toPrim } from '../convert'
import { CompileStop, Fault } from '../errors'
import type { Machine } from '../machine'
import { refR, truthy } from '../ops'
import { type CollectorSpec, PendingVal } from '../streamValues'
import { valueText } from '../text'
import { BuilderVal, JStr, type JVal, ListVal, MapVal, type R, SetVal } from '../values'
import { element } from './common'
import { optionalOf } from './optionals'
import { addCompensated, compensatedTotal } from './statistics'
import { HashStore } from './stores'
import { runtimeClassName } from './types'

/** The building blocks of java.util.stream.Collectors, each written the way the JDK writes it. */

export const call = (m: Machine, fn: JVal, v: JVal, sam = 'apply'): R => invokeCallable(m, fn, [refR(v)], sam)
export const mapped = (m: Machine, fn: JVal, v: JVal): JVal => element(m, call(m, fn, v))

/** The text of a CharSequence, as joining() needs it. */
export function charSequence(v: JVal): string {
  if (v instanceof JStr || v instanceof BuilderVal) return v.s
  throw new Fault('ClassCastException', `class ${runtimeClassName(v)} cannot be cast to class java.lang.CharSequence`)
}

export const toListSpec = (finish: (m: Machine, list: ListVal) => JVal): CollectorSpec => ({
  start: () => new ListVal('ArrayList', []),
  add: (_m, acc, v) => void (acc as ListVal).items.push(v),
  finish: (m, acc) => finish(m, acc as ListVal),
})

export const toSetSpec = (finish: (m: Machine, set: SetVal) => JVal): CollectorSpec => ({
  start: () => new SetVal('HashSet', new HashStore(false)),
  add: (m, acc, v) => void (acc as SetVal).store.put(m, v, null),
  finish: (m, acc) => finish(m, acc as SetVal),
})

export function toMapSpec(args: readonly R[]): CollectorSpec {
  const [keyFn, valueFn, merge, supplier] = args.map((a) => a.value)
  return {
    start: (m) => (supplier ? invokeCallable(m, supplier, [], 'get').value : new MapVal('HashMap', new HashStore(false))),
    add: (m, acc, v) => {
      const map = refR(acc as JVal)
      const key = mapped(m, keyFn!, v)
      const value = mapped(m, valueFn!, v)
      if (merge !== undefined) {
        callMethod(m, map, 'merge', [refR(key), refR(value), refR(merge)])
        return
      }
      if (value === null) throw new Fault('NullPointerException')
      const old = callMethod(m, map, 'putIfAbsent', [refR(key), refR(value)]).value
      if (old !== null) {
        throw new Fault('IllegalStateException', `Duplicate key ${valueText(m, key)} (attempted merging values ${valueText(m, old)} and ${valueText(m, value)})`)
      }
    },
    finish: (_m, acc) => acc as JVal,
  }
}

/** groupingBy: one downstream container per key, made with computeIfAbsent (so new keys go to the head of their bucket). */
export function groupingSpec(classifier: JVal, factory: JVal | null, down: CollectorSpec): CollectorSpec {
  return {
    start: (m) => (factory ? invokeCallable(m, factory, [], 'get').value : new MapVal('HashMap', new HashStore(false))),
    add: (m, acc, v) => {
      const map = acc as JVal
      if (!(map instanceof MapVal)) throw new CompileStop('groupingBy needs a factory that makes a built-in Map')
      const key = mapped(m, classifier, v)
      if (key === null) throw new Fault('NullPointerException', 'element cannot be mapped to a null key')
      let pending = map.store.find(m, key)?.value as PendingVal | undefined
      if (!pending) {
        pending = new PendingVal(down.start(m))
        map.store.put(m, key, pending, true)
      }
      down.add(m, pending.acc, v)
    },
    finish: (m, acc) => {
      const map = acc as MapVal
      for (const e of map.store.entries(m)) e.value = down.finish(m, (e.value as PendingVal).acc)
      return map
    },
  }
}

/** partitioningBy: Java's Partition map, which always has both keys and prints false first. */
export function partitionSpec(test: JVal, down: CollectorSpec): CollectorSpec {
  return {
    start: (m) => ({ yes: down.start(m), no: down.start(m) }),
    add: (m, acc, v) => {
      const parts = acc as { yes: unknown; no: unknown }
      down.add(m, truthy(call(m, test, v, 'test')) ? parts.yes : parts.no, v)
    },
    finish: (m, acc) => {
      const parts = acc as { yes: unknown; no: unknown }
      const yes = down.finish(m, parts.yes)
      const no = down.finish(m, parts.no)
      const store = new HashStore(true)
      store.put(m, m.box('boolean', false), no)
      store.put(m, m.box('boolean', true), yes)
      return new MapVal('Map', store, [], true)
    },
  }
}

/** reducing and minBy/maxBy: an Optional of the fold, or a plain value when there is an identity. */
export function reducingSpec(identity: JVal | undefined, mapper: JVal | null, op: (m: Machine, a: JVal, b: JVal) => JVal): CollectorSpec {
  return {
    start: () => ({ present: identity !== undefined, value: identity ?? null }),
    add: (m, acc, v) => {
      const box = acc as { present: boolean; value: JVal }
      const x = mapper ? mapped(m, mapper, v) : v
      box.value = box.present ? op(m, box.value, x) : x
      box.present = true
    },
    finish: (_m, acc) => {
      const box = acc as { present: boolean; value: JVal }
      return identity !== undefined ? box.value : optionalOf(null, box.value ?? undefined)
    },
  }
}

export function numberSpec(prim: 'int' | 'long' | 'double', fn: JVal, average: boolean): CollectorSpec {
  const sam = `applyAs${prim[0]!.toUpperCase()}${prim.slice(1)}`
  return {
    start: () => ({ sum: prim === 'double' ? [0, 0, 0] : 0n, count: 0 }),
    add: (m, acc, v) => {
      const a = acc as { sum: bigint | number[]; count: number }
      const x = toPrim(call(m, fn, v, sam), prim)
      a.count++
      if (Array.isArray(a.sum)) {
        addCompensated(a.sum, x as number)
        a.sum[2]! += x as number
      } else a.sum = BigInt.asIntN(prim === 'int' && !average ? 32 : 64, a.sum + BigInt(x as number))
    },
    finish: (m, acc) => {
      const a = acc as { sum: bigint | number[]; count: number }
      const total = Array.isArray(a.sum) ? compensatedTotal(a.sum) : a.sum
      if (average) return m.box('double', a.count ? Number(total) / a.count : 0)
      return prim === 'double' ? m.box('double', total as number) : m.box(prim, prim === 'int' ? Number(total) : total)
    },
  }
}
