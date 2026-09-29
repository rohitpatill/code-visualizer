import { T } from '../../lang/types'
import { toPrim, toRef } from '../convert'
import { CompileStop, Fault } from '../errors'
import type { Machine } from '../machine'
import { JStr, type JVal, type R } from '../values'

/** A built-in class has no method of that name. Its own class, so an unqualified call can keep looking in enclosing classes. */
export class NoMethod extends CompileStop {}

export const noMethod = (owner: string, name: string) => new NoMethod(`cannot find symbol: method ${name}(...) in ${owner}`)

export function arity(what: string, args: readonly R[], min: number, max = min): void {
  if (args.length >= min && args.length <= max) return
  const want = min === max ? `${min}` : `${min} to ${max}`
  throw new CompileStop(`${what} takes ${want} argument${max === 1 ? '' : 's'}, not ${args.length}`)
}

export function intArg(r: R | undefined, what: string): number {
  if (!r) throw new CompileStop(`${what} is missing an argument`)
  return toPrim(r, 'int') as number
}

/** The text of a String argument; null is Java's NullPointerException. */
export function textArg(r: R | undefined, what: string): string {
  const v = r?.value
  if (v instanceof JStr) return v.s
  if (v === null) throw new Fault('NullPointerException', `${what}: the argument is null`)
  throw new CompileStop(`${what} needs a String`)
}

/** An element as a collection stores it: primitives are boxed. */
export const element = (m: Machine, r: R): JVal => toRef(m, r, T.object)

/** Checks an index against a size the way java.util collections do. */
export function checkIndex(i: number, size: number, cls = 'IndexOutOfBoundsException'): number {
  if (i < 0 || i >= size) throw new Fault(cls, `Index ${i} out of bounds for length ${size}`)
  return i
}
