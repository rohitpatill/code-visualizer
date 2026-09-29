import { type BaseToken, CompileError } from '../../shared/syntax'

export type JavaNum =
  | { kind: 'int' | 'long'; value: bigint; decimal: boolean }
  | { kind: 'float' | 'double'; value: number }

export interface Token extends BaseToken {
  num?: JavaNum
  /** Decoded text of a string or char literal. */
  str?: string
}

const PUNCTS = [
  '>>>=', '<<=', '>>=', '>>>', '...', '->', '::', '++', '--', '&&', '||', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=',
  '%=', '&=', '|=', '^=', '<<', '>>', '{', '}', '(', ')', '[', ']', ';', ',', '.', '<', '>', '+', '-', '*', '/', '%', '&',
  '|', '^', '!', '~', '?', ':', '=', '@',
]
const ESCAPES: Readonly<Record<string, string>> = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', s: ' ', '"': '"', "'": "'", '\\': '\\' }
const IDENT_START = /[\p{L}_$]/u
const IDENT = /[\p{L}\p{N}_$]/u
const NUMBER = /^(?:0[xX][0-9a-fA-F_]+[lL]?|0[bB][01_]+[lL]?|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?[fFdDlL]?)/

function number(text: string, line: number): JavaNum {
  const clean = text.replace(/_/g, '').toLowerCase()
  const radix = clean.startsWith('0x') ? 16 : clean.startsWith('0b') ? 2 : /^0\d/.test(clean) ? 8 : 10
  if (radix === 10 && (/[.e]/.test(clean) || /[fd]$/.test(clean))) {
    const value = Number(clean.replace(/[fd]$/, ''))
    if (Number.isNaN(value)) throw new CompileError(`malformed number ${text}`, line)
    return clean.endsWith('f') ? { kind: 'float', value: Math.fround(value) } : { kind: 'double', value }
  }
  const long = clean.endsWith('l')
  const digits = long ? clean.slice(0, -1) : clean
  let value: bigint
  try {
    value = radix === 8 ? BigInt(`0o${digits.slice(1)}`) : BigInt(digits)
  } catch {
    throw new CompileError(`malformed number ${text}`, line)
  }
  return { kind: long ? 'long' : 'int', value, decimal: radix === 10 }
}

/** `"""` text blocks: the content starts on the next line and loses its common indentation. */
function textBlock(raw: string): string {
  const lines = raw.split('\n').map((l) => l.replace(/\r$/, ''))
  const closingOwnLine = /^[ \t]*$/.test(lines[lines.length - 1]!)
  const significant = lines.filter((l, i) => l.trim() !== '' || (closingOwnLine && i === lines.length - 1))
  const indent = Math.min(...significant.map((l) => /^[ \t]*/.exec(l)![0].length))
  return lines.map((l) => (l.trim() === '' ? '' : l.slice(indent).replace(/[ \t]+$/, ''))).join('\n')
}

function decode(raw: string, line: number): string {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!
    if (ch !== '\\') {
      out += ch
      continue
    }
    const e = raw[++i] ?? ''
    if (e === 'u') {
      while (raw[i] === 'u') i++
      const hex = raw.slice(i, i + 4)
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new CompileError('illegal unicode escape', line)
      out += String.fromCharCode(parseInt(hex, 16))
      i += 3
    } else if (/[0-7]/.test(e)) {
      const oct = /^[0-3]?[0-7]{1,2}|^[0-7]/.exec(raw.slice(i))![0]
      out += String.fromCharCode(parseInt(oct, 8))
      i += oct.length - 1
    } else if (e === '\n') {
      continue
    } else if (e in ESCAPES) {
      out += ESCAPES[e]
    } else {
      throw new CompileError(`illegal escape character \\${e}`, line)
    }
  }
  return out
}

/** Splits Java source into tokens. */
export function tokenize(source: string): Token[] {
  const out: Token[] = []
  let i = 0
  let line = 1
  const newlinesIn = (s: string) => (s.match(/\n/g) ?? []).length

  const quoted = (quote: string): string => {
    const start = i++
    while (i < source.length && source[i] !== quote) {
      if (source[i] === '\n') throw new CompileError(quote === '"' ? 'unclosed string literal' : 'unclosed character literal', line)
      i += source[i] === '\\' ? 2 : 1
    }
    if (i >= source.length) throw new CompileError('unclosed string literal', line)
    return source.slice(start + 1, i++)
  }

  while (i < source.length) {
    const c = source[i]!
    if (c === '\n') {
      line++
      i++
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f') {
      i++
      continue
    }
    if (source.startsWith('//', i)) {
      while (i < source.length && source[i] !== '\n') i++
      continue
    }
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2)
      if (end === -1) throw new CompileError('unclosed comment', line)
      line += newlinesIn(source.slice(i, end))
      i = end + 2
      continue
    }
    const start = line
    if (IDENT_START.test(c)) {
      let j = i + 1
      while (j < source.length && IDENT.test(source[j]!)) j++
      out.push({ kind: 'ident', text: source.slice(i, j), line: start })
      i = j
      continue
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      const text = NUMBER.exec(source.slice(i))![0]
      out.push({ kind: 'number', text, line: start, num: number(text, start) })
      i += text.length
      continue
    }
    if (source.startsWith('"""', i)) {
      const open = source.indexOf('\n', i)
      const end = source.indexOf('"""', i + 3)
      if (open === -1 || end === -1 || end < open) throw new CompileError('unclosed text block', start)
      const raw = source.slice(open + 1, end)
      out.push({ kind: 'string', text: raw, line: start, str: decode(textBlock(raw), start) })
      line += newlinesIn(source.slice(i, end))
      i = end + 3
      continue
    }
    if (c === '"') {
      const raw = quoted('"')
      out.push({ kind: 'string', text: raw, line: start, str: decode(raw, start) })
      continue
    }
    if (c === "'") {
      const text = decode(quoted("'"), start)
      if (text.length !== 1) throw new CompileError(text.length ? 'unclosed character literal' : 'empty character literal', start)
      out.push({ kind: 'char', text, line: start, str: text })
      continue
    }
    const p = PUNCTS.find((q) => source.startsWith(q, i))
    if (!p) throw new CompileError(`illegal character: '${c}'`, start)
    out.push({ kind: 'punct', text: p, line: start })
    i += p.length
  }
  out.push({ kind: 'eof', text: '', line })
  return out
}
