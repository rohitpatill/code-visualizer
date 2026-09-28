// Pure helpers: step descriptions, diffs between steps, heap layout, syntax colors.

const INLINE_KINDS = new Set(['function', 'class', 'module'])

export function isInlineRef(value, heap) {
  return value.t === 'r' && INLINE_KINDS.has(heap[value.id]?.kind)
}

export function shortValue(value, heap) {
  if (value.t === 'p') return value.v
  const obj = heap[value.id]
  if (!obj) return '?'
  switch (obj.kind) {
    case 'list':
      return `a list of ${obj.size}`
    case 'tuple':
      return `a tuple of ${obj.size}`
    case 'set':
      return `a set of ${obj.size}`
    case 'deque':
      return `a deque of ${obj.size}`
    case 'dict':
      return `a dict with ${obj.size} ${obj.size === 1 ? 'key' : 'keys'}`
    case 'function':
      return `function ${obj.name}`
    case 'class':
      return `class ${obj.name}`
    case 'instance':
      return `a ${obj.cls} object`
    default:
      return obj.repr ?? obj.name ?? obj.kind
  }
}

export function describeStep(step) {
  if (!step) return { title: '', detail: '' }
  const frame = step.frames[step.frames.length - 1]
  const where = frame?.name === 'Globals' ? 'the top level' : `${frame?.name}()`
  switch (step.event) {
    case 'call': {
      const args = frame.vars.map(([k, v]) => `${k}=${shortValue(v, step.heap)}`).join(', ')
      return { title: `Calling ${frame.name}(${args})`, detail: `A new frame is pushed onto the stack at depth ${step.frames.length - 1}.` }
    }
    case 'line':
      return { title: `About to run line ${step.line}`, detail: `Inside ${where}.` }
    case 'return':
      if (step.func === '<module>') return { title: 'Program finished', detail: 'The last line has run.' }
      return {
        title: `${frame.name}() returns ${shortValue(step.ret, step.heap)}`,
        detail: 'Its frame is popped next, and the value goes back to the caller.',
      }
    case 'exception':
      return { title: step.exc, detail: `Raised on line ${step.line} inside ${where}.` }
    default:
      return { title: step.event, detail: '' }
  }
}

// Which variables and heap objects differ from the previous step.
export function diffSteps(prev, cur) {
  const vars = new Set()
  const heap = new Set()
  if (!prev || !cur) return { vars, heap }
  const prevFrames = new Map(prev.frames.map((f) => [f.id, new Map(f.vars.map(([k, v]) => [k, JSON.stringify(v)]))]))
  for (const f of cur.frames) {
    const old = prevFrames.get(f.id)
    if (!old) continue // brand-new frame, the whole frame is new
    for (const [k, v] of f.vars) {
      if (old.get(k) !== JSON.stringify(v)) vars.add(`${f.id}:${k}`)
    }
  }
  for (const [id, obj] of Object.entries(cur.heap)) {
    const before = prev.heap[id]
    if (!before || JSON.stringify(before) !== JSON.stringify(obj)) heap.add(id)
  }
  return { vars, heap }
}

function childRefs(obj) {
  switch (obj?.kind) {
    case 'list':
    case 'tuple':
    case 'set':
    case 'deque':
      return obj.items
    case 'dict':
      return obj.entries.flat()
    case 'class':
    case 'instance':
      return obj.attrs.map(([, v]) => v)
    default:
      return []
  }
}

// Heap layout: one row per object a variable points at, with everything that
// object points at placed to its right. Arrows then run mostly left to right.
export function layoutHeap(step, skip = new Set()) {
  const placed = new Set(skip)
  const rows = []
  const place = (value, row) => {
    if (value.t !== 'r' || placed.has(value.id) || isInlineRef(value, step.heap)) return
    placed.add(value.id)
    row.push(value.id)
    for (const child of childRefs(step.heap[value.id])) place(child, row)
  }
  for (const frame of step.frames) {
    for (const [, value] of frame.vars) {
      const row = []
      place(value, row)
      if (row.length) rows.push(row)
    }
    if (step.ret) {
      const row = []
      place(step.ret, row)
      if (row.length) rows.push(row)
    }
  }
  return rows
}

const KEYWORDS = new Set(
  'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '),
)
const BUILTINS = new Set(
  'print len range enumerate zip map filter sorted sum min max abs list dict set tuple str int float bool input isinstance type super open reversed any all round'.split(' '),
)
const TOKEN = /(#.*$)|("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|(.)/g

export function highlightLine(line) {
  const out = []
  let m
  let prevWord = ''
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(line)) !== null) {
    const [text, comment, string, number, word] = m
    let cls = null
    if (comment) cls = 'tk-comment'
    else if (string) cls = 'tk-string'
    else if (number) cls = 'tk-number'
    else if (word) {
      if (KEYWORDS.has(word)) cls = 'tk-keyword'
      else if (prevWord === 'def' || prevWord === 'class') cls = 'tk-defname'
      else if (BUILTINS.has(word)) cls = 'tk-builtin'
      else if (word === 'self') cls = 'tk-self'
      prevWord = word
    }
    out.push({ text, cls })
  }
  return out
}
