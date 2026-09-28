import type { Token } from '../types'

const KEYWORDS = new Set(
  'await break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield'.split(
    ' ',
  ),
)
const BUILTINS = new Set(
  'console Math Array Object Map Set Number String Boolean JSON Infinity NaN parseInt parseFloat prompt Symbol BigInt Date RegExp Error ListNode TreeNode buildList buildTree'.split(
    ' ',
  ),
)
const TOKEN = /(\/\/.*$|\/\*.*?(?:\*\/|$))|("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|`(?:\\.|[^`\\])*`?)|(\b\d[\d_]*(?:\.\d+)?n?\b)|([A-Za-z_$][\w$]*)|(\s+)|(.)/g

function classify(word: string, prevWord: string): string | null {
  if (word === 'this') return 'tk-self'
  if (KEYWORDS.has(word)) return 'tk-keyword'
  if (prevWord === 'function' || prevWord === 'class') return 'tk-defname'
  return BUILTINS.has(word) ? 'tk-builtin' : null
}

export function highlightJavaScript(line: string): Token[] {
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
