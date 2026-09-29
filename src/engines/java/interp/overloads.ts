import type { MethodDecl } from '../lang/ast'
import { type JType, T, primOf, typeName, widens } from '../lang/types'
import type { Method } from './classes'
import { convert, primValue } from './convert'
import { CompileStop } from './errors'
import { instanceOfType, isKnownType } from './lib/types'
import type { Machine } from './machine'
import { isRawPrim, refR } from './ops'
import type { Scope } from './scope'
import { JArray, JObject, JStr, type R, Slot } from './values'

const NOT_APPLICABLE = -Infinity
const VARARGS_PENALTY = 100

/** How well an argument fits a parameter type: higher is a closer match, as Java's overload phases rank them. */
function fit(m: Machine, param: JType, arg: R): number {
  if (param.t === 'var') return 1
  if (param.t === 'prim') {
    const u = primValue(arg)
    if (!u) return NOT_APPLICABLE
    if (isRawPrim(arg)) return u.p === param.name ? 6 : widens(u.p, param.name) ? 5 : NOT_APPLICABLE
    return widens(u.p, param.name) ? 2 : NOT_APPLICABLE
  }
  if (isRawPrim(arg)) {
    const box = primOf(param)
    if (box) return box === (arg.type as { name: string }).name ? 3 : NOT_APPLICABLE
    return param.t === 'ref' && isKnownType(m, param.name) && !['Object', 'Number', 'Comparable'].includes(param.name) ? NOT_APPLICABLE : 1
  }
  const v = arg.value
  if (v === null) return 3
  if (param.t === 'array') return v instanceof JArray && typeName(v.type) === typeName(param) ? 5 : v instanceof JArray ? 2 : NOT_APPLICABLE
  if (param.t !== 'ref') return NOT_APPLICABLE
  if (!isKnownType(m, param.name)) return 1
  if (!instanceOfType(m, v, param)) return NOT_APPLICABLE
  const exact = (v instanceof JObject && v.cls.name === param.name) || (v instanceof JStr && param.name === 'String')
  return exact ? 5 : param.name === 'Object' ? 1 : 3
}

function applicability(m: Machine, decl: MethodDecl, args: readonly R[]): number {
  const params = decl.params
  const fixed = decl.varargs ? params.length - 1 : params.length
  if (args.length < fixed || (!decl.varargs && args.length !== fixed)) return NOT_APPLICABLE
  let total = 0
  for (let i = 0; i < fixed; i++) total += fit(m, params[i]!.type, args[i]!)
  if (!decl.varargs) return total
  const last = params[fixed]!.type
  if (args.length === params.length && fit(m, last, args[fixed]!) > NOT_APPLICABLE && (args[fixed]!.value instanceof JArray || args[fixed]!.value === null)) {
    return total + fit(m, last, args[fixed]!)
  }
  const elem = last.t === 'array' ? last.of : T.object
  for (let i = fixed; i < args.length; i++) total += fit(m, elem, args[i]!)
  return total - VARARGS_PENALTY
}

export const argText = (r: R) => (r.value === null ? '<null>' : r.value instanceof JStr ? 'String' : r.value instanceof JObject ? r.value.cls.name : typeName(r.type))

/** The overload that fits `args` best. Candidates come most-derived first, so an override wins over what it overrides. */
export function pickMethod(m: Machine, candidates: readonly Method[], args: readonly R[], what: string): Method {
  let best: Method | null = null
  let bestScore = NOT_APPLICABLE
  for (const c of candidates) {
    const score = applicability(m, c.decl, args)
    if (score > bestScore) {
      best = c
      bestScore = score
    }
  }
  if (!best) throw new CompileStop(`no suitable ${what} found for (${args.map(argText).join(', ')})`)
  return best
}

/** Binds arguments to parameters, packing extra arguments into the varargs array. */
export function bindArgs(m: Machine, decl: MethodDecl, args: readonly R[], scope: Scope): void {
  const params = decl.params
  let values = args
  if (decl.varargs) {
    const fixed = params.length - 1
    const last = params[fixed]!.type as Extract<JType, { t: 'array' }>
    const direct = args.length === params.length && (args[fixed]!.value instanceof JArray || args[fixed]!.value === null)
    if (!direct) {
      const packed = new JArray(last, args.slice(fixed).map((a) => convert(m, a, last.of)))
      values = [...args.slice(0, fixed), refR(packed, last)]
    }
  }
  params.forEach((p, i) => scope.vars.set(p.name, new Slot(p.type, convert(m, values[i]!, p.type))))
}
