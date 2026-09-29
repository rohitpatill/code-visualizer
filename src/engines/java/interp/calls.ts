import type { Expr } from '../lang/ast'
import { type JType, T } from '../lang/types'
import { type ClassInfo, type Method, isSubtype, methodsNamed } from './classes'
import { convert } from './convert'
import { CompileStop, Fault, JavaThrow } from './errors'
import { evalExpr } from './eval'
import { describeNull } from './names'
import { type Completion, execBody } from './exec'
import { callLibMethod, callLibStatic } from './lib'
import { NoMethod } from './lib/common'
import { classRefMethod, objectMethod } from './lib/objects'
import type { Frame, Machine } from './machine'
import { enumStatic } from './enums'
import { ensureInit } from './objects'
import { VOID, isRawPrim, refR } from './ops'
import { Scope } from './scope'
import { asThrow, throwableText } from './throwing'
import { argText, bindArgs, pickMethod } from './overloads'
import { ClassRef, FnVal, JObject, type R, Slot } from './values'

type FnImplLambda = Extract<FnVal['impl'], { kind: 'lambda' }>

const OBJECT_METHODS = new Set(['getClass', 'hashCode', 'equals', 'toString'])
function finish(m: Machine, frame: Frame, done: Completion, ret: JType, endLine: number, made?: JObject): R {
  if (done && done.k !== 'return') throw new CompileStop(`${done.k} outside of a loop or switch`)
  const returned = done?.value ?? null
  if (done && ret.t === 'void' && returned && !made) throw new CompileStop('incompatible types: unexpected return value')
  if (ret.t !== 'void' && ret.t !== 'var' && !returned) throw new CompileStop(done ? 'missing return value' : `missing return statement in ${frame.name}()`)
  let result: R = VOID
  if (made) result = refR(made, { t: 'ref', name: made.cls.name, args: [] })
  else if (returned && ret.t === 'var') result = returned
  else if (returned) result = { type: ret, value: convert(m, returned, ret) }
  const line = done?.line ?? endLine
  frame.line = line
  m.record('return', line, result === VOID ? {} : { ret: result })
  return result
}

/**
 * Runs a pushed frame: records the call, the body, and the return. An
 * exception leaving the frame is recorded again in the caller, where it now
 * is. Running out of JavaScript stack is Java's StackOverflowError, raised in
 * the deepest frame that has room left to build it.
 */
export function runFrame(m: Machine, frame: Frame, body: () => Completion, ret: JType, endLine: number, made?: JObject): R {
  let popped = false
  try {
    m.record('call', frame.line)
    return finish(m, frame, body(), ret, endLine, made)
  } catch (err) {
    const thrown = asThrow(m, err instanceof RangeError ? new Fault('StackOverflowError') : err)
    if (!(thrown instanceof JavaThrow)) m.noteError(thrown, frame)
    m.popFrame(frame)
    popped = true
    if (thrown instanceof JavaThrow && !m.silent) m.record('exception', m.frame.line, { exc: throwableText(thrown.exc) })
    throw thrown
  } finally {
    if (!popped) m.popFrame(frame)
  }
}

export function invokeMethod(m: Machine, { decl, owner }: Method, self: JObject | null, args: readonly R[]): R {
  const body = decl.body
  if (!body) throw new CompileStop(`${owner.name}.${decl.name}() has no body: it is abstract`)
  if (decl.isStatic) ensureInit(m, owner)
  const scope = new Scope(null)
  bindArgs(m, decl, args, scope)
  const frame = m.pushFrame({
    name: `${owner.name}.${decl.name}`, line: decl.line, scope, self: decl.isStatic ? null : self, cls: owner, silent: owner.decl.prelude,
    showThis: !decl.isStatic,
  })
  return runFrame(m, frame, () => execBody(m, body, scope), decl.ret, decl.endLine)
}

function invokeLambda(m: Machine, impl: FnImplLambda, args: readonly R[]): R {
  if (args.length !== impl.params.length) throw new CompileStop(`this lambda takes ${impl.params.length} arguments, but was called with ${args.length}`)
  const scope = new Scope(impl.scope)
  impl.params.forEach((p, i) => {
    const a = args[i]!
    const type = p.type ?? (isRawPrim(a) ? a.type : T.object)
    scope.vars.set(p.name, new Slot(type, p.type ? convert(m, a, type) : a.value))
  })
  const frame = m.pushFrame({ name: 'lambda', line: impl.line, scope, self: impl.self, cls: impl.cls, silent: false, showThis: false })
  const body = impl.body
  const run = Array.isArray(body) ? () => execBody(m, body, scope) : (): Completion => ({ k: 'return', value: evalExpr(m, body as Expr), line: impl.line })
  return runFrame(m, frame, run, T.var, impl.endLine)
}

/** Calls a lambda, method reference, built-in comparator, or an object implementing a functional interface. */
export function invokeCallable(m: Machine, fn: R['value'], args: readonly R[], sam = ''): R {
  if (fn instanceof FnVal) return fn.impl.kind === 'native' ? fn.impl.call(m, args) : invokeLambda(m, fn.impl, args)
  if (fn instanceof JObject) {
    const named = sam ? methodsNamed(fn.cls, sam).find((x) => x.decl.body) : undefined
    const decl = named?.decl ?? fn.cls.decl.methods.find((x) => !x.isStatic && x.body)
    if (!decl) throw new CompileStop(`${fn.cls.name} has no ${sam || 'functional'} method to call`)
    return invokeMethod(m, named ?? { decl, owner: fn.cls }, fn, args)
  }
  if (fn === null) throw new Fault('NullPointerException', `Cannot invoke "${sam || 'apply'}()" because the value is null`)
  throw new CompileStop('this value is not a function')
}

