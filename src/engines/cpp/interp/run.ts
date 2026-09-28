import type { RawTrace, TraceError } from '../../../trace/types'
import { StepLimit } from '../../shared/recorder'
import { CompileError } from '../lang/lexer'
import { parse } from '../lang/parser'
import preludeSource from '../prelude.cpp?raw'
import { callFunction } from './calls'
import { CppError } from './errors'
import { execList } from './exec'
import { Machine } from './machine'

export const MAX_STEPS = 3000

const result = (steps: RawTrace['steps'], truncated: boolean, error: TraceError | null, stdout: string): string =>
  JSON.stringify({ steps, truncated, error, stdout, maxSteps: MAX_STEPS } satisfies RawTrace)

function describe(err: unknown): string {
  if (err instanceof CppError) return `Runtime error: ${err.message}`
  if (err instanceof RangeError) return 'Runtime error: stack overflow: too many nested calls'
  return `Internal error: ${err instanceof Error ? err.message : String(err)}. This is a bug in the visualizer, not in your code.`
}

/** Parses and runs one C++ program: global initializers, then main(). Returns the trace as JSON. */
export function runTrace(source: string, stdin: string): string {
  let program
  try {
    program = parse(source, preludeSource)
  } catch (err) {
    if (err instanceof CompileError) return result([], false, { message: `Compile error: ${err.message}`, line: err.line }, '')
    throw err
  }
  const main = program.functions.get('main')
  if (!main) {
    return result([], false, { message: 'Compile error: no main() function. Put the code that calls your solution in the call box.', line: null }, '')
  }
  const m = new Machine(program, MAX_STEPS, stdin)
  const top = m.pushFrame({ name: 'globals', line: 1, endLine: program.endLine, scope: m.globals, self: null, silent: false }, true)
  let error: TraceError | null = null
  let truncated = false
  try {
    execList(m, program.globals, -1)
    callFunction(m, main, [], null)
    top.line = program.endLine
    m.record('return', program.endLine)
  } catch (err) {
    if (err instanceof StepLimit) truncated = true
    else {
      error = { message: describe(err), line: m.errorLine ?? top.line }
      if (m.errorLine === null) {
        try {
          m.record('exception', top.line, { exc: error.message })
        } catch (limit) {
          if (!(limit instanceof StepLimit)) throw limit
        }
      }
    }
  }
  return result(m.recorder.steps, truncated, error, m.recorder.out.text())
}
