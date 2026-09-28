import type { Output } from '../../shared/recorder'
import type { CType } from '../lang/types'
import { CppError } from './errors'

/** Formats a double the way `cout << x` does: `%g` with the current precision, or `%f` under `fixed`. */
export function formatDouble(x: number, precision: number, fixed: boolean): string {
  if (Number.isNaN(x)) return x < 0 ? '-nan' : 'nan'
  if (!Number.isFinite(x)) return x < 0 ? '-inf' : 'inf'
  if (fixed) return x.toFixed(Math.min(100, precision))
  if (x === 0) return Object.is(x, -0) ? '-0' : '0'
  const p = Math.max(1, precision)
  const exp = Math.floor(Math.log10(Math.abs(Number(x.toPrecision(p)))))
  if (exp < -4 || exp >= p) {
    const [mant, e] = x.toExponential(p - 1).split('e')
    const m = mant!.includes('.') ? mant!.replace(/\.?0+$/, '') : mant!
    const n = Number(e)
    return `${m}e${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(2, '0')}`
  }
  const s = x.toFixed(Math.max(0, p - 1 - exp))
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

export const charText = (code: number) => String.fromCharCode(code & 0xff)

/** Standard streams for one run: cout goes to the recorded output, cin reads the input box. */
export class Io {
  precision = 6
  fixed = false
  boolalpha = false
  width = 0
  failed = false
  private pos = 0

  constructor(
    readonly out: Output,
    private readonly input: string,
  ) {}

  write(text: string): void {
    const padded = this.width > text.length ? text.padStart(this.width) : text
    this.width = 0
    this.out.write(padded)
  }

  /** The next whitespace-separated token, or null at end of input. */
  token(): string | null {
    const rest = this.input.slice(this.pos)
    const m = /^\s*(\S+)/.exec(rest)
    if (!m) {
      this.pos = this.input.length
      this.failed = true
      return null
    }
    this.pos += m[0].length
    return m[1]!
  }

  char(): number | null {
    const rest = this.input.slice(this.pos)
    const m = /^\s*(\S)/.exec(rest)
    if (!m) {
      this.failed = true
      return null
    }
    this.pos += m[0].length
    return m[1]!.charCodeAt(0)
  }

  line(): string | null {
    if (this.pos >= this.input.length) {
      this.failed = true
      return null
    }
    const end = this.input.indexOf('\n', this.pos)
    const text = this.input.slice(this.pos, end === -1 ? undefined : end).replace(/\r$/, '')
    this.pos = end === -1 ? this.input.length : end + 1
    return text
  }
}

/** printf with the common conversions: d i u ld lld lu llu c s f e g x o %, with flags, width and precision. */
export function printf(format: string, args: readonly { value: unknown; type: CType }[]): string {
  let next = 0
  return format.replace(/%([-+ 0#]*)(\d+|\*)?(?:\.(\d+))?(hh|h|ll|l|z)?([diuxXoscfFeEgG%])/g, (_, flags: string, width, prec, _len, conv: string) => {
    if (conv === '%') return '%'
    const arg = args[next++]
    if (!arg) throw new CppError('printf has more % conversions than arguments')
    const v = arg.value
    let text: string
    switch (conv) {
      case 'd':
      case 'i':
      case 'u':
        text = String(typeof v === 'bigint' ? v : Math.trunc(Number(v)))
        break
      case 'x':
      case 'X':
      case 'o':
        text = BigInt.asUintN(64, BigInt(v as number | bigint)).toString(conv === 'o' ? 8 : 16)
        if (conv === 'X') text = text.toUpperCase()
        break
      case 'c':
        text = charText(Number(v))
        break
      case 's':
        text = String((v as { s?: string }).s ?? v)
        break
      case 'e':
      case 'E':
        text = Number(v).toExponential(prec === undefined ? 6 : Number(prec)).replace(/e([+-])(\d)$/, 'e$10$2')
        if (conv === 'E') text = text.toUpperCase()
        break
      case 'g':
      case 'G':
        text = formatDouble(Number(v), prec === undefined ? 6 : Number(prec), false)
        break
      default:
        text = Number(v).toFixed(prec === undefined ? 6 : Number(prec))
    }
    if (flags.includes('+') && !text.startsWith('-') && /[dif]/.test(conv)) text = `+${text}`
    const w = width === undefined || width === '*' ? 0 : Number(width)
    if (text.length >= w) return text
    if (flags.includes('-')) return text.padEnd(w)
    return flags.includes('0') ? text.padStart(w, '0') : text.padStart(w)
  })
}
