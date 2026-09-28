import { VIEW_LABELS, compact } from '../structures.js'

const NODE = 38 // tree / graph node diameter
const GAP_X = 50
const GAP_Y = 70

function Tags({ tags }) {
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

function ArrayView({ data, heap, prevData }) {
  const { items, pointers, offArray, window, isString } = data
  const byIndex = new Map()
  pointers.forEach(([name, i]) => byIndex.set(i, [...(byIndex.get(i) || []), name]))
  const showGhost = pointers.some(([, i]) => i === items.length)
  return (
    <div className="arr">
      <div className="arr-row">
        {items.map((v, i) => {
          const inWindow = window && i >= window.lo && i <= window.hi
          const changed = prevData && JSON.stringify(prevData.items[i]) !== JSON.stringify(v)
          return (
            <div key={i} className={`arr-col${inWindow ? ' in-window' : ''}`}>
              <div className={`arr-cell${byIndex.has(i) ? ' is-pointed' : ''}${changed ? ' is-changed' : ''}`}>
                {isString ? v.v : compact(v, heap)}
              </div>
              <div className="arr-index">{i}</div>
              <div className="arr-ptrs">
                {(byIndex.get(i) || []).map((n) => (
                  <span key={n} className="ptr">
                    <span className="ptr-caret">▲</span>
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
        {showGhost && (
          <div className="arr-col">
            <div className="arr-cell is-ghost">end</div>
            <div className="arr-index">{items.length}</div>
            <div className="arr-ptrs">
              {byIndex.get(items.length).map((n) => (
                <span key={n} className="ptr">
                  <span className="ptr-caret">▲</span>
                  {n}
                </span>
              ))}
            </div>
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

function GridView({ data, heap, prevData }) {
  const { rows, marks } = data
  const cols = Math.max(0, ...rows.map((r) => r.length))
  const markAt = (r, c) => marks.filter((m) => m.r === r && m.c === c)
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
              <th>{r}</th>
              {row.map((v, c) => {
                const m = markAt(r, c)
                const before = prevData?.rows[r]?.[c]
                const changed = prevData && JSON.stringify(before) !== JSON.stringify(v)
                return (
                  <td key={c} className={`${m.length ? 'is-pointed' : ''}${changed ? ' is-changed' : ''}`} title={m.map((x) => x.label).join(' ')}>
                    {compact(v, heap)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {marks.length > 0 && <p className="struct-note">Highlighted: {marks.map((m) => `[${m.label}] = [${m.r}][${m.c}]`).join(', ')}</p>}
    </div>
  )
}

function LinkedListView({ data, tags, hovered }) {
  const { nodes, cycleTo } = data
  return (
    <div className="ll">
      {nodes.map((n, i) => (
        <div key={n.id} className="ll-item">
          <div className="ll-node-wrap">
            <Tags tags={tags.get(n.id)} />
            <div className={`ll-node${hovered === n.id ? ' is-hot' : ''}`} data-heap={n.id} data-covered="1">
              <span className="ll-val">{n.label}</span>
              <span className="ll-next" />
            </div>
          </div>
          <span className="ll-arrow">{i === nodes.length - 1 && cycleTo !== null ? '' : '→'}</span>
        </div>
      ))}
      {cycleTo !== null ? (
        <span className="ll-cycle">↩ back to node {cycleTo} (cycle)</span>
      ) : (
        <span className="ll-none">None</span>
      )}
    </div>
  )
}

function TreeLayout({ nodes, edges, width, depth, renderNode, nodeKey }) {
  const w = Math.max(1, width) * GAP_X
  const h = (depth + 1) * GAP_Y
  const pos = new Map(nodes.map((n) => [nodeKey(n), { x: n.x * GAP_X + GAP_X / 2, y: n.depth * GAP_Y + NODE / 2 + 18 }]))
  return (
    <div className="tree" style={{ width: w, height: h }}>
      <svg width={w} height={h} className="tree-edges">
        {edges.map((e, i) => {
          const a = pos.get(e.from)
          const b = pos.get(e.to)
          if (!a || !b) return null
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        })}
      </svg>
      {nodes.map((n) => {
        const p = pos.get(nodeKey(n))
        return (
          <div key={nodeKey(n)} className="tree-node-wrap" style={{ left: p.x, top: p.y }}>
            {renderNode(n)}
          </div>
        )
      })}
    </div>
  )
}

function TreeView({ data, tags, hovered }) {
  if (!data.nodes.length) return <div className="struct-empty">empty tree</div>
  return (
    <TreeLayout
      {...data}
      nodeKey={(n) => n.id}
      renderNode={(n) => (
        <>
          <Tags tags={tags.get(n.id)} />
          <div className={`tnode${hovered === n.id ? ' is-hot' : ''}${tags.get(n.id)?.some((t) => t.active) ? ' is-current' : ''}`} data-heap={n.id} data-covered="1">
            {n.label}
          </div>
        </>
      )}
    />
  )
}

function HeapView({ data, heap }) {
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
      <p className="struct-note">Parent of index i is (i - 1) // 2. Index 0 is always the smallest.</p>
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

function GraphView({ data }) {
  const { keys, edges, undirected, visited, frontier, current } = data
  if (!keys.length) return <div className="struct-empty">empty graph</div>
  const n = keys.length
  const radius = Math.max(70, n * 16)
  const size = radius * 2 + 80
  const pos = new Map(
    keys.map((k, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2
      return [k, { x: size / 2 + radius * Math.cos(a), y: size / 2 + radius * Math.sin(a) }]
    }),
  )
  const shorten = (a, b, by) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    return { x: b.x - (dx / len) * by, y: b.y - (dy / len) * by }
  }
  return (
    <div className="graph-wrap">
      <div className="graph" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <defs>
            <marker id="g-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" className="g-head" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const a = pos.get(e.from)
            const b = pos.get(e.to)
            if (!a || !b) return null
            const end = undirected ? b : shorten(a, b, NODE / 2 + 2)
            return (
              <g key={i}>
                <line x1={a.x} y1={a.y} x2={end.x} y2={end.y} className="g-edge" markerEnd={undirected ? undefined : 'url(#g-head)'} />
                {e.weight !== null && (
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} className="g-weight">
                    {e.weight}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        {keys.map((k) => {
          const p = pos.get(k)
          const cls = ['gnode', visited.has(k) && 'is-visited', frontier.has(k) && 'is-frontier', current.has(k) && 'is-current']
          return (
            <div key={k} className="tree-node-wrap" style={{ left: p.x, top: p.y }}>
              {current.has(k) && <Tags tags={current.get(k).map((name) => ({ name, active: true }))} />}
              <div className={cls.filter(Boolean).join(' ')}>{k.replace(/^'|'$/g, '')}</div>
            </div>
          )
        })}
      </div>
      <div className="legend">
        <span>
          <i className="sw sw-current" /> current
        </span>
        <span>
          <i className="sw sw-frontier" /> waiting (queue / stack)
        </span>
        <span>
          <i className="sw sw-visited" /> visited
        </span>
      </div>
    </div>
  )
}

function StackView({ data, heap }) {
  const items = [...data.items].reverse()
  return (
    <div className="stackview">
      {items.map((v, i) => (
        <div key={i} className={`stack-item${i === 0 ? ' is-top' : ''}`}>
          <span>{compact(v, heap)}</span>
          {i === 0 && <span className="stack-top">top</span>}
        </div>
      ))}
      {items.length === 0 && <div className="struct-empty">empty stack</div>}
      <div className="stack-base" />
    </div>
  )
}

function QueueView({ data, heap }) {
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

const VIEWS = {
  array: ArrayView,
  grid: GridView,
  list: LinkedListView,
  tree: TreeView,
  graph: GraphView,
  stack: StackView,
  queue: QueueView,
  heap: HeapView,
}

export function StructureCard({ struct, prevStruct, heap, tags, hovered, onClose }) {
  const View = VIEWS[struct.view]
  return (
    <section className={`struct${hovered && hovered === struct.rootId ? ' is-hot' : ''}`} data-heap={struct.rootId ?? undefined}>
      <header className="struct-head">
        <span>
          <code>{struct.name}</code> as {VIEW_LABELS[struct.view].toLowerCase()}
          {struct.frameName !== 'Globals' && <span className="struct-frame"> in {struct.frameName}()</span>}
        </span>
        <button className="struct-close" onClick={onClose} title="Back to the memory view for this variable" aria-label={`Stop showing ${struct.name} as ${struct.view}`}>
          ×
        </button>
      </header>
      <View data={struct.data} prevData={prevStruct?.data} heap={heap} tags={tags} hovered={hovered} />
    </section>
  )
}
