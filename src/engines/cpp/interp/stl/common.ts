import { T } from '../../lang/types'
import { num } from '../arith'
import { CppError } from '../errors'
import { type Cell, type IterVal, type R, VOID } from '../values'

export const NPOS = 2n ** 64n - 1n

export const lvalue = (cell: Cell): R => ({ type: cell.type, value: cell.value, cell })
export const boolR = (value: boolean): R => ({ type: T.bool, value })
export const sizeR = (n: number): R => ({ type: T.sizeT, value: BigInt(n) })
export const intR = (n: number): R => ({ type: T.int, value: n | 0 })
export const iterR = (it: IterVal): R => ({ type: { t: 'iter', of: T.int }, value: it })
export { VOID }

export const intArg = (r: R | undefined, what: string): number => {
  if (!r) throw new CppError(`${what} is missing an argument`)
  return Number(num(r.value))
}

export function arity(what: string, args: readonly R[], min: number, max = min): void {
  if (args.length < min || args.length > max) {
    const want = min === max ? `${min}` : `${min} to ${max}`
    throw new CppError(`${what} takes ${want} argument${max === 1 ? '' : 's'}, got ${args.length}`)
  }
}

export const unknownMethod = (owner: string, name: string): CppError => new CppError(`${owner} has no member function '${name}'`)
