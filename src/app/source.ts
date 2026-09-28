/** The program that actually runs: the user's code, then the optional call box. */
export function joinSource(code: string, call: string): string {
  const tail = call.trim()
  return tail ? `${code.trimEnd()}\n\n${tail}\n` : code
}
