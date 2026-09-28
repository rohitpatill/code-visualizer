import { compact } from '../../structures/common'
import type { HeapTreeData, Tag, TreeData } from '../../structures/types'
import type { Heap } from '../../trace/types'
import { useIsHot } from '../memory/cover'
import { Tags } from './Tags'
import { TreeLayout } from './TreeLayout'

function TreeNode({ id, label, tags }: { id: string; label: string; tags: readonly Tag[] | undefined }) {
  const hot = useIsHot(id)
  const current = tags?.some((t) => t.active)
  return (
    <>
      <Tags tags={tags} />
      <div className={`tnode${hot ? ' is-hot' : ''}${current ? ' is-current' : ''}`} data-heap={id} data-covered="1">
        {label}
      </div>
    </>
  )
}

export function TreeView({ data, tags }: { data: TreeData; tags: ReadonlyMap<string, Tag[]> }) {
  if (!data.nodes.length) return <div className="struct-empty">empty tree</div>
  return (
    <TreeLayout
      {...data}
      nodeKey={(n) => n.id}
      renderNode={(n) => <TreeNode id={n.id} label={n.label} tags={tags.get(n.id)} />}
    />
  )
}

export function HeapView({ data, heap }: { data: HeapTreeData; heap: Heap }) {
  const edges = data.nodes.slice(1).map((n) => ({ from: Math.floor((n.i - 1) / 2), to: n.i }))
  return (
    <div className="heapview">
      {data.nodes.length ? (
        <TreeLayout
          nodes={data.nodes}
          edges={edges}
          width={data.width}
          depth={data.depth}
          nodeKey={(n) => n.i}
          renderNode={(n) => (
            <div className={`tnode${n.i === 0 ? ' is-root' : ''}`} title={`index ${n.i}`}>
              {n.label}
            </div>
          )}
        />
      ) : (
        <div className="struct-empty">empty heap</div>
      )}
      <p className="struct-note">The parent of index i is at (i - 1) / 2, rounded down. Index 0 is always the smallest.</p>
      <div className="arr-row">
        {data.items.map((v, i) => (
          <div key={i} className="arr-col">
            <div className={`arr-cell${i === 0 ? ' is-pointed' : ''}`}>{compact(v, heap)}</div>
            <div className="arr-index">{i}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
