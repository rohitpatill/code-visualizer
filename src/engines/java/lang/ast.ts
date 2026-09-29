import type { JavaNum } from './lexer'
import type { JType } from './types'

interface At {
  line: number
}

export interface LambdaParam {
  name: string
  type: JType | null
}

export type Expr = At &
  (
    | { k: 'num'; lit: JavaNum }
    | { k: 'char'; value: number }
    | { k: 'bool'; value: boolean }
    | { k: 'str'; value: string }
    | { k: 'null' }
    | { k: 'this' }
    | { k: 'name'; name: string }
    | { k: 'field'; obj: Expr; name: string }
    | { k: 'index'; obj: Expr; index: Expr }
    /** `f(x)`, `a.f(x)`, `super.f(x)`. */
    | { k: 'call'; obj: Expr | null; name: string; args: Expr[]; sup: boolean }
    /** `new C(args)`, with a body for an anonymous class. */
    | { k: 'new'; type: JType; args: Expr[]; body: ClassDecl | null }
    /** `new int[n][m]`, `new int[n][]`, `new int[]{1, 2}`: `type` is the whole array type. */
    | { k: 'newArray'; type: JType; dims: Expr[]; init: Expr | null }
    /** A braced array initializer, `{1, 2, 3}`. */
    | { k: 'array'; items: Expr[] }
    | { k: 'unary'; op: string; arg: Expr }
    | { k: 'postfix'; op: '++' | '--'; arg: Expr }
    | { k: 'binary'; op: string; left: Expr; right: Expr }
    | { k: 'logical'; op: '&&' | '||'; left: Expr; right: Expr }
    | { k: 'assign'; op: string; target: Expr; value: Expr }
    | { k: 'cond'; test: Expr; then: Expr; else: Expr }
    | { k: 'cast'; type: JType; arg: Expr }
    | { k: 'instanceof'; arg: Expr; type: JType; bind: string | null }
    | { k: 'lambda'; params: LambdaParam[]; body: Expr | Stmt[]; endLine: number }
    /** `Integer::compare`, `list::add`, `ArrayList::new`, `int[]::new`. */
    | { k: 'methodRef'; target: Expr | null; type: JType | null; name: string }
    | { k: 'switch'; test: Expr; cases: SwitchCase[] }
  )

export interface VarDeclarator {
  name: string
  /** Extra `[]` after the name, as in `int a[]`. */
  dims: number
  init: Expr | null
  line: number
}

export interface CatchClause {
  types: string[]
  name: string
  body: Stmt[]
  line: number
}

/** One `case`. Colon cases fall through; an arrow case runs one statement (an expression yields in a switch expression). */
export interface SwitchCase {
  labels: Expr[]
  isDefault: boolean
  body: Stmt[]
  arrow: boolean
  line: number
}

export type Stmt = At &
  (
    | { k: 'local'; type: JType; decls: VarDeclarator[] }
    | { k: 'expr'; expr: Expr }
    | { k: 'block'; body: Stmt[] }
    | { k: 'if'; test: Expr; then: Stmt; else: Stmt | null }
    | { k: 'while'; test: Expr; body: Stmt }
    | { k: 'do'; body: Stmt; test: Expr; testLine: number }
    | { k: 'for'; init: Stmt[]; test: Expr | null; update: Expr[]; body: Stmt }
    | { k: 'foreach'; type: JType; name: string; iterable: Expr; body: Stmt }
    | { k: 'switch'; test: Expr; cases: SwitchCase[] }
    | { k: 'break'; label: string | null }
    | { k: 'continue'; label: string | null }
    | { k: 'return'; value: Expr | null }
    | { k: 'yield'; value: Expr }
    | { k: 'throw'; value: Expr }
    | { k: 'try'; resources: Stmt[]; body: Stmt[]; catches: CatchClause[]; finally: Stmt[] | null }
    | { k: 'labeled'; label: string; body: Stmt }
    /** `this(...)` or `super(...)` at the start of a constructor. */
    | { k: 'ctorCall'; which: 'this' | 'super'; args: Expr[] }
    | { k: 'empty' }
  )

export interface Param {
  name: string
  type: JType
}

export interface MethodDecl extends At {
  name: string
  params: Param[]
  /** The last parameter is `T...`; its type is the array `T[]`. */
  varargs: boolean
  ret: JType
  /** Null for abstract and interface methods. */
  body: Stmt[] | null
  isStatic: boolean
  endLine: number
}

export interface FieldDecl extends At {
  name: string
  type: JType
  init: Expr | null
  isStatic: boolean
}

/** Field initializers and initializer blocks, run in source order. */
export type Initializer = { k: 'field'; field: FieldDecl } | { k: 'block'; body: Stmt[]; line: number }

/** One constant of an enum, with its constructor arguments and, when it overrides methods, its own class body. */
export interface EnumConstant extends At {
  name: string
  args: Expr[]
  body: ClassDecl | null
}

export interface ClassDecl extends At {
  name: string
  kind: 'class' | 'interface' | 'record' | 'enum'
  superName: string | null
  interfaces: string[]
  /** Top-level, `static` nested, or implicitly static (interfaces, records). Inner classes see their outer instance. */
  isStatic: boolean
  isAbstract: boolean
  fields: FieldDecl[]
  methods: MethodDecl[]
  ctors: MethodDecl[]
  staticInit: Initializer[]
  instanceInit: Initializer[]
  nested: ClassDecl[]
  /** Record components, in order. */
  components: Param[]
  /** A record's compact canonical constructor body. */
  compactCtor: Stmt[] | null
  /** An enum's constants, in declaration order. */
  constants: EnumConstant[]
  anonymous: boolean
  /** Declared inside a method body. A local class sees the method's variables. */
  local: boolean
  /** Built-in helper code: runs without recording steps. */
  prelude: boolean
  endLine: number
}

export interface Program {
  classes: ClassDecl[]
  endLine: number
}
