import { callMethod, invokeCallable } from '../calls'
import { toPrim } from '../convert'
import { CompileStop } from '../errors'
import type { Machine } from '../machine'
import { refR, truthy } from '../ops'
import { type CollectorSpec, CollectorVal, StatsVal, StreamVal } from '../streamValues'
import { JStr, type JVal, type R } from '../values'
import {
  call, charSequence, groupingSpec, mapped, numberSpec, partitionSpec, reducingSpec, toListSpec, toMapSpec, toSetSpec,
} from './collecting'
import { element, noMethod } from './common'
import { immutableList } from './lists'
import { immutableSet } from './sets'
import { acceptStat } from './statistics'
import { take } from './streamSources'

const collector = (spec: CollectorSpec): R => refR(new CollectorVal(spec), { t: 'ref', name: 'Collector', args: [] })

export function specOf(r: R | undefined, what: string): CollectorSpec {
  const v = r?.value
  if (v instanceof CollectorVal) return v.spec
  throw new CompileStop(`${what} needs a Collector, such as Collectors.toList()`)
}

const STAT_PRIMS: Readonly<Record<string, 'int' | 'long' | 'double'>> = { summarizingInt: 'int', summarizingLong: 'long', summarizingDouble: 'double' }

/** The static factories of java.util.stream.Collectors. */
export function collectorsStatic(m: Machine, name: string, args: readonly R[]): R {
  const fn = (i = 0) => args[i]!.value
  switch (name) {
    case 'toList':
      return collector(toListSpec((_m, list) => list))
    case 'toUnmodifiableList':
      return collector(toListSpec((_m, list) => immutableList(list.items)))
    case 'toSet':
      return collector(toSetSpec((_m, set) => set))
    case 'toUnmodifiableSet':
      return collector(toSetSpec((mm, set) => immutableSet(mm, set.store.entries(mm).map((e) => e.key))))
    case 'toCollection':
      return collector({
        start: (mm) => invokeCallable(mm, fn(), [], 'get').value,
        add: (mm, acc, v) => void callMethod(mm, refR(acc as JVal), 'add', [refR(v)]),
        finish: (_m, acc) => acc as JVal,
      })
    case 'toMap':
      return collector(toMapSpec(args))
    case 'joining': {
      const text = (i: number) => (args[i] ? charSequence(args[i].value) : '')
      const [sep, prefix, suffix] = [text(0), text(1), text(2)]
      return collector({
        start: () => [] as string[],
        add: (_m, acc, v) => void (acc as string[]).push(charSequence(v)),
        finish: (_m, acc) => new JStr(`${prefix}${(acc as string[]).join(sep)}${suffix}`),
      })
    }
    case 'counting':
      return collector({
        start: () => ({ n: 0n }),
        add: (_m, acc) => void (acc as { n: bigint }).n++,
        finish: (mm, acc) => mm.box('long', (acc as { n: bigint }).n),
      })
    case 'summingInt':
    case 'summingLong':
    case 'summingDouble':
    case 'averagingInt':
    case 'averagingLong':
    case 'averagingDouble': {
      const prim = name.endsWith('Int') ? 'int' : name.endsWith('Long') ? 'long' : 'double'
      return collector(numberSpec(prim, fn(), name.startsWith('averaging')))
    }
    case 'summarizingInt':
    case 'summarizingLong':
    case 'summarizingDouble': {
      const prim = STAT_PRIMS[name]!
      const sam = `applyAs${prim[0]!.toUpperCase()}${prim.slice(1)}`
      return collector({
        start: () => new StatsVal(prim),
        add: (mm, acc, v) => acceptStat(acc as StatsVal, toPrim(call(mm, fn(), v, sam), prim)),
        finish: (_m, acc) => acc as StatsVal,
      })
    }
    case 'minBy':
    case 'maxBy': {
      const cmp = fn()
      const min = name === 'minBy'
      return collector(
        reducingSpec(undefined, null, (mm, a, b) => {
          const c = toPrim(invokeCallable(mm, cmp, [refR(a), refR(b)], 'compare'), 'int') as number
          return (min ? c <= 0 : c >= 0) ? a : b
        }),
      )
    }
    case 'reducing': {
      const op = fn(args.length - 1)
      const identity = args.length > 1 ? element(m, args[0]!) : undefined
      const mapper = args.length === 3 ? fn(1) : null
      return collector(reducingSpec(identity, mapper, (mm, a, b) => element(mm, invokeCallable(mm, op, [refR(a), refR(b)], 'apply'))))
    }
    case 'groupingBy': {
      const down = args.length > 1 ? specOf(args[args.length - 1], name) : toListSpec((_m, list) => list)
      return collector(groupingSpec(fn(), args.length === 3 ? fn(1) : null, down))
    }
    case 'partitioningBy':
      return collector(partitionSpec(fn(), args[1] ? specOf(args[1], name) : toListSpec((_m, list) => list)))
    case 'mapping':
    case 'filtering':
    case 'flatMapping': {
      const down = specOf(args[1], name)
      const f = fn()
      const add = (mm: Machine, acc: unknown, v: JVal) => {
        if (name === 'mapping') down.add(mm, acc, mapped(mm, f, v))
        else if (name === 'filtering') {
          if (truthy(call(mm, f, v, 'test'))) down.add(mm, acc, v)
        } else {
          const inner = call(mm, f, v).value
          if (inner instanceof StreamVal) for (const x of take(inner)) down.add(mm, acc, x)
        }
      }
      return collector({ start: down.start, add, finish: down.finish })
    }
    case 'collectingAndThen': {
      const down = specOf(args[0], name)
      return collector({ start: down.start, add: down.add, finish: (mm, acc) => mapped(mm, fn(1), down.finish(mm, acc)) })
    }
    case 'teeing': {
      const [first, second] = [specOf(args[0], name), specOf(args[1], name)]
      return collector({
        start: (mm) => [first.start(mm), second.start(mm)],
        add: (mm, acc, v) => {
          const [a, b] = acc as [unknown, unknown]
          first.add(mm, a, v)
          second.add(mm, b, v)
        },
        finish: (mm, acc) => {
          const [a, b] = acc as [unknown, unknown]
          return element(mm, invokeCallable(mm, fn(2), [refR(first.finish(mm, a)), refR(second.finish(mm, b))], 'apply'))
        },
      })
    }
    default:
      throw noMethod('Collectors', name)
  }
}
