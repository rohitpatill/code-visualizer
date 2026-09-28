import { useStore } from '../../app/store'
import type { LinkedListData, Tag } from '../../structures/types'
import { useIsHot } from '../memory/cover'
import { Tags } from './Tags'

function ListNode({ id, label, tags }: { id: string; label: string; tags: readonly Tag[] | undefined }) {
  const hot = useIsHot(id)
  return (
    <div className="ll-node-wrap">
      <Tags tags={tags} />
      <div className={`ll-node${hot ? ' is-hot' : ''}`} data-heap={id} data-covered="1">
        <span className="ll-val">{label}</span>
        <span className="ll-next" />
      </div>
    </div>
  )
}

export function LinkedListView({ data, tags }: { data: LinkedListData; tags: ReadonlyMap<string, Tag[]> }) {
  const { nodes, cycleTo } = data
  const nullLiteral = useStore((s) => s.engine.copy.nullLiteral)
  return (
    <div className="ll">
      {nodes.map((n, i) => (
        <div key={n.id} className="ll-item">
          <ListNode id={n.id} label={n.label} tags={tags.get(n.id)} />
          <span className="ll-arrow">{i === nodes.length - 1 && cycleTo !== null ? '' : '→'}</span>
        </div>
      ))}
      {cycleTo !== null ? (
        <span className="ll-cycle">↩ back to node {cycleTo} (cycle)</span>
      ) : (
        <span className="ll-none">{nullLiteral}</span>
      )}
    </div>
  )
}
