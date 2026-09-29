const TOKEN = /\s*(\S+)/y
const CHAR = /\s*(\S)/y

/** The input box as stdin: whitespace-separated tokens, single characters, or whole lines. */
export class Input {
  private pos = 0

  constructor(private readonly text: string) {}

  /** The next whitespace-separated token, without consuming it. */
  peekToken(): string | null {
    TOKEN.lastIndex = this.pos
    return TOKEN.exec(this.text)?.[1] ?? null
  }

  /** The next whitespace-separated token, or null at end of input. */
  token(): string | null {
    TOKEN.lastIndex = this.pos
    const m = TOKEN.exec(this.text)
    if (!m) {
      this.pos = this.text.length
      return null
    }
    this.pos = TOKEN.lastIndex
    return m[1]!
  }

  /** The next character that is not whitespace, as a UTF-16 code. */
  char(): number | null {
    CHAR.lastIndex = this.pos
    const m = CHAR.exec(this.text)
    if (!m) return null
    this.pos = CHAR.lastIndex
    return m[1]!.charCodeAt(0)
  }

  /** Is anything left, even an empty line? */
  hasLine(): boolean {
    return this.pos < this.text.length
  }

  /** The next character, whitespace included, as a UTF-16 code. */
  read(): number | null {
    return this.pos < this.text.length ? this.text.charCodeAt(this.pos++) : null
  }

  /** The rest of the current line without its line break, or null at end of input. */
  line(): string | null {
    if (this.pos >= this.text.length) return null
    const end = this.text.indexOf('\n', this.pos)
    const text = this.text.slice(this.pos, end === -1 ? undefined : end).replace(/\r$/, '')
    this.pos = end === -1 ? this.text.length : end + 1
    return text
  }
}
