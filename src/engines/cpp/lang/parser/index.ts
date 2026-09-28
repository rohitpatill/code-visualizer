import type { Program } from '../ast'
import { tokenize } from '../lexer'
import { Cursor } from './cursor'
import { parseTopLevel } from './declarations'

/**
 * Parses the built-in prelude, then the user's program. Types the prelude
 * declares are known to the user code, and user definitions replace prelude
 * ones with the same name.
 */
export function parse(source: string, prelude = ''): Program {
  const program: Program = { functions: new Map(), classes: new Map(), globals: [], endLine: 1 }
  const preludeCursor = new Cursor(tokenize(prelude))
  parseTopLevel(preludeCursor, program, true)
  const tokens = tokenize(source)
  const cursor = new Cursor(tokens)
  for (const name of preludeCursor.classNames) cursor.classNames.add(name)
  for (const [name, type] of preludeCursor.aliases) cursor.aliases.set(name, type)
  parseTopLevel(cursor, program, false)
  program.endLine = tokens.length > 1 ? tokens[tokens.length - 2]!.line : 1
  return program
}
