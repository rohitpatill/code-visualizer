import { useState } from 'react'
import { Value } from './Value.jsx'
import { VIEW_LABELS, suggestView, viewsFor } from '../structures.js'

function ViewControl({ name, value, step, views, onSetView, open, onToggle }) {
  const options = viewsFor(value, step.heap)
  if (!options.length) return null
  const current = views[name]
  const suggestion = !current ? suggestView(name, value, step) : null
  return (
    <>
      {current ? (
        <button className="view-pill is-on" onClick={onToggle} title="Change how this variable is drawn">
          {VIEW_LABELS[current].toLowerCase()}
        </button>
      ) : suggestion ? (
        <button className="view-pill is-suggest" onClick={() => onSetView(name, suggestion)} title={`Draw ${name} as a ${VIEW_LABELS[suggestion].toLowerCase()}`}>
          show as {VIEW_LABELS[suggestion].toLowerCase()}
        </button>
      ) : null}
      <button className="view-more" onClick={onToggle} aria-expanded={open} title={`Choose how to draw ${name}`}>
        ⋯
      </button>
      {open && (
        <div className="view-menu" role="menu">
          <button className={`chip${!current ? ' is-on' : ''}`} onClick={() => onSetView(name, null)}>
            Memory
          </button>
          {options.map((v) => (
            <button key={v} className={`chip${current === v ? ' is-on' : ''}`} onClick={() => onSetView(name, v)}>
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export function StackPanel({ step, changed, hovered, onHover, views, onSetView }) {
  const [menu, setMenu] = useState(null)
  const activeId = step.frames[step.frames.length - 1]?.id
  const setView = (name, view) => {
    onSetView(name, view)
    setMenu(null)
  }
  return (
    <div className="stack">
      <h2 className="column-title">Stack</h2>
      {step.frames.map((frame, depth) => {
        const active = frame.id === activeId
        const returning = active && step.event === 'return' && frame.name !== 'Globals'
        const fresh = active && step.event === 'call'
        return (
          <section
            key={frame.id}
            className={`frame${active ? ' is-active' : ''}${fresh ? ' is-fresh' : ''}`}
            style={{ '--depth': Math.min(depth, 8) }}
          >
            <header className="frame-head">
              <span className="frame-name">{frame.name === 'Globals' ? 'Globals' : `${frame.name}()`}</span>
              {depth > 0 && <span className="frame-depth">depth {depth}</span>}
            </header>
            {frame.vars.length === 0 && !returning && <p className="frame-empty">No variables yet</p>}
            <table className="slots">
              <tbody>
                {frame.vars.map(([name, value]) => {
                  const key = `${frame.id}:${name}`
                  return (
                    <tr key={name} className={changed.vars.has(key) ? 'is-changed' : ''}>
                      <th scope="row">{name}</th>
                      <td>
                        <div className="slot-value">
                          <Value value={value} heap={step.heap} hovered={hovered} onHover={onHover} />
                          <ViewControl
                            name={name}
                            value={value}
                            step={step}
                            views={views}
                            onSetView={setView}
                            open={menu === key}
                            onToggle={() => setMenu(menu === key ? null : key)}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {returning && (
                  <tr className="return-row">
                    <th scope="row">returns</th>
                    <td>
                      <Value value={step.ret} heap={step.heap} hovered={hovered} onHover={onHover} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}
