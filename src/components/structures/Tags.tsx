import type { Tag } from '../../structures/types'

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

export function PointerMarks({ names }: { names: readonly string[] }) {
  return (
    <div className="arr-ptrs">
      {names.map((n) => (
        <span key={n} className="ptr">
          <span className="ptr-caret">▲</span>
          {n}
        </span>
      ))}
    </div>
  )
}
