import type { CatchClause, Stmt } from '../lang/ast'
import { type JType, T, arrayOf } from '../lang/types'
import { isSubtype } from './classes'
import { convert } from './convert'
import { CompileStop, Fault, JavaThrow } from './errors'
import { evalExpr, initialValue } from './eval'
import { iterate } from './lib/iteration'
import type { Machine } from './machine'
import { describeNull } from './names'
import { truthy } from './ops'
import { Scope } from './scope'
import { execSwitch } from './switches'
import { asThrow, isThrowable, throwObject } from './throwing'
import { JObject, type JVal, type R, Slot, UNINIT } from './values'

export type Completion =
  | undefined
  | { k: 'break' | 'continue'; label: string | null }
  | { k: 'return'; value: R | null; line: number }
  | { k: 'yield'; value: R }

export const NO_LINE = -1
const STEP_THEMSELVES = new Set(['block', 'empty', 'for', 'while', 'foreach', 'labeled'])

export function withScope<V>(m: Machine, scope: Scope, run: () => V): V {
  const f = m.frame
  const prev = f.scope
  f.scope = scope
  try {
    return run()
  } finally {
    f.scope = prev
  }
}

export function execList(m: Machine, stmts: readonly Stmt[], prevLine: number): Completion {
  let last = prevLine
  for (const s of stmts) {
    if (!STEP_THEMSELVES.has(s.k) && s.line !== last) m.step(s.line)
    last = s.line
    const done = execStmt(m, s, null)
    if (done !== undefined) return done
  }
  return undefined
}

/** A method, lambda or constructor body, in the scope that holds its parameters. */
export function execBody(m: Machine, body: readonly Stmt[], scope: Scope, prevLine = NO_LINE): Completion {
  return withScope(m, scope, () => execList(m, body, prevLine))
}

const bodyOf = (s: Stmt): readonly Stmt[] => (s.k === 'block' ? s.body : [s])

/** Statements in their own block scope; `setup` binds loop variables first. */
function nested(m: Machine, body: readonly Stmt[], ownerLine: number, setup?: (scope: Scope) => void): Completion {
  const scope = new Scope(m.frame.scope)
  return withScope(m, scope, () => {
    setup?.(scope)
    return execList(m, body, ownerLine)
  })
}

/** What a loop does with its body's result: 'next' to keep going, undefined to stop, anything else leaves the loop. */
function loopExit(done: Completion, label: string | null): Completion | 'next' {
  if (done === undefined) return 'next'
  const mine = (done.k === 'break' || done.k === 'continue') && (done.label === null || done.label === label)
  if (mine) return done.k === 'continue' ? 'next' : undefined
  return done
}

function declare(m: Machine, s: Extract<Stmt, { k: 'local' }>): void {
  for (const d of s.decls) {
    let type: JType = arrayOf(s.type, d.dims)
    let value: JVal = UNINIT
    if (d.init && type.t === 'var') {
      const r = evalExpr(m, d.init)
      type = r.type
      value = r.value
    } else if (d.init) value = initialValue(m, d.init, type)
    m.frame.scope.vars.set(d.name, new Slot(type, value))
  }
}

function execFor(m: Machine, s: Extract<Stmt, { k: 'for' }>, label: string | null): Completion {
  return withScope(m, new Scope(m.frame.scope), () => {
    for (const init of s.init) execStmt(m, init, null)
    for (;;) {
      m.step(s.line)
      if (s.test && !truthy(evalExpr(m, s.test))) return undefined
      const exit = loopExit(nested(m, bodyOf(s.body), s.line), label)
      if (exit !== 'next') return exit
      for (const u of s.update) evalExpr(m, u)
    }
  })
}

