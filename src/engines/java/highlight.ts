import type { Token } from '../types'

const KEYWORDS = new Set(
  'abstract assert boolean break byte case catch char class continue default do double else enum extends final finally float for if implements import instanceof int interface long new null package private protected public record return short static super switch this throw throws try var void while yield true false'.split(
    ' ',
  ),
)
const BUILTINS = new Set(
  'String System Math Integer Long Double Character Boolean Object List ArrayList LinkedList Map HashMap TreeMap LinkedHashMap Set HashSet TreeSet LinkedHashSet Queue Deque ArrayDeque Stack PriorityQueue Arrays Collections Comparator StringBuilder Scanner Iterator Objects ListNode TreeNode buildList buildTree'.split(
    ' ',
  ),
)
const TOKEN = /(\/\/.*$|\/\*.*?(?:\*\/|$))|(@\w+)|("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)|(\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[lLfFdD]?\b|\b0[xX][\da-fA-F_]+[lL]?\b)|([A-Za-z_$][\w$]*)|(\s+)|(.)/g

function classify(word: string, prevWord: string): string | null {
  if (word === 'this') return 'tk-self'
  if (KEYWORDS.has(word)) return 'tk-keyword'
  if (prevWord === 'class' || prevWord === 'interface' || prevWord === 'record') return 'tk-defname'
  return BUILTINS.has(word) ? 'tk-builtin' : null
}

export function highlightJava(line: string): Token[] {
  const out: Token[] = []
  let prevWord = ''
  for (const [text, comment, annotation, string, number, word] of line.matchAll(TOKEN)) {
    let cls: string | null = null
    if (comment) cls = 'tk-comment'
    else if (annotation) cls = 'tk-keyword'
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
