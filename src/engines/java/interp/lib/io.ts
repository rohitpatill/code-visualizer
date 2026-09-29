import { Input } from '../../../shared/input'
import { T } from '../../lang/types'
import { Fault } from '../errors'
import type { Machine } from '../machine'
import { VOID, boolR, doubleR, intR, longR, refR, strR } from '../ops'
import { textOf } from '../text'
import { JArray, JStr, NativeObj, type R } from '../values'
import { intArg, noMethod, textArg } from './common'
import { javaFormat } from './format'

const INT = /^[+-]?\d+$/
const DOUBLE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$|^[+-]?(NaN|Infinity)$/

export const systemOut = new NativeObj('out', {})
export const systemIn = new NativeObj('in', {})

/** What print shows for one argument: a char[] prints its characters, everything else String.valueOf. */
function printed(m: Machine, r: R): string {
  const v = r.value
  if (v instanceof JArray && v.type.of.t === 'prim' && v.type.of.name === 'char') return String.fromCharCode(...(v.items as number[]))
  return textOf(m, r)
}

/** print, println, printf and format, shared by System.out and PrintWriter. */
function printMethod(m: Machine, name: string, args: readonly R[], write: (text: string) => void): boolean {
  switch (name) {
    case 'print':
      write(printed(m, args[0]!))
      return true
    case 'println':
      write(args.length ? `${printed(m, args[0]!)}\n` : '\n')
      return true
    case 'printf':
    case 'format':
      write(javaFormat(m, textArg(args[0], name), args.slice(1)))
      return true
    case 'write':
      write(args[0]!.value instanceof JStr ? (args[0]!.value as JStr).s : String.fromCharCode(intArg(args[0], name)))
      return true
    case 'append':
      write(textOf(m, args[0]!))
      return true
    default:
      return false
  }
}

function tokenizer(obj: NativeObj, name: string): R {
  const tokens = obj.state.tokens!
  const index = obj.state.index ?? 0
  switch (name) {
    case 'hasMoreTokens':
    case 'hasMoreElements':
      return boolR(index < tokens.length)
    case 'nextToken':
    case 'nextElement':
      if (index >= tokens.length) throw new Fault('NoSuchElementException')
      obj.state.index = index + 1
      return strR(tokens[index]!)
    case 'countTokens':
      return intR(tokens.length - index)
    default:
      throw noMethod('StringTokenizer', name)
  }
}

/** Scanner's next methods: they look at the next token and consume it only if it fits, as Java's Scanner does. */
function scanner(source: Input, name: string): R {
  const peek = source.peekToken()
  const take = <V>(ok: boolean, value: () => V): V => {
    if (peek === null) throw new Fault('NoSuchElementException')
    if (!ok) throw new Fault('InputMismatchException')
    source.token()
    return value()
  }
  switch (name) {
    case 'nextInt':
    case 'nextShort':
    case 'nextByte': {
      const n = peek !== null && INT.test(peek) ? Number(peek) : NaN
      return take(n >= -2147483648 && n <= 2147483647, () => intR(n))
    }
    case 'nextLong': {
      const ok = peek !== null && INT.test(peek) && BigInt.asIntN(64, BigInt(peek)) === BigInt(peek)
      return take(ok, () => longR(BigInt(peek!)))
    }
    case 'nextDouble':
    case 'nextFloat':
      return take(peek !== null && DOUBLE.test(peek), () => doubleR(Number(peek)))
    case 'nextBoolean':
      return take(peek !== null && /^(true|false)$/i.test(peek), () => boolR(peek!.toLowerCase() === 'true'))
    case 'next':
      return take(true, () => strR(peek!))
    case 'nextLine': {
      const line = source.line()
      if (line === null) throw new Fault('NoSuchElementException', 'No line found')
      return strR(line)
    }
    case 'hasNext':
      return boolR(peek !== null)
    case 'hasNextInt':
      return boolR(peek !== null && INT.test(peek) && Number(peek) >= -2147483648 && Number(peek) <= 2147483647)
    case 'hasNextLong':
      return boolR(peek !== null && INT.test(peek))
    case 'hasNextDouble':
      return boolR(peek !== null && DOUBLE.test(peek))
    case 'hasNextLine':
      return boolR(source.hasLine())
    case 'close':
      return VOID
    default:
      throw noMethod('Scanner', name)
  }
}

function reader(source: Input, name: string): R {
  switch (name) {
    case 'readLine': {
      const line = source.line()
      return refR(line === null ? null : new JStr(line), T.string)
    }
    case 'read':
      return intR(source.read() ?? -1)
    case 'ready':
      return boolR(source.hasLine())
    case 'close':
      return VOID
    default:
      throw noMethod('BufferedReader', name)
  }
}

/** Methods of System.out, Scanner, BufferedReader, StringTokenizer and PrintWriter. */
export function nativeMethod(m: Machine, obj: NativeObj, name: string, args: readonly R[]): R {
  switch (obj.kind) {
    case 'out':
      if (printMethod(m, name, args, (text) => m.out.write(text))) return name === 'printf' || name === 'format' ? refR(obj) : VOID
      if (name === 'flush' || name === 'close') return VOID
      throw noMethod('PrintStream', name)
    case 'writer': {
      const buffer = obj.state.buffer!
      const flush = () => m.out.write(buffer.splice(0).join(''))
      if (printMethod(m, name, args, (text) => buffer.push(text))) {
        if (obj.state.autoFlush && (name === 'println' || name === 'printf' || name === 'format')) flush()
        return VOID
      }
      if (name === 'newLine') buffer.push('\n')
      else if (name === 'flush' || name === 'close') flush()
      else throw noMethod('PrintWriter', name)
      return VOID
    }
    case 'scanner':
      return scanner(obj.state.source!, name)
    case 'reader':
      return reader(obj.state.source!, name)
    case 'tokenizer':
      return tokenizer(obj, name)
    default:
      throw noMethod(obj.kind, name)
  }
}

/** `new Scanner(System.in)`, `new BufferedReader(...)`, `new StringTokenizer(line)`, `new PrintWriter(System.out)`. */
export function constructNative(m: Machine, name: string, args: readonly R[]): R | null {
  const source = () => (args[0]?.value instanceof JStr ? new Input(args[0].value.s) : m.stdin)
  switch (name) {
    case 'Scanner':
      return refR(new NativeObj('scanner', { source: source() }))
    case 'BufferedReader':
    case 'InputStreamReader':
      return refR(new NativeObj('reader', { source: source() }))
    case 'StringTokenizer': {
      const delims = args[1] ? textArg(args[1], name) : ' \t\n\r\f'
      const text = textArg(args[0], name)
      const tokens = text.split(new RegExp(`[${delims.replace(/[\]\\^-]/g, '\\$&')}]+`)).filter(Boolean)
      return refR(new NativeObj('tokenizer', { tokens, index: 0 }))
    }
    case 'PrintWriter':
    case 'BufferedWriter':
    case 'OutputStreamWriter': {
      const inner = args[0]?.value
      if (inner instanceof NativeObj && inner.kind === 'writer') return refR(inner)
      return refR(new NativeObj('writer', { buffer: [], autoFlush: args[1]?.value === true }))
    }
    default:
      return null
  }
}
