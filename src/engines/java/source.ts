const DEFINES_MAIN = /\bstatic\s+void\s+main\s*\(/

/**
 * Java statements live in methods, so the call box becomes the body of
 * main() in a class of its own. The wrapper is part of the traced source, so
 * the code view shows exactly what ran.
 */
export function buildJavaProgram(code: string, call: string): string {
  const tail = call.trim()
  if (!tail) return code
  if (DEFINES_MAIN.test(code)) return `${code.trimEnd()}\n\n${tail}\n`
  const name = /\bclass\s+Main\b/.test(code) ? 'Program' : 'Main'
  const body = tail
    .split('\n')
    .map((line) => `        ${line}`)
    .join('\n')
  return `${code.trimEnd()}\n\npublic class ${name} {\n    public static void main(String[] args) {\n${body}\n    }\n}\n`
}
