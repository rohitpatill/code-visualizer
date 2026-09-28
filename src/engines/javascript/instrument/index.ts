import { type AnyNode, type Program, parse } from 'acorn'
import { generate } from 'astring'
import { RESERVED_PREFIX } from './builders'
import { children } from './scopes'
import { Instrumenter, UnsupportedSyntax } from './transform'

export interface Instrumented {
  ok: true
  code: string
  /** Variable names for each reader id, in switch order. */
  scopes: string[][]
}

export interface InstrumentError {
  ok: false
  message: string
  line: number | null
}

const UNSUPPORTED: Readonly<Record<string, string>> = {
  AwaitExpression: 'await is not supported yet.',
  YieldExpression: 'Generators are not supported yet.',
  ImportExpression: 'import() is not available here. Write everything in one file.',
}

function validate(node: AnyNode): void {
  const reason = UNSUPPORTED[node.type]
  if (reason) throw new UnsupportedSyntax(reason, node.loc?.start.line ?? 0)
  if ((node.type === 'Identifier' || node.type === 'PrivateIdentifier') && node.name.startsWith(RESERVED_PREFIX)) {
    throw new UnsupportedSyntax(`Names starting with ${RESERVED_PREFIX} are reserved by the tracer.`, node.loc?.start.line ?? 0)
  }
  for (const child of children(node)) validate(child)
}

function parseProgram(code: string): Program | InstrumentError {
  try {
    return parse(code, { ecmaVersion: 'latest', sourceType: 'script', locations: true })
  } catch (err) {
    const loc = (err as { loc?: { line: number } }).loc
    const message = err instanceof Error ? err.message.replace(/\s*\(\d+:\d+\)$/, '') : String(err)
    return { ok: false, message: `SyntaxError: ${message}`, line: loc?.line ?? null }
  }
}

export function instrument(code: string): Instrumented | InstrumentError {
  const program = parseProgram(code)
  if ('ok' in program) return program
  try {
    validate(program)
    const instrumenter = new Instrumenter()
    instrumenter.program(program)
    return { ok: true, code: generate(program as unknown as Parameters<typeof generate>[0]), scopes: instrumenter.scopes }
  } catch (err) {
    if (err instanceof UnsupportedSyntax) return { ok: false, message: err.message, line: err.line || null }
    throw err
  }
}
