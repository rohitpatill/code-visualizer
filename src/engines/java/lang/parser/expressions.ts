import { CompileError } from '../../../shared/syntax'
import type { Expr, LambdaParam } from '../ast'
import type { JavaNum, Token } from '../lexer'
import { PRIM_NAMES, arrayOf, ref } from '../types'
import { parseAnonymousClass } from './classes'
import { parseBlock, parseSwitchBody } from './statements'
import { type Cursor, KEYWORDS, arrayDims, parseBaseType, parseType } from './types'

const BINARY: Readonly<Record<string, number>> = {
  '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7, instanceof: 7,
  '<<': 8, '>>': 8, '>>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10,
}
const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>='])
const PREFIX = new Set(['+', '-', '!', '~', '++', '--'])
const ASSIGNABLE = new Set(['name', 'field', 'index'])
const INT_MAX = 2n ** 31n - 1n
const LONG_MAX = 2n ** 63n - 1n

type Without<U, K extends PropertyKey> = U extends unknown ? Omit<U, K> : never
const node = (line: number, e: Without<Expr, 'line'>): Expr => ({ ...e, line }) as Expr

/** Decimal literals may reach 2^31 (or 2^63 for long) only right after a minus sign. */
function checkRange(lit: JavaNum, negated: boolean, line: number): JavaNum {
  if (lit.kind !== 'int' && lit.kind !== 'long') return lit
  const max = lit.kind === 'int' ? INT_MAX : LONG_MAX
  const limit = lit.decimal ? max + (negated ? 1n : 0n) : max * 2n + 1n
  if (lit.value > limit) throw new CompileError(`integer number too large: ${lit.value}`, line)
  const bits = lit.kind === 'int' ? 32 : 64
  const value = BigInt.asIntN(bits, negated ? -lit.value : lit.value)
  return { ...lit, value }
}

/** An expression, including assignment and lambdas. */
export function parseExpr(c: Cursor): Expr {
  if (isLambdaStart(c)) return parseLambda(c)
  const line = c.line
  const left = parseTernary(c)
  const tok = c.peek()
  if (tok.kind !== 'punct' || !ASSIGN.has(tok.text)) return left
  if (!ASSIGNABLE.has(left.k)) throw new CompileError('unexpected type: the left side of an assignment must be a variable', line)
  c.next()
  return node(line, { k: 'assign', op: tok.text, target: left, value: parseExpr(c) })
}

/** A conditional expression: what a `case` label holds, since `case A ->` is not a lambda. */
export function parseTernary(c: Cursor): Expr {
  const line = c.line
  const test = parseBinary(c, 1)
  if (!c.accept('?')) return test
  const then = parseExpr(c)
  c.expect(':')
  return node(line, { k: 'cond', test, then, else: isLambdaStart(c) ? parseLambda(c) : parseTernary(c) })
}

function binaryOp(tok: Token): number | undefined {
  if (tok.kind === 'punct' || (tok.kind === 'ident' && tok.text === 'instanceof')) return BINARY[tok.text]
  return undefined
}

function parseBinary(c: Cursor, min: number): Expr {
  let left = parseUnary(c)
  for (;;) {
    const tok = c.peek()
    const prec = binaryOp(tok)
    if (prec === undefined || prec < min) return left
    c.next()
    if (tok.text === 'instanceof') {
      c.accept('final')
      const type = parseType(c)
      const bind = c.peek().kind === 'ident' && !KEYWORDS.has(c.peek().text) ? c.next().text : null
      left = node(tok.line, { k: 'instanceof', arg: left, type, bind })
      continue
    }
    const right = parseBinary(c, prec + 1)
    const op = tok.text
    left = op === '&&' || op === '||' ? node(tok.line, { k: 'logical', op, left, right }) : node(tok.line, { k: 'binary', op, left, right })
  }
}

/** Can this token begin the operand of a reference cast? `(T) -x` is subtraction in Java, so + and - do not count. */
function startsOperand(tok: Token): boolean {
  if (tok.kind === 'punct') return tok.text === '(' || tok.text === '!' || tok.text === '~'
  if (tok.kind === 'ident') return tok.text !== 'instanceof'
  return tok.kind !== 'eof'
}

function tryCast(c: Cursor): Expr | null {
  const line = c.line
  return c.attempt(() => {
    c.expect('(')
    const type = parseType(c)
    c.expect(')')
    if (type.t !== 'prim' && !startsOperand(c.peek())) throw c.error('not a cast')
    return node(line, { k: 'cast', type, arg: parseUnary(c) })
  })
}

function parseUnary(c: Cursor): Expr {
  const tok = c.peek()
  const line = tok.line
  if (tok.kind === 'punct' && PREFIX.has(tok.text)) {
    c.next()
    const next = c.peek()
    if (tok.text === '-' && next.kind === 'number' && (next.num!.kind === 'int' || next.num!.kind === 'long')) {
      c.next()
      return parsePostfix(c, node(line, { k: 'num', lit: checkRange(next.num!, true, line) }))
    }
    const arg = parseUnary(c)
    if ((tok.text === '++' || tok.text === '--') && !ASSIGNABLE.has(arg.k)) throw new CompileError(`${tok.text} needs a variable`, line)
    return node(line, { k: 'unary', op: tok.text, arg })
  }
  if (c.at('(')) {
    const cast = tryCast(c)
    if (cast) return cast
  }
  return parsePostfix(c, parsePrimary(c))
}

export function parseArgs(c: Cursor): Expr[] {
  c.expect('(')
  const args: Expr[] = []
  while (!c.at(')')) {
    args.push(parseExpr(c))
    if (!c.accept(',')) break
  }
  c.expect(')')
  return args
}

/** `{1, 2, {3}}` after `=` or `new int[]`. */
export function parseArrayInit(c: Cursor): Expr {
  const line = c.expect('{').line
  const items: Expr[] = []
  while (!c.at('}')) {
    items.push(c.at('{') ? parseArrayInit(c) : parseExpr(c))
    if (!c.accept(',')) break
  }
  c.expect('}')
  return node(line, { k: 'array', items })
}

function parsePostfix(c: Cursor, base: Expr): Expr {
  let e = base
  for (;;) {
    const line = c.line
    if (c.accept('.')) {
      if (c.at('<')) throw c.error('explicit type arguments on a call are not supported')
      const name = c.ident('a member name')
      e = c.at('(') ? node(line, { k: 'call', obj: e, name, args: parseArgs(c), sup: false }) : node(line, { k: 'field', obj: e, name })
    } else if (c.at('[') && c.at(']', 1) && e.k === 'name') {
      const type = arrayOf(ref(e.name), arrayDims(c))
      c.expect('::')
      e = node(line, { k: 'methodRef', target: null, type, name: c.accept('new') ? 'new' : c.ident() })
    } else if (c.accept('[')) {
      const index = parseExpr(c)
      c.expect(']')
      e = node(line, { k: 'index', obj: e, index })
    } else if (c.at('++') || c.at('--')) {
      if (!ASSIGNABLE.has(e.k)) throw new CompileError(`${c.peek().text} needs a variable`, line)
      e = node(line, { k: 'postfix', op: c.next().text as '++' | '--', arg: e })
    } else if (c.accept('::')) {
      e = node(line, { k: 'methodRef', target: e, type: null, name: c.accept('new') ? 'new' : c.ident('a method name') })
    } else return e
  }
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
function isLambdaStart(c: Cursor): boolean {
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

function parseLambda(c: Cursor): Expr {
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

function parsePrimary(c: Cursor): Expr {
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
