import { invokeCallable } from '../calls'
import { CompileStop, Fault } from '../errors'
import type { Machine } from '../machine'
import { VOID, boolR, intR, refR, strR, truthy } from '../ops'
import { OptionalVal, type StreamPrim, StreamVal } from '../streamValues'
import { primText, valueText } from '../text'
import { isThrowable, throwObject } from '../throwing'
import { JObject, type JVal, type R } from '../values'
import { element, noMethod } from './common'
import { javaEquals, javaHash } from './equality'
import { elemR, fromR, streamR } from './streamSources'

const PRIMS: Readonly<Record<OptionalVal['kind'], StreamPrim>> = { Optional: null, OptionalInt: 'int', OptionalLong: 'long', OptionalDouble: 'double' }
const KINDS = { int: 'OptionalInt', long: 'OptionalLong', double: 'OptionalDouble' } as const

/** An Optional holding `v`, or the primitive Optional for a stream of `prim`. */
export const optionalOf = (prim: StreamPrim, v: JVal | undefined): OptionalVal => new OptionalVal(prim ? KINDS[prim] : 'Optional', v)

export const optionalR = (o: OptionalVal): R => refR(o, { t: 'ref', name: o.kind, args: [] })

/** `Optional[5]` or `Optional.empty`, as Optional.toString prints them. */
export function optionalText(m: Machine, o: OptionalVal): string {
  if (o.value === undefined) return `${o.kind}.empty`
  const prim = PRIMS[o.kind]
  return `${o.kind}[${prim ? primText(prim, o.value as number) : valueText(m, o.value)}]`
}

const noValue = () => new Fault('NoSuchElementException', 'No value present')

/** Optional.of, ofNullable and empty, and the OptionalInt, OptionalLong and OptionalDouble factories. */
export function optionalStatic(m: Machine, cls: OptionalVal['kind'], name: string, args: readonly R[]): R {
  const prim = PRIMS[cls]
  switch (name) {
    case 'empty':
      return optionalR(new OptionalVal(cls, undefined))
    case 'of': {
      const v = fromR(m, prim, args[0]!)
      if (v === null) throw new Fault('NullPointerException')
      return optionalR(new OptionalVal(cls, v))
    }
    case 'ofNullable':
      if (prim) break
      return optionalR(new OptionalVal(cls, element(m, args[0]!) ?? undefined))
    default:
      break
  }
  throw noMethod(cls, name)
}

/** orElseThrow(supplier): throws what the supplier makes. */
function throwSupplied(m: Machine, supplier: JVal): never {
  const exc = invokeCallable(m, supplier, [], 'get').value
  if (!(exc instanceof JObject) || !isThrowable(exc.cls)) throw new CompileStop('orElseThrow needs a supplier of an exception')
  throw throwObject(m, exc)
}

function optionalHash(m: Machine, o: OptionalVal): number {
  if (o.value === undefined) return 0
  const prim = PRIMS[o.kind]
  return javaHash(m, prim ? m.box(prim, o.value as number) : o.value)
}

export function optionalMethod(m: Machine, o: OptionalVal, name: string, args: readonly R[]): R {
  const prim = PRIMS[o.kind]
  const present = o.value !== undefined
  const value = (): R => {
    if (!present) throw noValue()
    return elemR(prim, o.value!)
  }
  const fn = () => args[0]!.value
  switch (name) {
    case 'isPresent':
      return boolR(present)
    case 'isEmpty':
      return boolR(!present)
    case 'get':
    case 'getAsInt':
    case 'getAsLong':
    case 'getAsDouble':
    case 'orElseThrow':
      if (name === 'orElseThrow' && args.length && !present) throwSupplied(m, fn())
      return value()
    case 'orElse':
      return present ? value() : elemR(prim, fromR(m, prim, args[0]!))
    case 'orElseGet':
      return present ? value() : elemR(prim, fromR(m, prim, invokeCallable(m, fn(), [], prim ? `getAs${KINDS[prim].slice(8)}` : 'get')))
    case 'ifPresent':
      if (present) invokeCallable(m, fn(), [value()], 'accept')
      return VOID
    case 'ifPresentOrElse':
      if (present) invokeCallable(m, fn(), [value()], 'accept')
      else invokeCallable(m, args[1]!.value, [], 'run')
      return VOID
    case 'map':
      return optionalR(new OptionalVal('Optional', present ? (element(m, invokeCallable(m, fn(), [value()], 'apply')) ?? undefined) : undefined))
    case 'flatMap': {
      if (!present) return optionalR(o)
      const next = invokeCallable(m, fn(), [value()], 'apply').value
      if (!(next instanceof OptionalVal)) throw new Fault('NullPointerException')
      return optionalR(next)
    }
    case 'filter':
      return present && !truthy(invokeCallable(m, fn(), [value()], 'test')) ? optionalR(new OptionalVal(o.kind, undefined)) : optionalR(o)
    case 'or':
      return present ? optionalR(o) : invokeCallable(m, fn(), [], 'get')
    case 'stream': {
      const items: JVal[] = present ? [o.value!] : []
      return streamR(new StreamVal(prim, items[Symbol.iterator](), () => items.length))
    }
    case 'equals': {
      const other = args[0]!.value
      const same = other instanceof OptionalVal && other.kind === o.kind && (other.value === undefined) === !present
      return boolR(same && (!present || (prim ? o.value === other.value : javaEquals(m, o.value!, other.value!))))
    }
    case 'hashCode':
      return intR(optionalHash(m, o))
    case 'toString':
      return strR(optionalText(m, o))
    default:
      throw noMethod(o.kind, name)
  }
}
