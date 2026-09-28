import { type CType, T, isArithmetic } from '../lang/types'
import { commonType, convertArith, num, unaryArith } from './arith'
import { compareVals } from './compare'
import { CppError } from './errors'
import { convert, copyValue } from './init'
import { printf } from './io'
import type { Machine } from './machine'
import { truthy } from './ops'
import { ALGORITHMS, algorithm } from './stl/algorithms'
import { NPOS, VOID, intArg } from './stl/common'
import { invoke } from './calls'
import { Cell, InitVal, PairVal, type R, StrVal, StreamVal, isFn } from './values'

const cout = new StreamVal('out')
const cin = new StreamVal('in')

const CONSTANTS: Readonly<Record<string, R>> = {
  INT_MAX: { type: T.int, value: 2147483647 },
  INT_MIN: { type: T.int, value: -2147483648 },
  UINT_MAX: { type: T.unsigned, value: 4294967295 },
  LLONG_MAX: { type: T.longLong, value: 2n ** 63n - 1n },
  LLONG_MIN: { type: T.longLong, value: -(2n ** 63n) },
  LONG_MAX: { type: T.long, value: 2n ** 63n - 1n },
  LONG_MIN: { type: T.long, value: -(2n ** 63n) },
  INT64_MAX: { type: T.longLong, value: 2n ** 63n - 1n },
  INT64_MIN: { type: T.longLong, value: -(2n ** 63n) },
  npos: { type: T.sizeT, value: NPOS },
  M_PI: { type: T.double, value: Math.PI },
  EOF: { type: T.int, value: -1 },
  cout: { type: T.stream, value: cout },
  cerr: { type: T.stream, value: cout },
  cin: { type: T.stream, value: cin },
  endl: { type: T.fn, value: { fn: 'builtin', name: 'endl' } },
  fixed: { type: T.fn, value: { fn: 'builtin', name: 'fixed' } },
  boolalpha: { type: T.fn, value: { fn: 'builtin', name: 'boolalpha' } },
  noboolalpha: { type: T.fn, value: { fn: 'builtin', name: 'noboolalpha' } },
}

const MATH: Readonly<Record<string, (x: number, y: number) => number>> = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, floor: Math.floor, ceil: Math.ceil, round: Math.round, log: Math.log, log2: Math.log2,
  log10: Math.log10, exp: Math.exp, pow: Math.pow, fmod: (x, y) => x % y, hypot: Math.hypot, fabs: Math.abs, sin: Math.sin,
  cos: Math.cos, tan: Math.tan, atan2: Math.atan2, trunc: Math.trunc,
}

