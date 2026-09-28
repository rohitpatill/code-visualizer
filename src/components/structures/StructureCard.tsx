import { VIEW_LABELS } from '../../structures/common'
import type { Structure, Tag } from '../../structures/types'
import type { Heap } from '../../trace/types'
import { useIsHot } from '../memory/cover'
import { ArrayView } from './ArrayView'
import { GraphView } from './GraphView'
import { GridView } from './GridView'
import { LinkedListView } from './LinkedListView'
import { QueueView, StackView } from './SequenceViews'
import { HeapView, TreeView } from './TreeViews'

interface Props {
  struct: Structure
  prevStruct: Structure | undefined
  heap: Heap
  tags: ReadonlyMap<string, Tag[]>
  onClose: () => void
}

function StructureBody({ struct, prevStruct, heap, tags }: Omit<Props, 'onClose'>) {
  switch (struct.view) {
    case 'array':
      return <ArrayView data={struct.data} prevData={prevStruct?.view === 'array' ? prevStruct.data : undefined} heap={heap} />
    case 'grid':
      return <GridView data={struct.data} prevData={prevStruct?.view === 'grid' ? prevStruct.data : undefined} heap={heap} />
    case 'list':
      return <LinkedListView data={struct.data} tags={tags} />
    case 'tree':
      return <TreeView data={struct.data} tags={tags} />
    case 'graph':
      return <GraphView data={struct.data} />
    case 'heap':
      return <HeapView data={struct.data} heap={heap} />
    case 'stack':
      return <StackView data={struct.data} heap={heap} />
    case 'queue':
      return <QueueView data={struct.data} heap={heap} />
  }
}

export function StructureCard({ struct, prevStruct, heap, tags, onClose }: Props) {
  const hot = useIsHot(struct.rootId)
  const label = VIEW_LABELS[struct.view].toLowerCase()
  return (
    <section className={`struct${hot ? ' is-hot' : ''}`} data-heap={struct.rootId ?? undefined}>
      <header className="struct-head">
        <span>
          <code>{struct.name}</code> as {label}
          {struct.frameLabel && <span className="struct-frame"> in {struct.frameLabel}</span>}
        </span>
        <button
          className="struct-close"
          onClick={onClose}
          title="Back to the memory view for this variable"
          aria-label={`Stop showing ${struct.name} as ${label}`}
        >
          ×
        </button>
      </header>
      <StructureBody struct={struct} prevStruct={prevStruct} heap={heap} tags={tags} />
    </section>
  )
}
