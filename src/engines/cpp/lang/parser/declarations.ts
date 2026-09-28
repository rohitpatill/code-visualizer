import type { ClassDef, FuncDef, MemberInit, Param, Program, Stmt } from '../ast'
import { CompileError } from '../lexer'
import type { CType } from '../types'
import type { Cursor } from './cursor'
import { parseArgs } from './expressions'
import { parseParams } from './params'
import { parseBlockBody, parseDeclarators } from './statements'
import { isTypeStart, parseBaseType, parseDeclarator, parseType } from './typeSpec'

const ACCESS = new Set(['public', 'private', 'protected'])
const TRAILING = new Set(['const', 'override', 'noexcept', 'final'])
const OPERATORS = new Set(['<', '>', '<=', '>=', '==', '!=', '+', '-', '*', '/'])

interface FnParts {
  name: string
  owner: string | null
  params: Param[]
  ret: CType
  retRef: boolean
  inits?: MemberInit[]
  line: number
}

function define(c: Cursor, parts: FnParts, prelude: boolean): FuncDef | null {
  while (TRAILING.has(c.peek().text)) c.next()
  if (c.accept(';')) return null
  if (c.accept('=')) throw new CompileError('= default and = delete are not supported', parts.line)
  const { body, endLine } = parseBlockBody(c)
  return { ...parts, inits: parts.inits ?? [], body, endLine, prelude }
}

function addTo(map: Map<string, FuncDef[]>, fn: FuncDef): void {
  const existing = (map.get(fn.name) ?? []).filter((f) => !f.prelude || fn.prelude)
  map.set(fn.name, [...existing, fn])
}

function parseInits(c: Cursor): MemberInit[] {
  const inits: MemberInit[] = []
  if (!c.accept(':')) return inits
  do {
    const name = c.ident('a member to initialize')
    inits.push({ name, args: c.at('{') ? parseArgs(c, '{', '}') : parseArgs(c, '(', ')') })
  } while (c.accept(','))
  return inits
}

function operatorName(c: Cursor): string {
  c.expect('operator')
  if (c.accept('(')) {
    c.expect(')')
    throw new CompileError('operator() is not supported; use a lambda', c.line)
  }
  const op = c.next().text
  if (!OPERATORS.has(op)) throw new CompileError(`operator${op} is not supported`, c.line)
  return `operator${op}`
}

function parseMember(c: Cursor, cls: ClassDef, prelude: boolean): void {
  const line = c.line
  if (c.at('friend') || c.at('template')) throw new CompileError(`${c.peek().text} members are not supported`, line)
  if (c.at('static')) throw new CompileError('static members are not supported', line)
  c.accept('virtual')
  c.accept('explicit')
  if (c.accept('~')) {
    c.ident()
    parseParams(c)
    define(c, { name: '~', owner: cls.name, params: [], ret: { t: 'void' }, retRef: false, line }, prelude)
    return
  }
  if (c.at(cls.name) && c.at('(', 1)) {
    c.next()
    const params = parseParams(c)
    const inits = parseInits(c)
    const ctor = define(c, { name: cls.name, owner: cls.name, params, ret: { t: 'void' }, retRef: false, inits, line }, prelude)
    if (ctor) cls.ctors.push(ctor)
    return
  }
  const base = parseBaseType(c)
  const save = c.pos
  const { type, ref } = parseDeclarator(c, base)
  const isOperator = c.at('operator')
  if (isOperator || (c.peek().kind === 'ident' && c.at('(', 1))) {
    const name = isOperator ? operatorName(c) : c.ident()
    const params = parseParams(c)
    const method = define(c, { name, owner: cls.name, params, ret: type, retRef: ref, line }, prelude)
    if (method) addTo(cls.methods, method)
    return
  }
  c.pos = save
  cls.fields.push(...parseDeclarators(c, base))
  c.expect(';')
}

function parseClass(c: Cursor, program: Program, prelude: boolean): void {
  const line = c.next().line
  const name = c.ident('a class name')
  c.classNames.add(name)
  if (c.accept(';')) return
  if (c.at(':')) throw new CompileError('inheritance is not supported', c.line)
  c.expect('{')
  const cls: ClassDef = { name, fields: [], methods: new Map(), ctors: [], prelude, line }
  while (!c.accept('}')) {
    if (c.done) throw c.error("expected '}'")
    if (ACCESS.has(c.peek().text) && c.at(':', 1)) c.pos += 2
    else if (!c.accept(';')) parseMember(c, cls, prelude)
  }
  c.expect(';')
  program.classes.set(name, cls)
}

function parseAlias(c: Cursor): void {
  if (c.accept('typedef')) {
    const type = parseType(c)
    c.aliases.set(c.ident('an alias name'), type)
  } else {
    c.expect('using')
    if (c.accept('namespace')) {
      c.ident()
    } else {
      const name = c.ident('an alias name')
      c.expect('=')
      c.aliases.set(name, parseType(c))
    }
  }
  c.expect(';')
}

function startsFunction(c: Cursor): boolean {
  if (!c.at('(')) return false
  const save = c.pos
  c.next()
  const yes = c.at(')') || isTypeStart(c)
  c.pos = save
  return yes
}

/** Functions, classes, aliases and global variables, in source order. */
export function parseTopLevel(c: Cursor, program: Program, prelude: boolean): void {
  while (!c.done) {
    const line = c.line
    if (c.accept(';')) continue
    if (c.at('using') || c.at('typedef')) {
      parseAlias(c)
      continue
    }
    if (c.at('template')) throw new CompileError('templates are not supported', line)
    if ((c.at('struct') || c.at('class')) && c.peek(1).kind === 'ident' && (c.at('{', 2) || c.at(';', 2) || c.at(':', 2))) {
      parseClass(c, program, prelude)
      continue
    }
    const base = parseBaseType(c)
    const save = c.pos
    const { type, ref } = parseDeclarator(c, base)
    let name = c.ident('a function or variable name')
    let owner: string | null = null
    if (c.accept('::')) {
      owner = name
      name = c.ident('a method name')
    }
    if (startsFunction(c)) {
      const params = parseParams(c)
      const fn = define(c, { name, owner, params, ret: type, retRef: ref, line }, prelude)
      if (!fn) continue
      const cls = owner ? program.classes.get(owner) : null
      if (owner && !cls) throw new CompileError(`unknown class ${owner}`, line)
      addTo(cls ? cls.methods : program.functions, fn)
      continue
    }
    c.pos = save
    const decls = parseDeclarators(c, base)
    c.expect(';')
    program.globals.push({ k: 'decl', decls, line } satisfies Stmt)
  }
}
