import { CompileError, type Token } from '../lexer'
import type { CType } from '../types'

/** Token stream plus the names the parser has learned are types. */
export class Cursor {
  pos = 0
  readonly classNames = new Set<string>()
  readonly aliases = new Map<string, CType>()

  constructor(private readonly tokens: Token[]) {}

  peek(n = 0): Token {
    return this.tokens[Math.min(this.pos + n, this.tokens.length - 1)]!
  }

  next(): Token {
    const tok = this.peek()
    if (this.pos < this.tokens.length - 1) this.pos++
    return tok
  }

  /** True when the token `n` ahead is this punctuator or word. */
  at(text: string, n = 0): boolean {
    const tok = this.peek(n)
    return tok.text === text && (tok.kind === 'punct' || tok.kind === 'ident')
  }

  accept(text: string): boolean {
    if (!this.at(text)) return false
    this.next()
    return true
  }

  expect(text: string): Token {
    if (this.at(text)) return this.next()
    this.splitGreater()
    if (this.at(text)) return this.next()
    throw this.error(`expected '${text}'`)
  }

  ident(what = 'a name'): string {
    const tok = this.peek()
    if (tok.kind !== 'ident') throw this.error(`expected ${what}`)
    this.next()
    return tok.text
  }

  get line(): number {
    return this.peek().line
  }

  get done(): boolean {
    return this.peek().kind === 'eof'
  }

  error(message: string): CompileError {
    const tok = this.peek()
    const found = tok.kind === 'eof' ? 'end of file' : `'${tok.text}'`
    return new CompileError(`${message}, found ${found}`, tok.line)
  }

  /** `vector<vector<int>>`: a `>>` closing two template lists is split into two `>`. */
  splitGreater(): void {
    const tok = this.peek()
    if (tok.kind !== 'punct' || !tok.text.startsWith('>') || tok.text === '>') return
    this.tokens.splice(this.pos, 1, { ...tok, text: '>' }, { ...tok, text: tok.text.slice(1) })
  }

  /** Runs `parse`; on a compile error, rewinds and returns null. */
  attempt<T>(parse: () => T): T | null {
    const start = this.pos
    try {
      return parse()
    } catch (err) {
      if (!(err instanceof CompileError)) throw err
      this.pos = start
      return null
    }
  }
}
