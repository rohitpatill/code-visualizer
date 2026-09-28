import { useEffect, useRef } from 'react'
import { highlightLine } from '../lib.js'

export function CodeView({ code, nextLine, prevLine, errorLine, breakpoints = new Set(), onToggleBreakpoint }) {
  const lines = code.replace(/\n$/, '').split('\n')
  const activeRef = useRef(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [nextLine])

  return (
    <div className="codeview">
      <ol className="code-lines">
        {lines.map((line, i) => {
          const n = i + 1
          const isNext = n === nextLine
          const isPrev = n === prevLine && !isNext
          const isError = n === errorLine
          const cls = ['code-line', isNext && 'is-next', isPrev && 'is-prev', isError && 'is-error'].filter(Boolean).join(' ')
          return (
            <li key={i} className={cls} ref={isNext ? activeRef : null}>
              <span className="gutter">{isNext ? '▶' : isPrev ? '▷' : ''}</span>
              {onToggleBreakpoint ? (
                <button
                  className={`lineno${breakpoints.has(n) ? ' has-bp' : ''}`}
                  onClick={() => onToggleBreakpoint(n)}
                  title={breakpoints.has(n) ? 'Remove breakpoint' : 'Set breakpoint'}
                >
                  {n}
                </button>
              ) : (
                <span className="lineno">{n}</span>
              )}
              <code className="line-text">
                {highlightLine(line).map((tok, j) =>
                  tok.cls ? (
                    <span key={j} className={tok.cls}>
                      {tok.text}
                    </span>
                  ) : (
                    tok.text
                  ),
                )}
                {line === '' && ' '}
              </code>
            </li>
          )
        })}
      </ol>
      <div className="code-legend">
        <span>
          <span className="legend-next">▶</span> runs next
        </span>
        <span>
          <span className="legend-prev">▷</span> just ran
        </span>
        {onToggleBreakpoint && (
          <span>
            <span className="legend-bp">●</span> click a line number for a breakpoint
          </span>
        )}
      </div>
    </div>
  )
}
