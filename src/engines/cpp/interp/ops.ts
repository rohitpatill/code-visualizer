import { type CType, T, isArithmetic, typeName } from '../lang/types'
import { arith, isZero, unaryArith } from './arith'
import { callOperatorValue } from './calls'
import { compareVals, equalVals, identity } from './compare'
import { CppError } from './errors'
import { convert, zeroOf } from './init'
import { charText, formatDouble } from './io'
import type { Machine } from './machine'
import { advance, distance } from './stl/iterators'
import { IterVal, ObjVal, PtrVal, type R, StrVal, StreamVal, UNINIT, type Val, isFn } from './values'

const RELATIONAL = new Set(['<', '>', '<=', '>=', '==', '!='])
const bool = (value: boolean): R => ({ type: T.bool, value })

function checkInit(r: R): void {
  if (r.value === UNINIT) throw new CppError('used a variable before giving it a value (uninitialized)')
}

const isArith = (r: R) => isArithmetic(r.type) && (typeof r.value === 'number' || typeof r.value === 'bigint' || typeof r.value === 'boolean')

export function truthy(m: Machine, r: R): boolean {
  checkInit(r)
  const v = r.value
  if (v instanceof PtrVal) return !v.isNull
  if (v instanceof StreamVal) return !m.io.failed
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') return !isZero(v)
  throw new CppError(`a ${typeName(r.type)} cannot be used as a condition`)
}

function relational(op: string, c: number): boolean {
  return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : op === '>=' ? c >= 0 : op === '==' ? c === 0 : c !== 0
}

function print(m: Machine, stream: R, r: R): R {
  checkInit(r)
  const v = r.value
  const io = m.io
  if (isFn(v) && v.fn === 'builtin') {
    if (v.name === 'endl') io.write('\n')
    else if (v.name === 'fixed') io.fixed = true
    else if (v.name === 'boolalpha') io.boolalpha = true
    else if (v.name === 'noboolalpha') io.boolalpha = false
    else if (v.name === 'setprecision') io.precision = v.arg ?? 6
    else if (v.name === 'setw') io.width = v.arg ?? 0
    else throw new CppError(`cannot print ${v.name} with <<`)
    return stream
  }
  let text: string
  if (typeof v === 'boolean') text = io.boolalpha ? String(v) : v ? '1' : '0'
  else if (typeof v === 'number' && r.type.t === 'char') text = charText(v)
  else if (typeof v === 'number' && r.type.t === 'float') text = formatDouble(v, io.precision, io.fixed)
  else if (typeof v === 'number' || typeof v === 'bigint') text = String(v)
  else if (v instanceof StrVal) text = v.s
  else if (v instanceof PtrVal) text = v.isNull ? '0' : `0x${(identity(v.target ?? v.base!) * 16 + v.index).toString(16)}`
  else throw new CppError(`cannot print a ${typeName(r.type)} with cout <<`)
  io.write(text)
  return stream
}

function read(m: Machine, stream: R, target: R): R {
  const cell = target.cell
  if (!cell) throw new CppError('cin >> needs a variable to read into')
  const type: CType = cell.type
  const io = m.io
  if (type.t === 'char') {
    const code = io.char()
    cell.value = code ?? 0
    return stream
  }
  const token = io.token()
  if (token === null) {
    cell.value = type.t === 'string' ? new StrVal('') : zeroOf(type)
    return stream
  }
  if (type.t === 'string') cell.value = new StrVal(token)
  else if (type.t === 'int' && /^[+-]?\d+$/.test(token)) cell.value = convert(m, { type: T.longLong, value: BigInt(token) }, type)
  else if ((type.t === 'float' || type.t === 'int') && !Number.isNaN(Number(token))) cell.value = convert(m, { type: T.double, value: Number(token) }, type)
  else if (type.t === 'bool' && (token === '0' || token === '1')) cell.value = token === '1'
  else {
    io.failed = true
    cell.value = zeroOf(type)
  }
  return stream
}

const textOf = (r: R): string | null => (r.value instanceof StrVal ? r.value.s : r.type.t === 'char' && typeof r.value === 'number' ? charText(r.value) : null)

function samePointer(a: PtrVal, b: PtrVal): boolean {
  if (a.isNull || b.isNull) return a.isNull && b.isNull
  return a.target === b.target && a.base === b.base && a.index === b.index
}

