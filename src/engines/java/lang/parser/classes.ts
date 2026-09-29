import { CompileError } from '../../../shared/syntax'
import type { ClassDecl, FieldDecl, MethodDecl, Param } from '../ast'
import { type JType, T, arrayOf } from '../types'
import { parseArgs, parseArrayInit, parseExpr } from './expressions'
import { parseBlock } from './statements'
import { type Cursor, arrayDims, parseType, qualifiedName, skipAnnotations, skipTypeParams } from './types'

const MODIFIERS = new Set([
  'public', 'private', 'protected', 'static', 'final', 'abstract', 'native', 'synchronized', 'transient', 'volatile', 'strictfp',
  'default', 'sealed',
])
const TYPE_WORDS = new Set(['class', 'interface', 'record', 'enum'])

interface Modifiers {
  isStatic: boolean
  isAbstract: boolean
}

function modifiers(c: Cursor): Modifiers {
  const mods: Modifiers = { isStatic: false, isAbstract: false }
  for (;;) {
    skipAnnotations(c)
    if (c.at('non') && c.at('-', 1) && c.at('sealed', 2)) c.pos += 3
    else if (MODIFIERS.has(c.peek().text) && c.peek().kind === 'ident' && !(c.at('default') && (c.at(':', 1) || c.at('->', 1)))) {
      const word = c.next().text
      if (word === 'static') mods.isStatic = true
      if (word === 'abstract') mods.isAbstract = true
    } else return mods
  }
}

function emptyClass(name: string, line: number, prelude: boolean): ClassDecl {
  return {
    name, kind: 'class', superName: null, interfaces: [], isStatic: true, isAbstract: false, fields: [], methods: [], ctors: [],
    staticInit: [], instanceInit: [], nested: [], components: [], compactCtor: null, constants: [], anonymous: false, prelude, line,
    endLine: line,
  }
}

/** `(int a, String... rest)`. Varargs become an array parameter. */
function parseParams(c: Cursor): { params: Param[]; varargs: boolean } {
  c.expect('(')
  const params: Param[] = []
  let varargs = false
  while (!c.at(')')) {
    if (varargs) throw c.error('a varargs parameter must be the last one')
    let type: JType = parseType(c)
    if (c.accept('...')) {
      varargs = true
      type = arrayOf(type)
    }
    const name = c.ident('a parameter name')
    params.push({ name, type: arrayOf(type, arrayDims(c)) })
    if (!c.accept(',')) break
  }
  c.expect(')')
  return { params, varargs }
}

function typeList(c: Cursor): string[] {
  const names = [typeRefName(c)]
  while (c.accept(',')) names.push(typeRefName(c))
  return names
}

/** The class a type refers to, without its type arguments. */
function typeRefName(c: Cursor): string {
  const type = parseType(c)
  if (type.t !== 'ref') throw new CompileError('expected a class or interface name', c.line)
  return type.name
}

function parseMethod(c: Cursor, name: string, ret: JType, mods: Modifiers, owner: ClassDecl, line: number): MethodDecl {
  const { params, varargs } = parseParams(c)
  arrayDims(c)
  if (c.accept('throws')) typeList(c)
  const isInterface = owner.kind === 'interface'
  if (c.accept(';')) {
    if (!mods.isAbstract && !isInterface) throw new CompileError(`missing method body, or declare ${name} abstract`, line)
    return { name, params, varargs, ret, body: null, isStatic: mods.isStatic, line, endLine: line }
  }
  const { body, endLine } = parseBlock(c)
  return { name, params, varargs, ret, body, isStatic: mods.isStatic, line, endLine }
}

function parseFields(c: Cursor, type: JType, first: string, line: number, isStatic: boolean, cls: ClassDecl): void {
  let name = first
  let at = line
  for (;;) {
    const fieldType = arrayOf(type, arrayDims(c))
    const init = c.accept('=') ? (c.at('{') ? parseArrayInit(c) : parseExpr(c)) : null
    const field: FieldDecl = { name, type: fieldType, init, isStatic, line: at }
    cls.fields.push(field)
    ;(isStatic ? cls.staticInit : cls.instanceInit).push({ k: 'field', field })
    if (!c.accept(',')) break
    at = c.line
    name = c.ident('a field name')
  }
  c.expect(';')
}

