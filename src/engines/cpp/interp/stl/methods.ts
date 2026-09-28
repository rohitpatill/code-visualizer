import { typeName } from '../../lang/types'
import type { Machine } from '../machine'
import { MapVal, type R, SeqVal, SetVal, StrVal } from '../values'
import { adapterMethod } from './adapters'
import { mapMethod, setMethod } from './associative'
import { unknownMethod } from './common'
import { sequenceMethod } from './sequences'
import { stringMethod } from './strings'

/** Member functions of the standard library types. */
export function stlMethod(m: Machine, target: R, name: string, args: readonly R[]): R {
  const v = target.value
  if (v instanceof StrVal) return stringMethod(m, v, name, args)
  if (v instanceof SeqVal) {
    const kind = v.type.t
    return kind === 'queue' || kind === 'stack' || kind === 'pq' ? adapterMethod(m, v, name, args) : sequenceMethod(m, v, name, args)
  }
  if (v instanceof MapVal) return mapMethod(m, v, name, args)
  if (v instanceof SetVal) return setMethod(m, v, name, args)
  throw unknownMethod(typeName(target.type), name)
}
