import type { Capture, Expr, Param } from '../ast'
import { CompileError } from '../lexer'
import type { Cursor } from './cursor'
import { parseParams } from './params'
import { parseBlockBody } from './statements'
import { isTypeStart, parseBaseType, parseDeclarator, parseType, skipStd } from './typeSpec'

const BINARY: Readonly<Record<string, number>> = {
  '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7,
  '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10,
}
const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '|=', '^='])
const PREFIX = new Set(['!', '-', '+', '~', '*', '&', '++', '--'])
const CASTS = new Set(['static_cast', 'dynamic_cast', 'reinterpret_cast', 'const_cast'])

type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
const node = (line: number, e: Without<Expr, 'line'>): Expr => ({ ...e, line }) as Expr

/** An expression, including the comma operator. */
export function parseComma(c: Cursor): Expr {
  const line = c.line
  const first = parseExpr(c)
  if (!c.at(',')) return first
  const exprs = [first]
  while (c.accept(',')) exprs.push(parseExpr(c))
  return node(line, { k: 'comma', exprs })
}

/** An assignment expression: what a function argument or initializer holds. */
export function parseExpr(c: Cursor): Expr {
  const line = c.line
  const left = parseConditional(c)
  const op = c.peek().text
  if (c.peek().kind === 'punct' && ASSIGN.has(op)) {
    c.next()
    return node(line, { k: 'assign', op, target: left, value: c.at('{') ? parseInitList(c) : parseExpr(c) })
  }
  return left
}

function parseConditional(c: Cursor): Expr {
  const line = c.line
  const test = parseBinary(c, 1)
  if (!c.accept('?')) return test
  const then = parseComma(c)
  c.expect(':')
  return node(line, { k: 'cond', test, then, else: parseExpr(c) })
}

function parseBinary(c: Cursor, min: number): Expr {
  let left = parseUnary(c)
  for (;;) {
    const tok = c.peek()
    const prec = tok.kind === 'punct' ? BINARY[tok.text] : undefined
    if (prec === undefined || prec < min) return left
    c.next()
    const right = parseBinary(c, prec + 1)
    const op = tok.text
    left = op === '&&' || op === '||' ? node(tok.line, { k: 'logical', op, left, right }) : node(tok.line, { k: 'binary', op, left, right })
  }
}

function isCast(c: Cursor): boolean {
  if (!c.at('(')) return false
  const save = c.pos
  c.next()
  const ok = isTypeStart(c) && c.attempt(() => parseType(c)) !== null && c.at(')')
  c.pos = save
  return ok
}

function parseUnary(c: Cursor): Expr {
  const tok = c.peek()
  const line = tok.line
  if (tok.kind === 'punct' && PREFIX.has(tok.text)) {
    c.next()
    return node(line, { k: 'unary', op: tok.text, arg: parseUnary(c) })
  }
  if (c.at('new')) return parseNew(c)
  if (c.accept('delete')) {
    if (c.accept('[')) c.expect(']')
    return node(line, { k: 'delete', arg: parseUnary(c) })
  }
  if (c.at('sizeof')) throw new CompileError('sizeof is not supported', line)
  if (isCast(c)) {
    c.expect('(')
    const type = parseType(c)
    c.expect(')')
    return node(line, { k: 'cast', type, arg: parseUnary(c) })
  }
  return parsePostfix(c, parsePrimary(c))
}

function parseNew(c: Cursor): Expr {
  const line = c.next().line
  const type = parseType(c)
  if (c.accept('[')) {
    const count = parseExpr(c)
    c.expect(']')
    if (c.at('(')) parseArgs(c, '(', ')')
    return node(line, { k: 'new', type, args: [], count })
  }
  const args = c.at('(') ? parseArgs(c, '(', ')') : c.at('{') ? parseArgs(c, '{', '}') : []
  return node(line, { k: 'new', type, args, count: null })
}

export function parseArgs(c: Cursor, open: string, close: string): Expr[] {
  c.expect(open)
  const args: Expr[] = []
  while (!c.at(close)) {
    args.push(c.at('{') ? parseInitList(c) : parseExpr(c))
    if (!c.accept(',')) break
  }
  c.expect(close)
  return args
}

export function parseInitList(c: Cursor): Expr {
  const line = c.line
  return node(line, { k: 'init', items: parseArgs(c, '{', '}') })
}

