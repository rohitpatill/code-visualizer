import type { Heap, Step, Value } from '../trace/types'
import { frameLabel, isProgramEnd, topFrame } from '../trace/values'

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')

export function shortValue(value: Value, heap: Heap): string {
  if (value.t === 'p') return value.v
  const obj = heap.get(value.id)
  if (!obj) return '?'
  switch (obj.kind) {
    case 'list':
    case 'tuple':
    case 'set':
    case 'deque':
      return `${article(obj.type)} ${obj.type} of ${obj.size}`
    case 'dict':
      return `${article(obj.type)} ${obj.type} with ${obj.size} ${obj.size === 1 ? 'key' : 'keys'}`
    case 'function':
      return `function ${obj.name}`
    case 'class':
      return `class ${obj.name}`
    case 'module':
      return `module ${obj.name}`
    case 'instance':
      return `${article(obj.type)} ${obj.type} object`
    case 'other':
      return obj.repr
  }
}

export interface Narration {
  title: string
  detail: string
}

export function describeStep(step: Step): Narration {
  const frame = topFrame(step)
  if (!frame) return { title: step.event, detail: '' }
  const where = frame.global ? 'the top level' : frameLabel(frame)
  switch (step.event) {
    case 'call': {
      const args = frame.vars.map(([k, v]) => `${k}=${shortValue(v, step.heap)}`).join(', ')
      return {
        title: `Calling ${frame.name}(${args})`,
        detail: `A new frame is pushed onto the stack at depth ${step.frames.length - 1}.`,
      }
    }
    case 'line':
      return { title: `About to run line ${step.line}`, detail: `Inside ${where}.` }
    case 'return':
      if (isProgramEnd(step)) return { title: 'Program finished', detail: 'The last line has run.' }
      return {
        title: `${frame.name}() returns ${step.ret ? shortValue(step.ret, step.heap) : 'nothing'}`,
        detail: 'Its frame is popped next, and the value goes back to the caller.',
      }
    case 'exception':
      return { title: step.exc ?? 'Exception', detail: `Raised on line ${step.line} inside ${where}.` }
  }
}
