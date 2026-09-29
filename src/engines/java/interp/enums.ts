import type { JType } from '../lang/types'
import { type ClassInfo, instanceFields } from './classes'
import { zeroOf } from './convert'
import { Fault } from './errors'
import { evalExpr } from './eval'
import type { Machine } from './machine'
import { construct } from './objects'
import { intR, refR, strR } from './ops'
import { ClassRef, JArray, JObject, JStr, type R, Slot } from './values'

/** `Main.Color`: the name Java's messages use for a nested class. */
function binaryName(cls: ClassInfo): string {
  return cls.outer ? `${binaryName(cls.outer)}.${cls.name}` : cls.name
}

/** Makes an enum's constants in order, each through its constructor, as the enum's static initializer does. */
export function createConstants(m: Machine, cls: ClassInfo): void {
  cls.decl.constants.forEach((k, ordinal) => {
    m.step(k.line)
    const obj = new JObject(cls, null, null)
    obj.constant = { name: k.name, ordinal }
    for (const f of instanceFields(cls)) obj.fields.set(f.name, new Slot(f.type, zeroOf(f.type)))
    construct(m, cls, obj, k.args.map((a) => evalExpr(m, a)))
    cls.statics.get(k.name)!.value = obj
  })
}

const constantsOf = (cls: ClassInfo) => cls.decl.constants.map((k) => cls.statics.get(k.name)!.value)

/** The static values() and valueOf(String) every enum has. */
export function enumStatic(cls: ClassInfo, name: string, args: readonly R[]): R | null {
  const type: Extract<JType, { t: 'array' }> = { t: 'array', of: { t: 'ref', name: cls.name, args: [] } }
  if (name === 'values' && !args.length) return refR(new JArray(type, constantsOf(cls)), type)
  if (name !== 'valueOf' || args.length !== 1) return null
  const text = args[0]!.value
  if (!(text instanceof JStr)) throw new Fault('NullPointerException', 'Name is null')
  const found = constantsOf(cls).find((v) => (v as JObject).constant!.name === text.s)
  if (!found) throw new Fault('IllegalArgumentException', `No enum constant ${binaryName(cls)}.${text.s}`)
  return refR(found)
}

/** name(), ordinal(), compareTo() and getDeclaringClass() on an enum constant. */
export function enumMethod(obj: JObject, name: string, args: readonly R[]): R | null {
  const constant = obj.constant
  if (!constant) return null
  switch (name) {
    case 'name':
      return strR(constant.name)
    case 'ordinal':
      return intR(constant.ordinal)
    case 'compareTo': {
      const other = args[0]?.value
      if (!(other instanceof JObject) || !other.constant) throw new Fault('NullPointerException')
      return intR(constant.ordinal - other.constant.ordinal)
    }
    case 'getDeclaringClass':
      return refR(new ClassRef(obj.cls.name, obj.cls))
    default:
      return null
  }
}
