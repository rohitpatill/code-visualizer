import type { Program } from '../ast'
import { tokenize } from '../lexer'
import { TokenCursor } from '../../../shared/syntax'
import { parseCompilationUnit } from './classes'

/** Parses the built-in prelude, then the user's file. User classes replace prelude classes with the same name. */
export function parse(source: string, prelude = ''): Program {
  const tokens = tokenize(source)
  const user = parseCompilationUnit(new TokenCursor(tokens), false)
  const names = new Set(user.map((c) => c.name))
  const builtIn = parseCompilationUnit(new TokenCursor(tokenize(prelude)), true).filter((c) => !names.has(c.name))
  return { classes: [...builtIn, ...user], endLine: tokens.length > 1 ? tokens[tokens.length - 2]!.line : 1 }
}
