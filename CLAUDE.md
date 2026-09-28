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

- Every change must leave the app working: `npm test` and `npm run build`
  pass, and the touched feature is checked. Tracer changes update the golden
  traces (`npx vitest run -u`) with the diff reviewed.
- Handle failure paths (bad input, timeouts, empty data) explicitly, with a
  short user-facing message.
- UI stays self-explanatory: short copy, sentence case, one job per element.
- Accessibility: keyboard reachable, visible focus, `prefers-reduced-motion`
  respected, colour never the only signal.

## Working agreements

- Do only what was asked. Offer extra steps (tests, refactors, checks) in one
  line; don't do them unasked.
- Be a collaborator who pushes back: give an opinion, disagree when there is
  a better long-term approach, and get approval before a new direction.
  Answer "in short" when asked.
- Rohit usually dictates by voice. Expect typos and misheard words.
- No em dashes anywhere (docs, UI copy, comments, responses).
- Commit messages are short and plain, written like a human ("Fix arrow
  offset"). Never add Claude as co-author or any AI attribution.
- Research subagents (web search or fetch) must use the Haiku model.
- Writing this project's code is fine: it is a tool built for him, not a
  learning exercise (his learning work lives in `D:\Projects\python-groundwork`).

## Keeping this file true

After any change to architecture, files, decisions, limits or backlog, update
the matching section here in the same piece of work. Remove what is no longer
true.

## Running

```bash
npm install
npm run dev
```

Serves at http://localhost:5173. `.claude/launch.json` defines the
`stepthrough` preview config for the same command. `npm test` runs Vitest,
`npm run typecheck` runs `tsc`, `npm run build` typechecks then outputs to
`dist/`. The first run needs internet (Pyodide loads from the jsdelivr CDN).

Git: `main` tracks https://github.com/rohitpatill/code-visualizer.

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
3. **Tracers record every step up front; the UI is a pure replay.** Steps
   store heap deltas and `Trace` rebuilds any step, so stepping back is free
   and every view is a different drawing of the same step.
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
    `ListNode`, `TreeNode`, `build_list`, `build_tree` in `helpers.py`, a
    separate module, so their lines are never traced.
12. **One engine per language behind a shared trace contract.** The UI never
    knows which language ran. TypeScript enforces the contract; golden traces
    and builder tests catch drift.
13. **State in a zustand store with narrow selectors**, so a hover or a step
    re-renders only what depends on it.

## Architecture

Every language is an engine that emits one shared trace format. Everything
after the engine (model, structures, UI) is language-neutral and only reads
that format.

```
index.html                  fonts, mounts src/main.tsx
vite.config.ts              React plugin, ES workers, Vitest config
tsconfig.json               strict, noUncheckedIndexedAccess
.claude/launch.json         dev server preview config
src/
  main.tsx                  entry: persistence, React root, styles
  trace/
    types.ts                THE CONTRACT: Value, HeapObject, Frame, StepRecord,
                            RawTrace, Step
    Trace.ts                rebuilds any step from heap deltas (checkpoints)
    values.ts               sameValue, deref, topFrame, isProgramEnd, ...
  engines/
    types.ts                Engine interface (worker, editor language,
                            highlighter, samples, copy)
    registry.ts             list of engines, default engine
    protocol.ts             worker request/response messages
    useEngine.ts            worker lifecycle, 15 s timeout, restart
    python/
      index.ts              the Python engine definition
      worker.ts             module worker: Pyodide from CDN, runs the tracer
      runtime.ts            installTracer(): shared by worker and tests
      pyodide.ts            PYODIDE_VERSION, CDN url
      tracer.py             sys.settrace tracer
      helpers.py            ListNode, TreeNode, build_list, build_tree
      highlight.ts          Python token colours for the code view
      samples.ts            13 grouped examples, can preset views and call
      __golden__/           golden traces, one per sample
  model/                    pure logic: describe, diff, heapLayout,
                            callTree, guess
  structures/               view suggestions and data builders: common,
                            pointers, suggest, linear, trees, graph, build
  app/
    store.ts                zustand store: all state and actions
    navigation.ts           step over / out / breakpoint targets
    storage.ts              safe localStorage (stepthrough-* keys)
    source.ts               joinSource(code, call)
    usePlayback.ts          play timer
    useKeyboard.ts          shortcuts, registered once
    App.tsx                 shell: top bar, edit or view, guide
  components/
    TopBar.tsx, Guide.tsx
    edit/                   EditPane (CodeMirror), SamplePicker
    view/                   ViewLayout, CodeView, OutputPanel, MemoryPane,
                            Controls, Transport, QuizForm, Timeline,
                            CallTreeView
    memory/                 StackPanel, ViewControl, HeapPanel, HeapObject,
                            Value, Arrows, cover (CoverContext, useIsHot)
    structures/             StructureCard + one file per view family
  styles/                   index.css imports 14 small sheets in cascade order
```

### Trace contract (`src/trace/types.ts`)

- `RawTrace`: `{steps, truncated, error, stdout, maxSteps}`.
- `StepRecord`: `line, event, frames[], out, heap, ret?, exc?`. `event` is
  `call | line | return | exception`; a `line` event fires before the line
  runs ("runs next"). `out` is the stdout length so far in UTF-16 units; the
  UI slices the final `stdout` with it.
- `heap` is a delta: `set` holds objects that are new or changed on this step,
  `del` lists ids that stopped being reachable.
- Frames: user frames only, outermost first, `global: true` on the module
  frame, stable small ids.
- Values: `{t:'p', k, v, s?}` inline primitives, where `k` is neutral
  (`none bool int float str other`), `v` is the literal in the source
  language, and `s` is the raw text for strings. Otherwise `{t:'r', id}`.
- Heap objects: `kind` drives rendering (`list tuple set deque dict instance
  class function module other`), `type` is the language's own type name for
  labels.
- `Trace` keeps a full heap copy every 64 steps, so `step(i)` replays at most
  63 deltas, keeps an 8-step LRU cache, and `scan()` walks every step in
  O(total deltas) for whole-run views like the call tree.

### Python tracer (`src/engines/python/tracer.py`)

- Compiles user code as `"<your code>"`; frames from any other file are
  ignored, which is why helpers (a separate module) are never traced.
- Object ids are small and stable, and the tracer holds every object it has
  seen, so CPython can never reuse an id for a different object.
- Each step still walks every reachable object to detect changes (settrace
  has no mutation hook), but only changed objects are emitted.
- Classes not defined in user code (like `deque`) carry no attrs; they render
  as an inline label anyway.
- Containers capped at 100 items, reprs at 200 chars. `MAX_STEPS = 3000`,
  plus the 15 s worker timeout for code that swallows the stop exception.
- `input()` reads the stdin box; stdout is captured by swapping `sys.stdout`.

### Frontend data flow

1. Edit mode: code, call and views live in the store and persist to
   `localStorage` through `persistDrafts()`.
2. Visualize joins code + call (`joinSource`) and asks the engine to run it.
   The worker returns a JSON string, parsed once into a `Trace`.
3. View mode: the store's `index` drives everything. `ViewLayout` rebuilds the
   current and previous `Step`; `MemoryPane` derives the diff (from the
   step's `touched` ids, O(changes)), structures, tags and cover per step, and
   the call tree once per run.
4. Hover lives in the store and components subscribe per id (`useIsHot`), so
   hovering re-renders two elements, not the tree. Arrows re-measure only when
   the layout changes.
5. `coveredBy` maps heap ids drawn inside a structure card. Those are skipped
   by the default heap layout and draw no arrow; the card carries
   `data-heap=rootId` so the owning variable's arrow lands on it.
6. Recursive functions with `root` in every frame: frames are walked
   outermost first and covered roots skipped, so one tree is drawn.
7. Default heap layout: one row per object a variable points at, references
   placed to its right (DFS). Stack and heap share one scroll container so
   arrow coordinates stay valid.
8. Timeline bars are one SVG path built once per run; the playhead moves a
   clip rect and one bar.

### Adding a language

1. Write a tracer that emits `RawTrace` exactly as in `trace/types.ts`.
2. Add `src/engines/<lang>/` with a worker that speaks `engines/protocol.ts`,
   an `Engine` definition (editor language, highlighter, samples, copy), and
   register it in `engines/registry.ts`.
3. Add golden traces for its samples. The model, structure and render tests
   should then pass unchanged; if they need changes, the contract leaked.
4. Still to build when the second engine lands: a language picker and
   per-language drafts in `localStorage`.

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

- `npm test` (Vitest, 63 tests):
  - tracer golden traces for all 13 samples, run in real Pyodide 0.26.4 from
    npm with `PYTHONHASHSEED=0` (set order depends on string hashing), plus
    edge cases: syntax and runtime errors, step limit, `input()`, UTF-16
    output slicing, stable ids, delta emission, raw strings;
  - `Trace` rebuilding checked against a forward replay in shuffled order;
  - every structure builder over every step of every sample;
  - every step of every sample rendered in jsdom, both tabs, guess mode,
    empty-run error, top bar and guide, with no React warnings.
- `npm run build` runs `tsc` then Vite. The 500 kB chunk warning is CodeMirror.
- A test asserts the npm Pyodide version equals the CDN version the browser
  loads; bump `pyodide.ts` and `package.json` together.
- Not yet checked by eye in a browser since the TypeScript migration.
- `npm audit`: dev-tooling vulnerabilities, deliberately not force-fixed
  (would jump Vite a major version; local-only tool).

## Known limits

- One file, standard library only. Needs internet on first load.
- Flash may not replay if the same thing changes on consecutive steps.
- Generators and iterators render as opaque `other` boxes.
- Set display order follows Python's real iteration order, which changes
  between runs (string hash seed).
- Guess mode only asks about plain values that change at the same call depth,
  so pure recursion (factorial) asks nothing.
- Structure detection is heuristic. Graphs assume adjacency dicts or lists
  (no edge lists). Trees need `left`/`right` or `children`; node values come
  from `val value data key item` or the first primitive attr.
- Graph layout is a circle, fine up to about 20 to 30 nodes.
- Call tree includes every call, `__init__` too.

## Roadmap

Agreed order: (1) language-neutral foundation, done; (2) JavaScript engine
(instrument code with acorn, run it in a worker); (3) better structure
views; (4) backend with sandboxed runners for Java, C and C++; (5) accounts
and progress on that same backend.

## Backlog

- Pin any variable as a pointer by hand.
- Watch expressions (`hi - lo`, `len(stack)`) updated every step.
- Live counters of steps and loop iterations (complexity feel).
- Shareable link with code and views in the URL.
- Edge-list graph input, better layout for large graphs.
- Hide `__init__` and other noise in the call tree.
- Split CodeMirror into its own chunk (only edit mode needs it).
- More learning-first features in the spirit of guess mode.
