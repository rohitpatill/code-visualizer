import type { NumLit } from './lexer'
import type { CType } from './types'

interface At {
  line: number
}

export type Expr = At &
  (
    | { k: 'num'; lit: NumLit }
    | { k: 'bool'; value: boolean }
    | { k: 'char'; value: number }
    | { k: 'str'; value: string }
    | { k: 'null' }
    | { k: 'this' }
    | { k: 'name'; name: string }
    | { k: 'unary'; op: string; arg: Expr }
    | { k: 'postfix'; op: '++' | '--'; arg: Expr }
    | { k: 'binary'; op: string; left: Expr; right: Expr }
    | { k: 'logical'; op: '&&' | '||'; left: Expr; right: Expr }
    | { k: 'assign'; op: string; target: Expr; value: Expr }
    | { k: 'cond'; test: Expr; then: Expr; else: Expr }
    | { k: 'comma'; exprs: Expr[] }
    | { k: 'call'; callee: Expr; args: Expr[] }
    | { k: 'member'; obj: Expr; name: string; arrow: boolean }
    | { k: 'index'; obj: Expr; index: Expr }
    | { k: 'cast'; type: CType; arg: Expr }
    | { k: 'construct'; type: CType; args: Expr[]; braces: boolean }
    | { k: 'new'; type: CType; args: Expr[]; count: Expr | null }
    | { k: 'delete'; arg: Expr }
    | { k: 'init'; items: Expr[] }
    | { k: 'lambda'; params: Param[]; body: Stmt[]; capture: Capture; endLine: number }
    | { k: 'limits'; type: CType; which: 'max' | 'min' }
  )

export interface Capture {
  /** Default mode for names not listed. */
  mode: 'none' | 'ref' | 'copy'
  byRef: string[]
  byCopy: string[]
}

export interface Param {
  name: string
  type: CType
  ref: boolean
  def: Expr | null
}

export interface VarDecl extends At {
  name: string
  type: CType
  ref: boolean
  /** `T x = e` or `T x{...}` (the latter as an `init` expression). */
  init: Expr | null
  /** `T x(a, b)` */
  ctorArgs: Expr[] | null
  /** C array sizes, `int a[n][m]`; null where the initializer decides (`int a[] = {...}`). */
  dims: (Expr | null)[]
}

export type Stmt = At &
  (
    | { k: 'decl'; decls: VarDecl[] }
    | { k: 'bind'; names: string[]; ref: boolean; init: Expr }
    | { k: 'expr'; expr: Expr }
    | { k: 'block'; body: Stmt[] }
    | { k: 'if'; test: Expr; then: Stmt; else: Stmt | null }
    | { k: 'while'; test: Expr; body: Stmt }
    | { k: 'do'; body: Stmt; test: Expr; testLine: number }
    | { k: 'for'; init: Stmt | null; test: Expr | null; update: Expr | null; body: Stmt }
    | { k: 'range'; names: string[]; type: CType; ref: boolean; range: Expr; body: Stmt }
    | { k: 'switch'; test: Expr; cases: SwitchCase[] }
    | { k: 'break' }
    | { k: 'continue' }
    | { k: 'return'; value: Expr | null }
    | { k: 'empty' }
  )

export interface SwitchCase extends At {
  test: Expr | null
  body: Stmt[]
}

export interface MemberInit {
  name: string
  args: Expr[]
}

export interface FuncDef extends At {
  name: string
  /** Owning class for methods and constructors. */
  owner: string | null
  params: Param[]
  ret: CType
  retRef: boolean
  body: Stmt[]
  endLine: number
  inits: MemberInit[]
  /** Built-in helper code: runs without recording steps. */
  prelude: boolean
}

export interface ClassDef extends At {
  name: string
  fields: VarDecl[]
  methods: Map<string, FuncDef[]>
  ctors: FuncDef[]
  prelude: boolean
}

export interface Program {
  functions: Map<string, FuncDef[]>
  classes: Map<string, ClassDef>
  globals: Stmt[]
  endLine: number
}
