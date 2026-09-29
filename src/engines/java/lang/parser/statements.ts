import { CompileError } from '../../../shared/syntax'
import type { CatchClause, Expr, Stmt, SwitchCase, VarDeclarator } from '../ast'
import type { JType } from '../types'
import { parseArgs, parseArrayInit, parseExpr, parseTernary } from './expressions'
import { type Cursor, KEYWORDS, arrayDims, parseType, qualifiedName, skipAnnotations } from './types'

type Without<U, K extends PropertyKey> = U extends unknown ? Omit<U, K> : never
const node = (line: number, s: Without<Stmt, 'line'>): Stmt => ({ ...s, line }) as Stmt

const STATEMENT_EXPRESSIONS = new Set(['assign', 'postfix', 'call', 'new'])
const DECLARATOR_FOLLOW = new Set(['=', ';', ',', '[', ':'])
const UNSUPPORTED: Readonly<Record<string, string>> = {
  enum: 'enums are not supported yet',
  synchronized: 'synchronized blocks are not supported',
  class: 'classes declared inside a method are not supported; declare the class next to your other classes',
  interface: 'interfaces declared inside a method are not supported',
  record: 'records declared inside a method are not supported; declare the record next to your classes',
}

export function parseBlock(c: Cursor): { body: Stmt[]; endLine: number } {
  c.expect('{')
  const body: Stmt[] = []
  while (!c.at('}')) {
    if (c.done) throw c.error("reached end of file while parsing, expected '}'")
    body.push(parseStatement(c))
  }
  return { body, endLine: c.next().line }
}

/** Does `Type name` start here? Checked without consuming anything. */
export function isLocalDeclaration(c: Cursor): boolean {
  const save = c.pos
  const ok = c.attempt(() => {
    parseType(c)
    return c.peek().kind === 'ident' && !KEYWORDS.has(c.peek().text) && DECLARATOR_FOLLOW.has(c.peek(1).text)
  })
  c.pos = save
  return ok === true
}

function declarator(c: Cursor): VarDeclarator {
  const line = c.line
  const name = c.ident('a variable name')
  const dims = arrayDims(c)
  const init = c.accept('=') ? (c.at('{') ? parseArrayInit(c) : parseExpr(c)) : null
  return { name, dims, init, line }
}

/** `int a = 1, b[] = {2};` without the semicolon. */
function parseLocal(c: Cursor): Stmt {
  const line = c.line
  const type: JType = parseType(c)
  const decls = [declarator(c)]
  while (c.accept(',')) decls.push(declarator(c))
  if (type.t === 'var' && (decls.length > 1 || decls[0]!.dims || !decls[0]!.init)) {
    throw new CompileError("'var' needs exactly one variable with an initializer", line)
  }
  return node(line, { k: 'local', type, decls })
}

function parenthesized(c: Cursor): Expr {
  c.expect('(')
  const e = parseExpr(c)
  c.expect(')')
  return e
}

function parseExpressionStatement(c: Cursor): Stmt {
  const line = c.line
  const expr = parseExpr(c)
  const isStep = STATEMENT_EXPRESSIONS.has(expr.k) || (expr.k === 'unary' && (expr.op === '++' || expr.op === '--'))
  if (!isStep) throw new CompileError('not a statement', line)
  return node(line, { k: 'expr', expr })
}

function parseFor(c: Cursor, line: number): Stmt {
  c.expect('(')
  const each = c.attempt(() => {
    const type = parseType(c)
    const name = c.ident()
    c.expect(':')
    return { type, name }
  })
  if (each) {
    const iterable = parseExpr(c)
    c.expect(')')
    return node(line, { k: 'foreach', ...each, iterable, body: parseStatement(c) })
  }
  const init: Stmt[] = []
  if (isLocalDeclaration(c)) init.push(parseLocal(c))
  else if (!c.at(';')) {
    do {
      init.push(parseExpressionStatement(c))
    } while (c.accept(','))
  }
  c.expect(';')
  const test = c.at(';') ? null : parseExpr(c)
  c.expect(';')
  const update: Expr[] = []
  if (!c.at(')')) {
    do {
      update.push(parseExpr(c))
    } while (c.accept(','))
  }
  c.expect(')')
  return node(line, { k: 'for', init, test, update, body: parseStatement(c) })
}

function arrowBody(c: Cursor, asExpr: boolean): Stmt {
  const line = c.line
  if (c.at('{')) return node(line, { k: 'block', body: parseBlock(c).body })
  if (c.at('throw')) return parseStatement(c)
  const value = asExpr ? parseExpr(c) : null
  const stmt = value ? node(line, { k: 'yield', value }) : parseExpressionStatement(c)
  c.expect(';')
  return stmt
}

