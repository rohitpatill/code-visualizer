import { CompileError } from '../../../shared/syntax'
import type { CatchClause, Expr, Stmt, SwitchCase } from '../ast'
import { parseExpr, parseTernary } from './expressions'
import { stmtNode as node } from './nodes'
import { isLocalDeclaration, parenthesized, parseBlock, parseExpressionStatement, parseLocal, parseStatement } from './statements'
import { type Cursor, parseType, qualifiedName } from './types'

// Loops, switches and try blocks.

export function parseFor(c: Cursor, line: number): Stmt {
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

export function parseTry(c: Cursor, line: number): Stmt {
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
