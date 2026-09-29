import type { RawTrace, TraceError } from '../../../trace/types'
import { StepLimit } from '../../shared/recorder'
import { CompileError } from '../../shared/syntax'
import { parse } from '../lang/parser'
import { type JType, T } from '../lang/types'
import preludeSource from '../prelude.java?raw'
import { invokeMethod } from './calls'
import { type Method, methodsNamed } from './classes'
import { CompileStop, ExitSignal, JavaThrow } from './errors'
import { Machine } from './machine'
import { ensureInit } from './objects'
import { refR } from './ops'
import { Scope } from './scope'
import { asThrow, throwableText } from './throwing'
import { JArray } from './values'

export const MAX_STEPS = 3000

const STRING_ARRAY: Extract<JType, { t: 'array' }> = { t: 'array', of: T.string }

const result = (steps: RawTrace['steps'], truncated: boolean, error: TraceError | null, stdout: string): string =>
  JSON.stringify({ steps, truncated, error, stdout, maxSteps: MAX_STEPS } satisfies RawTrace)

const compileError = (message: string, line: number | null) => result([], false, { message: `Compile error: ${message}`, line }, '')

/** `public static void main(String[] args)` in the first user class that has one. */
function findMain(m: Machine): Method | null {
  for (const cls of m.classes.all) {
    if (cls.decl.prelude) continue
    const main = methodsNamed(cls, 'main').find((x) => x.owner === cls && x.decl.isStatic && x.decl.params.length <= 1)
    if (main) return main
  }
  return null
}

function describe(m: Machine, err: unknown, line: number): TraceError {
  if (err instanceof JavaThrow) return { message: `Exception in thread "main" ${throwableText(err.exc)}`, line: err.line }
  const at = m.errorLine ?? line
  if (err instanceof CompileStop) return { message: `Compile error: ${err.message}`, line: at }
  if (err instanceof RangeError) return { message: 'Exception in thread "main" java.lang.StackOverflowError', line: at }
  const text = err instanceof Error ? err.message : String(err)
  return { message: `Internal error: ${text}. This is a bug in the visualizer, not in your code.`, line: at }
}

/** Parses and runs one Java program from its main method. Returns the trace as JSON. */
export function runTrace(source: string, stdin: string): string {
  let m: Machine
  try {
    m = new Machine(parse(source, preludeSource), MAX_STEPS, stdin)
  } catch (err) {
    if (err instanceof CompileError) return compileError(err.message, err.line)
    throw err
  }
  const main = findMain(m)
  if (!main) return compileError('no main method. Put the code that calls your solution in the call box.', null)
  const endLine = m.program.endLine
  const top = m.pushFrame({ name: 'globals', line: 1, scope: new Scope(null), self: null, cls: null, silent: false, showThis: false }, true)
  let error: TraceError | null = null
  let truncated = false
  try {
    ensureInit(m, main.owner)
    invokeMethod(m, main, null, main.decl.params.length ? [refR(new JArray(STRING_ARRAY, []), STRING_ARRAY)] : [])
    top.line = endLine
    m.record('return', endLine)
  } catch (raw) {
    const err = raw instanceof StepLimit || raw instanceof ExitSignal ? raw : asThrow(m, raw)
    if (err instanceof StepLimit) truncated = true
    else if (!(err instanceof ExitSignal)) {
      error = describe(m, err, top.line)
      const recorded = err instanceof JavaThrow || (err instanceof CompileStop && m.errorLine !== null)
      try {
        if (!recorded) m.record('exception', top.line, { exc: error.message })
      } catch (limit) {
        if (!(limit instanceof StepLimit)) throw limit
      }
    }
  }
  return result(m.recorder.steps, truncated, error, m.out.text())
}