/** `(test) { case ... }` for both switch statements and switch expressions, colon or arrow style. */
export function parseSwitchBody(c: Cursor, asExpr: boolean): { test: Expr; cases: SwitchCase[] } {
  const test = parenthesized(c)
  c.expect('{')
  const cases: SwitchCase[] = []
  let style: boolean | null = null
  while (!c.accept('}')) {
    const line = c.line
    const labels: Expr[] = []
    let isDefault = c.accept('default')
    if (!isDefault) {
      c.expect('case')
      do {
        if (c.accept('default')) isDefault = true
        else labels.push(parseTernary(c))
      } while (c.accept(','))
    }
    const arrow = c.accept('->')
    if (!arrow) c.expect(':')
    if (style !== null && style !== arrow) throw new CompileError("different case kinds used in the switch: use all ':' or all '->'", line)
    style = arrow
    const body: Stmt[] = []
    if (arrow) body.push(arrowBody(c, asExpr))
    else while (!c.at('case') && !c.at('default') && !c.at('}')) body.push(parseStatement(c))
    cases.push({ labels, isDefault, body, arrow, line })
  }
  return { test, cases }
}

function parseTry(c: Cursor, line: number): Stmt {
  const resources: Stmt[] = []
  if (c.accept('(')) {
    while (!c.at(')')) {
      resources.push(parseLocal(c))
      if (!c.accept(';')) break
    }
    c.expect(')')
  }
  const body = parseBlock(c).body
  const catches: CatchClause[] = []
  while (c.at('catch')) {
    const at = c.next().line
    c.expect('(')
    c.accept('final')
    const types = [qualifiedName(c)]
    while (c.accept('|')) types.push(qualifiedName(c))
    const name = c.ident('an exception name')
    c.expect(')')
    catches.push({ types: types.map((t) => t.split('.').pop()!), name, body: parseBlock(c).body, line: at })
  }
  const fin = c.accept('finally') ? parseBlock(c).body : null
  if (!catches.length && !fin && !resources.length) throw new CompileError("'try' without 'catch' or 'finally'", line)
  return node(line, { k: 'try', resources, body, catches, finally: fin })
}

const optionalLabel = (c: Cursor): string | null => (c.peek().kind === 'ident' && !c.at(';') ? c.next().text : null)

function isYield(c: Cursor): boolean {
  if (!c.at('yield')) return false
  const next = c.peek(1)
  return !(next.kind === 'punct' && ['=', '(', '.', '[', '++', '--', '+=', '-='].includes(next.text))
}

export function parseStatement(c: Cursor): Stmt {
  const line = c.line
  skipAnnotations(c)
  if (c.at('{')) return node(line, { k: 'block', body: parseBlock(c).body })
  if (c.accept(';')) return node(line, { k: 'empty' })
  const tok = c.peek()
  const word = tok.kind === 'ident' ? tok.text : ''
  if (word in UNSUPPORTED && !(word === 'record' && !c.at('(', 2))) throw new CompileError(UNSUPPORTED[word]!, line)
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
    case 'switch': {
      c.next()
      return node(line, { k: 'switch', ...parseSwitchBody(c, false) })
    }
    case 'try':
      c.next()
      return parseTry(c, line)
    case 'break':
    case 'continue': {
      c.next()
      const label = optionalLabel(c)
      c.expect(';')
      return node(line, { k: word, label })
    }
    case 'return': {
      c.next()
      const value = c.at(';') ? null : parseExpr(c)
      c.expect(';')
      return node(line, { k: 'return', value })
    }
    case 'throw': {
      c.next()
      const value = parseExpr(c)
      c.expect(';')
      return node(line, { k: 'throw', value })
    }
    case 'assert':
      while (!c.accept(';')) c.next()
      return node(line, { k: 'empty' })
    case 'this':
    case 'super':
      if (c.at('(', 1)) {
        c.next()
        const args = parseArgs(c)
        c.expect(';')
        return node(line, { k: 'ctorCall', which: word, args })
      }
      break
    default:
      break
  }
  if (isYield(c)) {
    c.next()
    const value = parseExpr(c)
    c.expect(';')
    return node(line, { k: 'yield', value })
  }
  if (tok.kind === 'ident' && c.at(':', 1) && !KEYWORDS.has(word)) {
    c.pos += 2
    return node(line, { k: 'labeled', label: word, body: parseStatement(c) })
  }
  if (c.at('final') || isLocalDeclaration(c)) {
    const local = parseLocal(c)
    c.expect(';')
    return local
  }
  const stmt = parseExpressionStatement(c)
  c.expect(';')
  return stmt
}
