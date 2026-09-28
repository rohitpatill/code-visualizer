import { compact } from '../../structures/common'
import type { SequenceData } from '../../structures/types'
import type { Heap } from '../../trace/types'

export function StackView({ data, heap }: { data: SequenceData; heap: Heap }) {
  const items = [...data.items].reverse()
  return (
    <div className="stackview">
      {items.map((v, i) => (
        <div key={items.length - i} className={`stack-item${i === 0 ? ' is-top' : ''}`}>
          <span>{compact(v, heap)}</span>
          {i === 0 && <span className="stack-top">top</span>}
        </div>
      ))}
      {items.length === 0 && <div className="struct-empty">empty stack</div>}
      <div className="stack-base" />
    </div>
  )
}

export function QueueView({ data, heap }: { data: SequenceData; heap: Heap }) {
  return (
    <div className="queueview">
      <span className="q-end">front</span>
      <div className="q-items">
        {data.items.map((v, i) => (
          <div key={i} className={`q-item${i === 0 ? ' is-front' : ''}`}>
            {compact(v, heap)}
          </div>
        ))}
        {data.items.length === 0 && <div className="struct-empty">empty queue</div>}
      </div>
      <span className="q-end">back</span>
    </div>
  )
}
