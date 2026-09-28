import { EditorView } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { useMemo, useState } from 'react'
import { useStore } from '../../app/store'

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

const BASIC_SETUP = { foldGutter: false }

export function EditPane() {
  const engine = useStore((s) => s.engine)
  const code = useStore((s) => s.code)
  const call = useStore((s) => s.call)
  const stdin = useStore((s) => s.stdin)
  const setCode = useStore((s) => s.setCode)
  const setCall = useStore((s) => s.setCall)
  const setStdin = useStore((s) => s.setStdin)
  const [showStdin, setShowStdin] = useState(false)
  const extensions = useMemo(() => [engine.editorLanguage(), editorTheme], [engine])
  const { copy } = engine

  return (
    <main className="edit-layout">
      <div className="editor-wrap">
        <CodeMirror value={code} onChange={setCode} extensions={extensions} theme="dark" height="100%" autoFocus basicSetup={BASIC_SETUP} />
      </div>
      <aside className="edit-side">
        <p className="hint">Paste one {engine.label} file and press Visualize. Every line, call and return becomes a step.</p>
        <label className="field">
          <span className="field-label">Code that calls your solution (optional)</span>
          <textarea
            className="stdin"
            value={call}
            onChange={(e) => setCall(e.target.value)}
            placeholder={copy.callPlaceholder}
            rows={3}
            spellCheck={false}
          />
          <span className="hint-small">{copy.callHint}</span>
        </label>
        <button className="link-btn" onClick={() => setShowStdin((s) => !s)} aria-expanded={showStdin}>
          {showStdin ? 'Hide input lines' : `Add lines for ${copy.inputCall}`}
        </button>
        {showStdin && (
          <textarea
            className="stdin"
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            placeholder={`One line per ${copy.inputCall} call`}
            rows={4}
          />
        )}
        <p className="hint-small">Runs in your browser. Stops after 3000 steps so infinite loops can't hang the page.</p>
      </aside>
    </main>
  )
}
