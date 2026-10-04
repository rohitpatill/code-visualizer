import type { IndexMark, Tag } from '../../structures/types'

export function Tags({ tags }: { tags: readonly Tag[] | undefined }) {
  if (!tags?.length) return null
  return (
    <div className="tags">
      {tags.map((t) => (
        <span key={t.name} className={`tag${t.active ? ' is-active' : ''}`}>
          {t.name}
        </span>
      ))}
    </div>
  )
}

const MAX_SHOWN = 3

/** Index variables under a cell. Past three, the first two show and the rest fold into "+n", all named on hover. */
export function PointerMarks({ marks }: { marks: readonly IndexMark[] }) {
  const folded = marks.length > MAX_SHOWN
  const shown = folded ? marks.slice(0, MAX_SHOWN - 1) : marks
  return (
    <div className="arr-ptrs" title={folded ? marks.map((m) => m.name).join(', ') : undefined}>
      {shown.map((m) => (
        <span key={m.name} className={`ptr${m.active ? '' : ' is-paused'}`}>
          <span className="ptr-caret" aria-hidden="true">
            ▲
          </span>
          {m.name}
        </span>
      ))}
      {folded && <span className="ptr">+{marks.length - shown.length}</span>}
    </div>
  )
}

/** "i = -1, j = 7" for marks that land on no drawn cell. */
export const offText = (marks: readonly IndexMark[]): string => marks.map((m) => `${m.name} = ${m.index}`).join(', ')
