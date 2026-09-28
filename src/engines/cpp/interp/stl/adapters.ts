import { typeName } from '../../lang/types'
import { CppError } from '../errors'
import { construct, convert } from '../init'
import type { Machine } from '../machine'
import { Cell, type R, type SeqVal } from '../values'
import { VOID, boolR, lvalue, sizeR, unknownMethod } from './common'
import { heapPop, heapPush } from './heap'

/** queue (front is items[0]), stack (top is the last item) and priority_queue (a binary heap). */
export function adapterMethod(m: Machine, seq: SeqVal, name: string, args: readonly R[]): R {
  const t = seq.type
  const owner = typeName(t)
  const elem = 'of' in t ? t.of : t
  const items = seq.items
  const kind = t.t
  const nonEmpty = () => {
    if (!items.length) throw new CppError(`${name}() on an empty ${kind === 'pq' ? 'priority_queue' : kind} (undefined behavior in real C++)`)
  }
  switch (name) {
    case 'size':
      return sizeR(items.length)
    case 'empty':
      return boolR(items.length === 0)
    case 'push':
    case 'emplace': {
      const cell = new Cell(elem, args.length === 1 ? convert(m, args[0]!, elem) : construct(m, elem, args))
      if (kind === 'pq') heapPush(m, seq, cell)
      else items.push(cell)
      return VOID
    }
    case 'pop':
      nonEmpty()
      if (kind === 'pq') heapPop(m, seq)
      else if (kind === 'queue') items.shift()
      else items.pop()
      return VOID
    case 'front':
      if (kind !== 'queue') break
      nonEmpty()
      return lvalue(items[0]!)
    case 'back':
      if (kind !== 'queue') break
      nonEmpty()
      return lvalue(items[items.length - 1]!)
    case 'top':
      if (kind === 'queue') break
      nonEmpty()
      return lvalue(kind === 'pq' ? items[0]! : items[items.length - 1]!)
  }
  throw unknownMethod(owner, name)
}
