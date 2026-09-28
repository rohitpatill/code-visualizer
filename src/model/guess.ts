import type { Prim, StepRecord } from '../trace/types'
import { sameValue, topFrame } from '../trace/values'

export interface Question {
  name: string
  answer: Prim
}

/** The first plain value in the running frame that the next step changes. */
export function questionFor(cur: StepRecord, next: StepRecord): Question | null {
  if (next.frames.length !== cur.frames.length) return null
  const before = topFrame(cur)
  const after = topFrame(next)
  if (!before || !after) return null
  const old = new Map(before.vars)
  for (const [name, value] of after.vars) {
    if (value.t === 'p' && !sameValue(old.get(name), value)) return { name, answer: value }
  }
  return null
}

const normalize = (s: string) => s.trim().replace(/\s+/g, '').replace(/"/g, "'")

/** Accepts 5 for 5, hello or 'hello' for 'hello', [1,2] for [1, 2]. */
export function sameAnswer(input: string, answer: Prim): boolean {
  if (normalize(input) === normalize(answer.v)) return true
  return answer.k === 'str' && (input === answer.s || input.trim() === answer.s)
}
