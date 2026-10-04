import { useMemo } from 'react'
import { type PlacedMarks, placeMarks } from '../../structures/indexMarks'
import type { IndexMark } from '../../structures/types'
import type { Heap, HeapObject as TraceObject, SequenceObject, Value as TraceValue } from '../../trace/types'
import { sameValue, valueKey } from '../../trace/values'
import { offText, PointerMarks } from '../structures/Tags'
import { useIsHot } from './cover'
import { Value } from './Value'

const NO_MARKS: PlacedMarks = { at: new Map(), end: [], off: [] }

function Sequence({ obj, prev, heap, placed }: { obj: SequenceObject; prev: TraceObject | undefined; heap: Heap; placed: PlacedMarks }) {
  const before = prev?.kind === obj.kind ? prev.items : null
  return (
    <div className="cells">
      {obj.items.map((item, i) => {
        const marks = placed.at.get(i)
        const classes = `cell${before && !sameValue(before[i], item) ? ' is-changed' : ''}${marks ? ' is-pointed' : ''}`
        return (
          <div key={i} className={classes}>
            <div className="cell-value">
              <Value value={item} heap={heap} />
            </div>
            {obj.kind !== 'set' && <div className="cell-index">{i}</div>}
            {marks && <PointerMarks marks={marks} />}
          </div>
        )
      })}
      {placed.end.length > 0 && (
        <div className="cell cell-end">
          <div className="cell-value">end</div>
          <div className="cell-index">{obj.items.length}</div>
          <PointerMarks marks={placed.end} />
        </div>
      )}
      {obj.items.length === 0 && placed.end.length === 0 && <div className="cell cell-empty">empty</div>}
      {obj.size > obj.items.length && <div className="cell cell-more">+{obj.size - obj.items.length} more</div>}
    </div>
  )
}

type Row = [key: TraceValue | string, value: TraceValue]

const rowKey = (k: Row[0]) => (typeof k === 'string' ? k : valueKey(k))

function RowMarks({ marks }: { marks: readonly IndexMark[] | undefined }) {
  if (!marks) return null
  return <span className="row-ptrs">◂ {marks.map((m) => m.name).join(', ')}</span>
}

function Pairs({ rows, prevRows, heap, placed }: { rows: Row[]; prevRows: Row[] | null; heap: Heap; placed: PlacedMarks }) {
  const before = prevRows && new Map(prevRows.map(([k, v]) => [rowKey(k), v]))
  return (
    <table className="pairs">
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i} className={`${before && !sameValue(before.get(rowKey(k)), v) ? 'is-changed' : ''}${placed.at.has(i) ? ' is-pointed' : ''}`}>
            <th scope="row">{typeof k === 'string' ? k : <Value value={k} heap={heap} />}</th>
            <td>
              <Value value={v} heap={heap} />
              <RowMarks marks={placed.at.get(i)} />
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

function body(obj: TraceObject, prev: TraceObject | undefined, heap: Heap, placed: PlacedMarks) {
  switch (obj.kind) {
    case 'list':
    case 'tuple':
    case 'set':
    case 'deque':
      return <Sequence obj={obj} prev={prev} heap={heap} placed={placed} />
    case 'dict':
      return <Pairs rows={obj.entries} prevRows={prev?.kind === 'dict' ? prev.entries : null} heap={heap} placed={placed} />
    case 'instance':
      return <Pairs rows={obj.attrs} prevRows={prev?.kind === 'instance' ? prev.attrs : null} heap={heap} placed={NO_MARKS} />
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
  marks: readonly IndexMark[] | undefined
}

function place(obj: TraceObject, marks: readonly IndexMark[] | undefined): PlacedMarks {
  if (!marks) return NO_MARKS
  if (obj.kind === 'dict') return placeMarks(marks, obj.entries.length, obj.entries.length)
  return 'items' in obj ? placeMarks(marks, obj.items.length, obj.size) : NO_MARKS
}

export function HeapObject({ id, obj, prev, isNew, isChanged, heap, marks }: Props) {
  const hot = useIsHot(id)
  const placed = useMemo(() => place(obj, marks), [obj, marks])
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
      {body(obj, prev, heap, placed)}
      {placed.off.length > 0 && <p className="heap-note">Not on a cell: {offText(placed.off)}</p>}
    </div>
  )
}
