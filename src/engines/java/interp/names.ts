import type { Expr } from '../lang/ast'
import type { JType } from '../lang/types'
import { type ClassInfo, staticSlot } from './classes'
import { toPrim } from './convert'
import { CompileStop, Fault } from './errors'
import { evalExpr } from './eval'
import { isLibClass, libStaticField } from './lib'
import { runtimeClassName } from './lib/types'
import type { Machine } from './machine'
import { ensureInit } from './objects'
import { intR, refR } from './ops'
import { ClassRef, ElementSlot, JArray, JObject, type R, type Slot, UNINIT } from './values'

// Names and members: variables, fields, static fields and array elements, read
// or written, with the NullPointerException and bounds messages Java gives.

/** A variable visible from the running code: locals, then fields of this and enclosing instances, then static fields. */
function findVar(m: Machine, name: string): { slot: Slot; owner?: ClassInfo } | undefined {
  const f = m.frame
  const local = f.scope.find(name)
  if (local) return { slot: local }
  for (let obj = f.self; obj; obj = obj.outer) {
    const field = obj.fields.get(name) ?? obj.env?.find(name)
    if (field) return { slot: field }
  }
  for (let cls = f.cls; cls; cls = cls.outer) {
    const found = staticSlot(cls, name)
    if (found) return found
  }
  return undefined
}

function classRef(m: Machine, name: string): R | null {
  const cls = m.classes.resolve(name, m.frame.cls)
  if (cls) return refR(new ClassRef(cls.name, cls))
  return isLibClass(name) ? refR(new ClassRef(name, null)) : null
}

export function evalName(m: Machine, name: string): R {
  const found = findVar(m, name)
  if (found) {
    if (found.owner) ensureInit(m, found.owner)
    const value = found.slot.value
    if (value === UNINIT) throw new CompileStop(`variable ${name} might not have been initialized`)
    return { type: found.slot.type, value }
  }
  const ref = classRef(m, name)
  if (!ref) throw new CompileStop(`cannot find symbol: variable ${name}`)
  return ref
}

/** Source text of a simple expression, for the helpful NullPointerException messages Java prints. */
export function exprText(e: Expr): string | null {
  switch (e.k) {
    case 'name':
      return e.name
    case 'this':
      return 'this'
    case 'field': {
      const obj = exprText(e.obj)
      return obj && `${obj}.${e.name}`
    }
    case 'index': {
      const obj = exprText(e.obj)
      return obj && `${obj}[${exprText(e.index) ?? '...'}]`
    }
    case 'num':
      return String(e.lit.value)
    default:
      return null
  }
}

/** `"curr.next"`, or `the return value of "get()"`: what was null. */
export function describeNull(e: Expr | null): string {
  if (!e) return 'the value'
  const text = exprText(e)
  if (text) return `"${text}"`
  return e.k === 'call' ? `the return value of "${e.name}()"` : 'the value'
}

/** The declared type of a simple expression, for array wording in error messages. */
function declaredType(m: Machine, e: Expr): JType | null {
  if (e.k === 'name') return findVar(m, e.name)?.slot.type ?? null
  if (e.k === 'index') {
    const t = declaredType(m, e.obj)
    return t?.t === 'array' ? t.of : null
  }
  return null
}

function arrayWord(t: JType | null): string {
  if (t?.t !== 'array') return 'array'
  const of = t.of
  if (of.t !== 'prim') return 'object array'
  return of.name === 'byte' || of.name === 'boolean' ? 'byte/boolean array' : `${of.name} array`
}

export function checkedIndex(m: Machine, target: R, index: R, objExpr: Expr, verb: 'load from' | 'store to'): { array: JArray; i: number } {
  const array = target.value
  const i = toPrim(index, 'int') as number
  if (array === null) throw new Fault('NullPointerException', `Cannot ${verb} ${arrayWord(declaredType(m, objExpr))} because ${describeNull(objExpr)} is null`)
  if (!(array instanceof JArray)) throw new CompileStop(`array required, but ${runtimeClassName(array)} found`)
  if (i < 0 || i >= array.items.length) throw new Fault('ArrayIndexOutOfBoundsException', `Index ${i} out of bounds for length ${array.items.length}`)
  return { array, i }
}

export function readField(m: Machine, target: R, name: string, objExpr: Expr): R {
  const v = target.value
  if (v instanceof ClassRef) {
    if (v.cls) {
      const nested = v.cls.nested.get(name)
      if (nested) return refR(new ClassRef(nested.name, nested))
      const found = staticSlot(v.cls, name)
      if (!found) throw new CompileStop(`cannot find symbol: variable ${name} in class ${v.name}`)
      ensureInit(m, found.owner)
      return { type: found.slot.type, value: found.slot.value }
    }
    return libStaticField(m, v.name, name)
  }
  if (v === null) {
    const what = name === 'length' ? 'Cannot read the array length' : `Cannot read field "${name}"`
    throw new Fault('NullPointerException', `${what} because ${describeNull(objExpr)} is null`)
  }
  if (v instanceof JArray && name === 'length') return intR(v.items.length)
  if (v instanceof JObject) {
    const slot = v.fields.get(name) ?? staticSlot(v.cls, name)?.slot
    if (slot) return { type: slot.type, value: slot.value }
  }
  throw new CompileStop(`cannot find symbol: variable ${name} in ${runtimeClassName(v)}`)
}

/** The storage an assignment writes: a variable, a field, or an array element. */
export function placeOf(m: Machine, e: Expr): Slot {
  if (e.k === 'name') {
    const found = findVar(m, e.name)
    if (!found) throw new CompileStop(`cannot find symbol: variable ${e.name}`)
    if (found.owner) ensureInit(m, found.owner)
    return found.slot
  }
  if (e.k === 'index') {
    const { array, i } = checkedIndex(m, evalExpr(m, e.obj), evalExpr(m, e.index), e.obj, 'store to')
    return new ElementSlot(array, i)
  }
  if (e.k !== 'field') throw new CompileStop('unexpected type: required variable, found value')
  const target = evalTarget(m, e.obj)
  const v = target.value
  if (v === null) throw new Fault('NullPointerException', `Cannot assign field "${e.name}" because ${describeNull(e.obj)} is null`)
  if (v instanceof JArray) throw new CompileStop('cannot assign a value to final variable length')
  if (v instanceof ClassRef && v.cls) {
    const found = staticSlot(v.cls, e.name)
    if (found) {
      ensureInit(m, found.owner)
      return found.slot
    }
  }
  const slot = v instanceof JObject ? (v.fields.get(e.name) ?? staticSlot(v.cls, e.name)?.slot) : undefined
  if (!slot) throw new CompileStop(`cannot find symbol: variable ${e.name}`)
  return slot
}

/** The receiver of a member access: like evalExpr, but a bare class name is allowed. */
export function evalTarget(m: Machine, e: Expr): R {
  return e.k === 'name' ? evalName(m, e.name) : evalExpr(m, e)
}
