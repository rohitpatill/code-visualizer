import { T, typeName } from '../../lang/types'
import type { Machine } from '../machine'
import { MapVal, type R, SeqVal, SetVal, StrVal, StreamVal, VOID } from '../values'
import { adapterMethod } from './adapters'
import { mapMethod, setMethod } from './associative'
import { unknownMethod } from './common'
import { sequenceMethod } from './sequences'
import { stringMethod } from './strings'

/** The stream calls competitive code uses for setup; they change nothing here. */
function streamMethod(m: Machine, name: string, args: readonly R[]): R {
  switch (name) {
    case 'tie':
    case 'sync_with_stdio':
    case 'flush':
    case 'ignore':
      return VOID
    case 'precision':
      m.io.precision = Number(args[0]?.value ?? 6)
      return VOID
    case 'get':
      return { type: T.int, value: m.io.char() ?? -1 }
    default:
      throw unknownMethod('stream', name)
  }
}

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
  if (v instanceof StreamVal) return streamMethod(m, name, args)
  throw unknownMethod(typeName(target.type), name)
}