function parseMember(c: Cursor, cls: ClassDecl): void {
  const line = c.line
  if (c.at('{') || (c.at('static') && c.at('{', 1))) {
    const isStatic = c.accept('static')
    cls[isStatic ? 'staticInit' : 'instanceInit'].push({ k: 'block', body: parseBlock(c).body, line })
    return
  }
  const mods = modifiers(c)
  if (TYPE_WORDS.has(c.peek().text) && c.peek(1).kind === 'ident') {
    cls.nested.push(parseClass(c, mods, cls.prelude, cls))
    return
  }
  skipTypeParams(c)
  const at = c.line
  if (c.at(cls.name) && c.at('(', 1)) {
    c.next()
    cls.ctors.push(parseMethod(c, cls.name, T.void, mods, cls, at))
    return
  }
  if (cls.kind === 'record' && c.at(cls.name) && c.at('{', 1)) {
    c.next()
    cls.compactCtor = parseBlock(c).body
    return
  }
  const type = parseType(c)
  const nameLine = c.line
  const name = c.ident('a field or method name')
  const isStatic = mods.isStatic || (cls.kind === 'interface' && !c.at('('))
  if (c.at('(')) cls.methods.push(parseMethod(c, name, type, mods, cls, nameLine))
  else parseFields(c, type, name, nameLine, isStatic, cls)
}

/** `PLUS { int apply(int a, int b) { ... } }`: a constant's own subclass of its enum, named `Op.PLUS` in frames. */
function parseConstantBody(c: Cursor, owner: ClassDecl, name: string, line: number): ClassDecl {
  const body = parseAnonymousClass(c, owner.name, line)
  body.name = `${owner.name}.${name}`
  body.isStatic = true
  return body
}

/** `RED, GREEN("g"), BLUE;` at the start of an enum body. */
function parseEnumConstants(c: Cursor, cls: ClassDecl): void {
  while (!c.at(';') && !c.at('}')) {
    skipAnnotations(c)
    const line = c.line
    const name = c.ident('an enum constant')
    const args = c.at('(') ? parseArgs(c) : []
    const body = c.at('{') ? parseConstantBody(c, cls, name, line) : null
    cls.constants.push({ name, args, body, line })
    if (!c.accept(',')) break
  }
  c.accept(';')
}

function parseClassBody(c: Cursor, cls: ClassDecl): void {
  c.expect('{')
  if (cls.kind === 'enum') parseEnumConstants(c, cls)
  while (!c.at('}')) {
    if (c.done) throw c.error("reached end of file while parsing, expected '}'")
    if (!c.accept(';')) parseMember(c, cls)
  }
  cls.endLine = c.next().line
}

function parseClass(c: Cursor, mods: Modifiers, prelude: boolean, outer: ClassDecl | null): ClassDecl {
  const word = c.next().text
  const line = c.line
  const cls = emptyClass(c.ident('a class name'), line, prelude)
  cls.kind = word as ClassDecl['kind']
  cls.isAbstract = mods.isAbstract || cls.kind === 'interface'
  cls.isStatic = !outer || mods.isStatic || cls.kind !== 'class' || outer.kind === 'interface'
  skipTypeParams(c)
  if (cls.kind === 'record') cls.components = parseParams(c).params
  if (c.accept('extends')) {
    const names = typeList(c)
    if (cls.kind === 'interface') cls.interfaces.push(...names)
    else if (names.length > 1) throw new CompileError('a class can extend only one class', line)
    else cls.superName = names[0]!
  }
  if (c.accept('implements')) cls.interfaces.push(...typeList(c))
  if (c.accept('permits')) typeList(c)
  parseClassBody(c, cls)
  return cls
}

/** The body of `new Comparator<T>() { ... }`: a class with no name that extends or implements `base`. */
export function parseAnonymousClass(c: Cursor, base: string, line: number): ClassDecl {
  const cls = emptyClass(`anonymous ${base}`, line, false)
  cls.superName = base
  cls.anonymous = true
  cls.isStatic = false
  parseClassBody(c, cls)
  return cls
}

function skipHeader(c: Cursor): void {
  for (;;) {
    if (c.accept('package') || c.accept('import')) {
      c.accept('static')
      qualifiedName(c)
      if (c.accept('.')) c.expect('*')
      c.expect(';')
    } else if (!c.accept(';')) return
  }
}

/** The classes, interfaces and records of one source file, in order. */
export function parseCompilationUnit(c: Cursor, prelude: boolean): ClassDecl[] {
  skipHeader(c)
  const classes: ClassDecl[] = []
  while (!c.done) {
    if (c.accept(';')) continue
    const mods = modifiers(c)
    if (!TYPE_WORDS.has(c.peek().text)) {
      throw new CompileError('expected a class, interface or record here. Statements go inside a method; if your code has its own main(), leave the call box empty', c.line)
    }
    classes.push(parseClass(c, mods, prelude, null))
  }
  return classes
}
