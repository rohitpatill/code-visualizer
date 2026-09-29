import type { Expr, Stmt, SwitchCase } from '../lang/ast'
import { primValue } from './convert'
import { CompileStop, Fault } from './errors'
import { evalExpr } from './eval'
import { type Completion, NO_LINE, execList, withScope } from './exec'
import type { Machine } from './machine'
import { describeNull } from './names'
import { Scope } from './scope'
import { JObject, JStr, type R } from './values'

// switch statements and switch expressions, colon or arrow style.

function switchValue(m: Machine, test: Expr): R {
  const r = evalExpr(m, test)
  if (r.value === null) throw new Fault('NullPointerException', `Cannot invoke "String.hashCode()" because ${describeNull(test)} is null`)
  return r
}

function caseMatches(value: R, label: R): boolean {
  if (value.value instanceof JStr) return label.value instanceof JStr && label.value.s === value.value.s
  const x = primValue(value)
  const y = primValue(label)
  if (!x || !y) throw new CompileStop('constant expression required in case label')
  return Number(x.v) === Number(y.v)
}

/** `case RED:` names an enum constant of the switch value's own enum, unqualified. */
const sameConstant = (value: R, label: Expr) => label.k === 'name' && value.value instanceof JObject && value.value.constant?.name === label.name

function matchCase(m: Machine, value: R, cases: readonly SwitchCase[]): number {
  const isEnum = value.value instanceof JObject && value.value.constant !== null
  for (let i = 0; i < cases.length; i++) {
    for (const label of cases[i]!.labels) {
      if (isEnum ? sameConstant(value, label) : caseMatches(value, evalExpr(m, label))) return i
    }
  }
  return cases.findIndex((c) => c.isDefault)
}

/** Runs from the matching case: arrow cases alone, colon cases falling through until something leaves. */
function runCases(m: Machine, cases: readonly SwitchCase[], start: number): Completion {
  return withScope(m, new Scope(m.frame.scope), () => {
    if (cases[start]!.arrow) return execList(m, cases[start]!.body, NO_LINE)
    for (let i = start; i < cases.length; i++) {
      const done = execList(m, cases[i]!.body, NO_LINE)
      if (done !== undefined) return done
    }
    return undefined
  })
}

export function execSwitch(m: Machine, s: Extract<Stmt, { k: 'switch' }>): Completion {
  const start = matchCase(m, switchValue(m, s.test), s.cases)
  if (start === -1) return undefined
  const done = runCases(m, s.cases, start)
  return done?.k === 'break' && done.label === null ? undefined : done
}

/** A switch expression's value: what the matching case yields. */
export function evalSwitch(m: Machine, e: Extract<Expr, { k: 'switch' }>): R {
  const start = matchCase(m, switchValue(m, e.test), e.cases)
  if (start === -1) throw new CompileStop('the switch expression does not cover all possible input values')
  const done = runCases(m, e.cases, start)
  if (done?.k !== 'yield') throw new CompileStop(done ? `${done.k} out of switch expression` : 'switch expression completes without providing a value')
  return done.value
}
