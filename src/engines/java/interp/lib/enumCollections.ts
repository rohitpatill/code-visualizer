import type { JType } from '../../lang/types'
import type { ClassInfo } from '../classes'
import { enumConstants, enumOf } from '../enums'
import { CompileStop, Fault } from '../errors'
import type { Machine } from '../machine'
import { refR } from '../ops'
import { ClassRef, type Entry, JObject, type JVal, MapVal, type R, SetVal, type Store } from '../values'
import { arity, element, noMethod } from './common'
import { isCollection, itemsOf } from './iteration'
import { runtimeClassName } from './types'

/** EnumMap's and EnumSet's storage: one slot per constant, indexed by ordinal, so iteration follows declaration order. */
export class EnumStore implements Store {
  modCount = 0
  private readonly slots: (Entry | undefined)[]
  private count = 0

  constructor(readonly universe: ClassInfo) {
    this.slots = new Array<Entry | undefined>(universe.decl.constants.length)
  }

  get size(): number {
    return this.count
  }

  /** The key's ordinal, or -1 when it is not a constant of this enum (get and contains then just say no). */
  private ordinal(key: JVal): number {
    return key instanceof JObject && key.constant && enumOf(key) === this.universe ? key.constant.ordinal : -1
  }

  find(_m: Machine, key: JVal): Entry | undefined {
    const i = this.ordinal(key)
    return i < 0 ? undefined : this.slots[i]
  }

  put(_m: Machine, key: JVal, value: JVal): Entry | undefined {
    const i = this.ordinal(key)
    if (i < 0) {
      if (key === null) throw new Fault('NullPointerException')
      throw new Fault('ClassCastException', `class ${runtimeClassName(key)} != class ${this.universe.name}`)
    }
    const entry = this.slots[i]
    if (entry) {
      const before = { ...entry }
      entry.value = value
      return before
    }
    this.slots[i] = { key, value, hash: 0, seq: i }
    this.count++
    this.modCount++
    return undefined
  }

  remove(_m: Machine, key: JVal): Entry | undefined {
    const i = this.ordinal(key)
    const entry = i < 0 ? undefined : this.slots[i]
    if (!entry) return undefined
    this.slots[i] = undefined
    this.count--
    this.modCount++
    return entry
  }

  clear(): void {
    if (!this.count) return
    this.slots.fill(undefined)
    this.count = 0
    this.modCount++
  }

  entries(): readonly Entry[] {
    return this.slots.filter((e): e is Entry => e !== undefined)
  }
}

const enumType = (cls: ClassInfo): JType => ({ t: 'ref', name: cls.name, args: [] })

/** The enum a `Color.class` argument names. */
function universeOf(r: R | undefined, what: string): ClassInfo {
  const v = r?.value
  if (v instanceof ClassRef && v.cls?.decl.kind === 'enum') return v.cls
  if (v === null) throw new Fault('NullPointerException')
  throw new CompileStop(`${what} needs an enum class, as in Color.class`)
}

/** `new EnumMap<>(Color.class)`, or a copy of another map. */
export function constructEnumMap(m: Machine, typeArgs: JType[], args: readonly R[]): R {
  arity('new EnumMap', args, 1)
  const source = args[0]!.value
  let universe: ClassInfo
  if (source instanceof MapVal) {
    const first = source.store.entries(m)[0]?.key
    if (source.store instanceof EnumStore) universe = source.store.universe
    else if (first instanceof JObject && first.constant) universe = enumOf(first)
    else throw new Fault('IllegalArgumentException', 'Specified map is empty')
  } else universe = universeOf(args[0], 'new EnumMap')
  const map = new MapVal('EnumMap', new EnumStore(universe), typeArgs.length ? typeArgs : [enumType(universe)])
  if (source instanceof MapVal) for (const e of source.store.entries(m)) map.store.put(m, e.key, e.value)
  return refR(map, { t: 'ref', name: 'EnumMap', args: typeArgs })
}

function enumSet(m: Machine, universe: ClassInfo, items: readonly JVal[]): R {
  const set = new SetVal('EnumSet', new EnumStore(universe), [enumType(universe)])
  for (const v of items) set.store.put(m, v, null)
  return refR(set, { t: 'ref', name: 'EnumSet', args: set.args })
}

function constantArg(m: Machine, r: R): JObject {
  const v = element(m, r)
  if (v instanceof JObject && v.constant) return v
  if (v === null) throw new Fault('NullPointerException')
  throw new CompileStop('EnumSet needs enum constants')
}

/** EnumSet.of, noneOf, allOf, range, complementOf and copyOf. */
export function enumSetStatic(m: Machine, name: string, args: readonly R[]): R {
  switch (name) {
    case 'noneOf':
      return enumSet(m, universeOf(args[0], `EnumSet.${name}`), [])
    case 'allOf': {
      const universe = universeOf(args[0], `EnumSet.${name}`)
      return enumSet(m, universe, enumConstants(m, universe))
    }
    case 'of': {
      if (!args.length) throw new CompileStop('EnumSet.of needs at least one constant')
      const items = args.map((a) => constantArg(m, a))
      return enumSet(m, enumOf(items[0]!), items)
    }
    case 'range': {
      arity('EnumSet.range', args, 2)
      const [from, to] = [constantArg(m, args[0]!), constantArg(m, args[1]!)]
      const lo = from.constant!.ordinal
      const hi = to.constant!.ordinal
      if (lo > hi) throw new Fault('IllegalArgumentException', `${from.constant!.name} > ${to.constant!.name}`)
      const universe = enumOf(from)
      return enumSet(m, universe, enumConstants(m, universe).slice(lo, hi + 1))
    }
    case 'complementOf': {
      const set = args[0]?.value
      if (!(set instanceof SetVal) || !(set.store instanceof EnumStore)) throw new CompileStop('EnumSet.complementOf needs an EnumSet')
      const store = set.store
      return enumSet(m, store.universe, enumConstants(m, store.universe).filter((k) => !store.find(m, k)))
    }
    case 'copyOf': {
      arity('EnumSet.copyOf', args, 1)
      const source = args[0]!
      if (source.value instanceof SetVal && source.value.store instanceof EnumStore) {
        return enumSet(m, source.value.store.universe, itemsOf(m, source, 'EnumSet.copyOf'))
      }
      if (!isCollection(source.value)) throw new CompileStop('EnumSet.copyOf needs a collection')
      const items = itemsOf(m, source, 'EnumSet.copyOf')
      if (!items.length) throw new Fault('IllegalArgumentException', 'Collection is empty')
      return enumSet(m, enumOf(constantArg(m, refR(items[0]!))), items)
    }
    default:
      throw noMethod('EnumSet', name)
  }
}
