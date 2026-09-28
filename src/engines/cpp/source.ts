const DEFINES_MAIN = /\bint\s+main\s*\(/

/**
 * C++ statements cannot sit at the top level, so the call box becomes the
 * body of main(). The wrapper is part of the traced source, so the code view
 * shows exactly what ran.
 */
export function buildCppProgram(code: string, call: string): string {
  const tail = call.trim()
  if (!tail) return code
  if (DEFINES_MAIN.test(code)) return `${code.trimEnd()}\n\n${tail}\n`
  const body = tail
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')
  return `${code.trimEnd()}\n\nint main() {\n${body}\n}\n`
}
