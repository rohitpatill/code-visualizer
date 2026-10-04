import { compact } from '../../structures/common'
import { placeMarks } from '../../structures/indexMarks'
import type { ArrayData, IndexMark } from '../../structures/types'
import type { Heap } from '../../trace/types'
import { sameValue } from '../../trace/values'
import { offText, PointerMarks } from './Tags'

const NONE: readonly IndexMark[] = []

export function ArrayView({ data, prevData, heap }: { data: ArrayData; prevData?: ArrayData; heap: Heap }) {
  const { items, pointers, offArray, window } = data
  const { at, end } = placeMarks(pointers, items.length, items.length)
  return (
    <div className="arr">
      <div className="arr-row">
        {items.map((v, i) => {
          const inWindow = window && i >= window.lo && i <= window.hi
          const changed = prevData && !sameValue(prevData.items[i], v)
          return (
            <div key={i} className={`arr-col${inWindow ? ' in-window' : ''}`}>
              <div className={`arr-cell${at.has(i) ? ' is-pointed' : ''}${changed ? ' is-changed' : ''}`}>
                {compact(v, heap)}
              </div>
              <div className="arr-index">{i}</div>
              <PointerMarks marks={at.get(i) ?? NONE} />
            </div>
          )
        })}
        {end.length > 0 && (
          <div className="arr-col">
            <div className="arr-cell is-ghost">end</div>
            <div className="arr-index">{items.length}</div>
            <PointerMarks marks={end} />
          </div>
        )}
        {items.length === 0 && <div className="struct-empty">empty</div>}
      </div>
      {(offArray.length > 0 || window) && (
        <p className="struct-note">
          {window && `Shaded: ${window.names[0]} to ${window.names[1]}. `}
          {offArray.length > 0 && `Not on a cell: ${offText(offArray)}`}
        </p>
      )}
    </div>
  )
}
