import type { RawTrace, TraceError } from '../../../trace/types'
import { HOOK } from '../instrument/builders'
import { instrument } from '../instrument'
import { describeError, formatArgs } from './format'
import helpersSource from './helpers.js?raw'
import { type Output, StepLimit } from '../../shared/recorder'
import { Tracer } from './tracer'

export const MAX_STEPS = 3000

const HELPER_NAMES = ['ListNode', 'TreeNode', 'buildList', 'buildTree'] as const

function makeConsole(out: Output) {
  const log = (...args: unknown[]) => out.write(`${formatArgs(args)}\n`)
  return { log, info: log, warn: log, error: log, debug: log, table: log }
}

function makePrompt(out: Output, stdin: string) {
  const lines = stdin.split(/\r?\n/)
  if (lines[lines.length - 1] === '') lines.pop()
  let next = 0
  return (message = '') => {
    out.write(String(message))
    if (next >= lines.length) throw new Error('prompt() ran out of lines. Add more in the input box.')
    const line = lines[next++]!
    out.write(`${line}\n`)
    return line
  }
}

const result = (steps: RawTrace['steps'], truncated: boolean, error: TraceError | null, stdout: string): string =>
  JSON.stringify({ steps, truncated, error, stdout, maxSteps: MAX_STEPS } satisfies RawTrace)

/** Instruments and runs one JavaScript program, returning the trace as JSON. */
export function runTrace(source: string, stdin: string): string {
  const instrumented = instrument(source)
  if (!instrumented.ok) return result([], false, { message: instrumented.message, line: instrumented.line }, '')

  let program: (...args: unknown[]) => void
  try {
    program = new Function(HOOK, 'console', 'prompt', ...HELPER_NAMES, instrumented.code) as typeof program
  } catch (err) {
    return result([], false, { message: `This code uses syntax the tracer cannot run yet. ${describeError(err)}`, line: null }, '')
  }

  const tracer = new Tracer(instrumented.scopes, MAX_STEPS)
  const helpers = new Function(helpersSource)() as Record<(typeof HELPER_NAMES)[number], unknown>
  let error: TraceError | null = null
  let truncated = false
  try {
    const { out } = tracer.recorder
    program(tracer.hooks, makeConsole(out), makePrompt(out, stdin), ...HELPER_NAMES.map((n) => helpers[n]))
  } catch (err) {
    if (err instanceof StepLimit) truncated = true
    else error = { message: describeError(err), line: tracer.errorLine }
  }
  return result(tracer.recorder.steps, truncated, error, tracer.recorder.out.text())
}
