import type { Expr } from '../lang/ast'
import { type JType, T, typeName } from '../lang/types'
import { callMethod, callSuper, callUnqualified } from './calls'
import { convert, toPrim, toRef, zeroOf } from './convert'
import { CompileStop, Fault } from './errors'
import { evalSwitch } from './switches'
import { constructLib } from './lib'
import { methodRef } from './lib/functional'
import { instanceOfType, runtimeClassName } from './lib/types'
import type { Machine } from './machine'
import { checkedIndex, evalName, evalTarget, exprText, placeOf, readField } from './names'
import { instantiate } from './objects'
import { binary, boolR, charR, intR, isRawPrim, refR, truthy, unary } from './ops'
import { FnVal, JArray, JStr, type JVal, type R, Slot, UNINIT } from './values'

type ArrayType = Extract<JType, { t: 'array' }>

const constants = new WeakMap<Expr, boolean>()

/** A compile-time constant expression of literals: javac folds `"h" + "i"` into one interned string. */
function isConstant(e: Expr): boolean {
  let known = constants.get(e)
  if (known === undefined) {
    known =
      e.k === 'str' || e.k === 'num' || e.k === 'char' || e.k === 'bool' ||
      (e.k === 'binary' && isConstant(e.left) && isConstant(e.right)) ||
      (e.k === 'unary' && e.op !== '++' && e.op !== '--' && isConstant(e.arg))
    constants.set(e, known)
  }
  return known
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
function arrayFromInit(m: Machine, type: JType, e: Extract<Expr, { k: 'array' }>): JArray {
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
    case 'binary': {
      const r = binary(m, e.op, evalExpr(m, e.left), evalExpr(m, e.right))
      return r.value instanceof JStr && isConstant(e) ? refR(m.intern(r.value.s), T.string) : r
    }
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
