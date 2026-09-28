import type { Frame as TraceFrame, StepEvent, Value } from '../../../trace/types'
import { type HeapDraft, Recorder } from '../../shared/recorder'
import type { ClassDef, Program } from '../lang/ast'
import { callOperator } from './calls'
import type { ObjectLess } from './compare'
import { Encoder } from './encode'
import { CppError } from './errors'
import { Io } from './io'
import { Scope } from './scope'
import { Cell, type ObjVal, PtrVal, type R } from './values'

export const MAX_DEPTH = 1500

export interface Frame {
  id: number
  name: string
  line: number
  endLine: number
  scope: Scope
  /** The outermost scope that belongs to this call; its variables are what the frame shows. */
  fnScope: Scope
  /** The object a method runs on. */
  self: Cell | null
  silent: boolean
  global: boolean
  failed: boolean
}

export interface FrameSpec {
  name: string
  line: number
  endLine: number
  scope: Scope
  self: Cell | null
  silent: boolean
}

export class Machine {
  readonly recorder: Recorder
  readonly globals = new Scope(null)
  readonly stack: Frame[] = []
  readonly io: Io
  readonly less: ObjectLess = (a, b) => callOperator(this, '<', a, b)
  errorLine: number | null = null
  private readonly encoder = new Encoder(this.less)
  private readonly thisCells = new WeakMap<Frame, Cell>()
  private silentDepth = 0
  private nextFrameId = 1

  constructor(
    readonly program: Program,
    maxSteps: number,
    stdin: string,
  ) {
    this.recorder = new Recorder(maxSteps)
    this.io = new Io(this.recorder.out, stdin)
  }

  get frame(): Frame {
    return this.stack[this.stack.length - 1]!
  }

  get silent(): boolean {
    return this.silentDepth > 0
  }

  classDef(name: string): ClassDef {
    const cls = this.program.classes.get(name)
    if (!cls) throw new CppError(`unknown type ${name}`)
    return cls
  }

  pushFrame(spec: FrameSpec, global = false): Frame {
    if (this.stack.length > MAX_DEPTH) throw new CppError('stack overflow: too many nested calls (does the recursion reach its base case?)')
    const frame: Frame = { ...spec, id: this.nextFrameId++, fnScope: spec.scope, global, failed: false }
    this.stack.push(frame)
    if (frame.silent) this.silentDepth++
    return frame
  }

  popFrame(frame: Frame): void {
    const at = this.stack.lastIndexOf(frame)
    if (at !== -1) this.stack.splice(at, 1)
    if (frame.silent) this.silentDepth--
  }

  /** A variable visible from the running code: locals, then members of `this`, then globals. */
  lookup(name: string): Cell | undefined {
    const f = this.frame
    const local = f.scope.find(name, this.globals)
    if (local) return local
    const self = f.self?.value as ObjVal | undefined
    return self?.fields?.get(name) ?? this.globals.vars.get(name)
  }

  thisValue(): R {
    const self = this.frame.self
    if (!self) throw new CppError("'this' is only available inside a method")
    return { type: { t: 'ptr', to: self.type }, value: new PtrVal(self) }
  }

  step(line: number): void {
    const f = this.frame
    f.line = line
    this.record('line', line)
  }

  record(event: StepEvent, line: number, extra: { ret?: R; exc?: string } = {}): void {
    if (this.silentDepth > 0) return
    this.recorder.ensureBudget()
    const heap: HeapDraft = {}
    const names = new Map<Cell, string>()
    const vars = this.stack.map((f) => this.frameVars(f))
    for (const list of vars) for (const [name, cell] of list) names.set(cell, name)
    const frames: TraceFrame[] = this.stack.map((f, i) => ({
      id: f.id,
      name: f.name,
      line: f.line,
      global: f.global,
      vars: vars[i]!.map(([name, cell]): [string, Value] => [name, this.encoder.cell(cell, heap, names)]),
    }))
    const ret = extra.ret ? this.encoder.value(extra.ret.value, extra.ret.type, heap, names) : undefined
    this.recorder.push(event, line, frames, heap, { ret, exc: extra.exc })
  }

  private frameVars(f: Frame): [string, Cell][] {
    const chain: Scope[] = []
    for (let s: Scope | null = f.scope; s; s = s.parent) {
      chain.push(s)
      if (s === f.fnScope) break
    }
    const vars = new Map<string, Cell>()
    if (f.self) {
      let cell = this.thisCells.get(f)
      if (!cell) {
        cell = new Cell({ t: 'ptr', to: f.self.type }, new PtrVal(f.self))
        this.thisCells.set(f, cell)
      }
      vars.set('this', cell)
    }
    for (const scope of chain.reverse()) for (const [name, cell] of scope.vars) vars.set(name, cell)
    return [...vars]
  }
}
