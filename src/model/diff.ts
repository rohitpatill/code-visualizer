import type { Step } from '../trace/types'
import { sameValue } from '../trace/values'

export interface StepDiff {
  /** `${frameId}:${name}` of every variable that changed. */
  vars: ReadonlySet<string>
  /** Heap ids that are new or changed. */
  heap: ReadonlySet<string>
}

const NO_CHANGES: StepDiff = { vars: new Set(), heap: new Set() }

export const varKey = (frameId: number, name: string): string => `${frameId}:${name}`

export function diffSteps(prev: Step | null, cur: Step): StepDiff {
  if (!prev) return NO_CHANGES
  const vars = new Set<string>()
  const prevFrames = new Map(prev.frames.map((f) => [f.id, f]))
  for (const frame of cur.frames) {
    const old = prevFrames.get(frame.id)
    if (!old) continue
    const before = new Map(old.vars)
    for (const [name, value] of frame.vars) {
      if (!sameValue(before.get(name), value)) vars.add(varKey(frame.id, name))
    }
  }
  return { vars, heap: cur.touched }
}