function parsePostfix(c: Cursor, base: Expr): Expr {
  let e = base
  for (;;) {
    const line = c.line
    if (c.at('(')) e = node(line, { k: 'call', callee: e, args: parseArgs(c, '(', ')') })
    else if (c.accept('[')) {
      const index = parseComma(c)
      c.expect(']')
      e = node(line, { k: 'index', obj: e, index })
    } else if (c.at('.') || c.at('->')) {
      const arrow = c.next().text === '->'
      e = node(line, { k: 'member', obj: e, name: c.ident('a member name'), arrow })
    } else if (c.at('++') || c.at('--')) e = node(line, { k: 'postfix', op: c.next().text as '++' | '--', arg: e })
    else return e
  }
}

function parseCapture(c: Cursor): Capture {
  const capture: Capture = { mode: 'none', byRef: [], byCopy: [] }
  c.expect('[')
  while (!c.at(']')) {
    if (c.accept('&')) {
      if (c.peek().kind === 'ident') capture.byRef.push(c.next().text)
      else capture.mode = 'ref'
    } else if (c.accept('=')) capture.mode = 'copy'
    else if (c.accept('this')) capture.byRef.push('this')
    else capture.byCopy.push(c.ident('a captured name'))
    if (!c.accept(',')) break
  }
  c.expect(']')
  return capture
}

function parseLambda(c: Cursor): Expr {
  const line = c.line
  const capture = parseCapture(c)
  const params: Param[] = c.at('(') ? parseParams(c) : []
  c.accept('mutable')
  if (c.accept('->')) parseType(c)
  const { body, endLine } = parseBlockBody(c)
  return node(line, { k: 'lambda', params, body, capture, endLine })
}

function parseTypeExpression(c: Cursor): Expr {
  const line = c.line
  if (c.at('numeric_limits')) {
    c.next()
    c.expect('<')
    const type = parseType(c)
    c.expect('>')
    c.expect('::')
    const which = c.ident()
    if (which !== 'max' && which !== 'min') throw new CompileError(`numeric_limits::${which} is not supported`, line)
    c.expect('(')
    c.expect(')')
    return node(line, { k: 'limits', type, which })
  }
  if (c.peek(1).text === '::' && c.peek(2).kind === 'ident') {
    c.pos += 2
    return node(line, { k: 'name', name: c.next().text })
  }
  const type = parseDeclarator(c, parseBaseType(c)).type
  if (c.at('{')) return node(line, { k: 'construct', type, args: parseArgs(c, '{', '}'), braces: true })
  if (c.at('(')) return node(line, { k: 'construct', type, args: parseArgs(c, '(', ')'), braces: false })
  throw c.error('expected ( or { after a type')
}

function parsePrimary(c: Cursor): Expr {
  const tok = c.peek()
  const line = tok.line
  if (tok.kind === 'number' || tok.kind === 'char') {
    c.next()
    return tok.kind === 'number' ? node(line, { k: 'num', lit: tok.num! }) : node(line, { k: 'char', value: tok.str!.charCodeAt(0) })
  }
  if (tok.kind === 'string') {
    let value = ''
    while (c.peek().kind === 'string') value += c.next().str!
    return node(line, { k: 'str', value })
  }
  if (c.accept('(')) {
    const inner = parseComma(c)
    c.expect(')')
    return inner
  }
  if (c.at('{')) return parseInitList(c)
  if (c.at('[')) return parseLambda(c)
  if (c.accept('true')) return node(line, { k: 'bool', value: true })
  if (c.accept('false')) return node(line, { k: 'bool', value: false })
  if (c.accept('nullptr') || c.accept('NULL')) return node(line, { k: 'null' })
  if (c.accept('this')) return node(line, { k: 'this' })
  skipStd(c)
  if (CASTS.has(c.peek().text)) {
    c.next()
    c.expect('<')
    const type = parseType(c)
    c.expect('>')
    c.expect('(')
    const arg = parseExpr(c)
    c.expect(')')
    return node(line, { k: 'cast', type, arg })
  }
  if (isTypeStart(c) || c.at('numeric_limits')) return parseTypeExpression(c)
  if (c.peek().kind !== 'ident') throw c.error('expected an expression')
  let name = c.next().text
  while (c.at('::') && c.peek(1).kind === 'ident') {
    c.next()
    name = c.next().text
  }
  return node(line, { k: 'name', name })
}
