import type { Frame, FrameDelta, HeapDelta, HeapObject, StepEvent, Value, WireStep } from '../../../trace/types'
import { type HeapDraft, Encoder } from './encode'
import { describeError } from './format'

/** Thrown from a hook once the step budget is spent; the run stops as truncated. */
export class StepLimit extends Error {}

/** What instrumented code passes for each scope: an id into `scopes` and a getter by index. */
export interface Reader {
  i: number
  g: (k: number) => unknown
}

export interface LiveFrame {
  id: number
  name: string
  line: number
  endLine: number
  global: boolean
  readers: readonly Reader[]
  done: boolean
}

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

export class Tracer {
  readonly steps: WireStep[] = []
  readonly out = new Output()
  /** The deepest line an escaping error was raised on. */
  errorLine: number | null = null
  private readonly stack: LiveFrame[] = []
  private readonly encoder = new Encoder()
  private prevHeap = new Map<string, string>()
  private prevFrames: string[] = []
  private nextFrameId = 1
  private lastError: unknown = undefined

  constructor(
    private readonly scopes: readonly (readonly string[])[],
    private readonly maxSteps: number,
  ) {}

  /** The hooks instrumented code calls, as `__st.enter(...)` and so on. */
  readonly hooks = {
    enter: (name: string, line: number, endLine: number, readers: readonly Reader[], global = false): LiveFrame => {
      const frame: LiveFrame = { id: this.nextFrameId++, name, line, endLine, global, readers, done: false }
      this.stack.push(frame)
      if (!global) this.record('call', line)
      return frame
    },
    step: (frame: LiveFrame, line: number, readers: readonly Reader[]): void => {
      frame.line = line
      frame.readers = readers
      this.record('line', line)
    },
    ret: <T>(frame: LiveFrame, line: number, value: T): T => {
      frame.line = line
      this.record('return', line, { ret: value })
      frame.done = true
      return value
    },
    fail: (frame: LiveFrame, error: unknown): void => {
      if (error instanceof StepLimit || frame.done) return
      frame.done = true
      if (error !== this.lastError) {
        this.lastError = error
        this.errorLine = frame.line
      }
      this.record('exception', frame.line, { exc: describeError(error) })
    },
    leave: (frame: LiveFrame): void => {
      try {
        if (!frame.done) {
          frame.line = frame.endLine
          this.record('return', frame.endLine, { ret: undefined })
        }
      } finally {
        const at = this.stack.lastIndexOf(frame)
        if (at !== -1) this.stack.splice(at, 1)
      }
    },
  }

  private frameVars(frame: LiveFrame, heap: HeapDraft): [string, Value][] {
    const live = new Map<string, unknown>()
    for (const r of frame.readers) {
      const names = this.scopes[r.i] ?? []
      for (let k = 0; k < names.length; k++) {
        try {
          live.set(names[k]!, r.g(k))
        } catch {
          // Still in its temporal dead zone: declared but not yet reached.
        }
      }
    }
    return [...live].map(([name, v]) => [name, this.encoder.value(v, heap)])
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

  private record(event: StepEvent, line: number, extra: { ret?: unknown; exc?: string } = {}): void {
    if (this.steps.length >= this.maxSteps) throw new StepLimit()
    const heap: HeapDraft = {}
    const frames: Frame[] = this.stack.map((f) => ({
      id: f.id,
      name: f.name,
      line: f.line,
      global: f.global,
      vars: this.frameVars(f, heap),
    }))
    const step: WireStep = { line, event, frames: this.framesDelta(frames), out: this.out.length, heap: {} }
    if ('ret' in extra) step.ret = this.encoder.value(extra.ret, heap)
    if (extra.exc !== undefined) step.exc = extra.exc
    step.heap = this.heapDelta(heap)
    this.steps.push(step)
  }
}
