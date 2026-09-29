import { TokenCursor } from '../../../shared/syntax'
import type { Token } from '../lexer'
import type { CType } from '../types'

/** Token stream plus the names the parser has learned are types. */
export class Cursor extends TokenCursor<Token> {
  readonly classNames = new Set<string>()
  readonly aliases = new Map<string, CType>()
}
