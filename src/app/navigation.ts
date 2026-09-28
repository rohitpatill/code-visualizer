import type { StepRecord } from '../trace/types'

/** The first step after `from` that passes `test`, or the last step if none does. */
export function findStep(records: readonly StepRecord[], from: number, test: (r: StepRecord) => boolean): number {
  for (let j = from + 1; j < records.length; j++) if (test(records[j]!)) return j
  return records.length - 1
}

export const isBreakpointHit = (record: StepRecord, breakpoints: ReadonlySet<number>): boolean =>
  record.event === 'line' && breakpoints.has(record.line)

export const stepOverTarget = (records: readonly StepRecord[], from: number): number => {
  const depth = records[from]?.frames.length ?? 0
  return findStep(records, from, (r) => r.frames.length <= depth)
}

export const stepOutTarget = (records: readonly StepRecord[], from: number): number => {
  const depth = records[from]?.frames.length ?? 0
  return findStep(records, from, (r) => r.frames.length < depth)
}
