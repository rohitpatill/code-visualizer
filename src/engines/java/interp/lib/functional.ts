import type { Expr } from '../../lang/ast'
import { type JType, typeName } from '../../lang/types'
import { callMethod, callStatic, invokeCallable } from '../calls'
import { methodsNamed } from '../classes'
import { toPrim, zeroOf } from '../convert'
import { CompileStop } from '../errors'
import { evalExpr } from '../eval'
import type { Machine } from '../machine'
import type { PrimValue } from '../numbers'
import { instantiate } from '../objects'
import { boolR, intR, refR, truthy } from '../ops'
import { ClassRef, FnVal, JArray, type JVal, type R } from '../values'
import { compareWith } from './equality'
import { constructLib } from './index'

type Call = (m: Machine, args: readonly R[]) => R

export const nativeFn = (label: string, params: readonly string[], call: Call) => new FnVal({ kind: 'native', call }, label, params)

/** A comparator built in Java terms: Comparator.comparingInt, reverseOrder, reversed() and friends. */
export const comparator = (label: string, compare: (m: Machine, a: JVal, b: JVal) => number) =>
  nativeFn(label, ['a', 'b'], (m, [a, b]) => intR(compare(m, a!.value, b!.value)))

const boxed = (m: Machine, r: R): JVal => (r.type.t === 'prim' ? m.box(r.type.name, r.value as PrimValue) : r.value)

/** Comparator.comparing(keyExtractor): compares the extracted keys by natural order, or by `keyCmp`. */
export function comparing(fn: JVal, keyCmp: JVal = null): FnVal {
  const key = (m: Machine, v: JVal) => boxed(m, invokeCallable(m, fn, [refR(v)], 'apply'))
  return comparator('comparing', (m, a, b) => compareWith(m, keyCmp, key(m, a), key(m, b)))
}

export const NATURAL = comparator('naturalOrder', (m, a, b) => compareWith(m, null, a, b))
export const REVERSE = comparator('reverseOrder', (m, a, b) => compareWith(m, null, b, a))

export const reversed = (cmp: JVal) => (cmp === null ? REVERSE : comparator('reversed', (m, a, b) => compareWith(m, cmp, b, a)))

/** Comparator's static factories. */
export function comparatorStatic(name: string, args: readonly R[]): R {
  switch (name) {
    case 'naturalOrder':
      return refR(NATURAL)
    case 'reverseOrder':
      return refR(REVERSE)
    case 'comparing':
    case 'comparingInt':
    case 'comparingLong':
    case 'comparingDouble':
      return refR(comparing(args[0]!.value, args[1]?.value ?? null))
    default:
      throw new CompileStop(`Comparator.${name} is not supported`)
  }
}

/** thenComparing takes a comparator or a key extractor: a one-argument lambda, or a method reference other than compare. */
const isKeyExtractor = (fn: JVal) => fn instanceof FnVal && (fn.params.length === 1 || (fn.label.includes('::') && !/::compare(To)?$/.test(fn.label)))

/** A method called on a lambda or comparator: a default method such as reversed(), or its functional method. */
export function fnMethod(m: Machine, fn: JVal, name: string, args: readonly R[]): R {
  switch (name) {
    case 'reversed':
      return refR(reversed(fn))
    case 'thenComparing':
    case 'thenComparingInt':
    case 'thenComparingLong':
    case 'thenComparingDouble': {
      const next = args[0]!.value
      const second = name === 'thenComparing' && args.length === 1 && !isKeyExtractor(next) ? next : comparing(next, args[1]?.value ?? null)
      return refR(comparator('thenComparing', (mm, a, b) => compareWith(mm, fn, a, b) || compareWith(mm, second, a, b)))
    }
    case 'negate':
      return refR(nativeFn('negate', ['x'], (mm, xs) => boolR(!truthy(invokeCallable(mm, fn, xs, 'test')))))
    case 'and':
    case 'or': {
      const other = args[0]!.value
      return refR(
        nativeFn(name, ['x'], (mm, xs) => {
          const first = truthy(invokeCallable(mm, fn, xs, 'test'))
          if (name === 'and' ? !first : first) return boolR(first)
          return boolR(truthy(invokeCallable(mm, other, xs, 'test')))
        }),
      )
    }
    case 'andThen':
    case 'compose': {
      const other = args[0]!.value
      const [first, then]: [JVal, JVal] = name === 'andThen' ? [fn, other] : [other, fn]
      return refR(nativeFn(name, ['x'], (mm, xs) => invokeCallable(mm, then, [invokeCallable(mm, first, xs)])))
    }
    case 'equals':
      return boolR(fn === args[0]!.value)
    default:
      return invokeCallable(m, fn, args, name)
  }
}

