import { enumMethod } from '../enums'
import type { Machine } from '../machine'
import { boolR, intR, refR, strR } from '../ops'
import { valueText } from '../text'
import { isThrowable, javaName, throwableText } from '../throwing'
import { ClassRef, JObject, type R } from '../values'
import { element, noMethod } from './common'
import { javaEquals, javaHash } from './equality'

/** java.lang.Object's methods, record accessors and the Throwable methods the prelude leaves to the runtime. */
export function objectMethod(m: Machine, obj: JObject, name: string, args: readonly R[]): R {
  const constant = enumMethod(obj, name, args)
  if (constant) return constant
  const record = obj.cls.decl.kind === 'record'
  switch (name) {
    case 'equals':
      return boolR(record ? javaEquals(m, obj, element(m, args[0]!)) : obj === args[0]!.value)
    case 'hashCode':
      return intR(record ? javaHash(m, obj) : m.identityHash(obj))
    case 'toString':
      return strR(valueText(m, obj))
    case 'getClass':
      return refR(new ClassRef(obj.cls.name, obj.cls))
    case 'printStackTrace':
      if (isThrowable(obj.cls)) {
        m.out.write(`${throwableText(obj)}\n`)
        return { type: { t: 'void' }, value: null }
      }
      break
    default:
      if (record && !args.length && obj.cls.decl.components.some((c) => c.name === name)) {
        const slot = obj.fields.get(name)!
        return { type: slot.type, value: slot.value }
      }
  }
  throw noMethod(obj.cls.name, name)
}

/** getName and getSimpleName on the value getClass() returns. */
export function classRefMethod(ref: ClassRef, name: string): R | null {
  if (name === 'getSimpleName') return strR(ref.name)
  if (name === 'getName') return strR(ref.cls ? javaName(ref.cls) : ref.qualified)
  return null
}
