import type { Initializer, MethodDecl } from '../lang/ast'
import { type ClassInfo, instanceFields, isSubtype } from './classes'
import { bindArgs, pickMethod, runFrame } from './calls'
import { convert, zeroOf } from './convert'
import { CompileStop } from './errors'
import { evalExpr, initialValue } from './eval'
import { execBody, execList } from './exec'
import type { Machine } from './machine'
import { Scope } from './scope'
import { JObject, type R, Slot } from './values'

const NO_LINE = -1

function runInitializers(m: Machine, inits: readonly Initializer[], target: (name: string) => Slot): void {
  for (const init of inits) {
    if (init.k === 'block') execList(m, init.body, NO_LINE)
    else if (init.field.init) {
      const slot = target(init.field.name)
      slot.value = initialValue(m, init.field.init, slot.type)
    }
  }
}

/**
 * Runs a class's static initializers the first time the class is used, as
 * the JVM does, in a `<clinit>` frame. The superclass goes first.
 */
export function ensureInit(m: Machine, cls: ClassInfo): void {
  if (cls.init !== 'pending') return
  cls.init = 'running'
  if (cls.superclass) ensureInit(m, cls.superclass)
  const inits = cls.decl.staticInit.filter((i) => i.k === 'block' || i.field.init)
  if (inits.length) {
    const lineOf = (i: Initializer) => (i.k === 'block' ? i.line : i.field.line)
    const frame = m.pushFrame({ name: `${cls.name}.<clinit>`, line: lineOf(inits[0]!), scope: new Scope(null), self: null, cls, silent: cls.decl.prelude, showThis: false })
    const run = () => {
      for (const init of inits) {
        if (init.k === 'field') m.step(init.field.line)
        runInitializers(m, [init], (name) => cls.statics.get(name)!)
      }
      return undefined
    }
    runFrame(m, frame, run, { t: 'void' }, lineOf(inits[inits.length - 1]!))
  }
  cls.init = 'done'
}

/** The object an inner class instance belongs to: `this`, or the enclosing instance of the right class. */
function enclosingInstance(m: Machine, cls: ClassInfo): JObject | null {
  const outer = cls.outer
  if (cls.decl.isStatic || !outer) return null
  for (let obj = m.frame.self; obj; obj = obj.outer) if (isSubtype(obj.cls, outer.name)) return obj
  throw new CompileStop(`non-static variable this cannot be referenced from a static context: make ${cls.name} a static class, or create it inside an instance method of ${outer.name}`)
}

/** `new C(args)`: fields start at zero, then the constructor chain runs. */
export function instantiate(m: Machine, cls: ClassInfo, args: readonly R[], outer: JObject | null | undefined, env: Scope | null): JObject {
  if (cls.decl.kind === 'interface' || (cls.decl.isAbstract && !cls.decl.anonymous)) throw new CompileStop(`${cls.name} is abstract; cannot be instantiated`)
  ensureInit(m, cls)
  const obj = new JObject(cls, outer === undefined ? enclosingInstance(m, cls) : outer, env)
  for (const f of instanceFields(cls)) obj.fields.set(f.name, new Slot(f.type, zeroOf(f.type)))
  construct(m, cls, obj, args)
  return obj
}

function withObjectFrame(m: Machine, cls: ClassInfo, obj: JObject, run: () => void): void {
  const frame = m.pushFrame({ name: `new ${cls.name}`, line: cls.decl.line, scope: new Scope(null), self: obj, cls, silent: true, showThis: false })
  try {
    run()
  } finally {
    m.popFrame(frame)
  }
}

/** A record without its own canonical constructor: components go straight into the fields, after an optional compact body. */
function constructRecord(m: Machine, cls: ClassInfo, obj: JObject, args: readonly R[]): void {
  const components = cls.decl.components
  if (args.length !== components.length) throw new CompileStop(`constructor ${cls.name} cannot take ${args.length} arguments`)
  const compact = cls.decl.compactCtor
  const scope = new Scope(null)
  components.forEach((c, i) => scope.vars.set(c.name, new Slot(c.type, convert(m, args[i]!, c.type))))
  if (compact) {
    const frame = m.pushFrame({ name: `new ${cls.name}`, line: cls.decl.line, scope, self: obj, cls, silent: cls.decl.prelude, showThis: true })
    runFrame(m, frame, () => execBody(m, compact, scope), { t: 'void' }, cls.decl.endLine, obj)
  }
  for (const c of components) obj.fields.get(c.name)!.value = scope.vars.get(c.name)!.value
}

const isCanonical = (cls: ClassInfo, ctor: MethodDecl) => ctor.params.length === cls.decl.components.length

/** Runs the constructor of `cls` that fits `args` on an allocated object, including its superclass constructors. */
export function construct(m: Machine, cls: ClassInfo, obj: JObject, args: readonly R[]): void {
  const decl = cls.decl
  const ctors = decl.ctors
  if (decl.kind === 'record' && !ctors.some((c) => isCanonical(cls, c)) && args.length === decl.components.length) {
    constructRecord(m, cls, obj, args)
    return
  }
  if (!ctors.length) {
    if (args.length && !decl.anonymous) throw new CompileStop(`constructor ${cls.name} in class ${cls.name} cannot be applied to ${args.length} arguments`)
    if (cls.superclass) construct(m, cls.superclass, obj, decl.anonymous ? args : [])
    if (decl.instanceInit.length) withObjectFrame(m, cls, obj, () => runInitializers(m, decl.instanceInit, (name) => obj.fields.get(name)!))
    return
  }
  const { decl: ctor } = pickMethod(m, ctors.map((d) => ({ decl: d, owner: cls })), args, `constructor ${cls.name}`)
  const scope = new Scope(null)
  bindArgs(m, ctor, args, scope)
  const frame = m.pushFrame({ name: `new ${cls.name}`, line: ctor.line, scope, self: obj, cls, silent: decl.prelude, showThis: true })
  runFrame(m, frame, () => {
    const [first, ...rest] = ctor.body ?? []
    const explicit = first?.k === 'ctorCall' ? first : null
    if (explicit) {
      m.step(explicit.line)
      const callArgs = explicit.args.map((a) => evalExpr(m, a))
      if (explicit.which === 'this') construct(m, cls, obj, callArgs)
      else if (cls.superclass) construct(m, cls.superclass, obj, callArgs)
    } else if (cls.superclass) construct(m, cls.superclass, obj, [])
    if (explicit?.which !== 'this') runInitializers(m, decl.instanceInit, (name) => obj.fields.get(name)!)
    return execBody(m, explicit ? rest : (ctor.body ?? []), scope, explicit?.line)
  }, { t: 'void' }, ctor.endLine, obj)
}
