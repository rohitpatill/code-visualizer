/** One `[...]` (or `.get(...)`) level of an access: the plain names marked there, and the one name that leads deeper. */
export interface AccessLevel {
  names: string[]
  follow: string | null
}

/** `grid[r][c]` is `{ base: ['grid'], levels: [r, c] }`; `self.dp[i]` has base `['self', 'dp']`. */
export interface Access {
  base: string[]
  levels: AccessLevel[]
}

export type LineComment = '#' | '//'

const IDENT = /^[A-Za-z_$][\w$]*$/
// Calls whose first argument is an index or a key: `list.get(i)`, `s.charAt(i)`, `map.getOrDefault(k, 0)`.
const METHODS = 'get|charAt|at|set|getOrDefault|put|merge|containsKey|computeIfAbsent|compute|has|count|find'
const BASE = new RegExp(String.raw`(?<![\w$.>])([A-Za-z_$][\w$]*(?:\s*(?:\.|->)\s*[A-Za-z_$][\w$]*)*)\s*(?=\[|\.\s*(?:${METHODS})\s*\()`, 'g')
const CALL = new RegExp(String.raw`^\.\s*(${METHODS})\s*\(`)
const LAST_LEVEL = new Set(['set', 'put', 'merge', 'containsKey', 'computeIfAbsent', 'compute', 'has', 'count', 'find'])
const KEYWORDS = new Set('return in of new case if while for not and or else elif yield await throw typeof delete int'.split(' '))

/** Blanks out comments and string literals, so brackets inside them are not read as code. */
export function stripCode(source: string, comment: LineComment): string {
  const quote = comment === '#' ? /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|#[^\n]*/g
    : /\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g
  return source.replace(quote, (m) => (m[0] === '#' || m[0] === '/' ? ' ' : `${m[0]}${m[0]}`))
}

/** The text inside the bracket or paren opening at `open`, and the index after its close. */
function group(text: string, open: number): [inner: string, end: number] | null {
  const close = text[open] === '[' ? ']' : ')'
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (ch === '[' || ch === '(' || ch === '{') depth++
    else if (ch === ']' || ch === ')' || ch === '}') {
      depth--
      if (depth === 0) return ch === close ? [text.slice(open + 1, i), i + 1] : null
    }
  }
  return null
}

/** Splits at commas or colons outside nested brackets. */
function splitTop(inner: string, sep: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!
    if ('([{'.includes(ch)) depth++
    else if (')]}'.includes(ch)) depth--
    else if (ch === sep && depth === 0) {
      parts.push(inner.slice(start, i))
      start = i + 1
    }
  }
  parts.push(inner.slice(start))
  return parts.map((p) => p.trim())
}

function level(inner: string, isCall: boolean): AccessLevel {
  const text = isCall ? (splitTop(inner, ',')[0] ?? '') : inner.trim()
  if (IDENT.test(text)) return { names: [text], follow: text }
  const slice = isCall ? [] : splitTop(text, ':')
  return { names: slice.length > 1 ? slice.filter((p) => IDENT.test(p)) : [], follow: null }
}

/** Every chain of subscripts in the code, read once per run. Only plain variable indexes are kept. */
export function scanAccesses(source: string, comment: LineComment): Access[] {
  const text = stripCode(source, comment)
  const seen = new Map<string, Access>()
  for (const m of text.matchAll(BASE)) {
    const base = m[1]!.split(/\s*(?:\.|->)\s*/)
    if (KEYWORDS.has(base[0]!)) continue
    const levels: AccessLevel[] = []
    let at = m.index + m[0].length
    for (;;) {
      const call = CALL.exec(text.slice(at, at + 24))
      const open = call ? at + call[0].length - 1 : text[at] === '[' ? at : -1
      const found = open >= 0 ? group(text, open) : null
      if (!found) break
      const next = level(found[0], call !== null)
      levels.push(next)
      at = found[1]
      if (!next.follow || (call && LAST_LEVEL.has(call[1]!))) break
      while (text[at] === ' ') at++
    }
    if (!levels.some((l) => l.names.length)) continue
    const access = { base, levels }
    seen.set(JSON.stringify(access), access)
  }
  return [...seen.values()]
}
