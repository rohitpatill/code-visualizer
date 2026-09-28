import type { Stmt, VarDecl } from '../lang/ast'
import type { CType } from '../lang/types'
import { num } from './arith'
import { CppError } from './errors'
import { evalExpr } from './eval'
import { construct, convert, copyValue, defaultValue } from './init'
import type { Machine } from './machine'
import { binary, truthy } from './ops'
import { Scope } from './scope'
import { elementCells } from './stl/iterators'
import { Cell, InitVal, MapVal, ObjVal, PairVal, type R, SeqVal, SetVal, StrVal, type Val } from './values'

export const BREAK = Symbol('break')
export const CONTINUE = Symbol('continue')
export type Completion = undefined | typeof BREAK | typeof CONTINUE | { ret: R | null; line: number }

const NO_LINE = -1
const LOOPS_STEP_THEMSELVES = new Set(['block', 'empty', 'for', 'while'])

function withScope<T>(m: Machine, scope: Scope, run: () => T): T {
  const f = m.frame
  const prev = f.scope
  f.scope = scope
  try {
    return run()
  } finally {
    f.scope = prev
  }
}

/** Array sizes are evaluated at run time; `int a[] = {...}` takes its size from the list. */
export function declaredType(m: Machine, d: VarDecl): CType {
  let type = d.type
  for (let i = d.dims.length - 1; i >= 0; i--) {
    const dim = d.dims[i]
    const size = dim ? Number(num(evalExpr(m, dim).value)) : d.init?.k === 'init' ? d.init.items.length : -1
    if (!Number.isInteger(size) || size < 0) throw new CppError(`array '${d.name}' needs a size`)
    type = { t: 'array', of: type, size }
  }
  return type
}

export function declare(m: Machine, d: VarDecl, scope: Scope, zero: boolean): void {
  if (d.ref) {
    if (!d.init) throw new CppError(`reference '${d.name}' must be initialized`)
    const r = evalExpr(m, d.init)
    scope.vars.set(d.name, r.cell ?? new Cell(d.type.t === 'auto' ? r.type : d.type, copyValue(r.value)))
    return
  }
  let type = declaredType(m, d)
  let value: Val
  if (d.init) {
    const r = evalExpr(m, d.init)
    if (type.t === 'auto') {
      if (r.value instanceof InitVal) throw new CppError('auto cannot take its type from a braced list; write the type')
      type = r.type
      value = copyValue(r.value)
    } else value = convert(m, r, type)
  } else if (d.ctorArgs) value = construct(m, type, d.ctorArgs.map((a) => evalExpr(m, a)))
  else if (type.t === 'auto') throw new CppError(`'${d.name}' is declared auto but has no initializer`)
  else value = defaultValue(m, type, zero)
  scope.vars.set(d.name, new Cell(type, value))
}

function parts(v: Val): Cell[] {
  if (v instanceof PairVal) return [v.first, v.second]
  if (v instanceof ObjVal) return [...v.fields.values()]
  if (v instanceof SeqVal) return v.items
  throw new CppError('structured bindings need a pair, a struct or an array')
}

function bindNames(m: Machine, scope: Scope, names: readonly string[], source: Cell, ref: boolean, type: CType): void {
  if (names.length === 1) {
    const copy = () =>
      type.t === 'auto' ? new Cell(source.type, copyValue(source.value)) : new Cell(type, convert(m, { type: source.type, value: source.value }, type))
    scope.vars.set(names[0]!, ref ? source : copy())
    return
  }
  const pieces = parts(source.value)
  if (pieces.length !== names.length) throw new CppError(`cannot bind ${names.length} names to ${pieces.length} values`)
  names.forEach((name, i) => scope.vars.set(name, ref ? pieces[i]! : new Cell(pieces[i]!.type, copyValue(pieces[i]!.value))))
}

function iterationCells(m: Machine, r: R): Cell[] {
  const v = r.value
  if (v instanceof SeqVal || v instanceof StrVal || v instanceof MapVal || v instanceof SetVal) return elementCells(m, v)
  if (v instanceof InitVal) return v.items.map((it) => new Cell(it.type, copyValue(it.value)))
  throw new CppError('a range-based for loop needs a container')
}

