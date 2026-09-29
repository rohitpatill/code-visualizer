import type { JType, PrimName } from '../lang/types'
import { methodsNamed } from './classes'
import { callMethod } from './calls'
import { primValue } from './convert'
import type { Machine } from './machine'
import type { PrimValue } from './numbers'
import { isThrowable, throwableText } from './throwing'
import {
  BuilderVal, ClassRef, EntryVal, FnVal, HeapVal, IterVal, JArray, JObject, JStr, type JVal, ListVal, MapVal, NativeObj, type R,
  SetVal, ViewVal, entryVal,
} from './values'
import { optionalText } from './lib/optionals'
import { statsText } from './lib/statistics'
import { CollectorVal, OptionalVal, StatsVal, StreamVal } from './streamValues'

function parseExponential(exponential: string): { digits: string; e: number } {
  const [mantissa, exp] = exponential.replace(/^-/, '').split('e')
  return { digits: mantissa!.replace('.', ''), e: Number(exp) }
}

/**
 * Java's decimal layout of the shortest round-trip digits: plain between
 * 10^-3 and 10^7, `1.0E10` style outside. The exponent form always shows two
 * digits, and Java picks the two closest to the value (`4.9E-324`, not `5.0E-324`).
 */
function javaDecimal(x: number, exponential: string): string {
  const { digits, e } = parseExponential(exponential)
  const abs = Math.abs(x)
  let text: string
  if (abs >= 1e-3 && abs < 1e7) {
    if (e >= 0) text = `${digits.slice(0, e + 1).padEnd(e + 1, '0')}.${digits.slice(e + 1) || '0'}`
    else text = `0.${'0'.repeat(-e - 1)}${digits}`
  } else {
    const two = digits.length > 1 ? { digits, e } : parseExponential(abs.toExponential(1))
    text = `${two.digits[0]}.${two.digits.slice(1)}E${two.e}`
  }
  return x < 0 ? `-${text}` : text
}

function special(x: number): string | null {
  if (Number.isNaN(x)) return 'NaN'
  if (x === Infinity) return 'Infinity'
  if (x === -Infinity) return '-Infinity'
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0'
  return null
}

/** Double.toString. */
export function doubleText(x: number): string {
  return special(x) ?? javaDecimal(x, x.toExponential())
}

/** Float.toString: the fewest digits that read back as the same float. */
export function floatText(x: number): string {
  const s = special(x)
  if (s) return s
  for (let p = 1; p < 10; p++) {
    const candidate = Number(x.toPrecision(p))
    if (Math.fround(candidate) === x) return javaDecimal(x, candidate.toExponential())
  }
  return javaDecimal(x, x.toExponential())
}

/** String.valueOf for a primitive. */
export function primText(p: PrimName, v: PrimValue): string {
  switch (p) {
    case 'char':
      return String.fromCharCode(Number(v))
    case 'double':
      return doubleText(Number(v))
    case 'float':
      return floatText(Number(v))
    default:
      return String(v)
  }
}

const ARRAY_CODES: Readonly<Record<string, string>> = { int: 'I', long: 'J', double: 'D', float: 'F', char: 'C', boolean: 'Z', byte: 'B', short: 'S' }

/** The JVM name of an array class, as `toString()` prints it: `[I`, `[[C`, `[Ljava.lang.String;`. */
export function arrayClassName(t: JType): string {
  if (t.t === 'array') return `[${arrayClassName(t.of)}`
  if (t.t === 'prim') return ARRAY_CODES[t.name]!
  const name = t.t === 'ref' ? t.name : 'Object'
  return `L${name === 'String' || name === 'Object' || name === 'Integer' ? `java.lang.${name}` : name};`
}

function recordText(m: Machine, obj: JObject): string {
  const parts = obj.cls.decl.components.map((c) => `${c.name}=${valueText(m, obj.fields.get(c.name)!.value, obj.fields.get(c.name)!.type)}`)
  return `${obj.cls.name}[${parts.join(', ')}]`
}

