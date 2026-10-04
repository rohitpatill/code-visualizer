import { compact } from '../../structures/common'
import type { GridData } from '../../structures/types'
import type { Heap } from '../../trace/types'
import { sameValue } from '../../trace/values'

export function GridView({ data, prevData, heap }: { data: GridData; prevData?: GridData; heap: Heap }) {
  const { rows, marks, rowMarks } = data
  const cols = rows.reduce((max, r) => Math.max(max, r.length), 0)
  const marksAt = new Map<string, string[]>()
  for (const m of marks) {
    const key = `${m.r},${m.c}`
    marksAt.set(key, [...(marksAt.get(key) ?? []), m.label])
  }
  return (
    <div className="grid-wrap">
      <table className="grid">
        <thead>
          <tr>
            <th />
            {Array.from({ length: cols }, (_, c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              <th className={rowMarks.has(r) ? 'is-pointed' : undefined} title={rowMarks.get(r)?.join(', ')}>
                {r}
                {rowMarks.has(r) && <span className="row-ptrs"> ◂ {rowMarks.get(r)!.join(', ')}</span>}
              </th>
              {row.map((v, c) => {
                const labels = marksAt.get(`${r},${c}`)
                const changed = prevData && !sameValue(prevData.rows[r]?.[c], v)
                return (
                  <td
                    key={c}
                    className={`${labels ? 'is-pointed' : ''}${changed ? ' is-changed' : ''}`}
                    title={labels?.join(' ')}
                  >
                    {compact(v, heap)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {marks.length > 0 && (
        <p className="struct-note">Highlighted: {marks.map((m) => `[${m.label}] = [${m.r}][${m.c}]`).join(', ')}</p>
      )}
    </div>
  )
}
