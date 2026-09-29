import { CompileError } from '../../../shared/syntax'
import type { Expr, Stmt, VarDeclarator } from '../ast'
import type { JType } from '../types'
import { parseFor, parseSwitchBody, parseTry } from './control'
import { parseArgs, parseArrayInit, parseExpr } from './expressions'
import { stmtNode as node } from './nodes'
import { type Cursor, KEYWORDS, arrayDims, parseType, skipAnnotations } from './types'

const STATEMENT_EXPRESSIONS = new Set(['assign', 'postfix', 'call', 'new'])
const DECLARATOR_FOLLOW = new Set(['=', ';', ',', '[', ':'])
const UNSUPPORTED: Readonly<Record<string, string>> = {
  enum: 'enums declared inside a method are not supported; declare the enum next to your classes',
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
export function parseLocal(c: Cursor): Stmt {
  const line = c.line
  const type: JType = parseType(c)
  const decls = [declarator(c)]
  while (c.accept(',')) decls.push(declarator(c))
  if (type.t === 'var' && (decls.length > 1 || decls[0]!.dims || !decls[0]!.init)) {
    throw new CompileError("'var' needs exactly one variable with an initializer", line)
  }
  return node(line, { k: 'local', type, decls })
}

export function parenthesized(c: Cursor): Expr {
  c.expect('(')
  const e = parseExpr(c)
  c.expect(')')
  return e
}

export function parseExpressionStatement(c: Cursor): Stmt {
  const line = c.line
  const expr = parseExpr(c)
  const isStep = STATEMENT_EXPRESSIONS.has(expr.k) || (expr.k === 'unary' && (expr.op === '++' || expr.op === '--'))
  if (!isStep) throw new CompileError('not a statement', line)
  return node(line, { k: 'expr', expr })
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