function objectText(m: Machine, obj: JObject): string {
  const own = methodsNamed(obj.cls, 'toString').find((x) => !x.decl.params.length && x.decl.body)
  if (own) return valueText(m, callMethod(m, { type: { t: 'ref', name: obj.cls.name, args: [] }, value: obj }, 'toString', []).value)
  if (obj.constant) return obj.constant.name
  if (obj.cls.decl.kind === 'record') return recordText(m, obj)
  if (isThrowable(obj.cls)) return throwableText(obj)
  return `${obj.cls.name}@${m.identityHash(obj).toString(16)}`
}

function joined(m: Machine, self: object, items: readonly JVal[], open: string, close: string): string {
  return `${open}${items.map((v) => (v === self ? '(this Collection)' : valueText(m, v))).join(', ')}${close}`
}

/** String.valueOf(value): what printing or string concatenation shows. Calls user toString methods. */
export function valueText(m: Machine, v: JVal, type: JType = { t: 'ref', name: 'Object', args: [] }): string {
  if (v === null) return 'null'
  const prim = primValue({ type, value: v })
  if (prim) return primText(prim.p, prim.v)
  if (v instanceof JStr) return v.s
  if (v instanceof BuilderVal) return v.s
  if (v instanceof JObject) return objectText(m, v)
  if (v instanceof JArray) return `${arrayClassName(v.type)}@${m.identityHash(v).toString(16)}`
  if (v instanceof ListVal || v instanceof HeapVal) return joined(m, v, v.items, '[', ']')
  if (v instanceof SetVal) return joined(m, v, v.store.entries(m).map((e) => e.key), '[', ']')
  if (v instanceof ViewVal) return joined(m, v, viewItems(m, v), '[', ']')
  if (v instanceof MapVal) {
    const parts = v.store.entries(m).map((e) => `${e.key === v ? '(this Map)' : valueText(m, e.key)}=${e.value === v ? '(this Map)' : valueText(m, e.value)}`)
    return `{${parts.join(', ')}}`
  }
  if (v instanceof EntryVal) return `${valueText(m, v.entry.key)}=${valueText(m, v.entry.value)}`
  if (v instanceof FnVal) return `Main$$Lambda@${m.identityHash(v).toString(16)}`
  if (v instanceof ClassRef) return `class ${v.name}`
  if (v instanceof IterVal) return `java.util.Iterator@${m.identityHash(v).toString(16)}`
  if (v instanceof NativeObj) return `${NATIVE_NAMES[v.kind]}@${m.identityHash(v).toString(16)}`
  if (v instanceof OptionalVal) return optionalText(m, v)
  if (v instanceof StatsVal) return statsText(m, v)
  if (v instanceof StreamVal) return `java.util.stream.${v.prim ? `${v.prim[0]!.toUpperCase()}${v.prim.slice(1)}` : 'Reference'}Pipeline@${m.identityHash(v).toString(16)}`
  if (v instanceof CollectorVal) return `java.util.stream.Collectors$CollectorImpl@${m.identityHash(v).toString(16)}`
  return String(v)
}

const NATIVE_NAMES: Readonly<Record<NativeObj['kind'], string>> = {
  out: 'java.io.PrintStream',
  in: 'java.io.BufferedInputStream',
  scanner: 'java.util.Scanner',
  reader: 'java.io.BufferedReader',
  tokenizer: 'java.util.StringTokenizer',
  writer: 'java.io.PrintWriter',
  random: 'java.util.Random',
}

/** The elements a map view iterates over. */
export function viewItems(m: Machine, view: ViewVal): JVal[] {
  const entries = view.map.store.entries(m)
  if (view.part === 'keys') return entries.map((e) => e.key)
  if (view.part === 'values') return entries.map((e) => e.value)
  return entries.map(entryVal)
}

/** Text of an evaluated expression, for concatenation and printing. */
export const textOf = (m: Machine, r: R): string => valueText(m, r.value, r.type)
