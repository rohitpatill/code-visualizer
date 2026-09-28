import { useEffect } from 'react'

const SECTIONS = [
  {
    title: 'Run your code',
    body: 'Paste one Python file and press Visualize. For LeetCode code (a class Solution), put the call in the box on the right, for example result = Solution().reverseList(build_list([1, 2, 3])).',
  },
  {
    title: 'Read the screen',
    body: 'Left: your code. ▶ runs next, ▷ just ran. Middle: the stack, one box per running function. Right: the heap, where lists, dicts and objects live. A teal dot is a reference; its arrow shows what it points at. Coral means it just changed.',
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
    body: 'Click ⋯ next to any list, dict, object or string in the stack and pick how to draw it: array, grid, linked list, tree, graph, stack, queue or heap. When the shape is obvious, a "show as ..." pill offers it. The × on a structure goes back to the plain view.',
  },
  {
    title: 'Pointers and windows',
    body: 'In array and grid views, index variables with common names (i, j, lo, hi, mid, left, right, slow, fast, r, c ...) show as markers under the cells. Pairs like left/right shade the window between them. Tree and linked list nodes get name tags for the variables pointing at them.',
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

export function Guide({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="guide-backdrop" onClick={onClose}>
      <aside className="guide" role="dialog" aria-label="How to use" onClick={(e) => e.stopPropagation()}>
        <header className="guide-head">
          <h2>How to use</h2>
          <button className="btn" onClick={onClose} autoFocus>
            Close
          </button>
        </header>
        {SECTIONS.map((s) => (
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
        <section className="guide-section">
          <h3>Built-in helpers</h3>
          <p>
            <code>ListNode</code>, <code>TreeNode</code>, <code>build_list([1, 2, 3])</code> and{' '}
            <code>build_tree([1, 2, 3, None, 4])</code> work without defining them. If your code defines its own, yours
            wins.
          </p>
        </section>
      </aside>
    </div>
  )
}
