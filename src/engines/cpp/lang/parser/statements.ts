import type { Expr, Stmt, SwitchCase, VarDecl } from '../ast'
import { CompileError } from '../lexer'
import type { CType } from '../types'
import type { Cursor } from './cursor'
import { parseArgs, parseComma, parseExpr, parseInitList } from './expressions'
import { isTypeStart, parseBaseType, parseDeclarator } from './typeSpec'

type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
const node = (line: number, s: Without<Stmt, 'line'>): Stmt => ({ ...s, line }) as Stmt

const KEYWORDS = new Set([
  'delete', 'new', 'sizeof', 'case', 'default', 'else', 'do', 'return', 'throw', 'goto', 'typedef', 'using', 'namespace',
  'struct', 'class', 'template', 'operator', 'if', 'while', 'for', 'switch', 'break', 'continue',
])

const UNSUPPORTED: Readonly<Record<string, string>> = {
  try: 'exceptions (try/catch) are not supported',
  throw: 'exceptions (throw) are not supported',
  goto: 'goto is not supported',
  template: 'templates are not supported',
}

/** Does a declaration start here? Checks `type name` without consuming anything. */
export function isDeclaration(c: Cursor): boolean {
  if (!isTypeStart(c)) return false
  const save = c.pos
  const ok = c.attempt(() => {
    const base = parseBaseType(c)
    parseDeclarator(c, base)
    return c.peek().kind === 'ident' || (base.t === 'auto' && c.at('['))
  })
  c.pos = save
  return ok === true
}

export function parseBlockBody(c: Cursor): { body: Stmt[]; endLine: number } {
  c.expect('{')
  const body: Stmt[] = []
  while (!c.at('}')) {
    if (c.done) throw c.error("expected '}'")
    body.push(parseStatement(c))
  }
  return { body, endLine: c.next().line }
}

function structuredNames(c: Cursor): string[] {
  c.expect('[')
  const names = [c.ident()]
  while (c.accept(',')) names.push(c.ident())
  c.expect(']')
  return names
}

export function parseDeclarators(c: Cursor, base: CType): VarDecl[] {
  const decls: VarDecl[] = []
  do {
    const { type, ref } = parseDeclarator(c, base)
    const at = c.line
    const name = c.ident('a variable name')
    const dims: (Expr | null)[] = []
    while (c.accept('[')) {
      dims.push(c.at(']') ? null : parseExpr(c))
      c.expect(']')
    }
    let init: Expr | null = null
    let ctorArgs: Expr[] | null = null
    if (c.accept('=')) init = c.at('{') ? parseInitList(c) : parseExpr(c)
    else if (c.at('(')) ctorArgs = parseArgs(c, '(', ')')
    else if (c.at('{')) init = parseInitList(c)
    decls.push({ name, type, ref, init, ctorArgs, dims, line: at })
  } while (c.accept(','))
  return decls
}

/** `int a = 1, *p;` or `auto [x, y] = pair;`, including the semicolon. */
export function parseDeclaration(c: Cursor): Stmt {
  const line = c.line
  const base = parseBaseType(c)
  if (base.t === 'auto') {
    const save = c.pos
    const { ref } = parseDeclarator(c, base)
    if (c.at('[')) {
      const names = structuredNames(c)
      c.expect('=')
      const init = parseExpr(c)
      c.expect(';')
      return node(line, { k: 'bind', names, ref, init })
    }
    c.pos = save
  }
  const decls = parseDeclarators(c, base)
  c.expect(';')
  return node(line, { k: 'decl', decls })
}

function parenthesized(c: Cursor): Expr {
  c.expect('(')
  const e = parseComma(c)
  c.expect(')')
  return e
}

function parseFor(c: Cursor, line: number): Stmt {
  c.expect('(')
  if (isDeclaration(c)) {
    const save = c.pos
    const base = parseBaseType(c)
    const { type, ref } = parseDeclarator(c, base)
    const names = c.at('[') ? structuredNames(c) : [c.ident()]
    if (c.accept(':')) {
      const range = parseExpr(c)
      c.expect(')')
      return node(line, { k: 'range', names, type, ref, range, body: parseStatement(c) })
    }
    c.pos = save
  }
  const init = c.accept(';') ? null : isDeclaration(c) ? parseDeclaration(c) : parseExpressionStatement(c)
  const test = c.at(';') ? null : parseComma(c)
  c.expect(';')
  const update = c.at(')') ? null : parseComma(c)
  c.expect(')')
  return node(line, { k: 'for', init, test, update, body: parseStatement(c) })
}

function parseSwitch(c: Cursor, line: number): Stmt {
  const test = parenthesized(c)
  c.expect('{')
  const cases: SwitchCase[] = []
  while (!c.accept('}')) {
    const at = c.line
    let caseTest: Expr | null = null
    if (c.accept('case')) caseTest = parseExpr(c)
    else if (!c.accept('default')) throw c.error("expected 'case' or 'default'")
    c.expect(':')
    const body: Stmt[] = []
    while (!c.at('case') && !c.at('default') && !c.at('}')) body.push(parseStatement(c))
    cases.push({ test: caseTest, body, line: at })
  }
  return node(line, { k: 'switch', test, cases })
}

function parseExpressionStatement(c: Cursor): Stmt {
  const line = c.line
  const expr = parseComma(c)
  c.expect(';')
  return node(line, { k: 'expr', expr })
}

export function parseStatement(c: Cursor): Stmt {
  const line = c.line
  const word = c.peek().kind === 'ident' ? c.peek().text : null
  if (word && word in UNSUPPORTED) throw new CompileError(UNSUPPORTED[word]!, line)
  if (c.at('{')) return node(line, { k: 'block', body: parseBlockBody(c).body })
  if (c.accept(';')) return node(line, { k: 'empty' })
  switch (word) {
    case 'if': {
      c.next()
      const test = parenthesized(c)
      const then = parseStatement(c)
      return node(line, { k: 'if', test, then, else: c.accept('else') ? parseStatement(c) : null })
    }
    case 'while': {
      c.next()
      const test = parenthesized(c)
      return node(line, { k: 'while', test, body: parseStatement(c) })
    }
    case 'do': {
      c.next()
      const body = parseStatement(c)
      const testLine = c.expect('while').line
      const test = parenthesized(c)
      c.expect(';')
      return node(line, { k: 'do', body, test, testLine })
    }
    case 'for':
      c.next()
      return parseFor(c, line)
    case 'switch':
      c.next()
      return parseSwitch(c, line)
    case 'break':
    case 'continue':
      c.next()
      c.expect(';')
      return node(line, { k: word })
    case 'return': {
      c.next()
      const value = c.at(';') ? null : c.at('{') ? parseInitList(c) : parseComma(c)
      c.expect(';')
      return node(line, { k: 'return', value })
    }
    case 'using':
      if (c.at('namespace', 1)) {
        while (!c.accept(';')) c.next()
        return node(line, { k: 'empty' })
      }
      break
  }
  if (isDeclaration(c)) return parseDeclaration(c)
  if (word && !KEYWORDS.has(word) && c.peek(1).kind === 'ident' && !isTypeStart(c)) {
    throw new CompileError(`unknown type '${word}': it is not declared, or not supported by this visualizer`, line)
  }
  return parseExpressionStatement(c)
}
