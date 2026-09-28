import type { Heap, HeapObject as TraceObject, SequenceObject, Value as TraceValue } from '../../trace/types'
import { sameValue, valueKey } from '../../trace/values'
import { useIsHot } from './cover'
import { Value } from './Value'

function Sequence({ obj, prev, heap }: { obj: SequenceObject; prev: TraceObject | undefined; heap: Heap }) {
  const before = prev?.kind === obj.kind ? prev.items : null
  return (
    <div className="cells">
      {obj.items.map((item, i) => (
        <div key={i} className={`cell${before && !sameValue(before[i], item) ? ' is-changed' : ''}`}>
          <div className="cell-value">
            <Value value={item} heap={heap} />
          </div>
          {obj.kind !== 'set' && <div className="cell-index">{i}</div>}
        </div>
      ))}
      {obj.items.length === 0 && <div className="cell cell-empty">empty</div>}
      {obj.size > obj.items.length && <div className="cell cell-more">+{obj.size - obj.items.length} more</div>}
    </div>
  )
}

type Row = [key: TraceValue | string, value: TraceValue]

const rowKey = (k: Row[0]) => (typeof k === 'string' ? k : valueKey(k))

function Pairs({ rows, prevRows, heap }: { rows: Row[]; prevRows: Row[] | null; heap: Heap }) {
  const before = prevRows && new Map(prevRows.map(([k, v]) => [rowKey(k), v]))
  return (
    <table className="pairs">
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i} className={before && !sameValue(before.get(rowKey(k)), v) ? 'is-changed' : ''}>
            <th scope="row">{typeof k === 'string' ? k : <Value value={k} heap={heap} />}</th>
            <td>
              <Value value={v} heap={heap} />
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td className="cell-empty" colSpan={2}>
              empty
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

function body(obj: TraceObject, prev: TraceObject | undefined, heap: Heap) {
  switch (obj.kind) {
    case 'list':
    case 'tuple':
    case 'set':
    case 'deque':
      return <Sequence obj={obj} prev={prev} heap={heap} />
    case 'dict':
      return <Pairs rows={obj.entries} prevRows={prev?.kind === 'dict' ? prev.entries : null} heap={heap} />
    case 'instance':
      return <Pairs rows={obj.attrs} prevRows={prev?.kind === 'instance' ? prev.attrs : null} heap={heap} />
    case 'other':
      return <code className="other-repr">{obj.repr}</code>
    default:
      return null
  }
}

interface Props {
  id: string
  obj: TraceObject
  prev: TraceObject | undefined
  isNew: boolean
  isChanged: boolean
  heap: Heap
}

export function HeapObject({ id, obj, prev, isNew, isChanged, heap }: Props) {
  const hot = useIsHot(id)
  const classes = ['heap-obj', `kind-${obj.kind}`]
  if (hot) classes.push('is-hot')
  if (isNew) classes.push('is-new')
  else if (isChanged) classes.push('is-changed')
  return (
    <div className={classes.join(' ')} data-heap={id}>
      <div className="heap-label">
        {obj.kind === 'instance' ? `${obj.type} object` : obj.type}
        {'size' in obj && obj.kind !== 'dict' && <span className="heap-size">len {obj.size}</span>}
      </div>
      {body(obj, prev, heap)}
    </div>
  )
}
