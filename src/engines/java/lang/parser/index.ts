import type { Program } from '../ast'
import { tokenize } from '../lexer'
import { parseCompilationUnit } from './classes'
import { Cursor } from './types'

/** Parses the built-in prelude, then the user's file. User classes replace prelude classes with the same name. */
export function parse(source: string, prelude = ''): Program {
  const tokens = tokenize(source)
  const user = parseCompilationUnit(new Cursor(tokens), false)
  const names = new Set(user.map((c) => c.name))
  const builtIn = parseCompilationUnit(new Cursor(tokenize(prelude)), true).filter((c) => !names.has(c.name))
  return { classes: [...builtIn, ...user], endLine: tokens.length > 1 ? tokens[tokens.length - 2]!.line : 1 }
}
