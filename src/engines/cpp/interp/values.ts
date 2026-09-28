import type { Capture, ClassDef, FuncDef, Param, Stmt } from '../lang/ast'
import type { CType, SeqType } from '../lang/types'
import type { Scope } from './scope'

/** A variable that was declared but never given a value. Reading it is an error. */
export const UNINIT = Symbol('uninitialized')

/** Storage: a variable, element, field or heap allocation. References and pointers point at cells. */
export class Cell {
  freed = false
  private stored: Val

  constructor(
    public type: CType,
    value: Val,
  ) {
    this.stored = value
  }

  get value(): Val {
    return this.stored
  }

  set value(v: Val) {
    this.stored = v
  }
}

/** One character inside a std::string, so `s[i] = 'x'` and `for (char& ch : s)` write through. */
export class CharCell extends Cell {
  constructor(
    private readonly str: StrVal,
    private readonly at: number,
  ) {
    super({ t: 'char' }, 0)
  }

  override get value(): Val {
    return this.str.s.charCodeAt(this.at)
  }

  override set value(code: Val) {
    if (typeof code !== 'number') return
    const s = this.str.s
    this.str.s = s.slice(0, this.at) + String.fromCharCode(code & 0xff) + s.slice(this.at + 1)
  }
}

export class StrVal {
  constructor(public s: string) {}
}

/** vector, deque, queue, stack, priority_queue (heap order) and C arrays. */
export class SeqVal {
  constructor(
    public type: SeqType,
    public items: Cell[],
  ) {}
}

export class MapVal {
  readonly entries = new Map<string, { key: Val; cell: Cell }>()
  constructor(public type: Extract<CType, { t: 'map' }>) {}
}

export class SetVal {
  readonly keys = new Map<string, Val>()
  constructor(public type: Extract<CType, { t: 'set' }>) {}
}

export class PairVal {
  constructor(
    public type: Extract<CType, { t: 'pair' }>,
    public first: Cell,
    public second: Cell,
  ) {}
}

export class ObjVal {
  constructor(
    public cls: ClassDef,
    public fields: Map<string, Cell>,
  ) {}
}

/** A pointer: to one cell, or to element `index` of an array allocation. Both null is nullptr. */
export class PtrVal {
  constructor(
    public target: Cell | null,
    public base: SeqVal | null = null,
    public index = 0,
  ) {}

  get isNull(): boolean {
    return this.target === null && this.base === null
  }
}

export const NULL_PTR = new PtrVal(null)

/** A position in a container. Maps and sets iterate in their visible order. */
export class IterVal {
  constructor(
    public over: SeqVal | StrVal | MapVal | SetVal,
    public index: number,
    public reverse = false,
  ) {}
}

export type FnVal =
  | { fn: 'user'; defs: FuncDef[]; self: Cell | null }
  | { fn: 'lambda'; params: Param[]; body: Stmt[]; scope: Scope; self: Cell | null; line: number; endLine: number; capture: Capture }
  | { fn: 'builtin'; name: string; arg?: number }
  | { fn: 'cmp'; greater: boolean }

export class StreamVal {
  constructor(readonly dir: 'out' | 'in') {}
}

/** A braced list not yet given a type; it takes one from where it is used. */
export class InitVal {
  constructor(public items: R[]) {}
}

export type Val =
  | boolean
  | number
  | bigint
  | StrVal
  | SeqVal
  | MapVal
  | SetVal
  | PairVal
  | ObjVal
  | PtrVal
  | IterVal
  | FnVal
  | StreamVal
  | InitVal
  | typeof UNINIT
  | null

/** An evaluated expression: its type, value, and the cell it lives in when it is an lvalue. */
export interface R {
  type: CType
  value: Val
  cell?: Cell
}

export const VOID: R = { type: { t: 'void' }, value: null }

export const isFn = (v: Val): v is FnVal => typeof v === 'object' && v !== null && 'fn' in v
