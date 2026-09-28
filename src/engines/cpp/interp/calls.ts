import { StepLimit } from '../../shared/recorder'
import type { ClassDef, Expr, FuncDef, MemberInit, Param } from '../lang/ast'
import { type CType, T, isArithmetic, typeName } from '../lang/types'
import { callBuiltin } from './builtins'
import { compareVals } from './compare'
import { CppError } from './errors'
import { evalExpr } from './eval'
import { type Completion, declaredType, execBody } from './exec'
import { construct, convert, copyValue, defaultValue } from './init'
import type { Frame, Machine } from './machine'
import { truthy } from './ops'
import { Scope } from './scope'
import { stlMethod } from './stl/methods'
import { Cell, type FnVal, InitVal, ObjVal, PtrVal, type R, VOID } from './values'

function score(p: Param, a: R): number {
  if (p.type.t === 'auto' || a.value instanceof InitVal) return 1
  if (typeName(p.type) === typeName(a.type)) return 3
  if (isArithmetic(p.type) && isArithmetic(a.type)) return 2
  if (p.type.t === a.type.t || (p.type.t === 'ptr' && a.value instanceof PtrVal)) return 2
  return 0
}

export function pickOverload(defs: readonly FuncDef[], args: readonly R[], what: string): FuncDef {
  let best: FuncDef | null = null
  let bestScore = -1
  for (const fn of defs) {
    const required = fn.params.filter((p) => !p.def).length
    if (args.length < required || args.length > fn.params.length) continue
    const s = args.reduce((sum, a, i) => sum + score(fn.params[i]!, a), 0)
    if (s > bestScore) {
      best = fn
      bestScore = s
    }
  }
  if (!best) throw new CppError(`no version of ${what} takes ${args.length} argument${args.length === 1 ? '' : 's'}`)
  return best
}

function bindParams(m: Machine, params: readonly Param[], args: readonly R[], scope: Scope): void {
  params.forEach((p, i) => {
    const arg = args[i] ?? evalExpr(m, p.def!)
    const type = p.type.t === 'auto' ? arg.type : p.type
    if (p.ref && arg.cell) scope.vars.set(p.name, arg.cell)
    else scope.vars.set(p.name, new Cell(type, p.type.t === 'auto' ? copyValue(arg.value) : convert(m, arg, type)))
  })
}

function fail(m: Machine, frame: Frame, err: unknown): void {
  if (err instanceof StepLimit || frame.failed) return
  frame.failed = true
  const message = err instanceof CppError ? err.message : err instanceof RangeError ? 'stack overflow: too many nested calls' : String(err)
  if (m.errorLine === null) m.errorLine = frame.line
  m.record('exception', frame.line, { exc: `Runtime error: ${message}` })
}

function returned(m: Machine, ret: CType, retRef: boolean, value: R | null): R {
  if (!value || ret.t === 'void') return VOID
  if (retRef && value.cell) return value
  if (ret.t === 'auto') return { type: value.type, value: copyValue(value.value) }
  return { type: ret, value: convert(m, value, ret) }
}

function finish(m: Machine, frame: Frame, ret: CType, retRef: boolean, done: Completion, endLine: number): R {
  if (typeof done === 'object') {
    const result = returned(m, ret, retRef, done.ret)
    frame.line = done.line
    m.record('return', done.line, { ret: result })
    return result
  }
  frame.line = endLine
  const result: R = frame.name === 'main' ? { type: T.int, value: 0 } : VOID
  m.record('return', endLine, { ret: result })
  return result
}

function initMember(m: Machine, self: Cell, init: MemberInit): void {
  const obj = self.value as ObjVal
  const cell = obj.fields.get(init.name)
  if (!cell) throw new CppError(`${obj.cls.name} has no member named '${init.name}'`)
  const args = init.args.map((a) => evalExpr(m, a))
  cell.value = args.length === 1 && !(args[0]!.value instanceof InitVal) ? convert(m, args[0]!, cell.type) : construct(m, cell.type, args)
}

interface Callable {
  name: string
  params: readonly Param[]
  body: FuncDef['body']
  line: number
  endLine: number
  ret: CType
  retRef: boolean
  inits: readonly MemberInit[]
  prelude: boolean
}

function run(m: Machine, fn: Callable, args: readonly R[], self: Cell | null, parent: Scope): R {
  const scope = new Scope(parent)
  bindParams(m, fn.params, args, scope)
  const frame = m.pushFrame({ name: fn.name, line: fn.line, endLine: fn.endLine, scope, self, silent: fn.prelude || m.silent })
  try {
    m.record('call', fn.line)
    for (const init of fn.inits) initMember(m, self!, init)
    return finish(m, frame, fn.ret, fn.retRef, execBody(m, fn.body, scope), fn.endLine)
  } catch (err) {
    fail(m, frame, err)
    throw err
  } finally {
    m.popFrame(frame)
  }
}

