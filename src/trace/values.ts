import type { Frame, Heap, HeapObject, StepEvent, Value } from './types'

export const sameValue = (a: Value | undefined, b: Value | undefined): boolean => {
  if (!a || !b) return a === b
  if (a.t === 'p') return b.t === 'p' && a.k === b.k && a.v === b.v
  return b.t === 'r' && a.id === b.id
}

export const valueKey = (v: Value): string => (v.t === 'p' ? `p${v.k}:${v.v}` : `r${v.id}`)

export const isNone = (v: Value | undefined): boolean => !v || (v.t === 'p' && v.k === 'none')

export const deref = (v: Value | undefined, heap: Heap): HeapObject | undefined =>
  v?.t === 'r' ? heap.get(v.id) : undefined

export const topFrame = (step: { frames: readonly Frame[] }): Frame | undefined => step.frames[step.frames.length - 1]

export const isProgramEnd = (step: { event: StepEvent; frames: readonly Frame[] }): boolean =>
  step.event === 'return' && topFrame(step)?.global === true

export const frameLabel = (frame: Frame): string => (frame.global ? 'Globals' : `${frame.name}()`)

/** Globals plus the running frame, with the running frame last. */
export const scopeFrames = (frames: readonly Frame[]): readonly Frame[] =>
  frames.length > 1 ? [frames[0]!, frames[frames.length - 1]!] : frames
