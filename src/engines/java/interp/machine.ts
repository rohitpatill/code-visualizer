import { Input } from '../../shared/input'
import { type HeapDraft, type Output, Recorder, StepLimit } from '../../shared/recorder'
import type { Frame as TraceFrame, StepEvent, Value } from '../../../trace/types'
import type { Program } from '../lang/ast'
import type { PrimName } from '../lang/types'
import { type ClassInfo, ClassTable } from './classes'
import { Encoder } from './encode'
import { CompileStop, ExitSignal, Fault } from './errors'
import type { PrimValue } from './numbers'
import { Scope } from './scope'
import { Boxed, JStr, type JObject, type R, Slot } from './values'

export const MAX_DEPTH = 1500

export interface Frame {
  id: number
  name: string
  line: number
  scope: Scope
  /** The outermost scope of this call; the variables from here in are what the frame shows. */
  fnScope: Scope
  self: JObject | null
  /** The class whose code runs here, for resolving names. */
  cls: ClassInfo | null
  silent: boolean
  global: boolean
  showThis: boolean
}

export type FrameSpec = Pick<Frame, 'name' | 'line' | 'scope' | 'self' | 'cls' | 'silent' | 'showThis'>

/** Values Java caches in `valueOf`, so autoboxing them twice gives the same object. */
function cached(p: PrimName, v: PrimValue): boolean {
  if (p === 'boolean' || p === 'byte') return true
  if (p === 'float' || p === 'double') return false
  const n = Number(v)
  return p === 'char' ? n <= 127 : n >= -128 && n <= 127
}

export class Machine {
  readonly recorder: Recorder
  readonly classes: ClassTable
  readonly stack: Frame[] = []
  readonly stdin: Input
  private readonly encoder = new Encoder(this)
  private readonly interned = new Map<string, JStr>()
  private readonly boxes = new Map<string, Boxed>()
  private readonly identities = new WeakMap<object, number>()
  private readonly thisSlots = new WeakMap<JObject, Slot>()
  private readonly globalVars: [string, Slot][]
  /** Where a run stopped for something other than a Java exception: the innermost frame's line. */
  errorLine: number | null = null
  private nextIdentity = 1
  private silentDepth = 0
  private nextFrameId = 1

  constructor(
    readonly program: Program,
    maxSteps: number,
    stdin: string,
  ) {
    this.recorder = new Recorder(maxSteps)
    this.stdin = new Input(stdin)
    this.classes = new ClassTable(program)
    this.globalVars = this.staticFields()
  }

  get out(): Output {
    return this.recorder.out
  }

  get frame(): Frame {
    return this.stack[this.stack.length - 1]!
  }

  get silent(): boolean {
    return this.silentDepth > 0
  }

  pushFrame(spec: FrameSpec, global = false): Frame {
    if (!spec.silent && this.stack.length > MAX_DEPTH) throw new Fault('StackOverflowError')
    const frame: Frame = { ...spec, id: this.nextFrameId++, fnScope: spec.scope, global }
    this.stack.push(frame)
    if (frame.silent) this.silentDepth++
    return frame
  }

  popFrame(frame: Frame): void {
    const at = this.stack.lastIndexOf(frame)
    if (at !== -1) this.stack.splice(at, 1)
    if (frame.silent) this.silentDepth--
  }

  /** The one String object for a literal, as the JVM's string pool does. */
  intern(s: string): JStr {
    let str = this.interned.get(s)
    if (!str) {
      str = new JStr(s)
      this.interned.set(s, str)
    }
    return str
  }

  /** Autoboxing: `Integer.valueOf` and friends, including their caches. */
  box(p: PrimName, v: PrimValue): Boxed {
    if (!cached(p, v)) return new Boxed(p, v)
    const key = `${p}:${v}`
    let b = this.boxes.get(key)
    if (!b) {
      b = new Boxed(p, v)
      this.boxes.set(key, b)
    }
    return b
  }

  /** A stable stand-in for System.identityHashCode, as the hex in `Node@1b6d3586`. */
  identityHash(obj: object): number {
    let id = this.identities.get(obj)
    if (id === undefined) {
      id = this.nextIdentity++
      this.identities.set(obj, id)
    }
    return (Math.imul(id, 0x9e3779b1) >>> 4) & 0x7fffffff
  }

  /** Remembers where a compile error found at run time happened, and records that step once. */
  noteError(err: unknown, frame: Frame): void {
    if (this.errorLine !== null || err instanceof StepLimit || err instanceof ExitSignal) return
    this.errorLine = frame.line
    if (err instanceof CompileStop) this.record('exception', frame.line, { exc: `Compile error: ${err.message}` })
  }

  step(line: number): void {
    this.frame.line = line
    this.record('line', line)
  }

  record(event: StepEvent, line: number, extra: { ret?: R; exc?: string } = {}): void {
    if (this.silentDepth > 0) return
    this.recorder.ensureBudget()
    const heap: HeapDraft = {}
    const frames: TraceFrame[] = this.stack.map((f) => ({
      id: f.id,
      name: f.name,
      line: f.line,
      global: f.global,
      vars: this.frameVars(f).map(([name, slot]): [string, Value] => [name, this.encoder.value(slot.value, slot.type, heap)]),
    }))
    const ret = extra.ret ? this.encoder.value(extra.ret.value, extra.ret.type, heap) : undefined
    this.recorder.push(event, line, frames, heap, { ret, exc: extra.exc })
  }

  /** User classes' static fields, shown in the global frame. Names that clash across classes get the class prefix. */
  private staticFields(): [string, Slot][] {
    const fields = this.classes.all
      .filter((c) => !c.decl.prelude)
      .flatMap((c) => [...c.statics].filter(([name]) => !c.decl.constants.some((k) => k.name === name)).map(([name, slot]) => ({ cls: c.name, name, slot })))
    const counts = new Map<string, number>()
    for (const f of fields) counts.set(f.name, (counts.get(f.name) ?? 0) + 1)
    return fields.map((f): [string, Slot] => [counts.get(f.name)! > 1 ? `${f.cls}.${f.name}` : f.name, f.slot])
  }

  private frameVars(f: Frame): [string, Slot][] {
    if (f.global) return this.globalVars
    const chain: Scope[] = []
    for (let s: Scope | null = f.scope; s; s = s.parent) {
      chain.push(s)
      if (s === f.fnScope) break
    }
    const vars: [string, Slot][] = f.showThis && f.self ? [['this', this.thisSlot(f.self)]] : []
    for (const scope of chain.reverse()) vars.push(...scope.vars)
    return vars
  }

  private thisSlot(self: JObject): Slot {
    let slot = this.thisSlots.get(self)
    if (!slot) {
      slot = new Slot({ t: 'ref', name: self.cls.name, args: [] }, self)
      this.thisSlots.set(self, slot)
    }
    return slot
  }
}
