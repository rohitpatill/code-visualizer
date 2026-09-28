import type { AnyNode, Pattern, Statement } from 'acorn'

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])
const CLASS_TYPES = new Set(['ClassDeclaration', 'ClassExpression'])
const SKIP_KEYS = new Set(['type', 'start', 'end', 'loc', 'range'])

/** Child nodes of any AST node, in source order. */
export function* children(node: AnyNode): Generator<AnyNode> {
  for (const key in node) {
    if (SKIP_KEYS.has(key)) continue
    const value = (node as unknown as Record<string, unknown>)[key]
    if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item === 'object' && 'type' in item) yield item as AnyNode
    } else if (value && typeof value === 'object' && 'type' in value) {
      yield value as AnyNode
    }
  }
}

export function patternNames(pattern: Pattern | null | undefined, out: string[] = []): string[] {
  switch (pattern?.type) {
    case 'Identifier':
      out.push(pattern.name)
      break
    case 'AssignmentPattern':
      patternNames(pattern.left, out)
      break
    case 'RestElement':
      patternNames(pattern.argument, out)
      break
    case 'ArrayPattern':
      for (const el of pattern.elements) patternNames(el, out)
      break
    case 'ObjectPattern':
      for (const prop of pattern.properties) patternNames(prop.type === 'RestElement' ? prop : prop.value, out)
      break
  }
  return out
}

/** `var` names declared anywhere in these statements, not counting nested functions and classes. */
export function hoistedVars(statements: readonly AnyNode[]): string[] {
  const out: string[] = []
  const visit = (node: AnyNode) => {
    if (FUNCTION_TYPES.has(node.type) || CLASS_TYPES.has(node.type)) return
    if (node.type === 'VariableDeclaration' && node.kind === 'var') {
      for (const d of node.declarations) patternNames(d.id, out)
    }
    for (const child of children(node)) visit(child)
  }
  statements.forEach(visit)
  return out
}

/** Names that a statement list declares in its own block scope. */
export function lexicalNames(statements: readonly Statement[]): string[] {
  const out: string[] = []
  for (const s of statements) {
    if (s.type === 'VariableDeclaration' && s.kind !== 'var') for (const d of s.declarations) patternNames(d.id, out)
    else if (s.type === 'ClassDeclaration' || s.type === 'FunctionDeclaration') out.push(s.id.name)
  }
  return out
}

/** Names a `for (let ...)` / `for (const x of ...)` head binds for each iteration. */
export function loopHeadNames(head: AnyNode | null | undefined): string[] {
  if (head?.type !== 'VariableDeclaration' || head.kind === 'var') return []
  return head.declarations.flatMap((d) => patternNames(d.id))
}

export const isFunction = (node: AnyNode): boolean => FUNCTION_TYPES.has(node.type)
export const isClass = (node: AnyNode): boolean => CLASS_TYPES.has(node.type)