const CTYPE: Readonly<Record<string, (c: string) => boolean>> = {
  isdigit: (c) => /[0-9]/.test(c), isalpha: (c) => /[A-Za-z]/.test(c), isalnum: (c) => /[A-Za-z0-9]/.test(c),
  isupper: (c) => /[A-Z]/.test(c), islower: (c) => /[a-z]/.test(c), isspace: (c) => /\s/.test(c),
  ispunct: (c) => /[!-/:-@[-`{-~]/.test(c),
}

const OTHER = new Set([
  'max', 'min', 'swap', 'abs', 'llabs', 'to_string', 'stoi', 'stol', 'stoll', 'stoul', 'stoull', 'stod', 'stof', 'tolower',
  'toupper', '__gcd', 'gcd', 'lcm', 'make_pair', 'printf', 'puts', 'getline', 'setprecision', 'setw',
])

export const builtinConstant = (name: string): R | undefined => CONSTANTS[name]

export const isBuiltin = (name: string): boolean => OTHER.has(name) || name in MATH || name in CTYPE || ALGORITHMS.has(name)

function parseInteger(text: string, what: string, bits: 32 | 64): R {
  const m = /^\s*([+-]?\d+)/.exec(text)
  if (!m) throw new CppError(`${what}: invalid argument "${text}"`)
  const v = BigInt(m[1]!)
  if (bits === 32) {
    if (v > 2147483647n || v < -2147483648n) throw new CppError(`${what}: "${text}" is out of range for int`)
    return { type: T.int, value: Number(v) }
  }
  return { type: T.longLong, value: BigInt.asIntN(64, v) }
}

function extreme(m: Machine, name: 'max' | 'min', args: readonly R[]): R {
  const list = args.length === 1 && args[0]!.value instanceof InitVal ? args[0]!.value.items : args.slice(0, 2)
  if (!list.length) throw new CppError(`${name} needs values`)
  const comp = args.length === 3 && isFn(args[2]!.value) ? args[2]!.value : null
  const type = list.every((r) => isArithmetic(r.type)) ? list.map((r) => r.type).reduce(commonType) : list[0]!.type
  const vals = list.map((r): R => ({ type, value: isArithmetic(type) ? convertArith(r.value, r.type, type) : r.value }))
  const less = (a: R, b: R) => (comp ? truthy(m, invoke(m, comp, [a, b])) : compareVals(a.value, b.value, m.less) < 0)
  const best = vals.reduce((acc, r) => ((name === 'max' ? less(acc, r) : less(r, acc)) ? r : acc))
  return { type: best.type, value: copyValue(best.value) }
}

const charOf = (r: R | undefined): string => String.fromCharCode(Number(num(r?.value ?? 0)) & 0xff)

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y) [x, y] = [y, x % y]
  return x
}

export function callBuiltin(m: Machine, name: string, args: readonly R[]): R {
  if (ALGORITHMS.has(name)) return algorithm(m, name, args)
  const [a, b] = args
  if (name in MATH) return { type: T.double, value: MATH[name]!(Number(num(a!.value)), Number(num(b?.value ?? 0))) }
  if (name in CTYPE) return { type: T.int, value: CTYPE[name]!(charOf(a)) ? 1 : 0 }
  switch (name) {
    case 'max':
    case 'min':
      return extreme(m, name, args)
    case 'swap': {
      if (!a?.cell || !b?.cell) throw new CppError('swap needs two variables')
      const tmp = a.cell.value
      a.cell.value = b.cell.value
      b.cell.value = tmp
      return VOID
    }
    case 'abs':
    case 'llabs':
      if (a!.type.t === 'float') return { type: a!.type, value: Math.abs(Number(a!.value)) }
      return compareVals(a!.value, 0, m.less) < 0 ? unaryArith('-', a!) : { type: a!.type, value: a!.value }
    case 'to_string': {
      const v = a!.value
      const text = a!.type.t === 'float' ? Number(v).toFixed(6) : String(typeof v === 'boolean' ? Number(v) : v)
      return { type: T.string, value: new StrVal(text) }
    }
    case 'stoi':
    case 'stol':
      return parseInteger((a!.value as StrVal).s, name, name === 'stoi' ? 32 : 64)
    case 'stoll':
    case 'stoul':
    case 'stoull':
      return parseInteger((a!.value as StrVal).s, name, 64)
    case 'stod':
    case 'stof': {
      const v = parseFloat((a!.value as StrVal).s)
      if (Number.isNaN(v)) throw new CppError(`${name}: invalid argument`)
      return { type: T.double, value: v }
    }
    case 'tolower':
    case 'toupper': {
      const c = charOf(a)
      return { type: T.int, value: (name === 'tolower' ? c.toLowerCase() : c.toUpperCase()).charCodeAt(0) }
    }
    case '__gcd':
    case 'gcd':
    case 'lcm': {
      const type = commonType(a!.type, b!.type)
      const x = BigInt(num(a!.value))
      const y = BigInt(num(b!.value))
      const g = gcd(x, y)
      const v = name === 'lcm' ? (g ? (x / g) * y : 0n) : g
      return { type, value: convertArith(v < 0n ? -v : v, T.longLong, type) }
    }
    case 'make_pair': {
      const type: CType = { t: 'pair', a: a!.type, b: b!.type }
      return { type, value: new PairVal(type, new Cell(a!.type, copyValue(a!.value)), new Cell(b!.type, copyValue(b!.value))) }
    }
    case 'printf':
      m.io.write(printf((a!.value as StrVal).s, args.slice(1)))
      return { type: T.int, value: 0 }
    case 'puts':
      m.io.write(`${(a!.value as StrVal).s}\n`)
      return { type: T.int, value: 0 }
    case 'getline': {
      if (!b?.cell) throw new CppError('getline needs a string variable')
      const line = m.io.line()
      b.cell.value = convert(m, { type: T.string, value: new StrVal(line ?? '') }, T.string)
      return a!
    }
    case 'setprecision':
    case 'setw':
      return { type: T.fn, value: { fn: 'builtin', name, arg: intArg(a, name) } }
    default:
      throw new CppError(`${name} is not supported`)
  }
}
