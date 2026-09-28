import type { AnyNode, BlockStatement, Class, Expression, Function as FunctionNode, Node, Program, Statement } from 'acorn'
import { FRAME, block, bool, constDecl, exprStmt, guarded, hook, id, num, reader, readerName, str } from './builders'
import { children, hoistedVars, isClass, isFunction, lexicalNames, loopHeadNames, patternNames } from './scopes'

export class UnsupportedSyntax extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message)
  }
}

interface Ctx {
  /** Reader variables visible here, outermost scope first. */
  readers: readonly string[]
}

interface BlockOpts {
  /** Step at this line when the block starts (loop headers that bind per iteration). */
  headerLine?: number
  /** Line of the statement that owns the block, for same-line step merging. */
  ownerLine?: number
}

const NO_READERS: Ctx = { readers: [] }
const NO_LINE = -1

const line = (node: Node) => node.loc?.start.line ?? 0
const unique = (names: readonly string[]) => [...new Set(names)]
const seq = (first: Expression, second: Expression): Expression => ({ start: 0, end: 0, type: 'SequenceExpression', expressions: [first, second] })
const voidZero = (): Expression => ({ start: 0, end: 0, type: 'UnaryExpression', operator: 'void', prefix: true, argument: num(0) })

function keyName(key: AnyNode): string {
  if (key.type === 'Identifier') return key.name
  if (key.type === 'PrivateIdentifier') return `#${key.name}`
  if (key.type === 'Literal') return String(key.value)
  return '[computed]'
}

const isDirective = (s: Statement) => s.type === 'ExpressionStatement' && s.directive !== undefined

function splitDirectives(statements: Statement[]): [Statement[], Statement[]] {
  const n = statements.findIndex((s) => !isDirective(s))
  const at = n === -1 ? statements.length : n
  return [statements.slice(0, at), statements.slice(at)]
}

const needsStep = (s: Statement): boolean => {
  switch (s.type) {
    case 'FunctionDeclaration':
    case 'EmptyStatement':
    case 'ForStatement':
    case 'WhileStatement':
      return false
    case 'LabeledStatement':
      return needsStep(s.body)
    default:
      return true
  }
}

/**
 * Rewrites an AST in place so every statement reports a step, every function
 * reports entry, return and failure, and every scope exposes a reader over its
 * variables. `scopes[id]` lists the names reader `id` returns, in switch order.
 */
export class Instrumenter {
  readonly scopes: string[][] = []

  program(program: Program): void {
    const [directives, rest] = splitDirectives(program.body as Statement[])
    const prelude: Statement[] = [...directives]
    const readers = this.declareReader(hoistedVars(rest), prelude)
    const endLine = rest[rest.length - 1]?.loc?.end.line ?? 1
    prelude.push(constDecl(FRAME, hook('enter', [str('module'), num(1), num(endLine), this.readerList(readers), bool(true)])))
    program.body = [...prelude, guarded(this.scopedBlock(rest, { readers }, []))]
  }

  private register(names: readonly string[]): number {
    this.scopes.push([...names])
    return this.scopes.length - 1
  }

  /** Declares a reader for `names` (if any) into `into`; returns the reader variables now visible. */
  private declareReader(names: readonly string[], into: Statement[], outer: readonly string[] = []): readonly string[] {
    const list = unique(names)
    if (!list.length) return outer
    const scopeId = this.register(list)
    into.push(constDecl(readerName(scopeId), reader(scopeId, list)))
    return [...outer, readerName(scopeId)]
  }

  private readerList(readers: readonly string[], extra: Expression[] = []): Expression {
    return { start: 0, end: 0, type: 'ArrayExpression', elements: [...readers.map(id), ...extra] }
  }

  private step(at: number, readers: readonly string[], extra: Expression[] = []): Expression {
    return hook('step', [id(FRAME), num(at), this.readerList(readers, extra)])
  }

  private fn(node: FunctionNode, name: string, isMethod: boolean): void {
    if (node.async || node.generator) {
      throw new UnsupportedSyntax('Async functions and generators are not supported yet.', line(node))
    }
    for (const param of node.params) this.visit(param, NO_READERS)
    const body: Statement[] =
      node.body.type === 'BlockStatement'
        ? node.body.body
        : [{ start: node.body.start, end: node.body.end, loc: node.body.loc, type: 'ReturnStatement', argument: node.body }]
    const [directives, rest] = splitDirectives(body)
    const prelude: Statement[] = [...directives]
    const params = node.params.flatMap((p) => patternNames(p))
    const readers = this.declareReader([...(isMethod ? ['this'] : []), ...params, ...hoistedVars(rest)], prelude)
    const endLine = node.loc?.end.line ?? line(node)
    prelude.push(constDecl(FRAME, hook('enter', [str(name), num(line(node)), num(endLine), this.readerList(readers)])))
    node.body = block([...prelude, guarded(this.scopedBlock(rest, { readers }, []))])
    node.expression = false
  }

  private cls(node: Class, name: string, ctx: Ctx): void {
    if (node.superClass) this.visit(node.superClass, ctx)
    for (const member of node.body.body) {
      if (member.type === 'StaticBlock') {
        member.body = this.scopedBlock(member.body, ctx, []).body
        continue
      }
      if (member.computed) this.visit(member.key, ctx)
      const memberName = `${name}.${keyName(member.key)}`
      if (member.type === 'MethodDefinition') this.fn(member.value, memberName, true)
      else if (member.value) this.visit(member.value, ctx, memberName)
    }
  }

