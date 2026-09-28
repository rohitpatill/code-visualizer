import type { Heap, HeapDelta, HeapObject, RawTrace, Step, StepRecord, TraceError } from './types'

// A full heap copy is kept every CHECKPOINT_EVERY steps, so rebuilding any
// step replays at most that many deltas and memory stays O(steps / K * heap).
const CHECKPOINT_EVERY = 64
const CACHE_SIZE = 8

const EMPTY_SET: ReadonlySet<string> = new Set()

function applyDelta(heap: Map<string, HeapObject>, delta: HeapDelta): void {
  if (delta.set) for (const id in delta.set) heap.set(id, delta.set[id]!)
  if (delta.del) for (const id of delta.del) heap.delete(id)
}

export class Trace {
  readonly records: readonly StepRecord[]
  readonly stdout: string
  readonly error: TraceError | null
  readonly truncated: boolean
  readonly maxSteps: number
  private readonly checkpoints: Heap[] = []
  private readonly cache = new Map<number, Step>()

  constructor(raw: RawTrace) {
    this.records = raw.steps
    this.stdout = raw.stdout
    this.error = raw.error
    this.truncated = raw.truncated
    this.maxSteps = raw.maxSteps
    const heap = new Map<string, HeapObject>()
    raw.steps.forEach((record, i) => {
      applyDelta(heap, record.heap)
      if (i % CHECKPOINT_EVERY === 0) this.checkpoints.push(new Map(heap))
    })
  }

  static parse(json: string): Trace {
    return new Trace(JSON.parse(json) as RawTrace)
  }

  static failed(message: string): Trace {
    return new Trace({ steps: [], truncated: false, error: { message, line: null }, stdout: '', maxSteps: 0 })
  }

  get length(): number {
    return this.records.length
  }

  step(index: number): Step {
    const cached = this.cache.get(index)
    if (cached) {
      this.cache.delete(index)
      this.cache.set(index, cached)
      return cached
    }
    const record = this.records[index]
    if (!record) throw new RangeError(`No step ${index} in a trace of ${this.length}`)
    const block = Math.floor(index / CHECKPOINT_EVERY)
    const heap = new Map(this.checkpoints[block])
    for (let j = block * CHECKPOINT_EVERY + 1; j <= index; j++) applyDelta(heap, this.records[j]!.heap)
    const step = this.materialize(record, heap)
    this.cache.set(index, step)
    if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!)
    return step
  }

  /** Visits every step in order in O(total deltas). The heap is live: read it during the callback only. */
  scan(visit: (record: StepRecord, heap: Heap, index: number) => void): void {
    const heap = new Map<string, HeapObject>()
    this.records.forEach((record, i) => {
      applyDelta(heap, record.heap)
      visit(record, heap, i)
    })
  }

  private materialize(record: StepRecord, heap: Heap): Step {
    const { heap: delta, out, ...rest } = record
    return {
      ...rest,
      heap,
      stdout: this.stdout.slice(0, out),
      touched: delta.set ? new Set(Object.keys(delta.set)) : EMPTY_SET,
    }
  }
}
