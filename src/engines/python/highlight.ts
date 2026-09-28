import type { Token } from '../types'

const KEYWORDS = new Set(
  'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(
    ' ',
  ),
)
const BUILTINS = new Set(
  'print len range enumerate zip map filter sorted sum min max abs list dict set tuple str int float bool input isinstance type super open reversed any all round'.split(
    ' ',
  ),
)
const TOKEN = /(#.*$)|("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|(.)/g

function classify(word: string, prevWord: string): string | null {
  if (KEYWORDS.has(word)) return 'tk-keyword'
  if (prevWord === 'def' || prevWord === 'class') return 'tk-defname'
  if (BUILTINS.has(word)) return 'tk-builtin'
  return word === 'self' ? 'tk-self' : null
}

export function highlightPython(line: string): Token[] {
  const out: Token[] = []
  let prevWord = ''
  for (const [text, comment, string, number, word] of line.matchAll(TOKEN)) {
    let cls: string | null = null
    if (comment) cls = 'tk-comment'
    else if (string) cls = 'tk-string'
    else if (number) cls = 'tk-number'
    else if (word) {
      cls = classify(word, prevWord)
      prevWord = word
    }
    out.push({ text, cls })
  }
  return out
}
