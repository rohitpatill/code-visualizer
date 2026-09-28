import type { Expr } from '../lang/ast'
import { type CType, T } from '../lang/types'
import { deref, index, member } from './access'
import { literal, num } from './arith'
import { builtinConstant, isBuiltin } from './builtins'
import { callMethod, invoke, makeLambda } from './calls'
import { CppError } from './errors'
import { construct, convert, defaultValue } from './init'
import type { Machine } from './machine'
import { assign, binary, truthy, unary, update } from './ops'
import { Cell, InitVal, NULL_PTR, ObjVal, PtrVal, type R, SeqVal, StrVal, isFn } from './values'

const bool = (value: boolean): R => ({ type: T.bool, value })
const pointerTo = (to: CType): CType => ({ t: 'ptr', to })

function evalName(m: Machine, name: string): R {
  const cell = m.lookup(name)
  if (cell) return { type: cell.type, value: cell.value, cell }
  const self = m.frame.self
  const obj = self?.value
  if (obj instanceof ObjVal && obj.cls.methods.has(name)) return { type: T.fn, value: { fn: 'user', defs: obj.cls.methods.get(name)!, self } }
  const defs = m.program.functions.get(name)
  if (defs) return { type: T.fn, value: { fn: 'user', defs, self: null } }
  const constant = builtinConstant(name)
  if (constant) return constant
  if (isBuiltin(name)) return { type: T.fn, value: { fn: 'builtin', name } }
  throw new CppError(`'${name}' was not declared in this scope`)
}

function evalUnary(m: Machine, op: string, arg: Expr): R {
  if (op === '*') return deref(m, evalExpr(m, arg))
  if (op === '++' || op === '--') return update(m, op, evalExpr(m, arg), false)
  const r = evalExpr(m, arg)
  if (op !== '&') return unary(m, op, r)
  if (isFn(r.value)) return r
  if (!r.cell) throw new CppError('cannot take the address of a temporary value')
  return { type: pointerTo(r.type), value: new PtrVal(r.cell) }
}

function evalCall(m: Machine, e: Extract<Expr, { k: 'call' }>): R {
  const callee = e.callee
  if (callee.k === 'member') {
    const base = evalExpr(m, callee.obj)
    const target = callee.arrow ? deref(m, base) : base
    const args = e.args.map((a) => evalExpr(m, a))
    const field = target.value instanceof ObjVal ? target.value.fields.get(callee.name) : undefined
    if (field && isFn(field.value)) return invoke(m, field.value, args)
    return callMethod(m, target, callee.name, args)
  }
  const fn = evalExpr(m, callee)
  if (!isFn(fn.value)) throw new CppError('this is not a function, so it cannot be called')
  return invoke(m, fn.value, e.args.map((a) => evalExpr(m, a)))
}

function evalNew(m: Machine, e: Extract<Expr, { k: 'new' }>): R {
  if (e.count) {
    const n = Number(num(evalExpr(m, e.count).value))
    if (n < 0) throw new CppError(`new[] with a negative size ${n}`)
    const cells = Array.from({ length: n }, () => new Cell(e.type, defaultValue(m, e.type, true)))
    return { type: pointerTo(e.type), value: new PtrVal(null, new SeqVal({ t: 'array', of: e.type, size: n }, cells), 0) }
  }
  const cell = new Cell(e.type, construct(m, e.type, e.args.map((a) => evalExpr(m, a))))
  return { type: pointerTo(e.type), value: new PtrVal(cell) }
}

function evalDelete(m: Machine, arg: Expr): R {
  const p = evalExpr(m, arg).value
  if (!(p instanceof PtrVal)) throw new CppError('delete needs a pointer')
  if (p.isNull) return { type: T.void, value: null }
  const cells = p.base ? p.base.items : [p.target!]
  if (cells.some((c) => c.freed)) throw new CppError('deleted the same memory twice')
  for (const c of cells) c.freed = true
  return { type: T.void, value: null }
}

function limits(type: CType, which: 'max' | 'min'): R {
  if (type.t === 'float') return { type, value: which === 'max' ? Number.MAX_VALUE : 2.2250738585072014e-308 }
  if (type.t === 'char') return { type, value: which === 'max' ? 127 : -128 }
  if (type.t !== 'int') throw new CppError('numeric_limits needs a number type')
  const bits = BigInt(type.bits)
  const max = type.unsigned ? 2n ** bits - 1n : 2n ** (bits - 1n) - 1n
  const min = type.unsigned ? 0n : -(2n ** (bits - 1n))
  const v = which === 'max' ? max : min
  return { type, value: type.bits === 64 ? v : Number(v) }
}

export function evalExpr(m: Machine, e: Expr): R {
  switch (e.k) {
    case 'num':
      return literal(e.lit)
    case 'bool':
      return bool(e.value)
    case 'char':
      return { type: T.char, value: e.value }
    case 'str':
      return { type: T.string, value: new StrVal(e.value) }
    case 'null':
      return { type: pointerTo(T.void), value: NULL_PTR }
    case 'this':
      return m.thisValue()
    case 'name':
      return evalName(m, e.name)
    case 'unary':
      return evalUnary(m, e.op, e.arg)
    case 'postfix':
      return update(m, e.op, evalExpr(m, e.arg), true)
    case 'binary':
      return binary(m, e.op, evalExpr(m, e.left), evalExpr(m, e.right))
    case 'logical': {
      const left = truthy(m, evalExpr(m, e.left))
      if (e.op === '&&' ? !left : left) return bool(left)
      return bool(truthy(m, evalExpr(m, e.right)))
    }
    case 'assign': {
      const value = evalExpr(m, e.value)
      return assign(m, e.op, evalExpr(m, e.target), value)
    }
    case 'cond':
      return evalExpr(m, truthy(m, evalExpr(m, e.test)) ? e.then : e.else)
    case 'comma':
      return e.exprs.map((x) => evalExpr(m, x)).pop()!
    case 'call':
      return evalCall(m, e)
    case 'member':
      return member(m, evalExpr(m, e.obj), e.name, e.arrow)
    case 'index':
      return index(m, evalExpr(m, e.obj), evalExpr(m, e.index))
    case 'cast': {
      const r = evalExpr(m, e.arg)
      return { type: e.type, value: e.type.t === 'ptr' ? r.value : convert(m, r, e.type) }
    }
    case 'construct': {
      const args = e.args.map((a) => evalExpr(m, a))
      const value = e.braces ? convert(m, { type: T.auto, value: new InitVal(args) }, e.type) : construct(m, e.type, args)
      return { type: e.type, value }
    }
    case 'new':
      return evalNew(m, e)
    case 'delete':
      return evalDelete(m, e.arg)
    case 'init':
      return { type: T.auto, value: new InitVal(e.items.map((x) => evalExpr(m, x))) }
    case 'lambda':
      return { type: T.fn, value: makeLambda(m, e) }
    case 'limits':
      return limits(e.type, e.which)
  }
}