function pointerOp(op: string, a: R, b: R): R {
  const p = a.value as PtrVal
  const q = b.value
  if ((op === '+' || op === '-') && (typeof q === 'number' || typeof q === 'bigint')) {
    const by = Number(q) * (op === '-' ? -1 : 1)
    if (by === 0) return a
    if (!p.base) throw new CppError('pointer arithmetic only works on pointers into an array')
    return { type: a.type, value: new PtrVal(null, p.base, p.index + by) }
  }
  const other = q instanceof PtrVal ? q : q === 0 || q === 0n ? new PtrVal(null) : null
  if (!other) throw new CppError(`invalid operands to ${op}: ${typeName(a.type)} and ${typeName(b.type)}`)
  if (op === '-') return { type: T.longLong, value: BigInt(p.index - other.index) }
  if (op === '==' || op === '!=') return bool(samePointer(p, other) === (op === '=='))
  if (RELATIONAL.has(op) && p.base && p.base === other.base) return bool(relational(op, p.index - other.index))
  throw new CppError(`invalid operands to ${op} for pointers`)
}

function iteratorOp(op: string, a: R, b: R): R {
  const it = a.value as IterVal
  const q = b.value
  if ((op === '+' || op === '-') && (typeof q === 'number' || typeof q === 'bigint')) return { type: a.type, value: advance(it, Number(q) * (op === '-' ? -1 : 1)) }
  if (!(q instanceof IterVal)) throw new CppError(`invalid operands to ${op} for an iterator`)
  if (op === '-') return { type: T.longLong, value: BigInt(distance(q, it)) }
  if (RELATIONAL.has(op)) return bool(relational(op, it.over === q.over ? it.index - q.index : 1))
  throw new CppError(`invalid operator ${op} for iterators`)
}

export function binary(m: Machine, op: string, a: R, b: R): R {
  if (a.value instanceof StreamVal) {
    if (op === '<<' && a.value.dir === 'out') return print(m, a, b)
    if (op === '>>' && a.value.dir === 'in') return read(m, a, b)
    throw new CppError(`use << with cout and >> with cin`)
  }
  checkInit(a)
  checkInit(b)
  if (isArith(a) && isArith(b)) return arith(op, a, b)
  const ta = textOf(a)
  const tb = textOf(b)
  if ((a.value instanceof StrVal || b.value instanceof StrVal) && ta !== null && tb !== null) {
    if (op === '+') return { type: T.string, value: new StrVal(ta + tb) }
    if (RELATIONAL.has(op)) return bool(relational(op, ta < tb ? -1 : ta > tb ? 1 : 0))
  }
  if (a.value instanceof PtrVal) return pointerOp(op, a, b)
  if (b.value instanceof PtrVal && (op === '==' || op === '!=')) return pointerOp(op, b, a)
  if (a.value instanceof IterVal) return iteratorOp(op, a, b)
  if (a.value instanceof ObjVal) return callOperatorValue(m, op, a, b)
  if (RELATIONAL.has(op) && typeof a.value === 'object' && typeof b.value === 'object') {
    if (op === '==' || op === '!=') return bool(equalVals(a.value, b.value, m.less) === (op === '=='))
    return bool(relational(op, compareVals(a.value, b.value, m.less)))
  }
  throw new CppError(`invalid operands to ${op}: ${typeName(a.type)} and ${typeName(b.type)}`)
}

export function unary(m: Machine, op: string, r: R): R {
  if (op === '!') return bool(!truthy(m, r))
  checkInit(r)
  if (!isArith(r)) throw new CppError(`invalid operand to unary ${op}: ${typeName(r.type)}`)
  return unaryArith(op, r)
}

function cellOf(target: R) {
  if (!target.cell) throw new CppError('the left side of an assignment must be a variable')
  return target.cell
}

/** Stores a converted copy of `value` into the target's cell. */
function store(m: Machine, target: R, value: R): R {
  const cell = cellOf(target)
  cell.value = convert(m, value, cell.type)
  return { type: cell.type, value: cell.value, cell }
}

function storeRaw(target: R, value: Val): R {
  const cell = cellOf(target)
  cell.value = value
  return { type: cell.type, value, cell }
}

export function assign(m: Machine, op: string, target: R, value: R): R {
  if (op === '=') return store(m, target, value)
  const base = op.slice(0, -1)
  if (base === '+' && target.value instanceof StrVal) {
    const add = textOf(value)
    if (add === null) throw new CppError(`cannot append a ${typeName(value.type)} to a string`)
    target.value.s += add
    return target
  }
  const result = binary(m, base, target, value)
  return target.value instanceof PtrVal || target.value instanceof IterVal ? storeRaw(target, result.value) : store(m, target, result)
}

export function update(m: Machine, op: '++' | '--', target: R, postfix: boolean): R {
  checkInit(target)
  const before: R = { type: target.type, value: target.value }
  const v = target.value
  let after: R
  if (v instanceof PtrVal) after = storeRaw(target, pointerOp(op[0]!, target, { type: T.int, value: 1 }).value)
  else if (v instanceof IterVal) after = storeRaw(target, advance(v, op === '++' ? 1 : -1))
  else after = store(m, target, binary(m, op[0]!, target, { type: T.int, value: 1 }))
  return postfix ? before : after
}