export function callFunction(m: Machine, defs: readonly FuncDef[], args: readonly R[], self: Cell | null): R {
  const fn = pickOverload(defs, args, defs[0]!.name)
  const name = fn.owner ? `${fn.owner}::${fn.name}` : fn.name
  return run(m, { ...fn, name }, args, self, m.globals)
}

export function invoke(m: Machine, fn: FnVal, args: readonly R[]): R {
  switch (fn.fn) {
    case 'user':
      return callFunction(m, fn.defs, args, fn.self)
    case 'lambda':
      return run(m, { ...fn, name: 'lambda', ret: T.auto, retRef: false, inits: [], prelude: m.silent }, args, fn.self, fn.scope)
    case 'builtin':
      return callBuiltin(m, fn.name, args)
    case 'cmp': {
      const c = compareVals(args[0]!.value, args[1]!.value, m.less)
      return { type: T.bool, value: fn.greater ? c > 0 : c < 0 }
    }
  }
}

function fieldValue(m: Machine, cls: ClassDef, index: number, type: CType, zero: boolean): Cell {
  const f = cls.fields[index]!
  if (f.init) return new Cell(type, convert(m, evalExpr(m, f.init), type))
  if (f.ctorArgs) return new Cell(type, construct(m, type, f.ctorArgs.map((a) => evalExpr(m, a))))
  return new Cell(type, defaultValue(m, type, zero))
}

/** Builds an object: default member values, then aggregate braces or the chosen constructor. */
export function constructObject(m: Machine, cls: ClassDef, args: readonly R[], braced = false): ObjVal {
  const obj = new ObjVal(cls, new Map())
  const aggregate = cls.ctors.length === 0
  cls.fields.forEach((f, i) => obj.fields.set(f.name, fieldValue(m, cls, i, declaredType(m, f), aggregate && braced)))
  if (aggregate) {
    if (args.length > cls.fields.length) throw new CppError(`too many values to initialize ${cls.name}`)
    args.forEach((a, i) => {
      const cell = obj.fields.get(cls.fields[i]!.name)!
      cell.value = convert(m, a, cell.type)
    })
    return obj
  }
  const ctor = pickOverload(cls.ctors, args, `${cls.name}'s constructor`)
  run(m, { ...ctor, name: `${cls.name}::${cls.name}` }, args, new Cell({ t: 'class', name: cls.name }, obj), m.globals)
  return obj
}

export function callMethod(m: Machine, target: R, name: string, args: readonly R[]): R {
  const v = target.value
  if (!(v instanceof ObjVal)) return stlMethod(m, target, name, args)
  const defs = v.cls.methods.get(name)
  if (!defs) throw new CppError(`${v.cls.name} has no member function '${name}'`)
  return callFunction(m, defs, args, target.cell ?? new Cell(target.type, v))
}

export function callOperatorValue(m: Machine, op: string, a: R, b: R): R {
  const obj = a.value as ObjVal
  const defs = obj.cls.methods.get(`operator${op}`)
  if (!defs) throw new CppError(`${obj.cls.name} has no operator${op}`)
  return callFunction(m, defs, [b], a.cell ?? new Cell(a.type, obj))
}

export function callOperator(m: Machine, op: string, a: ObjVal, b: ObjVal): boolean {
  if (!a.cls.methods.has(`operator${op}`)) throw new CppError(`${a.cls.name} has no operator${op}, so it cannot be sorted or ordered`)
  const type: CType = { t: 'class', name: b.cls.name }
  return truthy(m, callOperatorValue(m, op, { type, value: a }, { type, value: b }))
}

export function makeLambda(m: Machine, e: Extract<Expr, { k: 'lambda' }>): FnVal {
  const f = m.frame
  const { mode, byRef, byCopy } = e.capture
  let scope: Scope
  if (mode === 'ref') scope = new Scope(f.scope)
  else {
    scope = new Scope(m.globals)
    if (mode === 'copy') {
      const chain: Scope[] = []
      for (let s: Scope | null = f.scope; s && s !== m.globals; s = s.parent) chain.push(s)
      for (const s of chain.reverse()) for (const [n, c] of s.vars) scope.vars.set(n, new Cell(c.type, copyValue(c.value)))
    }
  }
  for (const name of byCopy) {
    const cell = m.lookup(name)
    if (!cell) throw new CppError(`cannot capture '${name}': it is not declared here`)
    scope.vars.set(name, new Cell(cell.type, copyValue(cell.value)))
  }
  for (const name of byRef) {
    if (name === 'this') continue
    const cell = m.lookup(name)
    if (!cell) throw new CppError(`cannot capture '${name}': it is not declared here`)
    scope.vars.set(name, cell)
  }
  const self = mode !== 'none' || byRef.includes('this') ? f.self : null
  return { fn: 'lambda', params: e.params, body: e.body, scope, self, line: e.line, endLine: e.endLine, capture: e.capture }
}
