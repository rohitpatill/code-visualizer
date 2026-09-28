import type { Token } from '../types'

const KEYWORDS = new Set(
  'auto bool break case char class const constexpr continue default delete do double else enum false float for if inline int long namespace new nullptr operator private protected public return short signed sizeof static struct switch true typedef unsigned using void while NULL'.split(
    ' ',
  ),
)
const BUILTINS = new Set(
  'std cout cin cerr endl string vector map unordered_map set unordered_set queue stack deque priority_queue pair greater less function sort reverse max min swap abs make_pair to_string stoi size_t INT_MAX INT_MIN LLONG_MAX printf getline ListNode TreeNode buildList buildTree'.split(
    ' ',
  ),
)
const TOKEN = /(\/\/.*$|\/\*.*?(?:\*\/|$))|(^\s*#\s*\w+.*$)|("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)|(\b\d[\d']*(?:\.\d+)?(?:[eE][+-]?\d+)?[uUlLfF]*\b)|([A-Za-z_]\w*)|(\s+)|(.)/g

function classify(word: string, prevWord: string): string | null {
  if (word === 'this') return 'tk-self'
  if (KEYWORDS.has(word)) return 'tk-keyword'
  if (prevWord === 'class' || prevWord === 'struct') return 'tk-defname'
  return BUILTINS.has(word) ? 'tk-builtin' : null
}

export function highlightCpp(line: string): Token[] {
  const out: Token[] = []
  let prevWord = ''
  for (const [text, comment, directive, string, number, word] of line.matchAll(TOKEN)) {
    let cls: string | null = null
    if (comment) cls = 'tk-comment'
    else if (directive) cls = 'tk-keyword'
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
