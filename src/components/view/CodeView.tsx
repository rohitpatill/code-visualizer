import { type Ref, memo, useEffect, useMemo, useRef } from 'react'
import type { Token } from '../../engines/types'

interface LineProps {
  n: number
  tokens: readonly Token[]
  isNext: boolean
  isPrev: boolean
  isError: boolean
  hasBreakpoint: boolean
  onToggleBreakpoint?: (line: number) => void
  lineRef?: Ref<HTMLLIElement>
}

const CodeLine = memo(function CodeLine({ n, tokens, isNext, isPrev, isError, hasBreakpoint, onToggleBreakpoint, lineRef }: LineProps) {
  const cls = ['code-line', isNext && 'is-next', isPrev && 'is-prev', isError && 'is-error'].filter(Boolean).join(' ')
  return (
    <li className={cls} ref={lineRef}>
      <span className="gutter">{isNext ? '▶' : isPrev ? '▷' : ''}</span>
      {onToggleBreakpoint ? (
        <button
          className={`lineno${hasBreakpoint ? ' has-bp' : ''}`}
          onClick={() => onToggleBreakpoint(n)}
          title={hasBreakpoint ? 'Remove breakpoint' : 'Set breakpoint'}
        >
          {n}
        </button>
      ) : (
        <span className="lineno">{n}</span>
      )}
      <code className="line-text">
        {tokens.map((tok, j) => (tok.cls ? <span key={j} className={tok.cls}>{tok.text}</span> : tok.text))}
        {tokens.length === 0 && ' '}
      </code>
    </li>
  )
})

interface Props {
  code: string
  highlight: (line: string) => Token[]
  nextLine: number | null
  prevLine?: number | null
  errorLine?: number | null
  breakpoints?: ReadonlySet<number>
  onToggleBreakpoint?: (line: number) => void
}

const NO_BREAKPOINTS: ReadonlySet<number> = new Set()

export function CodeView({ code, highlight, nextLine, prevLine, errorLine, breakpoints = NO_BREAKPOINTS, onToggleBreakpoint }: Props) {
  const lines = useMemo(() => code.replace(/\n$/, '').split('\n').map(highlight), [code, highlight])
  const activeRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [nextLine])

  return (
    <div className="codeview">
      <ol className="code-lines">
        {lines.map((tokens, i) => {
          const n = i + 1
          return (
            <CodeLine
              key={n}
              n={n}
              tokens={tokens}
              isNext={n === nextLine}
              isPrev={n === prevLine && n !== nextLine}
              isError={n === errorLine}
              hasBreakpoint={breakpoints.has(n)}
              onToggleBreakpoint={onToggleBreakpoint}
              lineRef={n === nextLine ? activeRef : undefined}
            />
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