/** A method the built-in part of `obj` answers: an inherited LinkedHashMap or ArrayList method. getClass stays the user class. */
const inheritedFromLib = (obj: JObject, name: string) => obj.base !== undefined && name !== 'getClass'

/** `obj.m(args)` on a user object: the most-derived overload that fits, then inherited built-in methods, then Object's. */
export function callObjectMethod(m: Machine, obj: JObject, name: string, args: readonly R[]): R {
  const found = methodsNamed(obj.cls, name)
  if (found.length) return invokeMethod(m, pickMethod(m, found, args, `method ${name}`), obj, args)
  if (inheritedFromLib(obj, name)) return callLibMethod(m, refR(obj.base!), name, args)
  return objectMethod(m, obj, name, args)
}

export function callStatic(m: Machine, cls: ClassInfo, name: string, args: readonly R[]): R {
  ensureInit(m, cls)
  const found = methodsNamed(cls, name).filter((x) => x.decl.isStatic)
  if (!found.length) {
    const builtin = cls.decl.kind === 'enum' ? enumStatic(cls, name, args) : null
    if (builtin) return builtin
    throw new CompileStop(`cannot find symbol: static method ${name}(...) in class ${cls.name}`)
  }
  return invokeMethod(m, pickMethod(m, found, args, `method ${name}`), null, args)
}

/** `target.name(args)` for any value. `recv` is the receiver's source, for NullPointerException messages. */
export function callMethod(m: Machine, target: R, name: string, args: readonly R[], recv: Expr | null = null): R {
  const v = target.value
  if (v === null) throw new Fault('NullPointerException', `Cannot invoke "${name}()" because ${describeNull(recv)} is null`)
  if (v instanceof ClassRef) return classRefMethod(v, name) ?? (v.cls ? callStatic(m, v.cls, name, args) : callLibStatic(m, v.name, name, args))
  if (v instanceof JObject) return callObjectMethod(m, v, name, args)
  return callLibMethod(m, target, name, args)
}

/** The instance an unqualified call to an instance method of `cls` runs on: `this`, or an enclosing instance. */
function receiverFor(m: Machine, cls: ClassInfo): JObject | null {
  for (let obj = m.frame.self; obj; obj = obj.outer) if (isSubtype(obj.cls, cls.name)) return obj
  return null
}

/** An unqualified call to a method `cls` inherits from a built-in class, or null if the built-in class has no such method. */
function inheritedCall(m: Machine, cls: ClassInfo, name: string, args: readonly R[]): R | null {
  const self = receiverFor(m, cls)
  if (!self || !inheritedFromLib(self, name)) return null
  try {
    return callLibMethod(m, refR(self.base!), name, args)
  } catch (err) {
    if (err instanceof NoMethod) return null
    throw err
  }
}

/** `name(args)` with no receiver: methods of this class and the enclosing classes, then the built-in helpers. */
export function callUnqualified(m: Machine, name: string, args: readonly R[]): R {
  for (let cls = m.frame.cls; cls; cls = cls.outer) {
    const found = methodsNamed(cls, name)
    if (!found.length) {
      const builtin = cls.decl.kind === 'enum' ? enumStatic(cls, name, args) : null
      if (builtin) return builtin
      const inherited = inheritedCall(m, cls, name, args)
      if (inherited) return inherited
      continue
    }
    const method = pickMethod(m, found, args, `method ${name}`)
    if (method.decl.isStatic) return invokeMethod(m, method, null, args)
    const self = receiverFor(m, cls)
    if (!self) throw new CompileStop(`non-static method ${name}(...) cannot be referenced from a static context`)
    return callObjectMethod(m, self, name, args)
  }
  const self = m.frame.self
  if (self && (OBJECT_METHODS.has(name) || self.constant)) return callObjectMethod(m, self, name, args)
  for (const cls of m.classes.all) {
    if (!cls.decl.prelude) continue
    const found = methodsNamed(cls, name).filter((x) => x.decl.isStatic)
    if (found.length) return invokeMethod(m, pickMethod(m, found, args, `method ${name}`), null, args)
  }
  throw new CompileStop(`cannot find symbol: method ${name}(${args.map(argText).join(', ')})`)
}

/** `super.name(args)`: the superclass's version, not the override. */
export function callSuper(m: Machine, name: string, args: readonly R[]): R {
  const self = m.frame.self
  if (!self) throw new CompileStop('non-static variable super cannot be referenced from a static context')
  const sup = m.frame.cls?.superclass
  const found = sup ? methodsNamed(sup, name) : []
  if (found.length) return invokeMethod(m, pickMethod(m, found, args, `method ${name}`), self, args)
  if (inheritedFromLib(self, name)) return callLibMethod(m, refR(self.base!), name, args)
  return objectMethod(m, self, name, args)
}
