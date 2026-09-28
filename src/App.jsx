import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { EditorView } from '@codemirror/view'
import { usePython } from './usePython.js'
import { samples } from './samples.js'
import { describeStep, diffSteps } from './lib.js'
import { buildStructures, buildTags } from './structures.js'
import { CodeView } from './components/CodeView.jsx'
import { StackPanel } from './components/StackPanel.jsx'
import { HeapPanel } from './components/HeapPanel.jsx'
import { Arrows } from './components/Arrows.jsx'
import { Timeline } from './components/Timeline.jsx'
import { CallTree, buildCallTree } from './components/CallTree.jsx'
import { Guide } from './components/Guide.jsx'
import { CoverContext } from './components/Value.jsx'

const STORE = {
  code: 'stepthrough-code',
  call: 'stepthrough-call',
  views: 'stepthrough-views',
  seenGuide: 'stepthrough-seen-guide',
}
const SPEEDS = [
  { label: 'Slow', ms: 1200 },
  { label: 'Normal', ms: 600 },
  { label: 'Fast', ms: 200 },
]

const editorTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', height: '100%' },
    '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--muted)' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgba(245, 184, 74, 0.07)' },
    '.cm-content': { fontFamily: 'var(--mono)', fontSize: '14px' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.7' },
  },
  { dark: true },
)

const readJSON = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