function newArrayRef(type: JType): FnVal {
  if (type.t !== 'array') throw new CompileStop(`${typeName(type)}::new needs an array type`)
  return nativeFn(`${typeName(type)}::new`, ['n'], (_m, [n]) => {
    const size = toPrim(n!, 'int') as number
    return refR(new JArray(type, Array.from({ length: size }, () => zeroOf(type.of))), type)
  })
}

/** Built-in statics that `Type::name` means, rather than an instance method called on the first argument. */
const LIB_STATICS: Readonly<Record<string, ReadonlySet<string>>> = {
  Integer: new Set(['compare', 'sum', 'max', 'min', 'parseInt', 'valueOf', 'toString', 'bitCount', 'signum', 'toBinaryString']),
  Long: new Set(['compare', 'sum', 'max', 'min', 'parseLong', 'valueOf']),
  Double: new Set(['compare', 'sum', 'max', 'min', 'parseDouble', 'valueOf']),
  Character: new Set(['isDigit', 'isLetter', 'isLetterOrDigit', 'isUpperCase', 'isLowerCase', 'isWhitespace', 'toUpperCase', 'toLowerCase', 'getNumericValue', 'isAlphabetic']),
  String: new Set(['valueOf', 'join', 'format']),
  Math: new Set(['max', 'min', 'abs', 'pow', 'sqrt', 'floor', 'ceil', 'round']),
  Objects: new Set(['equals', 'hash', 'isNull', 'nonNull', 'toString', 'hashCode']),
  Arrays: new Set(['toString', 'sort', 'asList', 'fill']),
  Collections: new Set(['sort', 'reverse', 'max', 'min']),
  Boolean: new Set(['logicalAnd', 'logicalOr', 'logicalXor', 'parseBoolean']),
}

/** A class named on the left of `::`, unless a local variable has that name. */
function classTarget(m: Machine, e: Expr): ClassRef | null {
  if (e.k !== 'name' || m.frame.scope.find(e.name)) return null
  const cls = m.classes.resolve(e.name, m.frame.cls)
  if (cls) return new ClassRef(cls.name, cls)
  return /^[A-Z]/.test(e.name) ? new ClassRef(e.name, null) : null
}

/** `Integer::compare`, `String::length`, `this::helper`, `ArrayList::new`, `int[]::new`. */
export function methodRef(m: Machine, e: Extract<Expr, { k: 'methodRef' }>): FnVal {
  if (e.type) return newArrayRef(e.type)
  const source = e.target!
  const target = classTarget(m, source)
  const label = `${source.k === 'name' ? source.name : source.k === 'this' ? 'this' : 'expr'}::${e.name}`
  if (!target) {
    const bound = evalExpr(m, source)
    return nativeFn(label, [], (mm, args) => callMethod(mm, bound, e.name, args, source))
  }
  const cls = target.cls
  if (e.name === 'new') return nativeFn(label, [], (mm, args) => (cls ? refR(instantiate(mm, cls, args, undefined, null)) : constructLib(mm, { t: 'ref', name: target.name, args: [] }, args)))
  const isStatic = cls ? methodsNamed(cls, e.name).some((x) => x.decl.isStatic) : (LIB_STATICS[target.name]?.has(e.name) ?? false)
  return nativeFn(label, [], (mm, args) => {
    if (isStatic) return cls ? callStatic(mm, cls, e.name, args) : callMethod(mm, refR(target), e.name, args)
    const [self, ...rest] = args
    if (!self) throw new CompileStop(`${label} needs an object to call ${e.name} on`)
    return callMethod(mm, self, e.name, rest)
  })
}
