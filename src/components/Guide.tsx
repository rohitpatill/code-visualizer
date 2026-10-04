import { Fragment, useEffect } from 'react'
import { useStore } from '../app/store'
import type { EngineCopy } from '../engines/types'

interface Section {
  title: string
  body: string
  keys?: readonly [string, string][]
}

const sections = (language: string, copy: EngineCopy): Section[] => [
  {
    title: 'Run your code',
    body: `Paste one ${language} file and press Visualize. For LeetCode code (${copy.solutionShape}), put the call in the box on the right, for example ${copy.callExample}.`,
  },
  {
    title: 'Read the screen',
    body: `Left: your code. ▶ runs next, ▷ just ran. Middle: the stack, one box per running function. Right: the heap, where ${copy.containers} live. A teal dot is a reference; its arrow shows what it points at. Coral means it just changed.`,
  },
  {
    title: 'Move through the run',
    keys: [
      ['→ / ←', 'next / previous step'],
      ['Shift + →', 'step over: skip past a function call'],
      ['Shift + ↑', 'step out: finish the current function'],
      ['Space', 'play / pause'],
      ['Home / End', 'first / last step'],
    ],
    body: 'Click a line number to set a breakpoint. Play stops there, and "Next breakpoint" jumps to it. The bar graph at the bottom is the whole run: taller means deeper calls. Click it to jump.',
  },
  {
    title: 'See data as a structure',
    body: `Click ⋯ next to a variable in the stack (${copy.containers}, or a string) and pick how to draw it: array, grid, linked list, tree, graph, stack, queue or heap. When the shape is obvious, a "show as ..." pill offers it. The × on a structure goes back to the plain view.`,
  },
  {
    title: 'Pointers and windows',
    body: 'Index variables show as amber markers under the cell they point at, in the plain memory view too: arr[i] marks i on arr, grid[r][c] marks r on the row and c on the cell, at any depth, and counts[w] marks the key w. A grey marker belongs to a paused caller. Common names (lo, hi, left, right ...) also mark arrays the code indexes, and pairs like left/right shade the window between them in the array view. Tree and linked list nodes get name tags for the variables pointing at them.',
  },
  {
    title: 'Recursion',
    body: 'Open the Call tree tab to see every call as a tree, with return values filled in as calls finish. Useful for fib, backtracking and divide and conquer.',
  },
  {
    title: 'Guess mode',
    body: 'Turn on Guess mode, then press Next. Before each line runs, you predict the new value of a variable it changes. Predicting first and then checking is what makes it stick.',
  },
]

function HelperList({ helpers }: { helpers: readonly string[] }) {
  return helpers.map((h, i) => (
    <Fragment key={h}>
      {i > 0 && (i === helpers.length - 1 ? ' and ' : ', ')}
      <code>{h}</code>
    </Fragment>
  ))
}

export function Guide() {
  const engine = useStore((s) => s.engine)
  const setGuideOpen = useStore((s) => s.setGuideOpen)
  const close = () => setGuideOpen(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGuideOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setGuideOpen])

  return (
    <div className="guide-backdrop" onClick={close}>
      <aside className="guide" role="dialog" aria-label="How to use" onClick={(e) => e.stopPropagation()}>
        <header className="guide-head">
          <h2>How to use</h2>
          <button className="btn" onClick={close} autoFocus>
            Close
          </button>
        </header>
        {sections(engine.label, engine.copy).map((s) => (
          <section key={s.title} className="guide-section">
            <h3>{s.title}</h3>
            {s.keys && (
              <dl className="guide-keys">
                {s.keys.map(([k, v]) => (
                  <div key={k}>
                    <dt>
                      <kbd>{k}</kbd>
                    </dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p>{s.body}</p>
          </section>
        ))}
        {engine.copy.helpers.length > 0 && (
          <section className="guide-section">
            <h3>Built-in helpers</h3>
            <p>
              <HelperList helpers={engine.copy.helpers} /> work without defining them. If your code defines its own, yours wins.
            </p>
          </section>
        )}
      </aside>
    </div>
  )
}
