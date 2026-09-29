// The contract every language engine emits. The UI only ever reads these shapes.

export type PrimKind = 'none' | 'bool' | 'int' | 'float' | 'str' | 'other'

export interface Prim {
  t: 'p'
  k: PrimKind
  /** Display text in the source language's own literal syntax. */
  v: string
  /** Raw text, only for strings. */
  s?: string
}

export interface Ref {
  t: 'r'
  id: string
}

export type Value = Prim | Ref

export type SequenceKind = 'list' | 'tuple' | 'set' | 'deque'

export type HeapObject =
  | {
      kind: SequenceKind
      type: string
      items: Value[]
      size: number
      /** Where the top is when drawn as a stack; the default is the last item. Java deques push at the front. */
      stackTop?: 'first'
    }
  | { kind: 'dict'; type: string; entries: [Value, Value][]; size: number }
  | { kind: 'instance'; type: string; attrs: [string, Value][] }
  | { kind: 'class'; type: string; name: string; bases: string[]; attrs: [string, Value][] }
  | { kind: 'function'; type: string; name: string; sig: string }
  | { kind: 'module'; type: string; name: string }
  | { kind: 'other'; type: string; repr: string }

export type HeapKind = HeapObject['kind']

export type SequenceObject = Extract<HeapObject, { items: Value[] }>

export type Heap = ReadonlyMap<string, HeapObject>

export type Var = [name: string, value: Value]

export interface Frame {
  id: number
  name: string
  line: number
  global: boolean
  vars: Var[]
}

export type StepEvent = 'call' | 'line' | 'return' | 'exception'

export interface HeapDelta {
  set?: Record<string, HeapObject>
  del?: string[]
}

/**
 * The stack as a change from the previous step: the first `keep` frames are
 * unchanged, `push` replaces everything above them. Callers are paused while
 * a callee runs, so deep recursion costs one frame per step, not the whole stack.
 */
export interface FrameDelta {
  keep: number
  push: Frame[]
}

/** One step as an engine sends it: frames and heap objects appear only when they change. */
export interface WireStep {
  line: number
  event: StepEvent
  frames: FrameDelta
  /** Length of stdout so far, in UTF-16 code units. */
  out: number
  heap: HeapDelta
  ret?: Value
  exc?: string
}

/** A step with its full stack rebuilt; the heap stays a delta until `Trace.step`. */
export interface StepRecord extends Omit<WireStep, 'frames'> {
  frames: Frame[]
}

export interface TraceError {
  message: string
  line: number | null
}

export interface RawTrace {
  steps: WireStep[]
  truncated: boolean
  error: TraceError | null
  stdout: string
  maxSteps: number
}

/** A step with its full heap and output rebuilt. */
export interface Step extends Omit<StepRecord, 'heap' | 'out'> {
  heap: Heap
  stdout: string
  /** Ids whose object is new or changed on this step. */
  touched: ReadonlySet<string>
}
