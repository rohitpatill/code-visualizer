import { CompileError } from '../../../shared/syntax'
import type { Expr, LambdaParam } from '../ast'
import type { JavaNum } from '../lexer'
import { PRIM_NAMES, arrayOf } from '../types'
import { parseAnonymousClass } from './classes'
import { parseSwitchBody } from './control'
import { parseArgs, parseArrayInit, parseExpr } from './expressions'
import { exprNode as node } from './nodes'
import { parseBlock } from './statements'
import { type Cursor, KEYWORDS, arrayDims, parseBaseType, parseType } from './types'

// Primary expressions: literals, names, calls, new, lambdas and switch expressions.

const INT_MAX = 2n ** 31n - 1n
const LONG_MAX = 2n ** 63n - 1n

/** Decimal literals may reach 2^31 (or 2^63 for long) only right after a minus sign. */
export function checkRange(lit: JavaNum, negated: boolean, line: number): JavaNum {
  if (lit.kind !== 'int' && lit.kind !== 'long') return lit
  const max = lit.kind === 'int' ? INT_MAX : LONG_MAX
  const limit = lit.decimal ? max + (negated ? 1n : 0n) : max * 2n + 1n
  if (lit.value > limit) throw new CompileError(`integer number too large: ${lit.value}`, line)
  const bits = lit.kind === 'int' ? 32 : 64
  const value = BigInt.asIntN(bits, negated ? -lit.value : lit.value)
  return { ...lit, value }
}

function parseNew(c: Cursor): Expr {
  const line = c.next().line
  const base = parseBaseType(c)
  if (c.at('[')) {
    const dims: Expr[] = []
    while (c.at('[') && !c.at(']', 1)) {
      c.next()
      dims.push(parseExpr(c))
      c.expect(']')
    }
    const type = arrayOf(base, dims.length + arrayDims(c))
    const init = !dims.length && c.at('{') ? parseArrayInit(c) : null
    if (!dims.length && !init) throw new CompileError('array dimension missing', line)
    return node(line, { k: 'newArray', type, dims, init })
  }
  if (base.t !== 'ref') throw new CompileError(`'[' expected after new ${base.t === 'prim' ? base.name : ''}`, line)
  const args = parseArgs(c)
  const body = c.at('{') ? parseAnonymousClass(c, base.name, line) : null
  return node(line, { k: 'new', type: base, args, body })
}

/** `x ->`, `(x, y) ->`, `(int a, int b) ->`, `() ->`. */
export function isLambdaStart(c: Cursor): boolean {
  if (c.peek().kind === 'ident' && c.at('->', 1)) return true
  if (!c.at('(')) return false
  let depth = 0
  for (let n = 0; ; n++) {
    const tok = c.peek(n)
    if (tok.kind === 'eof') return false
    if (tok.text === '(' && tok.kind === 'punct') depth++
    else if (tok.text === ')' && tok.kind === 'punct' && --depth === 0) return c.at('->', n + 1)
  }
}

function parseLambdaParams(c: Cursor): LambdaParam[] {
  if (!c.at('(')) return [{ name: c.ident(), type: null }]
  c.next()
  const params: LambdaParam[] = []
  while (!c.at(')')) {
    const bare = c.peek().kind === 'ident' && (c.at(',', 1) || c.at(')', 1))
    const type = bare ? null : parseType(c)
    params.push({ name: c.ident('a parameter name'), type: type?.t === 'var' ? null : type })
    if (!c.accept(',')) break
  }
  c.expect(')')
  return params
}

export function parseLambda(c: Cursor): Expr {
  const line = c.line
  const params = parseLambdaParams(c)
  c.expect('->')
  if (c.at('{')) {
    const { body, endLine } = parseBlock(c)
    return node(line, { k: 'lambda', params, body, endLine })
  }
  const body = parseExpr(c)
  return node(line, { k: 'lambda', params, body, endLine: c.peek(-1).line })
}

export function parsePrimary(c: Cursor): Expr {
  const tok = c.peek()
  const line = tok.line
  switch (tok.kind) {
    case 'number':
      c.next()
      return node(line, { k: 'num', lit: checkRange(tok.num!, false, line) })
    case 'char':
      c.next()
      return node(line, { k: 'char', value: tok.str!.charCodeAt(0) })
    case 'string':
      c.next()
      return node(line, { k: 'str', value: tok.str! })
    case 'eof':
      throw c.error('expected an expression')
    default:
      break
  }
  if (c.accept('(')) {
    const inner = parseExpr(c)
    c.expect(')')
    return inner
  }
  if (tok.kind !== 'ident') throw c.error('illegal start of expression')
  switch (tok.text) {
    case 'true':
    case 'false':
      c.next()
      return node(line, { k: 'bool', value: tok.text === 'true' })
    case 'null':
      c.next()
      return node(line, { k: 'null' })
    case 'this':
      c.next()
      return node(line, { k: 'this' })
    case 'super': {
      c.next()
      c.expect('.')
      const name = c.ident('a member name')
      if (c.at('(')) return node(line, { k: 'call', obj: null, name, args: parseArgs(c), sup: true })
      return node(line, { k: 'field', obj: node(line, { k: 'this' }), name })
    }
    case 'new':
      return parseNew(c)
    case 'switch': {
      c.next()
      const { test, cases } = parseSwitchBody(c, true)
      return node(line, { k: 'switch', test, cases })
    }
    default:
      break
  }
  if (PRIM_NAMES.has(tok.text)) {
    const type = parseType(c)
    if (c.accept('::')) return node(line, { k: 'methodRef', target: null, type, name: c.accept('new') ? 'new' : c.ident() })
    throw new CompileError(`'${tok.text}' is a type, not a value here`, line)
  }
  if (KEYWORDS.has(tok.text)) throw c.error('illegal start of expression')
  c.next()
  if (c.at('(')) return node(line, { k: 'call', obj: null, name: tok.text, args: parseArgs(c), sup: false })
  return node(line, { k: 'name', name: tok.text })
}
