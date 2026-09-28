import type { Frame, Step } from '../trace/types'
import { scopeFrames } from '../trace/values'
import type { Tag } from './types'

export const POINTER_NAMES: ReadonlySet<string> = new Set(
  'i j l r lo hi low high mid left right start end slow fast p q p1 p2 idx index pos ptr write read top front back'.split(
    ' ',
  ),
)

export const WINDOW_PAIRS: readonly (readonly [string, string])[] = [
  ['left', 'right'],
  ['l', 'r'],
  ['lo', 'hi'],
  ['low', 'high'],
  ['start', 'end'],
  ['i', 'j'],
]

export const CELL_PAIRS: readonly (readonly [string, string])[] = [
  ['r', 'c'],
  ['row', 'col'],
  ['i', 'j'],
  ['nr', 'nc'],
  ['x', 'y'],
]

export const CELL_NAMES: ReadonlySet<string> = new Set(CELL_PAIRS.flat())

/** Int variables with pointer-like names in globals and the running frame; the running frame wins clashes. */
export function pointerCandidates(frames: readonly Frame[], names: ReadonlySet<string> = POINTER_NAMES): Map<string, number> {
  const out = new Map<string, number>()
  for (const frame of scopeFrames(frames)) {
    for (const [name, v] of frame.vars) {
      if (v.t === 'p' && v.k === 'int' && names.has(name)) out.set(name, Number(v.v))
    }
  }
  return out
}

/** Variable names in globals and the running frame that point at each heap id. */
export function buildTags(step: Step): Map<string, Tag[]> {
  const tags = new Map<string, Tag[]>()
  const frames = scopeFrames(step.frames)
  frames.forEach((frame, fi) => {
    const active = fi === frames.length - 1
    for (const [name, v] of frame.vars) {
      if (v.t !== 'r') continue
      const list = tags.get(v.id)
      if (list) list.push({ name, active })
      else tags.set(v.id, [{ name, active }])
    }
  })
  return tags
}
