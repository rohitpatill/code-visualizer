# Stepthrough

A local, step-by-step Python execution visualizer for learning Python and DSA.
`README.md` is the user guide. This file is the builder's memory and the
engineering contract. Keep it in sync with the code (see "Keeping this file
true").

## Engineering standard

Write every line as a senior architect who has shipped systems serving
billions of requests would. Assume this code will be read, extended and run
at scale by people who never met us.

### Performance

- Pick the algorithm with the best time and space complexity the problem
  allows, and know what it is. No accidental O(n^2) (nested scans, `find`
  inside loops, repeated array copies, spreading in reducers).
- Use the right structure: `Map`/`Set` for lookups, indexes over rescans,
  Python `dict`/`set`/`deque` over list scans.
- Do work once. Memoize derived data per step or per run (`useMemo`, caches
  keyed by step index), never recompute it on every render.
- React: stable keys, no inline objects or functions passed to memoized
  children without reason, no state that can be derived, no layout thrash
  (batch DOM reads before writes).
- The hot paths here are the tracer's per-step snapshot and the per-step
  render. Any change to them states its cost per step and per run.
- Measure before and after any performance claim. No speculative
  micro-optimizations that hurt readability.

### Structure

- One module, one job. Soft limit 250 lines per file, hard limit 300. Past
  that, split by responsibility, not by line count.
- Functions do one thing and stay short (aim under 40 lines). Pure logic
  lives in `src/lib`-style modules, components only render.
- No duplication: extract a shared helper the second time logic repeats.
- Clear names over comments. Comments only explain *why* something non-obvious
  is done, never *what* the code does. No commented-out code, no dead code,
  no unused imports, no placeholder TODOs.
- No new dependency unless it clearly beats writing it ourselves; say why.

### Product practice

- Every change must leave the app working: `npm run build` passes and the
  touched feature is checked.
- Handle failure paths (bad input, timeouts, empty data) explicitly, with a
  short user-facing message.
- UI stays self-explanatory: short copy, sentence case, one job per element.
- Accessibility: keyboard reachable, visible focus, `prefers-reduced-motion`
  respected, colour never the only signal.

### Existing debt against this standard

These files exceed 300 lines and should be split when next touched:
`src/App.jsx` (509), `src/styles.css` (911), `src/features.css` (834),
`src/structures.js` (361), `src/components/Structures.jsx` (344).

## Working agreements

- Do only what was asked. Offer extra steps (tests, refactors, checks) in one
  line; don't do them unasked.
- Be a collaborator who pushes back: give an opinion, disagree when there is
  a better long-term approach, and get approval before a new direction.
  Answer "in short" when asked.
- Rohit usually dictates by voice. Expect typos and misheard words.
- No em dashes anywhere (docs, UI copy, comments, responses).
- Research subagents (web search or fetch) must use the Haiku model.
- Writing this project's code is fine: it is a tool built for him, not a
  learning exercise (his learning work lives in `D:\Projects\python-groundwork`).

## Keeping this file true

After any change to architecture, files, decisions, limits or backlog, update
the matching section here in the same piece of work. Remove what is no longer
true. Line counts in "Existing debt" are updated when files change.

## Running

```bash
npm install
npm run dev
```

Serves at http://localhost:5173. `.claude/launch.json` defines the
`stepthrough` preview config for the same command. `npm run build` outputs to
`dist/`. The first run needs internet (Pyodide loads from the jsdelivr CDN).
Not a git repository yet.

## Why it exists

Rohit is relearning Python and DSA. He wants to watch code run: how variables
get assigned, stack vs heap, references and mutation, recursion building up
and unwinding, and how data structures change over time. pythontutor.com had
the right idea but got confusing on anything non-trivial. Goal: anyone looking
at a run gets the clearest possible picture of what the code does, for any
common data structure or pattern.

## Key decisions

1. **React + Vite.** Many linked panels share state; plain HTML gets messy.
2. **Pyodide (CPython in WebAssembly) in a Web Worker.** No backend, real
   Python semantics, page stays responsive, worker can be killed on timeout.
3. **Tracer in Python via `sys.settrace`**, recording a full snapshot per
   step. The UI is a pure replay, so stepping back is free and every view is
   a different drawing of the same snapshot.
4. **SVG + DOM, not 3D.** Stack and heap are 2D concepts.
5. **Default view is the memory view** (stack, heap, arrows). Structure views
   are opt in.
6. **Structure views are chosen per variable**, not per program, because real
   problems mix structures (BFS: dict graph, deque queue, set visited). The
   app only suggests a view (dashed pill), never applies one silently.
7. **Algorithms are pointers over arrays.** Pointer markers and window shading
   are core, not extras.
8. **Pointer markers are name based** (`i j l r lo hi low high mid left right
   start end slow fast p q p1 p2 idx index pos ptr write read top front back`).
   `k` is excluded (usually a window size). Grid cells use pairs (`r,c`
   `row,col` `i,j` `nr,nc` `x,y`). Trade-off: a pointer named `x` won't show.
9. **Functions and classes render inline** as violet labels, keeping the heap
   about data.
10. **Guess mode** (predict a value before seeing it) is the most valued
    learning feature. Learning features keep getting weight without clutter.
11. **LeetCode support**: a "code that calls your solution" box plus built-in
    `ListNode`, `TreeNode`, `build_list`, `build_tree` defined in `tracer.py`
    so their lines are never traced.

## Architecture

```
index.html                 IBM Plex Sans + Mono, mounts React
package.json               react, react-dom, @uiw/react-codemirror,
                           @codemirror/lang-python, @codemirror/view, vite
vite.config.js
README.md                  user guide
CLAUDE.md                  this file
.claude/launch.json        dev server preview config
public/
  tracer.py                the whole Python side
  pyodide-worker.js        classic worker: loads Pyodide v0.26.4 (Python 3.12)
                           from jsdelivr, fetches tracer.py, runs run_trace()
src/
  main.jsx                 entry, imports styles.css then features.css
  App.jsx                  edit/view mode, playback, stepping, breakpoints,
                           guess mode, tabs, localStorage
  usePython.js             worker lifecycle, 15 s timeout, restarts worker
  lib.js                   narration (describeStep), diffSteps, heap layout
                           (layoutHeap), Python syntax highlighter
  structures.js            view suggestions, pointer detection, per-view data
                           builders, buildStructures(), buildTags()
  samples.js               13 grouped examples, can preset views and call
  styles.css               base theme and memory view
  features.css             structure views, call tree, breakpoints, guess
                           mode, guide
  components/
    CodeView.jsx           code lines, next/prev markers, breakpoints
    StackPanel.jsx         frames as a staircase, view picker per variable
    HeapPanel.jsx          structure cards first, then default heap rows
    Value.jsx              primitive / inline ref / port; CoverContext
    Arrows.jsx             SVG arrows measured from the DOM after render
    Structures.jsx         Array, Grid, LinkedList, Tree, Graph, Stack, Queue,
                           Heap views + StructureCard
    CallTree.jsx           buildCallTree(steps) + view
    Timeline.jsx           depth graph scrubber
    Guide.jsx              "How to use" sheet, opens on first visit
```

### Tracer (`public/tracer.py`)

- `run_trace(code, stdin_text)` returns JSON
  `{steps, truncated, error, stdout, maxSteps}`.
- Compiles user code as `"<your code>"`; frames from any other file are
  ignored, so helpers and library code are skipped.
- Events: `call`, `line`, `return`, `exception`. The module's own `call` is
  skipped. A `line` event fires before the line runs ("runs next" in the UI).
- Step: `line, event, func, frames[], heap{}, stdout`, plus `ret` on return
  and `exc` on exception.
- Frames: user frames only, outermost first, globals without dunders, stable
  small ids (frame objects kept alive so `id()` isn't reused).
- Values: exact-type primitives (`None bool int float complex str`) inline as
  `{t:'p', k, v}`; everything else `{t:'r', id}` into the heap. Heap kinds:
  `list tuple set deque dict function class module instance other`.
  Containers capped at 100 items, reprs at 200 chars.
- `input()` reads from the stdin box; stdout captured by swapping `sys.stdout`.
- Limits: `MAX_STEPS = 3000`, plus the 15 s worker timeout as a backstop for
  code that swallows the stop exception.
- Cost: each step re-serializes every reachable object, so a run is
  O(steps x reachable heap) in time and memory. This is the main scaling
  bottleneck.

### Frontend data flow

1. Edit mode: CodeMirror, samples, call box, optional stdin. Code, call and
   views persist in `localStorage` (`stepthrough-*` keys).
2. Visualize joins code + call and sends it to the worker.
3. View mode: `index` into `steps` drives everything. Per step App computes
   `diffSteps` (coral flashes), `buildStructures`, `buildTags`; once per run
   `buildCallTree`.
4. `coveredBy` maps heap ids drawn inside a structure card. Those are skipped
   by the default heap layout and draw no arrow; the card carries
   `data-heap=rootId` so the owning variable's arrow lands on it.
5. Recursive functions with `root` in every frame: frames are walked
   outermost first and covered roots skipped, so one tree is drawn.
6. Default heap layout: one row per object a variable points at, references
   placed to its right (DFS), keeping arrows left to right. Stack and heap
   share one scroll container so arrow coordinates stay valid.

## Design system

- Colour is meaning. Ink `#141B2D` background, panel `#1B2438`.
  **Amber `#F5B84A` execution** (next line, active frame, pointers, current
  node). **Teal `#56C7B8` heap and references.** **Coral `#FF7B6E` changed or
  error.** **Violet `#A99BFF` functions, classes, nodes.**
- IBM Plex Sans for UI, IBM Plex Mono for code and values.
- Signature: the stack as a staircase, echoed by the timeline depth graph.
- Tuples dashed (immutable), sets are pills without index.
- Motion only in response to steps; `prefers-reduced-motion` disables it.

## Keyboard

`→` next (asks first in guess mode), `←` back, `Shift+→` step over,
`Shift+↑` step out, `Space` play/pause, `Home`/`End`. Ignored while typing.

## Verification status

- Tracer was tested directly with a local Python importing `public/tracer.py`
  (recursion, aliasing, classes, dicts, input, syntax and runtime errors,
  infinite loops). Local Python is 3.10; Pyodide runs 3.12, so behaviour tied
  to newer features (`co_qualname`) differs locally.
- All 13 samples traced and fed through `structures.js` and `lib.js` in Node.
- `npm run build` passes (the 500 kB bundle warning is CodeMirror).
- Dev server confirmed running. Structure views, layout and arrows still need
  a visual pass in the browser.
- `npm audit`: 2 dev-tooling vulnerabilities, deliberately not force-fixed
  (would jump Vite a major version; local-only tool).

## Known limits

- One file, standard library only. Needs internet on first load.
- Flash may not replay if the same thing changes on consecutive steps.
- Python can reuse `id()` of freed objects, so an object may look new.
- Generators and iterators render as opaque `other` boxes.
- Structure detection is heuristic. Graphs assume adjacency dicts or lists
  (no edge lists). Trees need `left`/`right` or `children`; node values come
  from `val value data key item` or the first primitive attr.
- Graph layout is a circle, fine up to about 20 to 30 nodes.
- Call tree includes every call, `__init__` too.
- String array view slices the repr, so `\n` shows as two chars.

## Backlog

- Pin any variable as a pointer by hand.
- Watch expressions (`hi - lo`, `len(stack)`) updated every step.
- Live counters of steps and loop iterations (complexity feel).
- Shareable link with code and views in the URL.
- Edge-list graph input, better layout for large graphs.
- Hide `__init__` and other noise in the call tree.
- Incremental snapshots (store only changed heap objects per step) to lift
  the O(steps x heap) cost.
- Split the files listed under "Existing debt".
- More learning-first features in the spirit of guess mode.
