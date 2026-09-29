import type { TokenCursor } from '../../../shared/syntax'
import type { Token } from '../lexer'
import { type JType, PRIM_NAMES, type PrimName, T, arrayOf, ref } from '../types'

export type Cursor = TokenCursor<Token>

/** Words that can never start a type, so `return x;` is never read as a declaration. */
export const KEYWORDS: ReadonlySet<string> = new Set(
  'abstract assert break case catch class continue default do else enum extends final finally for if implements import instanceof interface native new package private protected public return static super switch synchronized this throw throws transient try volatile while true false null'.split(
    ' ',
  ),
)

/** `@Override`, `@SuppressWarnings("unchecked")`: accepted and ignored. */
export function skipAnnotations(c: Cursor): void {
  while (c.at('@') && !c.at('interface', 1)) {
    c.next()
    qualifiedName(c)
    if (c.at('(')) skipBalanced(c, '(', ')')
  }
}

function skipBalanced(c: Cursor, open: string, close: string): void {
  let depth = 0
  do {
    if (c.done) throw c.error(`expected '${close}'`)
    if (close === '>') c.splitGreater()
    const tok = c.next()
    if (tok.text === open) depth++
    else if (tok.text === close) depth--
  } while (depth > 0)
}

export function qualifiedName(c: Cursor): string {
  let name = c.ident()
  while (c.at('.') && c.peek(1).kind === 'ident') {
    c.next()
    name += `.${c.next().text}`
  }
  return name
}

/** `java.util.List` is `List`; `Map.Entry` stays. */
const dropPackage = (name: string) => name.split('.').filter((part, i, all) => i === all.length - 1 || !/^[a-z]/.test(part)).join('.')

function typeArgs(c: Cursor): JType[] {
  c.expect('<')
  const args: JType[] = []
  for (;;) {
    c.splitGreater()
    if (c.at('>')) break
    skipAnnotations(c)
    if (c.accept('?')) args.push(c.accept('extends') || c.accept('super') ? parseType(c) : T.object)
    else args.push(parseType(c))
    if (!c.accept(',')) break
  }
  c.expect('>')
  return args
}

/** `int`, `String`, `Map.Entry<String, Integer>`, without trailing `[]`. */
export function parseBaseType(c: Cursor): JType {
  skipAnnotations(c)
  while (c.accept('final')) skipAnnotations(c)
  const word = c.peek().kind === 'ident' ? c.peek().text : ''
  if (!word || KEYWORDS.has(word)) throw c.error('expected a type')
  c.next()
  if (PRIM_NAMES.has(word)) return { t: 'prim', name: word as PrimName }
  if (word === 'void') return T.void
  if (word === 'var') return T.var
  let name = word
  let args = c.at('<') ? typeArgs(c) : []
  while (c.at('.') && c.peek(1).kind === 'ident') {
    c.next()
    name += `.${c.next().text}`
    if (c.at('<')) args = typeArgs(c)
  }
  return ref(dropPackage(name), args)
}

/** Trailing `[]` pairs. */
export function arrayDims(c: Cursor): number {
  let dims = 0
  while (c.at('[') && c.at(']', 1)) {
    c.pos += 2
    dims++
  }
  return dims
}

export function parseType(c: Cursor): JType {
  const base = parseBaseType(c)
  return arrayOf(base, arrayDims(c))
}

/** `<T extends Comparable<T>, U>` before a generic class or method: parsed for syntax, erased. */
export function skipTypeParams(c: Cursor): void {
  if (c.at('<')) skipBalanced(c, '<', '>')
}