function execForeach(m: Machine, s: Extract<Stmt, { k: 'foreach' }>, label: string | null): Completion {
  let source: ReturnType<typeof iterate> | null = null
  for (;;) {
    m.step(s.line)
    source ??= iterate(m, evalExpr(m, s.iterable), s.iterable)
    if (!source.cursor.hasNext()) return undefined
    const item: R = { type: source.elem, value: source.cursor.next() }
    const type = s.type.t === 'var' ? source.elem : s.type
    const exit = loopExit(nested(m, bodyOf(s.body), s.line, (scope) => scope.vars.set(s.name, new Slot(type, convert(m, item, type)))), label)
    if (exit !== 'next') return exit
  }
}

function runCatch(m: Machine, handler: CatchClause, thrown: JavaThrow): Completion {
  return nested(m, handler.body, NO_LINE, (scope) => scope.vars.set(handler.name, new Slot(T.object, thrown.exc)))
}

function execTry(m: Machine, s: Extract<Stmt, { k: 'try' }>): Completion {
  return withScope(m, new Scope(m.frame.scope), () => {
    let completion: Completion
    let pending: JavaThrow | null = null
    try {
      for (const r of s.resources) execStmt(m, r, null)
      completion = nested(m, s.body, NO_LINE)
    } catch (err) {
      const thrown = asThrow(m, err)
      if (!(thrown instanceof JavaThrow)) throw thrown
      const handler = s.catches.find((c) => c.types.some((t) => isSubtype(thrown.exc.cls, t)))
      if (!handler) pending = thrown
      else {
        try {
          completion = runCatch(m, handler, thrown)
        } catch (again) {
          const next = asThrow(m, again)
          if (!(next instanceof JavaThrow)) throw next
          pending = next
        }
      }
    }
    if (s.finally) {
      const abrupt = nested(m, s.finally, NO_LINE)
      if (abrupt !== undefined) return abrupt
    }
    if (pending) throw pending
    return completion
  })
}

function execThrow(m: Machine, s: Extract<Stmt, { k: 'throw' }>): never {
  const exc = evalExpr(m, s.value).value
  if (exc === null) throw new Fault('NullPointerException', `Cannot throw exception because ${describeNull(s.value)} is null`)
  if (!(exc instanceof JObject) || !isThrowable(exc.cls)) throw new CompileStop('incompatible types: only a Throwable can be thrown')
  throw throwObject(m, exc)
}

function execStmt(m: Machine, s: Stmt, label: string | null): Completion {
  switch (s.k) {
    case 'local':
      declare(m, s)
      return undefined
    case 'expr':
      evalExpr(m, s.expr)
      return undefined
    case 'block':
      return nested(m, s.body, s.line)
    case 'if':
      if (truthy(evalExpr(m, s.test))) return nested(m, bodyOf(s.then), s.line)
      return s.else ? nested(m, bodyOf(s.else), s.line) : undefined
    case 'while':
      for (;;) {
        m.step(s.line)
        if (!truthy(evalExpr(m, s.test))) return undefined
        const exit = loopExit(nested(m, bodyOf(s.body), s.line), label)
        if (exit !== 'next') return exit
      }
    case 'do':
      for (;;) {
        const exit = loopExit(nested(m, bodyOf(s.body), s.line), label)
        if (exit !== 'next') return exit
        m.step(s.testLine)
        if (!truthy(evalExpr(m, s.test))) return undefined
      }
    case 'for':
      return execFor(m, s, label)
    case 'foreach':
      return execForeach(m, s, label)
    case 'switch':
      return execSwitch(m, s)
    case 'break':
    case 'continue':
      return { k: s.k, label: s.label }
    case 'return':
      return { k: 'return', value: s.value ? evalExpr(m, s.value) : null, line: s.line }
    case 'yield':
      return { k: 'yield', value: evalExpr(m, s.value) }
    case 'throw':
      return execThrow(m, s)
    case 'try':
      return execTry(m, s)
    case 'labeled': {
      const done = execStmt(m, s.body, s.label)
      return done?.k === 'break' && done.label === s.label ? undefined : done
    }
    case 'ctorCall':
      throw new CompileStop(`call to ${s.which}() must be the first statement in a constructor`)
    case 'empty':
      return undefined
  }
}
