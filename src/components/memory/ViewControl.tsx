import { useStore } from '../../app/store'
import { VIEW_LABELS } from '../../structures/common'
import { type SuggestContext, suggestView, viewsFor } from '../../structures/suggest'
import type { ViewName } from '../../structures/types'
import type { Value } from '../../trace/types'

interface Props {
  name: string
  value: Value
  ctx: SuggestContext
  open: boolean
  onToggle: () => void
  onPick: (view: ViewName | null) => void
}

export function ViewControl({ name, value, ctx, open, onToggle, onPick }: Props) {
  const current = useStore((s) => s.views[name])
  const options = viewsFor(value, ctx.heap)
  if (!options.length) return null
  const suggestion = current ? null : suggestView(name, value, ctx)
  return (
    <>
      {current ? (
        <button className="view-pill is-on" onClick={onToggle} title="Change how this variable is drawn">
          {VIEW_LABELS[current].toLowerCase()}
        </button>
      ) : suggestion ? (
        <button
          className="view-pill is-suggest"
          onClick={() => onPick(suggestion)}
          title={`Draw ${name} as a ${VIEW_LABELS[suggestion].toLowerCase()}`}
        >
          show as {VIEW_LABELS[suggestion].toLowerCase()}
        </button>
      ) : null}
      <button className="view-more" onClick={onToggle} aria-expanded={open} title={`Choose how to draw ${name}`}>
        ⋯
      </button>
      {open && (
        <div className="view-menu" role="menu">
          <button className={`chip${current ? '' : ' is-on'}`} onClick={() => onPick(null)}>
            Memory
          </button>
          {options.map((v) => (
            <button key={v} className={`chip${current === v ? ' is-on' : ''}`} onClick={() => onPick(v)}>
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