// Accept 5 for 5, hello or 'hello' for 'hello', [1,2] for [1, 2].
function sameAnswer(input, repr, kind) {
  const norm = (s) => s.trim().replace(/\s+/g, '').replace(/"/g, "'")
  if (norm(input) === norm(repr)) return true
  return kind === 'str' && input.trim() === repr.slice(1, -1)
}

// The first plain value that changes in the running frame when this step runs.
function questionFor(cur, next) {
  if (!cur || !next || next.frames.length !== cur.frames.length) return null
  const frame = next.frames[next.frames.length - 1]
  const before = new Map(cur.frames[cur.frames.length - 1].vars.map(([k, v]) => [k, JSON.stringify(v)]))
  for (const [name, v] of frame.vars) {
    if (v.t === 'p' && before.get(name) !== JSON.stringify(v)) return { name, answer: v.v, kind: v.k }
  }
  return null
}

export default function App() {
  const { status, loadError, run } = usePython()
  const [code, setCode] = useState(() => localStorage.getItem(STORE.code) || samples[2].code)
  const [call, setCall] = useState(() => localStorage.getItem(STORE.call) || '')
  const [views, setViews] = useState(() => readJSON(STORE.views, {}))
  const [stdin, setStdin] = useState('')
  const [showStdin, setShowStdin] = useState(false)
  const [trace, setTrace] = useState(null)
  const [tracedCode, setTracedCode] = useState('')
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [hovered, setHovered] = useState(null)
  const [tab, setTab] = useState('memory')
  const [breakpoints, setBreakpoints] = useState(new Set())
  const [guessMode, setGuessMode] = useState(false)
  const [quiz, setQuiz] = useState(null)
  const [score, setScore] = useState({ right: 0, total: 0 })
  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem(STORE.seenGuide))
  const memoryRef = useRef(null)

  const viewing = trace !== null
  const steps = trace?.steps ?? []
  const step = steps[index]
  const prevStep = index > 0 ? steps[index - 1] : null
  const last = steps.length - 1

  useEffect(() => localStorage.setItem(STORE.code, code), [code])
  useEffect(() => localStorage.setItem(STORE.call, call), [call])
  useEffect(() => localStorage.setItem(STORE.views, JSON.stringify(views)), [views])

  const closeGuide = useCallback(() => {
    setShowGuide(false)
    localStorage.setItem(STORE.seenGuide, '1')
  }, [])

  const visualize = async () => {
    const full = call.trim() ? `${code.replace(/\s+$/, '')}\n\n${call.trim()}\n` : code
    const result = await run(full, stdin)
    setTracedCode(full)
    setTrace(result)
    setIndex(0)
    setPlaying(false)
    setQuiz(null)
    setScore({ right: 0, total: 0 })
    setTab('memory')
  }

  const loadSample = (sample) => {
    setCode(sample.code)
    setCall(sample.call || '')
    setViews(sample.views || {})
    setBreakpoints(new Set())
  }

  const setView = useCallback((name, view) => {
    setViews((v) => {
      const next = { ...v }
      if (view) next[name] = view
      else delete next[name]
      return next
    })
  }, [])

  const go = useCallback(
    (i) => {
      setQuiz(null)
      setIndex(Math.max(0, Math.min(last, i)))
    },
    [last],
  )

  const findStep = useCallback(
    (test) => {
      for (let j = index + 1; j <= last; j++) if (test(steps[j])) return j
      return last
    },
    [index, last, steps],
  )

  const depth = step?.frames.length ?? 0
  const stepOver = () => go(findStep((s) => s.frames.length <= depth))
  const stepOut = () => go(findStep((s) => s.frames.length < depth))
  const nextBreakpoint = () => go(findStep((s) => s.event === 'line' && breakpoints.has(s.line)))

  // Next, with a prediction first when guess mode is on.
  const next = useCallback(() => {
    if (index >= last) return
    if (!guessMode) return go(index + 1)
    if (quiz?.result) return go(index + 1)
    if (quiz) return
    const q = questionFor(steps[index], steps[index + 1])
    if (q) setQuiz({ ...q, input: '', result: null })
    else go(index + 1)
  }, [guessMode, quiz, index, last, steps, go])

  const checkGuess = () => {
    const right = sameAnswer(quiz.input, quiz.answer, quiz.kind)
    setQuiz({ ...quiz, result: right ? 'right' : 'wrong' })
    setScore((s) => ({ right: s.right + (right ? 1 : 0), total: s.total + 1 }))
  }

  useEffect(() => {
    if (!playing) return
    if (index >= last) {
      setPlaying(false)
      return
    }
    const t = setTimeout(() => {
      const upcoming = steps[index + 1]
      setIndex(index + 1)
      if (upcoming.event === 'line' && breakpoints.has(upcoming.line)) setPlaying(false)
    }, SPEEDS[speed].ms)
    return () => clearTimeout(t)
  }, [playing, index, last, speed, steps, breakpoints])

  useEffect(() => {
    if (!viewing || showGuide) return
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select, .cm-editor')) return
      if (e.key === 'ArrowRight' && e.shiftKey) stepOver()
      else if (e.key === 'ArrowUp' && e.shiftKey) stepOut()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') go(index - 1)
      else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(last)
      else if (e.key === ' ') setPlaying((p) => !p)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const changed = useMemo(() => diffSteps(prevStep, step), [prevStep, step])
  const built = useMemo(() => (step ? buildStructures(step, views) : { structures: [], coveredBy: new Map() }), [step, views])
  const prevBuilt = useMemo(() => (prevStep ? buildStructures(prevStep, views) : null), [prevStep, views])
  const tags = useMemo(() => (step ? buildTags(step) : new Map()), [step])
  const cover = useMemo(
    () => ({ coveredBy: built.coveredBy, roots: new Set(built.structures.map((s) => s.rootId).filter(Boolean)) }),
    [built],
  )
  const callTree = useMemo(() => buildCallTree(steps), [steps])

  const description = describeStep(step)
  const atEnd = index === last
  const errorLine = trace?.error && atEnd ? trace.error.line : null
  const stdout = step?.stdout ?? ''
  const prevStdout = prevStep?.stdout ?? ''
  const newOutput = stdout.startsWith(prevStdout) ? stdout.slice(prevStdout.length) : ''
  const toggleBreakpoint = (n) =>
    setBreakpoints((b) => {
      const nb = new Set(b)
      nb.has(n) ? nb.delete(n) : nb.add(n)
      return nb
    })

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">Stepthrough</h1>
        <div className="topbar-actions">
          {!viewing && (
            <select
              className="sample-picker"
              value=""
              onChange={(e) => {
                const sample = samples[Number(e.target.value)]
                if (sample) loadSample(sample)
              }}
              aria-label="Load an example"
            >
              <option value="">Load an example</option>
              {[...new Set(samples.map((s) => s.group))].map((g) => (
                <optgroup key={g} label={g}>
                  {samples.map((s, i) =>
                    s.group === g ? (
                      <option key={s.name} value={i}>
                        {s.name}
                      </option>
                    ) : null,
                  )}
                </optgroup>
              ))}
            </select>
          )}
          <button className="btn" onClick={() => setShowGuide(true)}>
            How to use
          </button>
          {viewing ? (
            <button className="btn" onClick={() => setTrace(null)}>
              Edit code
            </button>
          ) : (
            <button className="btn btn-primary" onClick={visualize} disabled={status !== 'ready'}>
              {status === 'loading' ? 'Loading Python…' : status === 'running' ? 'Running…' : 'Visualize'}
            </button>
          )}
        </div>
      </header>

      {status === 'failed' && (
        <p className="banner banner-error">Python could not load: {loadError}. Check your internet connection and reload.</p>
      )}

      {!viewing && (
        <main className="edit-layout">
          <div className="editor-wrap">
            <CodeMirror
              value={code}
              onChange={setCode}
              extensions={[python(), editorTheme]}
              theme="dark"
              height="100%"
              autoFocus
              basicSetup={{ foldGutter: false }}
            />
          </div>
          <aside className="edit-side">
            <p className="hint">Paste one Python file and press Visualize. Every line, call and return becomes a step.</p>
            <label className="field">
              <span className="field-label">Code that calls your solution (optional)</span>
              <textarea
                className="stdin"
                value={call}
                onChange={(e) => setCall(e.target.value)}
                placeholder={'result = Solution().maxDepth(build_tree([3, 9, 20]))'}
                rows={3}
                spellCheck={false}
              />
              <span className="hint-small">
                For LeetCode code that only defines a class. It runs after your code. build_list and build_tree are
                built in.
              </span>
            </label>
            <button className="link-btn" onClick={() => setShowStdin((s) => !s)} aria-expanded={showStdin}>
              {showStdin ? 'Hide input lines' : 'Add lines for input()'}
            </button>
            {showStdin && (
              <textarea
                className="stdin"
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                placeholder="One line per input() call"
                rows={4}
              />
            )}
            <p className="hint-small">Runs in your browser. Stops after 3000 steps so infinite loops can't hang the page.</p>
          </aside>
        </main>
      )}

      {viewing && steps.length === 0 && (
        <main className="empty-run">
          <p className="banner banner-error">
            {trace.error ? trace.error.message : 'Nothing ran.'}
            {trace.error?.line ? ` (line ${trace.error.line})` : ''}
          </p>
          <CodeView code={tracedCode} nextLine={null} prevLine={null} errorLine={trace.error?.line} />
        </main>
      )}

      {viewing && step && (
        <main className="view-layout">
          <section className="code-pane">
            <CodeView
              code={tracedCode}
              nextLine={step.event === 'return' && step.func === '<module>' ? null : step.line}
              prevLine={prevStep?.line}
              errorLine={errorLine}
              breakpoints={breakpoints}
              onToggleBreakpoint={toggleBreakpoint}
            />
            <div className="output">
              <h2 className="pane-title">Output</h2>
              <pre>
                {stdout.slice(0, stdout.length - newOutput.length)}
                <mark>{newOutput}</mark>
                {!stdout && <span className="output-empty">Nothing printed yet</span>}
              </pre>
            </div>
          </section>

          <section className="memory-pane">
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'memory'} className={`tab${tab === 'memory' ? ' is-on' : ''}`} onClick={() => setTab('memory')}>
                Memory
              </button>
              <button
                role="tab"
                aria-selected={tab === 'calls'}
                className={`tab${tab === 'calls' ? ' is-on' : ''}`}
                onClick={() => setTab('calls')}
                disabled={callTree.callCount === 0}
                title={callTree.callCount === 0 ? 'This code makes no function calls' : 'Every function call as a tree'}
              >
                Call tree {callTree.callCount > 0 && <span className="tab-count">{callTree.callCount}</span>}
              </button>
            </div>
            <div className="memory">
              {tab === 'memory' ? (
                <CoverContext.Provider value={cover}>
                  <div className="memory-inner" ref={memoryRef}>
                    <StackPanel step={step} changed={changed} hovered={hovered} onHover={setHovered} views={views} onSetView={setView} />
                    <HeapPanel
                      step={step}
                      prevStep={prevStep}
                      changed={changed}
                      hovered={hovered}
                      onHover={setHovered}
                      structures={built.structures}
                      prevStructures={prevBuilt?.structures}
                      coveredBy={built.coveredBy}
                      tags={tags}
                      onCloseView={(name) => setView(name, null)}
                    />
                    <Arrows containerRef={memoryRef} deps={[index, trace, views]} hovered={hovered} />
                  </div>
                </CoverContext.Provider>
              ) : (
                <CallTree tree={callTree} index={index} activeFrameId={step.frames[step.frames.length - 1]?.id} onSeek={go} />
              )}
            </div>
          </section>

          <footer className="controls">
            {quiz ? (
              <form
                className={`narration quiz${quiz.result ? ` is-${quiz.result}` : ''}`}
                onSubmit={(e) => {
                  e.preventDefault()
                  quiz.result ? next() : checkGuess()
                }}
              >
                <strong>
                  Line {step.line} runs next. What will <code>{quiz.name}</code> be?
                </strong>
                {quiz.result ? (
                  <span className="quiz-result">
                    {quiz.result === 'right' ? 'Right: ' : 'Not quite. It becomes '}
                    <code>{quiz.answer}</code>
                  </span>
                ) : (
                  <input
                    className="quiz-input"
                    value={quiz.input}
                    onChange={(e) => setQuiz({ ...quiz, input: e.target.value })}
                    autoFocus
                    aria-label={`Your guess for ${quiz.name}`}
                    spellCheck={false}
                  />
                )}
                <button className="btn btn-primary" type="submit">
                  {quiz.result ? 'Continue' : 'Check'}
                </button>
                {!quiz.result && (
                  <button type="button" className="link-btn" onClick={() => go(index + 1)}>
                    Skip
                  </button>
                )}
              </form>
            ) : (
              <div className={`narration event-${step.event}`} aria-live="polite">
                <strong>{description.title}</strong>
                <span>{description.detail}</span>
              </div>
            )}
            <Timeline steps={steps} index={index} onSeek={go} />
            <div className="transport">
              <div className="buttons">
                <button className="btn icon" onClick={() => go(0)} disabled={index === 0} aria-label="First step" title="First step (Home)">
                  ⏮
                </button>
                <button className="btn icon" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Back" title="Back (←)">
                  ◀
                </button>
                <button
                  className="btn btn-primary play"
                  onClick={() => (atEnd ? (go(0), setPlaying(true)) : setPlaying((p) => !p))}
                  title="Play or pause (Space)"
                >
                  {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
                </button>
                <button className="btn icon" onClick={next} disabled={atEnd} aria-label="Next" title="Next (→)">
                  ▶
                </button>
                <button className="btn icon" onClick={() => go(last)} disabled={atEnd} aria-label="Last step" title="Last step (End)">
                  ⏭
                </button>
              </div>
              <div className="buttons">
                <button className="btn" onClick={stepOver} disabled={atEnd} title="Run until the next line at this depth, skipping calls (Shift + →)">
                  Step over
                </button>
                <button className="btn" onClick={stepOut} disabled={atEnd || depth <= 1} title="Run until the current function returns (Shift + ↑)">
                  Step out
                </button>
                {breakpoints.size > 0 && (
                  <button className="btn" onClick={nextBreakpoint} disabled={atEnd}>
                    Next breakpoint
                  </button>
                )}
              </div>
              <span className="counter">
                Step {index + 1} of {steps.length}
              </span>
              <div className="speed">
                <button
                  className={`chip${guessMode ? ' is-on' : ''}`}
                  onClick={() => {
                    setGuessMode((g) => !g)
                    setQuiz(null)
                  }}
                  aria-pressed={guessMode}
                  title="Predict each change before it happens"
                >
                  Guess mode{guessMode && score.total > 0 ? `: ${score.right}/${score.total}` : ''}
                </button>
                <span className="speed-sep" />
                {SPEEDS.map((s, i) => (
                  <button key={s.label} className={`chip${speed === i ? ' is-on' : ''}`} onClick={() => setSpeed(i)} aria-pressed={speed === i}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            {atEnd && trace.error && (
              <p className="banner banner-error">
                {trace.error.message}
                {trace.error.line ? ` (line ${trace.error.line})` : ''}
              </p>
            )}
            {trace.truncated && atEnd && (
              <p className="banner banner-warn">Stopped at {trace.maxSteps} steps. The code may loop forever, or it is just long.</p>
            )}
          </footer>
        </main>
      )}

      {showGuide && <Guide onClose={closeGuide} />}
    </div>
  )
}
