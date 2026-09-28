import type {
  ArrayExpression,
  BlockStatement,
  CallExpression,
  Expression,
  ExpressionStatement,
  Identifier,
  Literal,
  ObjectExpression,
  Statement,
  VariableDeclaration,
} from 'acorn'

// Hand-built nodes carry no source position; the generator ignores it and
// every hook call receives its line number explicitly.
const at = { start: 0, end: 0 }

export const HOOK = '__st'
export const FRAME = '__stF'
export const READER_ARG = '__stK'
export const ERROR = '__stE'
export const RESERVED_PREFIX = '__st'
export const readerName = (id: number) => `__stR${id}`

export const id = (name: string): Identifier => ({ ...at, type: 'Identifier', name })

export const num = (value: number): Literal => ({ ...at, type: 'Literal', value, raw: String(value) })

export const str = (value: string): Literal => ({ ...at, type: 'Literal', value, raw: JSON.stringify(value) })

export const bool = (value: boolean): Literal => ({ ...at, type: 'Literal', value, raw: String(value) })

export const array = (elements: Expression[]): ArrayExpression => ({ ...at, type: 'ArrayExpression', elements })

export const block = (body: Statement[]): BlockStatement => ({ ...at, type: 'BlockStatement', body })

export const exprStmt = (expression: Expression): ExpressionStatement => ({ ...at, type: 'ExpressionStatement', expression })

export const constDecl = (name: string, init: Expression): VariableDeclaration => ({
  ...at,
  type: 'VariableDeclaration',
  kind: 'const',
  declarations: [{ ...at, type: 'VariableDeclarator', id: id(name), init }],
})

/** `__st.<method>(...args)` */
export const hook = (method: string, args: Expression[]): CallExpression => ({
  ...at,
  type: 'CallExpression',
  optional: false,
  callee: { ...at, type: 'MemberExpression', object: id(HOOK), property: id(method), computed: false, optional: false },
  arguments: args,
})

export const readers = (names: readonly string[]): ArrayExpression => array(names.map(id))

/** `__st.step(__stF, line, [readers])` */
export const stepCall = (line: number, active: readonly string[]): CallExpression =>
  hook('step', [id(FRAME), num(line), readers(active)])

/**
 * `{ i: scopeId, g: (__stK) => { switch (__stK) { case 0: return a; ... } } }`
 * A closure created inside the scope, so it reads the live bindings. Reading
 * a binding still in its temporal dead zone throws; the runtime skips it.
 */
export function reader(scopeId: number, names: readonly string[]): ObjectExpression {
  const cases = names.map((name, i) => ({
    ...at,
    type: 'SwitchCase' as const,
    test: num(i),
    consequent: [
      { ...at, type: 'ReturnStatement' as const, argument: name === 'this' ? { ...at, type: 'ThisExpression' as const } : id(name) },
    ],
  }))
  const getter: Expression = {
    ...at,
    type: 'ArrowFunctionExpression',
    id: null,
    params: [id(READER_ARG)],
    body: block([{ ...at, type: 'SwitchStatement', discriminant: id(READER_ARG), cases }]),
    expression: false,
    generator: false,
    async: false,
  }
  const prop = (key: string, value: Expression) => ({
    ...at,
    type: 'Property' as const,
    key: id(key),
    value,
    kind: 'init' as const,
    method: false,
    shorthand: false,
    computed: false,
  })
  return { ...at, type: 'ObjectExpression', properties: [prop('i', num(scopeId)), prop('g', getter)] }
}

/** `try { body } catch (__stE) { __st.fail(__stF, __stE); throw __stE } finally { __st.leave(__stF) }` */
export function guarded(body: BlockStatement): Statement {
  return {
    ...at,
    type: 'TryStatement',
    block: body,
    handler: {
      ...at,
      type: 'CatchClause',
      param: id(ERROR),
      body: block([exprStmt(hook('fail', [id(FRAME), id(ERROR)])), { ...at, type: 'ThrowStatement', argument: id(ERROR) }]),
    },
    finalizer: block([exprStmt(hook('leave', [id(FRAME)]))]),
  }
}
