import { layoutHeap } from '../lib.js'
import { Value } from './Value.jsx'
import { StructureCard } from './Structures.jsx'

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function Sequence({ obj, prev, heap, hovered, onHover }) {
  const indexed = obj.kind !== 'set'
  return (
    <div className="cells">
      {obj.items.map((item, i) => {
        const changed = prev && prev.kind === obj.kind && (!prev.items[i] || !same(prev.items[i], item))
        return (
          <div key={i} className={`cell${changed ? ' is-changed' : ''}`}>
            <div className="cell-value">
              <Value value={item} heap={heap} hovered={hovered} onHover={onHover} />
            </div>
            {indexed && <div className="cell-index">{i}</div>}
          </div>
        )
      })}
      {obj.items.length === 0 && <div className="cell cell-empty">empty</div>}
      {obj.size > obj.items.length && <div className="cell cell-more">+{obj.size - obj.items.length} more</div>}
    </div>
  )
}

function Pairs({ rows, prevRows, heap, hovered, onHover, keyed }) {
  const before = new Map((prevRows || []).map(([k, v]) => [JSON.stringify(k), JSON.stringify(v)]))
  return (
    <table className="pairs">
      <tbody>
        {rows.map(([k, v], i) => {
          const kText = JSON.stringify(k)
          const changed = prevRows && before.get(kText) !== JSON.stringify(v)
          return (
            <tr key={i} className={changed ? 'is-changed' : ''}>
              <th scope="row">
                {keyed ? <Value value={k} heap={heap} hovered={hovered} onHover={onHover} /> : k}
              </th>
              <td>
                <Value value={v} heap={heap} hovered={hovered} onHover={onHover} />
              </td>
            </tr>
          )
        })}
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

function label(obj) {
  switch (obj.kind) {
    case 'set':
      return obj.frozen ? 'frozenset' : 'set'
    case 'instance':
      return `${obj.cls} object`
    case 'other':
      return obj.type
    default:
      return obj.kind
  }
}

function HeapObject({ id, obj, prev, isNew, isChanged, heap, hovered, onHover }) {
  const props = { heap, hovered, onHover }
  let body
  if (['list', 'tuple', 'set', 'deque'].includes(obj.kind)) body = <Sequence obj={obj} prev={prev} {...props} />
  else if (obj.kind === 'dict')
    body = <Pairs rows={obj.entries} prevRows={prev?.kind === 'dict' ? prev.entries : null} keyed {...props} />
  else if (obj.kind === 'instance')
    body = <Pairs rows={obj.attrs} prevRows={prev?.kind === 'instance' ? prev.attrs : null} {...props} />
  else body = <code className="other-repr">{obj.repr}</code>

  const classes = ['heap-obj', `kind-${obj.kind}`]
  if (hovered === id) classes.push('is-hot')
  if (isNew) classes.push('is-new')
  else if (isChanged) classes.push('is-changed')
  return (
    <div className={classes.join(' ')} data-heap={id}>
      <div className="heap-label">
        {label(obj)}
        {obj.size !== undefined && obj.kind !== 'dict' && <span className="heap-size">len {obj.size}</span>}
      </div>
      {body}
    </div>
  )
}

export function HeapPanel({ step, prevStep, changed, hovered, onHover, structures, prevStructures, coveredBy, tags, onCloseView }) {
  const rows = layoutHeap(step, new Set(coveredBy.keys()))
  const prevByKey = new Map((prevStructures || []).map((s) => [s.key, s]))
  return (
    <div className="heap">
      <h2 className="column-title">Heap</h2>
      {structures.map((s) => (
        <StructureCard
          key={s.key}
          struct={s}
          prevStruct={prevByKey.get(s.key)}
          heap={step.heap}
          tags={tags}
          hovered={hovered}
          onClose={() => onCloseView(s.name)}
        />
      ))}
      {rows.length === 0 && structures.length === 0 && (
        <p className="heap-empty">Lists, dicts and objects appear here once a variable points at one.</p>
      )}
      {rows.map((row) => (
        <div className="heap-row" key={row[0]}>
          {row.map((id) => (
            <HeapObject
              key={id}
              id={id}
              obj={step.heap[id]}
              prev={prevStep?.heap[id]}
              isNew={prevStep && !prevStep.heap[id]}
              isChanged={changed.heap.has(id)}
              heap={step.heap}
              hovered={hovered}
              onHover={onHover}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