  /** Transforms functions and classes nested anywhere inside an expression or pattern. */
  private visit(node: AnyNode, ctx: Ctx, name?: string): void {
    if (isFunction(node)) {
      const f = node as FunctionNode
      return this.fn(f, name ?? f.id?.name ?? '(anonymous)', false)
    }
    if (isClass(node)) {
      const c = node as Class
      return this.cls(c, name ?? c.id?.name ?? '(anonymous class)', ctx)
    }
    switch (node.type) {
      case 'VariableDeclarator':
        this.visit(node.id, ctx)
        if (node.init) this.visit(node.init, ctx, node.id.type === 'Identifier' ? node.id.name : undefined)
        return
      case 'AssignmentExpression':
        this.visit(node.left, ctx)
        this.visit(node.right, ctx, node.left.type === 'Identifier' ? node.left.name : undefined)
        return
      case 'Property':
        if (node.computed) this.visit(node.key, ctx)
        if (isFunction(node.value) && (node.method || node.kind !== 'init')) return this.fn(node.value as FunctionNode, keyName(node.key), true)
        return this.visit(node.value, ctx, keyName(node.key))
    }
    for (const child of children(node)) this.visit(child, ctx)
  }

  // Like Python, a new step starts when the line changes: a statement on the
  // same line as the one before it (or as its block's owner) shares that step.
  private list(statements: readonly Statement[], ctx: Ctx, prevLine = NO_LINE): Statement[] {
    let last = prevLine
    return statements.flatMap((s) => {
      const out = this.statement(s, ctx)
      const at = line(s)
      const stepped = needsStep(s) && at !== last
      last = at
      return stepped ? [exprStmt(this.step(at, ctx.readers)), out] : [out]
    })
  }

  private scopedBlock(statements: readonly Statement[], ctx: Ctx, extraNames: readonly string[], opts: BlockOpts = {}): BlockStatement {
    const prefix: Statement[] = []
    const readers = this.declareReader([...extraNames, ...lexicalNames(statements)], prefix, ctx.readers)
    if (opts.headerLine !== undefined) prefix.push(exprStmt(this.step(opts.headerLine, readers)))
    return block([...prefix, ...this.list(statements, { readers }, opts.headerLine ?? opts.ownerLine)])
  }

  private asBlock(s: Statement, ctx: Ctx, ownerLine: number, extraNames: readonly string[] = [], headerLine?: number): BlockStatement {
    return this.scopedBlock(s.type === 'BlockStatement' ? s.body : [s], ctx, extraNames, { ownerLine, headerLine })
  }

  private statement(s: Statement, ctx: Ctx): Statement {
    switch (s.type) {
      case 'BlockStatement':
        return this.scopedBlock(s.body, ctx, [], { ownerLine: line(s) })
      case 'IfStatement':
        this.visit(s.test, ctx)
        s.consequent = this.asBlock(s.consequent, ctx, line(s))
        if (s.alternate) s.alternate = this.asBlock(s.alternate, ctx, line(s))
        return s
      case 'ForStatement': {
        const head = loopHeadNames(s.init)
        for (const part of [s.init, s.test, s.update]) if (part) this.visit(part, ctx)
        const headReader = head.length ? [reader(this.register(head), head)] : []
        s.test = seq(this.step(line(s), ctx.readers, headReader), s.test ?? bool(true))
        s.body = this.asBlock(s.body, ctx, line(s), head)
        return s
      }
      case 'WhileStatement':
        this.visit(s.test, ctx)
        s.test = seq(this.step(line(s), ctx.readers), s.test)
        s.body = this.asBlock(s.body, ctx, line(s))
        return s
      case 'DoWhileStatement':
        s.body = this.asBlock(s.body, ctx, line(s))
        this.visit(s.test, ctx)
        s.test = seq(this.step(line(s.test), ctx.readers), s.test)
        return s
      case 'ForInStatement':
      case 'ForOfStatement':
        if (s.type === 'ForOfStatement' && s.await) throw new UnsupportedSyntax('for await is not supported yet.', line(s))
        this.visit(s.left, ctx)
        this.visit(s.right, ctx)
        s.body = this.asBlock(s.body, ctx, line(s), loopHeadNames(s.left), line(s))
        return s
      case 'TryStatement':
        s.block = this.scopedBlock(s.block.body, ctx, [], { ownerLine: line(s) })
        if (s.handler) {
          if (s.handler.param) this.visit(s.handler.param, ctx)
          const names = patternNames(s.handler.param)
          s.handler.body = this.scopedBlock(s.handler.body.body, ctx, names, { ownerLine: line(s.handler) })
        }
        if (s.finalizer) s.finalizer = this.scopedBlock(s.finalizer.body, ctx, [], { ownerLine: line(s.finalizer) })
        return s
      case 'SwitchStatement':
        this.visit(s.discriminant, ctx)
        for (const c of s.cases) {
          if (c.test) this.visit(c.test, ctx)
          c.consequent = this.list(c.consequent, ctx, line(c))
        }
        return s
      case 'LabeledStatement':
        s.body = this.statement(s.body, ctx)
        return s
      case 'WithStatement':
        this.visit(s.object, ctx)
        s.body = this.asBlock(s.body, ctx, line(s))
        return s
      case 'ReturnStatement':
        if (s.argument) this.visit(s.argument, ctx)
        s.argument = hook('ret', [id(FRAME), num(line(s)), s.argument ?? voidZero()])
        return s
      case 'FunctionDeclaration':
        this.fn(s, s.id.name, false)
        return s
      case 'ClassDeclaration':
        this.cls(s, s.id.name, ctx)
        return s
      default:
        for (const child of children(s)) this.visit(child, ctx)
        return s
    }
  }
}
