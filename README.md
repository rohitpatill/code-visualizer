# Stepthrough

A step-by-step code execution visualizer for Python and JavaScript. Pick a
language, paste a single file, press Visualize, and move through every step
of the run while watching the stack, the heap and the references between
them. Data structures can be drawn in
their real shape (tree, graph, grid, ...) and index variables show up as
pointers on them.

Built because Python Tutor's layout got confusing on anything non-trivial.
The in-app **How to use** panel covers everything below in short form.

## Run it

```
npm install      # first time only
npm run dev
```

Open the URL Vite prints (http://localhost:5173). Choose the language in the
top bar; each language keeps its own code. The first Python run takes a few
seconds while Python loads in the browser (needs internet for the Pyodide
download, cached after). JavaScript starts instantly.

## The default view

- **Code panel.** `▶` is the line that runs next, `▷` is the line that just
  ran. Errors turn the line coral. Click a line number to set a breakpoint.
- **Stack.** One frame per active call. Each nested call steps inward, so
  recursion shows as a staircase that builds up and unwinds. On return, a
  `returns` row shows the value before the frame is popped.
- **Heap.** Lists (with indexes), tuples (dashed, immutable), sets (pills, no
  index), deques, dicts and objects. Arrows run from each variable to the
  object it points at, so aliasing (`b = a`) shows as two arrows into one
  object. Hover a dot to highlight its arrow.
- **Change flashes.** Anything that changed in this step flashes coral.
- **Timeline.** The whole run as a depth graph (bar height is call depth).
  Click or drag to jump anywhere.
- **Output.** Everything printed so far, newest output highlighted.

## Structure views

Click `⋯` next to a variable in the stack and choose how to draw it. When the
shape is obvious a dashed "show as ..." pill offers the right view. The choice
is per variable name, remembered between runs, and `×` on the card goes back
to the plain view.

| View | Works on | Shows |
| --- | --- | --- |
| Array | list, tuple, str | cells with indexes, pointer markers, shaded window |
| Grid | list of lists | rows and columns, `[r][c]` style cell highlight |
| Linked list | object with `next` | chain of nodes, name tags, cycle detection |
| Tree | object with `left`/`right` or `children` | real tree layout, name tags |
| Graph | dict or list adjacency | nodes and edges, weights, visited / waiting / current |
| Stack | list, deque | vertical, top marked |
| Queue | deque, list | horizontal, front and back marked |
| Heap | list used with `heapq` | the implicit tree plus the array |

**Pointers.** Int variables with common index names (`i j l r lo hi low high
mid left right start end slow fast p q idx pos ptr ...`) show as markers under
array cells. Pairs like `left`/`right` or `lo`/`hi` shade the window between
them. Grids highlight the cell for pairs like `r, c` or `row, col`.

**Graph state.** Nodes in a variable named `visited` / `seen` are teal, nodes
in `queue` / `stack` / `heap` / `frontier` are dashed amber, and the node held
by `node` / `cur` / `u` / `v` / `nei` is solid amber.

## Learning tools

- **Call tree tab.** Every function call as a tree with return values, built
  up as you step. Click a call to jump to it.
- **Step over / step out.** Skip past a call, or finish the current function.
- **Breakpoints.** Play stops on them; "Next breakpoint" jumps straight there.
- **Guess mode.** Before each line runs, predict the new value of a variable
  it changes. Tracks your score.

## Controls

| Key | Action |
| --- | --- |
| `→` / `←` | Next / previous step |
| `Shift + →` | Step over |
| `Shift + ↑` | Step out |
| `Space` | Play / pause |
| `Home` / `End` | First / last step |

## LeetCode-style code

Put code that calls your solution in the "Code that calls your solution" box;
it runs after your code. These are built in (your own definitions win):

| | Python | JavaScript |
| --- | --- | --- |
| Nodes | `ListNode(val, next)`, `TreeNode(val, left, right)` | `new ListNode(val, next)`, `new TreeNode(val, left, right)` |
| List from values | `build_list([1, 2, 3])` | `buildList([1, 2, 3])` |
| Tree, LeetCode order | `build_tree([3, 9, 20, None, None, 15, 7])` | `buildTree([3, 9, 20, null, null, 15, 7])` |
| Example call | `result = Solution().reverseList(build_list([1, 2]))` | `const result = reverseList(buildList([1, 2]))` |

## Limits

- One file only, standard library only (no pip packages, no imports in JS).
- `input()` (Python) and `prompt()` (JavaScript) read from the input lines
  box, one line per call.
- JavaScript: async functions, generators and `await` are not supported yet.
- Stops after 3000 steps, with a 15 second hard timeout.
- Pointer markers are name based. A variable called `x` won't show on an
  array, by design, to avoid noise.

## How it works

```
src/engines/            one engine per language behind a shared Runner interface
  python/tracer.py      sys.settrace hook: records frames and heap changes every step
  python/helpers.py     ListNode, TreeNode, build_list, build_tree
  python/worker.ts      loads Pyodide in a Web Worker and runs the tracer
  javascript/           acorn instrumenter + runtime tracer, runs in a Web Worker
  workerRunner.ts       talks to a worker, restarts it on timeout
src/trace/              the shared trace format and Trace, which rebuilds any step
src/samples/catalog.ts  the examples every language implements
src/model/              narration, diffs, heap layout, call tree, guess mode
src/structures/         view suggestions and data for each structure view
src/app/                store (zustand), playback, keyboard, App shell
src/components/         edit mode, view mode, memory panels, structure views
src/styles/             one small stylesheet per area
```

Each tracer only records frames from the user's code. Primitives are stored
inline; everything else goes in the heap under a stable id, which is what makes
shared references visible. Each step stores only the frames and heap objects
that changed, and the UI rebuilds any step from those changes, so stepping
backwards is free and every view is just a different drawing of the same step.
The UI never knows which language produced the trace.

## Checks

```
npm test          # tracer golden traces, trace rebuilding, builders, render smoke test
npm run build     # typecheck, then production build
```

Golden traces live in `src/engines/python/__golden__`. After an intended tracer
change, update them with `npx vitest run -u` and review the diff.
