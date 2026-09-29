import { CompileError } from '../../../shared/syntax'
import { type CType, NAMED_INTS, T, intFromWords } from '../types'
import type { Cursor } from './cursor'

const INT_WORDS = new Set(['int', 'long', 'short', 'unsigned', 'signed'])
const SIMPLE: Readonly<Record<string, CType>> = {
  char: T.char,
  bool: T.bool,
  double: T.double,
  float: T.float,
  void: T.void,
  auto: T.auto,
  string: T.string,
}
export const QUALIFIERS = new Set(['const', 'constexpr', 'static', 'inline', 'volatile', 'mutable', 'register', 'typename'])
const TEMPLATES = new Set([
  'vector', 'deque', 'queue', 'stack', 'priority_queue', 'map', 'unordered_map', 'set', 'unordered_set', 'pair', 'greater',
  'less', 'function', 'array',
])

/** Consumes a leading `std::`, if present. */
export function skipStd(c: Cursor): void {
  if (c.at('std') && c.at('::', 1)) c.pos += 2
}

function wordAt(c: Cursor, n: number): string | null {
  const tok = c.peek(n)
  return tok.kind === 'ident' ? tok.text : null
}

export function isTypeName(c: Cursor, word: string): boolean {
  return word in SIMPLE || INT_WORDS.has(word) || TEMPLATES.has(word) || word in NAMED_INTS || c.classNames.has(word) || c.aliases.has(word)
}

/**
 * Does a type start here? Looks past qualifiers, `struct` and `std::` without
 * consuming. Template names count only before `<`, so a variable may be
 * called `queue` or `stack`, as real C++ allows.
 */
export function isTypeStart(c: Cursor): boolean {
  let n = 0
  while (QUALIFIERS.has(wordAt(c, n) ?? '') || wordAt(c, n) === 'struct') n++
  if (c.at('std', n) && c.at('::', n + 1)) n += 2
  const word = wordAt(c, n)
  if (word === null || !isTypeName(c, word)) return false
  return !TEMPLATES.has(word) || c.at('<', n + 1)
}

function templateArgs(c: Cursor, count: number): CType[] {
  c.expect('<')
  const args: CType[] = []
  while (!c.at('>')) {
    c.splitGreater()
    if (c.at('>')) break
    args.push(parseType(c))
    if (!c.accept(',')) break
  }
  c.expect('>')
  if (count && args.length < count) throw c.error(`expected ${count} template arguments`)
  return args
}

function functionSignature(c: Cursor): CType {
  c.expect('<')
  parseType(c)
  c.expect('(')
  while (!c.at(')')) {
    parseType(c)
    c.accept('&')
    if (!c.accept(',')) break
  }
  c.expect(')')
  c.expect('>')
  return T.fn
}

function template(c: Cursor, name: string): CType {
  switch (name) {
    case 'vector':
    case 'deque':
    case 'queue':
    case 'stack':
      return { t: name, of: templateArgs(c, 1)[0]! }
    case 'priority_queue': {
      const [of, , cmp] = templateArgs(c, 1)
      return { t: 'pq', of: of!, greater: cmp?.t === 'cmp' && cmp.greater }
    }
    case 'map':
    case 'unordered_map': {
      const [key, val] = templateArgs(c, 2)
      return { t: 'map', key: key!, val: val!, ordered: name === 'map' }
    }
    case 'set':
    case 'unordered_set':
      return { t: 'set', of: templateArgs(c, 1)[0]!, ordered: name === 'set' }
    case 'pair': {
      const [a, b] = templateArgs(c, 2)
      return { t: 'pair', a: a!, b: b! }
    }
    case 'greater':
    case 'less':
      if (c.at('<')) templateArgs(c, 0)
      return { t: 'cmp', greater: name === 'greater' }
    case 'function':
      return functionSignature(c)
    default: {
      c.expect('<')
      const of = parseType(c)
      c.expect(',')
      const size = c.next()
      if (size.num?.float !== false) throw c.error('std::array needs a constant size')
      c.expect('>')
      return { t: 'array', of, size: Number(size.num.value) }
    }
  }
}

/** A type without pointer or reference declarators: `const unsigned long long`, `vector<pair<int, int>>`, `TreeNode`. */
export function parseBaseType(c: Cursor): CType {
  while (QUALIFIERS.has(wordAt(c, 0) ?? '') || c.at('struct')) c.next()
  skipStd(c)
  const first = wordAt(c, 0)
  if (first === null) throw c.error('expected a type')
  if (INT_WORDS.has(first)) {
    const words: string[] = []
    while (INT_WORDS.has(wordAt(c, 0) ?? '') || (words.length && c.at('char'))) words.push(c.next().text)
    if (words.includes('char')) return T.char
    return intFromWords(words) ?? T.int
  }
  c.next()
  let type: CType
  if (first in SIMPLE) type = SIMPLE[first]!
  else if (first in NAMED_INTS) type = NAMED_INTS[first]!
  else if (TEMPLATES.has(first)) type = template(c, first)
  else if (c.aliases.has(first)) type = c.aliases.get(first)!
  else if (c.classNames.has(first)) type = { t: 'class', name: first }
  else throw new CompileError(`unknown type ${first}`, c.line)
  while (QUALIFIERS.has(wordAt(c, 0) ?? '')) c.next()
  return type
}

/** `*`, `&` and `const` after a base type. Returns the pointer-wrapped type and whether it is a reference. */
export function parseDeclarator(c: Cursor, base: CType): { type: CType; ref: boolean } {
  let type = base
  let ref = false
  for (;;) {
    if (c.accept('*')) type = { t: 'ptr', to: type }
    else if (c.accept('&') || c.accept('&&')) ref = true
    else if (!c.accept('const')) break
  }
  return { type, ref }
}

export function parseType(c: Cursor): CType {
  return parseDeclarator(c, parseBaseType(c)).type
}
