import { CompileError } from '../../shared/syntax'
import type { ClassDecl, FieldDecl, MethodDecl, Program } from '../lang/ast'
import { zeroOf } from './convert'
import { Slot } from './values'

export interface Method {
  decl: MethodDecl
  owner: ClassInfo
}

export interface ClassInfo {
  readonly decl: ClassDecl
  readonly name: string
  readonly outer: ClassInfo | null
  superclass: ClassInfo | null
  readonly interfaces: ClassInfo[]
  /** Declared supertype names, built-in ones included (Comparable, Comparator, Iterable). */
  readonly supertypes: readonly string[]
  readonly statics: Map<string, Slot>
  readonly nested: Map<string, ClassInfo>
  init: 'pending' | 'running' | 'done'
  readonly methodCache: Map<string, Method[]>
  fieldList: FieldDecl[] | null
}

function info(decl: ClassDecl, outer: ClassInfo | null): ClassInfo {
  const statics = new Map(decl.fields.filter((f) => f.isStatic).map((f) => [f.name, new Slot(f.type, zeroOf(f.type))]))
  const supertypes = [...(decl.superName ? [decl.superName] : []), ...decl.interfaces]
  return {
    decl, name: decl.name, outer, superclass: null, interfaces: [], supertypes, statics, nested: new Map(), init: 'pending',
    methodCache: new Map(), fieldList: null,
  }
}

/** Every class of the program, by name, with its supertypes linked. */
export class ClassTable {
  /** Classes in source order: prelude first, nested classes after their outer class. */
  readonly all: ClassInfo[] = []
  private readonly top = new Map<string, ClassInfo>()
  private readonly anonymous = new WeakMap<ClassDecl, ClassInfo>()

  constructor(program: Program) {
    for (const decl of program.classes) this.add(decl, null)
    for (const cls of this.all) this.link(cls)
  }

  private add(decl: ClassDecl, outer: ClassInfo | null): ClassInfo {
    const cls = info(decl, outer)
    this.all.push(cls)
    outer?.nested.set(decl.name, cls)
    if (!this.top.has(decl.name) || (this.top.get(decl.name)!.decl.prelude && !decl.prelude)) this.top.set(decl.name, cls)
    for (const inner of decl.nested) this.add(inner, cls)
    return cls
  }

  private link(cls: ClassInfo): void {
    const from = cls.outer
    for (const name of cls.decl.interfaces) {
      const iface = this.resolve(name, from ?? cls)
      if (iface) cls.interfaces.push(iface)
    }
    const superName = cls.decl.superName
    if (!superName) return
    const parent = this.resolve(superName, from ?? cls)
    if (parent?.decl.kind === 'interface') cls.interfaces.push(parent)
    else if (parent) cls.superclass = parent
    else if (!cls.decl.anonymous && superName !== 'Object') {
      throw new CompileError(`${cls.name} extends ${superName}: only your own classes and the built-in exceptions can be extended`, cls.decl.line)
    }
  }

  /** A class by simple or qualified name, as seen from inside `from`: nested classes of the enclosing classes first. */
  resolve(name: string, from: ClassInfo | null): ClassInfo | undefined {
    const simple = name.slice(name.lastIndexOf('.') + 1)
    for (let c = from; c; c = c.outer) {
      if (c.name === simple) return c
      const inner = c.nested.get(simple)
      if (inner) return inner
      for (let s = c.superclass; s; s = s.superclass) {
        const inherited = s.nested.get(simple)
        if (inherited) return inherited
      }
    }
    return this.top.get(simple)
  }

  /** The class behind `new Base() { ... }`, made once per place in the source. */
  anonymousClass(decl: ClassDecl, outer: ClassInfo | null): ClassInfo {
    let cls = this.anonymous.get(decl)
    if (!cls) {
      cls = info(decl, outer)
      this.anonymous.set(decl, cls)
      this.link(cls)
    }
    return cls
  }
}

/** Is `cls` the class `name`, or a subclass or implementation of it? */
export function isSubtype(cls: ClassInfo, name: string): boolean {
  if (name === 'Object' || cls.name === name || cls.supertypes.includes(name)) return true
  if (cls.superclass && isSubtype(cls.superclass, name)) return true
  return cls.interfaces.some((i) => isSubtype(i, name))
}

/** Methods named `name` visible on `cls`: its own first, then inherited ones, then interface defaults. */
export function methodsNamed(cls: ClassInfo, name: string): Method[] {
  let found = cls.methodCache.get(name)
  if (found) return found
  found = []
  const seen = new Set<ClassInfo>()
  const visit = (c: ClassInfo) => {
    if (seen.has(c)) return
    seen.add(c)
    for (const decl of c.decl.methods) if (decl.name === name) found!.push({ decl, owner: c })
    if (c.superclass) visit(c.superclass)
    for (const i of c.interfaces) visit(i)
  }
  visit(cls)
  cls.methodCache.set(name, found)
  return found
}

/** A static field of `cls` or of its supertypes. */
export function staticSlot(cls: ClassInfo, name: string): { slot: Slot; owner: ClassInfo } | undefined {
  const own = cls.statics.get(name)
  if (own) return { slot: own, owner: cls }
  if (cls.superclass) {
    const inherited = staticSlot(cls.superclass, name)
    if (inherited) return inherited
  }
  for (const i of cls.interfaces) {
    const constant = staticSlot(i, name)
    if (constant) return constant
  }
  return undefined
}

/** Instance fields, superclass fields first. Record components are fields too. */
export function instanceFields(cls: ClassInfo): FieldDecl[] {
  if (cls.fieldList) return cls.fieldList
  const inherited = cls.superclass ? instanceFields(cls.superclass) : []
  const components = cls.decl.components.map((p): FieldDecl => ({ name: p.name, type: p.type, init: null, isStatic: false, line: cls.decl.line }))
  cls.fieldList = [...inherited, ...components, ...cls.decl.fields.filter((f) => !f.isStatic)]
  return cls.fieldList
}
