import { compact } from '../../structures/common'
import type { ArrayData } from '../../structures/types'
import type { Heap } from '../../trace/types'
import { sameValue } from '../../trace/values'
import { PointerMarks } from './Tags'

const NONE: readonly string[] = []

export function ArrayView({ data, prevData, heap }: { data: ArrayData; prevData?: ArrayData; heap: Heap }) {
  const { items, pointers, offArray, window } = data
  const byIndex = new Map<number, string[]>()
  for (const [name, i] of pointers) {
    const names = byIndex.get(i)
    if (names) names.push(name)
    else byIndex.set(i, [name])
  }
  const pastEnd = byIndex.get(items.length)
  return (
    <div className="arr">
      <div className="arr-row">
        {items.map((v, i) => {
          const inWindow = window && i >= window.lo && i <= window.hi
          const changed = prevData && !sameValue(prevData.items[i], v)
          return (
            <div key={i} className={`arr-col${inWindow ? ' in-window' : ''}`}>
              <div className={`arr-cell${byIndex.has(i) ? ' is-pointed' : ''}${changed ? ' is-changed' : ''}`}>
                {compact(v, heap)}
              </div>
              <div className="arr-index">{i}</div>
              <PointerMarks names={byIndex.get(i) ?? NONE} />
            </div>
          )
        })}
        {pastEnd && (
          <div className="arr-col">
            <div className="arr-cell is-ghost">end</div>
            <div className="arr-index">{items.length}</div>
            <PointerMarks names={pastEnd} />
          </div>
        )}
        {items.length === 0 && <div className="struct-empty">empty</div>}
      </div>
      {(offArray.length > 0 || window) && (
        <p className="struct-note">
          {window && `Shaded: ${window.names[0]} to ${window.names[1]}. `}
          {offArray.length > 0 && `Outside the array: ${offArray.map(([n, v]) => `${n} = ${v}`).join(', ')}`}
        </p>
      )}
    </div>
  )
}
