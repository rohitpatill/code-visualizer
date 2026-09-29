import type { Expr } from '../lang/ast'
import { type JType, T, typeName } from '../lang/types'
import { callMethod, callSuper, callUnqualified } from './calls'
import { type ClassInfo, staticSlot } from './classes'
import { convert, toPrim, toRef, zeroOf } from './convert'
import { CompileStop, Fault } from './errors'
import { evalSwitch } from './exec'
import { constructLib, isLibClass, libStaticField } from './lib'
import { methodRef } from './lib/functional'
import { instanceOfType, runtimeClassName } from './lib/types'
import type { Machine } from './machine'
import { ensureInit, instantiate } from './objects'
import { binary, boolR, charR, intR, isRawPrim, refR, truthy, unary } from './ops'
import { ClassRef, ElementSlot, FnVal, JArray, JObject, type JVal, type R, Slot, UNINIT } from './values'

type ArrayType = Extract<JType, { t: 'array' }>

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

function evalName(m: Machine, name: string): R {
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
function exprText(e: Expr): string | null {
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
export function describeNull(_m: Machine, e: Expr | null): string {
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

function checkedIndex(m: Machine, target: R, index: R, objExpr: Expr, verb: 'load from' | 'store to'): { array: JArray; i: number } {
  const array = target.value
  const i = toPrim(index, 'int') as number
  if (array === null) throw new Fault('NullPointerException', `Cannot ${verb} ${arrayWord(declaredType(m, objExpr))} because ${describeNull(m, objExpr)} is null`)
  if (!(array instanceof JArray)) throw new CompileStop(`array required, but ${runtimeClassName(array)} found`)
  if (i < 0 || i >= array.items.length) throw new Fault('ArrayIndexOutOfBoundsException', `Index ${i} out of bounds for length ${array.items.length}`)
  return { array, i }
}

function readField(m: Machine, target: R, name: string, objExpr: Expr): R {
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
    throw new Fault('NullPointerException', `${what} because ${describeNull(m, objExpr)} is null`)
  }
  if (v instanceof JArray && name === 'length') return intR(v.items.length)
  if (v instanceof JObject) {
    const slot = v.fields.get(name) ?? staticSlot(v.cls, name)?.slot
    if (slot) return { type: slot.type, value: slot.value }
  }
  throw new CompileStop(`cannot find symbol: variable ${name} in ${runtimeClassName(v)}`)
}

/** The storage an assignment writes: a variable, a field, or an array element. */
function placeOf(m: Machine, e: Expr): Slot {
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
  if (v === null) throw new Fault('NullPointerException', `Cannot assign field "${e.name}" because ${describeNull(m, e.obj)} is null`)
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
function evalTarget(m: Machine, e: Expr): R {
  return e.k === 'name' ? evalName(m, e.name) : evalExpr(m, e)
}

function assign(m: Machine, e: Extract<Expr, { k: 'assign' }>): R {
  const slot = placeOf(m, e.target)
  if (e.op === '=') {
    slot.value = e.value.k === 'array' ? arrayFromInit(m, slot.type, e.value) : convert(m, evalExpr(m, e.value), slot.type)
    return { type: slot.type, value: slot.value }
  }
  const current = readSlot(slot, e.target)
  return store(m, slot, binary(m, e.op.slice(0, -1), current, evalExpr(m, e.value)))
}

function readSlot(slot: Slot, e: Expr): R {
  if (slot.value === UNINIT) throw new CompileStop(`variable ${exprText(e) ?? ''} might not have been initialized`)
  return { type: slot.type, value: slot.value }
}

/** Compound assignment and ++/-- narrow back to the variable's type implicitly, as in Java (`char c += 1` stays a char). */
function store(m: Machine, slot: Slot, result: R): R {
  slot.value = slot.type.t === 'prim' ? toPrim(result, slot.type.name, true) : toRef(m, result, slot.type)
  return { type: slot.type, value: slot.value }
}

function update(m: Machine, target: Expr, op: string, postfix: boolean): R {
  const slot = placeOf(m, target)
  const before = readSlot(slot, target)
  const after = store(m, slot, binary(m, op === '++' ? '+' : '-', before, intR(1)))
  return postfix ? before : after
}

function makeArray(m: Machine, type: ArrayType, dims: readonly number[]): JArray {
  const [n, ...rest] = dims
  const size = n!
  if (size < 0) throw new Fault('NegativeArraySizeException', String(size))
  const of = type.of
  const items: JVal[] = Array.from({ length: size }, () => (rest.length && of.t === 'array' ? makeArray(m, of, rest) : zeroOf(of)))
  return new JArray(type, items)
}

/** `{1, 2, 3}` as an array of `type`. */
export function arrayFromInit(m: Machine, type: JType, e: Extract<Expr, { k: 'array' }>): JArray {
  if (type.t !== 'array') throw new CompileStop(`illegal initializer for ${typeName(type)}`)
  const of = type.of
  return new JArray(type, e.items.map((item) => (item.k === 'array' ? arrayFromInit(m, of, item) : convert(m, evalExpr(m, item), of))))
}

/** The value a declaration or field initializer stores: array initializers take the declared type. */
export function initialValue(m: Machine, e: Expr, type: JType): JVal {
  return e.k === 'array' ? arrayFromInit(m, type, e) : convert(m, evalExpr(m, e), type)
}

function evalNew(m: Machine, e: Extract<Expr, { k: 'new' }>): R {
  const type = e.type as Extract<JType, { t: 'ref' }>
  const args = () => e.args.map((a) => evalExpr(m, a))
  if (e.body) {
    const cls = m.classes.anonymousClass(e.body, m.frame.cls)
    return refR(instantiate(m, cls, args(), m.frame.self, m.frame.scope), type)
  }
  const cls = m.classes.resolve(type.name, m.frame.cls)
  if (cls) return refR(instantiate(m, cls, args(), undefined, null), type)
  return constructLib(m, type, args())
}

function evalCast(m: Machine, type: JType, r: R): R {
  if (type.t === 'prim') return { type, value: toPrim(r, type.name, true) }
  if (isRawPrim(r)) return { type, value: toRef(m, r, type) }
  if (r.value !== null && !instanceOfType(m, r.value, type)) {
    throw new Fault('ClassCastException', `class ${runtimeClassName(r.value)} cannot be cast to class ${typeName(type)}`)
  }
  return { type, value: r.value }
}

function evalInstanceof(m: Machine, e: Extract<Expr, { k: 'instanceof' }>): R {
  const r = evalExpr(m, e.arg)
  const yes = r.value !== null && instanceOfType(m, r.value, e.type)
  if (yes && e.bind) m.frame.scope.vars.set(e.bind, new Slot(e.type, r.value))
  return boolR(yes)
}

export function evalExpr(m: Machine, e: Expr): R {
  switch (e.k) {
    case 'num': {
      const lit = e.lit
      if (lit.kind === 'int') return intR(Number(lit.value))
      if (lit.kind === 'long') return { type: T.long, value: lit.value as bigint }
      return { type: T[lit.kind], value: lit.value }
    }
    case 'char':
      return charR(e.value)
    case 'bool':
      return boolR(e.value)
    case 'str':
      return refR(m.intern(e.value), T.string)
    case 'null':
      return refR(null)
    case 'this':
      if (!m.frame.self) throw new CompileStop('non-static variable this cannot be referenced from a static context')
      return refR(m.frame.self, { t: 'ref', name: m.frame.self.cls.name, args: [] })
    case 'name':
      return evalName(m, e.name)
    case 'field':
      return readField(m, evalTarget(m, e.obj), e.name, e.obj)
    case 'index': {
      const { array, i } = checkedIndex(m, evalExpr(m, e.obj), evalExpr(m, e.index), e.obj, 'load from')
      return { type: array.type.of, value: array.items[i] ?? null }
    }
    case 'call': {
      if (e.sup) return callSuper(m, e.name, e.args.map((a) => evalExpr(m, a)))
      if (!e.obj) return callUnqualified(m, e.name, e.args.map((a) => evalExpr(m, a)))
      const target = evalTarget(m, e.obj)
      return callMethod(m, target, e.name, e.args.map((a) => evalExpr(m, a)), e.obj)
    }
    case 'new':
      return evalNew(m, e)
    case 'newArray': {
      const type = e.type as ArrayType
      if (e.init?.k === 'array') return refR(arrayFromInit(m, type, e.init), type)
      return refR(makeArray(m, type, e.dims.map((d) => toPrim(evalExpr(m, d), 'int') as number)), type)
    }
    case 'array':
      throw new CompileStop('illegal start of expression: an array initializer needs a declared array type, as in new int[]{1, 2}')
    case 'unary':
      if (e.op === '++' || e.op === '--') return update(m, e.arg, e.op, false)
      return unary(e.op, evalExpr(m, e.arg))
    case 'postfix':
      return update(m, e.arg, e.op, true)
    case 'binary':
      return binary(m, e.op, evalExpr(m, e.left), evalExpr(m, e.right))
    case 'logical': {
      const left = truthy(evalExpr(m, e.left))
      if (e.op === '&&' ? !left : left) return boolR(left)
      return boolR(truthy(evalExpr(m, e.right)))
    }
    case 'assign':
      return assign(m, e)
    case 'cond':
      return evalExpr(m, truthy(evalExpr(m, e.test)) ? e.then : e.else)
    case 'cast':
      return evalCast(m, e.type, evalExpr(m, e.arg))
    case 'instanceof':
      return evalInstanceof(m, e)
    case 'lambda': {
      const f = m.frame
      const impl = { kind: 'lambda' as const, params: e.params, body: e.body, scope: f.scope, self: f.self, cls: f.cls, line: e.line, endLine: e.endLine }
      return refR(new FnVal(impl, 'lambda', e.params.map((p) => p.name)))
    }
    case 'methodRef':
      return refR(methodRef(m, e))
    case 'switch':
      return evalSwitch(m, e)
  }
}
