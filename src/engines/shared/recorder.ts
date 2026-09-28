import type { Frame, FrameDelta, HeapDelta, HeapObject, StepEvent, Value, WireStep } from '../../trace/types'

/** Thrown once the step budget is spent; the run stops as truncated. */
export class StepLimit extends Error {}

/** Objects reachable on one step, keyed by id, filled while encoding. */
export type HeapDraft = Record<string, HeapObject>

export class Output {
  private readonly parts: string[] = []
  length = 0

  write(text: string): void {
    this.parts.push(text)
    this.length += text.length
  }

  text(): string {
    return this.parts.join('')
  }
}

export interface StepExtra {
  ret?: Value
  exc?: string
}

/**
 * Turns full per-step snapshots into the wire format: only frames and heap
 * objects that differ from the previous step are kept. Shared by every
 * engine whose tracer runs in JavaScript.
 */
export class Recorder {
  readonly steps: WireStep[] = []
  readonly out = new Output()
  private prevFrames: string[] = []
  private prevHeap = new Map<string, string>()

  constructor(readonly maxSteps: number) {}

  /** Call before encoding a step, so a spent budget costs no work. */
  ensureBudget(): void {
    if (this.steps.length >= this.maxSteps) throw new StepLimit()
  }

  push(event: StepEvent, line: number, frames: Frame[], heap: HeapDraft, extra: StepExtra = {}): void {
    const step: WireStep = { line, event, frames: this.framesDelta(frames), out: this.out.length, heap: this.heapDelta(heap) }
    if (extra.ret !== undefined) step.ret = extra.ret
    if (extra.exc !== undefined) step.exc = extra.exc
    this.steps.push(step)
  }

  private framesDelta(frames: Frame[]): FrameDelta {
    const json = frames.map((f) => JSON.stringify(f))
    let keep = 0
    const limit = Math.min(json.length, this.prevFrames.length)
    while (keep < limit && json[keep] === this.prevFrames[keep]) keep++
    this.prevFrames = json
    return { keep, push: frames.slice(keep) }
  }

  private heapDelta(heap: HeapDraft): HeapDelta {
    const next = new Map<string, string>()
    const set: Record<string, HeapObject> = {}
    let changed = false
    for (const id in heap) {
      const json = JSON.stringify(heap[id])
      next.set(id, json)
      if (this.prevHeap.get(id) !== json) {
        set[id] = heap[id]!
        changed = true
      }
    }
    const del = [...this.prevHeap.keys()].filter((id) => !next.has(id))
    this.prevHeap = next
    const delta: HeapDelta = {}
    if (changed) delta.set = set
    if (del.length) delta.del = del
    return delta
  }
}