export function execList(m: Machine, stmts: readonly Stmt[], prevLine: number): Completion {
  let last = prevLine
  for (const s of stmts) {
    if (!LOOPS_STEP_THEMSELVES.has(s.k) && s.line !== last) m.step(s.line)
    last = s.line
    const done = execStmt(m, s)
    if (done !== undefined) return done
  }
  return undefined
}

/** Runs a loop or branch body in its own scope; `setup` binds loop variables first. */
function nested(m: Machine, body: Stmt, ownerLine: number, setup?: (scope: Scope) => void, headerLine?: number): Completion {
  const scope = new Scope(m.frame.scope)
  return withScope(m, scope, () => {
    setup?.(scope)
    if (headerLine !== undefined) m.step(headerLine)
    return execList(m, body.k === 'block' ? body.body : [body], headerLine ?? ownerLine)
  })
}

/** What a loop does with its body's completion: undefined to keep going, BREAK to stop, anything else returns. */
const loopExit = (done: Completion): Completion | 'next' => (done === undefined || done === CONTINUE ? 'next' : done === BREAK ? undefined : done)

function execFor(m: Machine, s: Extract<Stmt, { k: 'for' }>): Completion {
  return withScope(m, new Scope(m.frame.scope), () => {
    if (s.init) execStmt(m, s.init)
    for (;;) {
      m.step(s.line)
      if (s.test && !truthy(m, evalExpr(m, s.test))) return undefined
      const exit = loopExit(nested(m, s.body, s.line))
      if (exit !== 'next') return exit
      if (s.update) evalExpr(m, s.update)
    }
  })
}

function execRange(m: Machine, s: Extract<Stmt, { k: 'range' }>): Completion {
  for (const cell of iterationCells(m, evalExpr(m, s.range))) {
    const exit = loopExit(nested(m, s.body, s.line, (scope) => bindNames(m, scope, s.names, cell, s.ref, s.type), s.line))
    if (exit !== 'next') return exit
  }
  return undefined
}

function execSwitch(m: Machine, s: Extract<Stmt, { k: 'switch' }>): Completion {
  const value = evalExpr(m, s.test)
  let start = s.cases.findIndex((c) => c.test !== null && binary(m, '==', value, evalExpr(m, c.test)).value === true)
  if (start === -1) start = s.cases.findIndex((c) => c.test === null)
  if (start === -1) return undefined
  return withScope(m, new Scope(m.frame.scope), () => {
    for (let i = start; i < s.cases.length; i++) {
      const done = execList(m, s.cases[i]!.body, s.cases[i]!.line)
      if (done === BREAK) return undefined
      if (done !== undefined) return done
    }
    return undefined
  })
}

export function execStmt(m: Machine, s: Stmt): Completion {
  switch (s.k) {
    case 'decl':
      for (const d of s.decls) declare(m, d, m.frame.scope, m.frame.global)
      return undefined
    case 'bind': {
      const r = evalExpr(m, s.init)
      bindNames(m, m.frame.scope, s.names, r.cell ?? new Cell(r.type, r.value), s.ref, r.type)
      return undefined
    }
    case 'expr':
      evalExpr(m, s.expr)
      return undefined
    case 'block':
      return nested(m, s, s.line)
    case 'if':
      if (truthy(m, evalExpr(m, s.test))) return nested(m, s.then, s.line)
      return s.else ? nested(m, s.else, s.line) : undefined
    case 'while':
      for (;;) {
        m.step(s.line)
        if (!truthy(m, evalExpr(m, s.test))) return undefined
        const exit = loopExit(nested(m, s.body, s.line))
        if (exit !== 'next') return exit
      }
    case 'do':
      for (;;) {
        const exit = loopExit(nested(m, s.body, s.line))
        if (exit !== 'next') return exit
        m.step(s.testLine)
        if (!truthy(m, evalExpr(m, s.test))) return undefined
      }
    case 'for':
      return execFor(m, s)
    case 'range':
      return execRange(m, s)
    case 'switch':
      return execSwitch(m, s)
    case 'break':
      return BREAK
    case 'continue':
      return CONTINUE
    case 'return':
      return { ret: s.value ? evalExpr(m, s.value) : null, line: s.line }
    case 'empty':
      return undefined
  }
}

/** A function body: its statements run in the scope that already holds the parameters. */
export function execBody(m: Machine, body: readonly Stmt[], scope: Scope): Completion {
  return withScope(m, scope, () => execList(m, body, NO_LINE))
}
