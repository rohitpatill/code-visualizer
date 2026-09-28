export class CompileError extends Error {
  constructor(
    message: string,
    readonly line: number | null,
  ) {
    super(message)
  }
}

export type NumLit =
  | { float: false; value: bigint; unsigned: boolean; longs: number }
  | { float: true; value: number; single: boolean }

export interface Token {
  kind: 'ident' | 'number' | 'string' | 'char' | 'punct' | 'eof'
  text: string
  line: number
  num?: NumLit
  /** Decoded text of a string or char literal. */
  str?: string
}

const PUNCTS = [
  '<<=', '>>=', '...', '->', '::', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
  '{', '}', '(', ')', '[', ']', ';', ',', '.', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^', '!', '~', '?', ':', '=',
]
const ESCAPES: Readonly<Record<string, string>> = { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', "'": "'", '"': '"', a: '\x07', b: '\b', f: '\f', v: '\v' }
const IDENT_START = /[A-Za-z_]/
const IDENT = /[A-Za-z0-9_]/
const MAX_MACRO_DEPTH = 16

function number(text: string, line: number): NumLit {
  const clean = text.replace(/'/g, '').toLowerCase()
  const isHex = clean.startsWith('0x')
  if (!isHex && /[.e]/.test(clean)) {
    const single = clean.endsWith('f')
    const value = Number(clean.replace(/[fl]$/, ''))
    if (Number.isNaN(value)) throw new CompileError(`invalid number ${text}`, line)
    return { float: true, value, single }
  }
  const suffix = /[ul]*$/.exec(clean)![0]
  const digits = clean.slice(0, clean.length - suffix.length)
  let value: bigint
  try {
    if (isHex || digits.startsWith('0b')) value = BigInt(digits)
    else if (digits.length > 1 && digits.startsWith('0')) value = BigInt(`0o${digits.slice(1)}`)
    else value = BigInt(digits)
  } catch {
    throw new CompileError(`invalid number ${text}`, line)
  }
  return { float: false, value, unsigned: suffix.includes('u'), longs: (suffix.match(/l/g) ?? []).length }
}

/** Splits C++ source into tokens, applying `#define` constants and dropping other directives. */
export function tokenize(source: string): Token[] {
  const macros = new Map<string, Token[]>()
  const out: Token[] = []
  let i = 0
  let line = 1
  let lineStart = true

  const emit = (tok: Token, depth = 0) => {
    const macro = tok.kind === 'ident' ? macros.get(tok.text) : undefined
    if (!macro) return out.push(tok)
    if (depth > MAX_MACRO_DEPTH) throw new CompileError(`macro ${tok.text} expands forever`, tok.line)
    for (const m of macro) emit({ ...m, line: tok.line }, depth + 1)
  }

  const directive = (text: string, at: number) => {
    const m = /^#\s*(\w+)\s*(.*)$/s.exec(text.trim())
    const name = m?.[1] ?? ''
    if (name === 'include' || name === 'pragma' || name === '') return
    if (name !== 'define') throw new CompileError(`#${name} is not supported`, at)
    const def = /^([A-Za-z_]\w*)(\()?\s*(.*)$/s.exec(m![2]!)
    if (!def) throw new CompileError('bad #define', at)
    if (def[2]) throw new CompileError('macros with parameters are not supported', at)
    macros.set(def[1]!, tokenize(def[3]!).slice(0, -1))
  }

  const literal = (quote: string): string => {
    let text = ''
    i++
    while (i < source.length && source[i] !== quote) {
      if (source[i] === '\n') throw new CompileError('missing closing quote', line)
      if (source[i] === '\\') {
        const e = source[i + 1] ?? ''
        if (e === 'x') {
          const hex = /^[0-9a-fA-F]{1,2}/.exec(source.slice(i + 2))?.[0] ?? ''
          text += String.fromCharCode(parseInt(hex || '0', 16))
          i += 2 + hex.length
          continue
        }
        text += ESCAPES[e] ?? e
        i += 2
        continue
      }
      text += source[i++]
    }
    if (i >= source.length) throw new CompileError('missing closing quote', line)
    i++
    return text
  }

  while (i < source.length) {
    const c = source[i]!
    if (c === '\n') {
      line++
      i++
      lineStart = true
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++
      continue
    }
    if (c === '#' && lineStart) {
      let end = i
      while (end < source.length && (source[end] !== '\n' || source[end - 1] === '\\')) end++
      directive(source.slice(i, end).replace(/\\\n/g, ' '), line)
      line += (source.slice(i, end).match(/\n/g) ?? []).length
      i = end
      continue
    }
    lineStart = false
    if (source.startsWith('//', i)) {
      while (i < source.length && source[i] !== '\n') i++
      continue
    }
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2)
      if (end === -1) throw new CompileError('unterminated comment', line)
      line += (source.slice(i, end).match(/\n/g) ?? []).length
      i = end + 2
      continue
    }
    const start = line
    if (IDENT_START.test(c)) {
      let j = i + 1
      while (j < source.length && IDENT.test(source[j]!)) j++
      emit({ kind: 'ident', text: source.slice(i, j), line: start })
      i = j
      continue
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      const m = /^(0[xX][0-9a-fA-F']+|0[bB][01']+|(?:[0-9][0-9']*)?\.?[0-9']*(?:[eE][+-]?[0-9]+)?)[uUlLfF]*/.exec(source.slice(i))!
      emit({ kind: 'number', text: m[0], line: start, num: number(m[0], start) })
      i += m[0].length
      continue
    }
    if (c === '"') {
      const text = literal('"')
      out.push({ kind: 'string', text, line: start, str: text })
      continue
    }
    if (c === "'") {
      const text = literal("'")
      if (text.length !== 1) throw new CompileError('a char literal holds exactly one character', start)
      out.push({ kind: 'char', text, line: start, str: text })
      continue
    }
    const p = PUNCTS.find((q) => source.startsWith(q, i))
    if (!p) throw new CompileError(`unexpected character ${c}`, start)
    out.push({ kind: 'punct', text: p, line: start })
    i += p.length
  }
  out.push({ kind: 'eof', text: '', line })
  return out
}
