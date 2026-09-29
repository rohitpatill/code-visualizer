/** A syntax error in the user's program, found before anything runs. */
export class CompileError extends Error {
  constructor(
    message: string,
    readonly line: number | null,
  ) {
    super(message)
  }
}

export interface BaseToken {
  kind: 'ident' | 'number' | 'string' | 'char' | 'punct' | 'eof'
  text: string
  line: number
}

/** A token stream for a recursive-descent parser, shared by the interpreted languages. */
export class TokenCursor<T extends BaseToken> {
  pos = 0
  /** Positions of `>>` tokens split in two, so a failed attempt can put them back. */
  private readonly splits: { at: number; token: T }[] = []

  constructor(private readonly tokens: T[]) {}

  peek(n = 0): T {
    return this.tokens[Math.min(this.pos + n, this.tokens.length - 1)]!
  }

  next(): T {
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

  expect(text: string): T {
    if (this.at(text)) return this.next()
    if (text === '>') {
      this.splitGreater()
      if (this.at(text)) return this.next()
    }
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

  /** `List<List<Integer>>`: a `>>` closing two type argument lists is split into two `>`. */
  splitGreater(): void {
    const tok = this.peek()
    if (tok.kind !== 'punct' || !tok.text.startsWith('>') || tok.text === '>') return
    this.splits.push({ at: this.pos, token: tok })
    this.tokens.splice(this.pos, 1, { ...tok, text: '>' }, { ...tok, text: tok.text.slice(1) })
  }

  /** Runs `parse`; on a compile error, rewinds (undoing any `>>` splits) and returns null. */
  attempt<R>(parse: () => R): R | null {
    const start = this.pos
    const splits = this.splits.length
    try {
      return parse()
    } catch (err) {
      if (!(err instanceof CompileError)) throw err
      while (this.splits.length > splits) {
        const { at, token } = this.splits.pop()!
        this.tokens.splice(at, 2, token)
      }
      this.pos = start
      return null
    }
  }
}
