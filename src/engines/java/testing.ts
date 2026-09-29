import type { RawTrace } from '../../trace/types'
import { runTrace } from './interp/run'

/** A Java program: `body` is main's body, `members` sits in the class above it. */
export const main = (body: string, members = '') =>
  `import java.util.*;\nimport java.util.function.*;\nimport java.util.stream.*;\nimport java.io.*;\n\npublic class Main {\n${members}\n    public static void main(String[] args) throws Exception {\n${body}\n    }\n}\n`

export const run = (code: string, stdin = ''): RawTrace => JSON.parse(runTrace(code, stdin)) as RawTrace

/** What the program prints; a run that stops with an error fails the test with that error. */
export function output(code: string, stdin = ''): string {
  const r = run(code, stdin)
  if (r.error) throw new Error(`${r.error.message} (line ${r.error.line})`)
  if (r.truncated) throw new Error('the run hit the step limit')
  return r.stdout
}
