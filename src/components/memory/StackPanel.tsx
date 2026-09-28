import { type CSSProperties, useMemo, useState } from 'react'
import { useStore } from '../../app/store'
import { type StepDiff, varKey } from '../../model/diff'
import { suggestContext } from '../../structures/suggest'
import type { ViewName } from '../../structures/types'
import type { Step } from '../../trace/types'
import { frameLabel, topFrame } from '../../trace/values'
import { Value } from './Value'
import { ViewControl } from './ViewControl'

const MAX_INDENT = 8

export function StackPanel({ step, changed }: { step: Step; changed: StepDiff }) {
  const [menu, setMenu] = useState<string | null>(null)
  const setView = useStore((s) => s.setView)
  const ctx = useMemo(() => suggestContext(step), [step])
  const activeId = topFrame(step)?.id

  return (
    <div className="stack">
      <h2 className="column-title">Stack</h2>
      {step.frames.map((frame, depth) => {
        const active = frame.id === activeId
        const returning = active && step.event === 'return' && !frame.global
        const fresh = active && step.event === 'call'
        return (
          <section
            key={frame.id}
            className={`frame${active ? ' is-active' : ''}${fresh ? ' is-fresh' : ''}`}
            style={{ '--depth': Math.min(depth, MAX_INDENT) } as CSSProperties}
          >
            <header className="frame-head">
              <span className="frame-name">{frameLabel(frame)}</span>
              {depth > 0 && <span className="frame-depth">depth {depth}</span>}
            </header>
            {frame.vars.length === 0 && !returning && <p className="frame-empty">No variables yet</p>}
            <table className="slots">
              <tbody>
                {frame.vars.map(([name, value]) => {
                  const key = varKey(frame.id, name)
                  const pick = (view: ViewName | null) => {
                    setView(name, view)
                    setMenu(null)
                  }
                  return (
                    <tr key={name} className={changed.vars.has(key) ? 'is-changed' : ''}>
                      <th scope="row">{name}</th>
                      <td>
                        <div className="slot-value">
                          <Value value={value} heap={step.heap} />
                          <ViewControl
                            name={name}
                            value={value}
                            ctx={ctx}
                            open={menu === key}
                            onToggle={() => setMenu(menu === key ? null : key)}
                            onPick={pick}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {returning && step.ret && (
                  <tr className="return-row">
                    <th scope="row">returns</th>
                    <td>
                      <Value value={step.ret} heap={step.heap} />
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
