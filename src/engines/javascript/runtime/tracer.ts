import type { Frame, StepEvent, Value } from '../../../trace/types'
import { type HeapDraft, Recorder, StepLimit } from '../../shared/recorder'
import { Encoder } from './encode'
import { describeError } from './format'

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

export class Tracer {
  readonly recorder: Recorder
  /** The deepest line an escaping error was raised on. */
  errorLine: number | null = null
  private readonly stack: LiveFrame[] = []
  private readonly encoder = new Encoder()
  private nextFrameId = 1
  private lastError: unknown = undefined

  constructor(
    private readonly scopes: readonly (readonly string[])[],
    maxSteps: number,
  ) {
    this.recorder = new Recorder(maxSteps)
  }

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

  private record(event: StepEvent, line: number, extra: { ret?: unknown; exc?: string } = {}): void {
    this.recorder.ensureBudget()
    const heap: HeapDraft = {}
    const frames: Frame[] = this.stack.map((f) => ({
      id: f.id,
      name: f.name,
      line: f.line,
      global: f.global,
      vars: this.frameVars(f, heap),
    }))
    const ret = 'ret' in extra ? this.encoder.value(extra.ret, heap) : undefined
    this.recorder.push(event, line, frames, heap, { ret, exc: extra.exc })
  }
}
