# Stepthrough

A local, step-by-step code visualizer (Python and JavaScript so far) for
learning programming and DSA.
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

1. **React + Vite + TypeScript.** Many linked panels share state; the trace
   contract between engines and UI is typed.
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
14. **Engines run behind a `Runner` interface**, not a worker. Python and
    JavaScript use `WorkerRunner` (browser Web Worker). C++ and Java will need
    a sandboxed server; that becomes another `Runner` and nothing above it
    changes.
15. **One sample catalog for every language** (`src/samples/catalog.ts`).
    Each engine supplies a `SampleSet` keyed by catalog id, so TypeScript
    fails the build if a language misses a sample (it may mark one `null`).
    Preset views are keyed by variable name, and a test checks every
    language's version really uses those names.
16. **All language-specific copy lives in `Engine.copy`** (LeetCode shape,
    call example, helpers, heap container words, null literal, input call).
    The guide, edit pane and heap panel read it; no component hard-codes a
    language.
17. **JavaScript is traced by instrumentation**, not a debugger: acorn parses,
    the code is rewritten so every statement calls a hook, astring
    regenerates it, and it runs with `new Function` in a worker. v1 is plain
    modern JS; async functions, generators and `await` are refused with a
    clear message.

## Architecture

Every language is an engine that emits one shared trace format through a
`Runner`. Everything after that (model, structures, UI) is language-neutral
and only reads the format.

```
index.html                  fonts, mounts src/main.tsx
vite.config.ts              React plugin, ES workers, Vitest config
tsconfig.json               strict, noUncheckedIndexedAccess
.claude/launch.json         dev server preview config
src/
  main.tsx                  entry: persistence, React root, styles
  trace/
    types.ts                THE CONTRACT: Value, HeapObject, Frame, WireStep,
                            RawTrace; StepRecord and Step are rebuilt forms
    Trace.ts                rebuilds frames and heaps from deltas
    values.ts               sameValue, deref, topFrame, isProgramEnd, ...
  samples/catalog.ts        the one list of examples, ids, groups, views
  engines/
    types.ts                Engine (runner, lazy grammar, highlighter,
                            samples, copy) and Sample
    runner.ts               Runner interface: state, subscribe, run
    workerRunner.ts         Runner on a Web Worker: timeout, restart, errors
    useRunner.ts            one runner per engine per session, React hook
    protocol.ts             worker request/response messages
    registry.ts             the list of engines, default engine
    python/
      index.ts              engine definition and copy
      worker.ts             module worker: Pyodide from CDN, runs the tracer
      runtime.ts            installTracer(): shared by worker and tests
      pyodide.ts            PYODIDE_VERSION, CDN url
      tracer.py             sys.settrace tracer
      helpers.py            ListNode, TreeNode, build_list, build_tree
      highlight.ts, samples.ts, __golden__/
    javascript/
      index.ts              engine definition and copy
      worker.ts             module worker, runs runtime/run.ts
      instrument/           builders (AST nodes), scopes (declarations),
                            transform (the rewrite), index (parse, validate,
                            generate)
      runtime/              run (entry), tracer (hooks, frames, deltas),
                            encode (values), format (console.log),
                            helpers.js (ListNode, TreeNode, buildList,
                            buildTree, evaluated from source)
      highlight.ts, samples.ts, __golden__/
  model/                    pure logic: describe, diff, heapLayout,
                            callTree, guess
  structures/               view suggestions and data builders: common,
                            pointers, suggest, linear, trees, graph, build
  app/
    store.ts                zustand store: all state and actions
    drafts.ts               per-language drafts, legacy migration
    navigation.ts           step over / out / breakpoint targets
    storage.ts              safe localStorage keys and access
    source.ts               joinSource(code, call)
    usePlayback.ts, useKeyboard.ts, App.tsx
  components/
    TopBar.tsx, Guide.tsx
    edit/                   EditPane, LanguagePicker, SamplePicker
    view/                   ViewLayout, CodeView, OutputPanel, MemoryPane,
                            Controls, Transport, QuizForm, Timeline,
                            CallTreeView
    memory/                 StackPanel, ViewControl, HeapPanel, HeapObject,
                            Value, Arrows, cover (CoverContext, useIsHot)
    structures/             StructureCard + one file per view family
  test/goldens.ts           golden lookup across all engines, for tests
  styles/                   index.css imports 14 small sheets in cascade order
```

### Trace contract (`src/trace/types.ts`)

- `RawTrace`: `{steps: WireStep[], truncated, error, stdout, maxSteps}`.
- `WireStep`: `line, event, frames, out, heap, ret?, exc?`. `event` is
  `call | line | return | exception`; a `line` event fires before the line
  runs ("runs next"). `out` is the stdout length so far in UTF-16 units.
- `frames` is a delta `{keep, push}`: the bottom `keep` frames are unchanged,
  `push` is the rest. Callers are paused while a callee runs, so deep
  recursion costs one frame per step.
- `heap` is a delta: `set` holds objects new or changed on this step, `del`
  lists ids no longer reachable.
- Frames: user frames only, outermost first, `global: true` on the top-level
  frame, stable small ids.
- Values: `{t:'p', k, v, s?}` inline primitives, `k` neutral (`none bool int
  float str other`), `v` the literal in the source language, `s` raw string
  text. Otherwise `{t:'r', id}`.
- Heap objects: `kind` drives rendering (`list tuple set deque dict instance
  class function module other`), `type` is the language's own type name.
- `Trace` expands frames once (sharing unchanged frame objects), keeps a full
  heap every 64 steps so `step(i)` replays at most 63 deltas, has an 8-step
  LRU, and `scan()` walks all steps in O(total deltas).

### Python tracer (`src/engines/python/tracer.py`)

- Compiles user code as `"<your code>"`; other files' frames are ignored, so
  helpers (a separate module) are never traced.
- Object ids are small and stable; the tracer holds every object it has seen,
  so CPython never reuses an id.
- Each step walks every reachable object to detect changes (settrace has no
  mutation hook) but emits only what changed.
- Classes not defined in user code carry no attrs. Containers capped at 100
  items, reprs at 200 chars. `MAX_STEPS = 3000`, plus the 15 s timeout.

### JavaScript tracer (`src/engines/javascript/`)

- Rewrite rules: each statement gets `__st.step(frame, line, readers)`
  before it; each function gets `enter`, `ret` on every return, and a
  try/catch/finally that reports `fail` and `leave` (implicit return). Loop
  tests step once per iteration. Statements that share a line share a step,
  like Python line events.
- Readers: every scope with declarations gets a closure
  `{i, g: k => switch(k) {...}}` created inside that scope, so it reads live
  bindings, including per-iteration `let`. Reading a binding in its temporal
  dead zone throws and is skipped, so `let`/`const` appear once initialized.
  Methods expose `this`. Inner scopes shadow outer names.
- Encoding: arrays and typed arrays are `list`, plain objects and `Map` are
  `dict`, `Set` is `set`, class instances are `instance`, `null` and
  `undefined` are `none`. Getters are never invoked (shown as `[getter]`).
  Ids come from a WeakMap, so they never repeat.
- `console.log` prints like Node; `prompt()` reads the input box. Helpers are
  evaluated from source so their names survive minification and they are
  never instrumented. Names starting with `__st` are reserved.

### Frontend data flow

1. Edit mode: code, call and views live in the store. Each language keeps its
   own draft (in memory while switching, and in `localStorage` as
   `stepthrough-draft-<id>`; the old single-language keys migrate into
   Python). The language choice persists as `stepthrough-language`.
2. Visualize joins code + call (`joinSource`) and asks the engine's runner to
   run it. The worker returns a JSON string, parsed once into a `Trace`.
3. View mode: the store's `index` drives everything. `ViewLayout` rebuilds the
   current and previous `Step`; `MemoryPane` derives the diff (from the
   step's `touched` ids), structures, tags and cover per step, and the call
   tree once per run.
4. Hover lives in the store and components subscribe per id (`useIsHot`).
   Arrows re-measure only when the layout changes.
5. `coveredBy` maps heap ids drawn inside a structure card; they skip the
   default heap layout and draw no arrow.
6. Recursive functions with `root` in every frame render one tree.
7. Default heap layout: one row per object a variable points at, references
   to its right (DFS). Stack and heap share one scroll container.
8. Timeline bars are one SVG path built once per run.
9. Editor grammars load on demand (`Engine.editorLanguage()`), one chunk per
   language.

### Adding a language

1. Emit `RawTrace` exactly as in `trace/types.ts`, including both deltas.
2. Add `src/engines/<id>/` with a `Runner` (a worker speaking
   `engines/protocol.ts`, or a remote runner), an `Engine` with its copy,
   highlighter and lazy grammar, and register it in `engines/registry.ts`.
3. Implement the whole `SampleSet` (TypeScript enforces it), using the
   catalog's variable names for preset views.
4. Add tracer tests that write `__golden__/<sample id>.json`. The builder,
   render and view-name tests then cover the new language automatically; if
   they need changes, the contract leaked.

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

- `npm test` (Vitest, 168 tests):
  - Python golden traces for all 13 samples in real Pyodide 0.26.4 from npm
    (`PYTHONHASHSEED=0`, since set order depends on string hashing), plus
    errors, step limit, `input()`, UTF-16 output, stable ids, deltas;
  - JavaScript golden traces for all 13 samples, plus syntax and runtime
    errors, refused async and reserved names, endless loops of every shape,
    temporal dead zone, per-iteration bindings, same-line merging,
    call/return frames, `this`, aliasing, value kinds, Node-style printing,
    `prompt()`, getters never run, user-defined helpers;
  - `Trace` rebuilding (heap and frames) against forward replay;
  - `WorkerRunner` with a fake worker: ready, results, busy, timeout and
    restart, crash, load failure, stale results;
  - drafts and language switching, including without storage;
  - every structure builder over every step of every sample in every
    language, and a check that preset view names exist in each trace;
  - every step of every sample in every language rendered in jsdom, both
    tabs, guess mode, empty-run error, top bar and guide, no React warnings.
- `npm run build` runs `tsc` then Vite. Main chunk about 614 kB (CodeMirror);
  acorn and astring live only in the JavaScript worker (150 kB).
- A test asserts the npm Pyodide version equals the CDN version the browser
  loads; bump `pyodide.ts` and `package.json` together.
- Not yet checked by eye in a browser since the TypeScript migration and the
  JavaScript engine.
- `npm audit`: dev-tooling vulnerabilities, deliberately not force-fixed
  (would jump Vite a major version; local-only tool).

## Known limits

- One file, standard library only. Needs internet on first load (Pyodide).
- Runaway recursion stays small on the wire but costs about 1 s (JS) to 4 s
  (Python) to trace, because every step walks every frame to find reachable
  objects.
- JavaScript: no async functions, generators or `await` yet. `let`/`const`
  declared directly in a `switch` body are not shown. Hoisted `var` shows as
  `undefined` before assignment (true to JS). Exceptions are recorded when
  they leave a function, not where they are thrown and caught locally.
- Flash may not replay if the same thing changes on consecutive steps.
- Python generators and iterators render as opaque `other` boxes.
- Python set display order follows real iteration order, which changes
  between runs (string hash seed).
- Guess mode only asks about plain values that change at the same call depth,
  so pure recursion (factorial) asks nothing.
- Structure detection is heuristic. Graphs assume adjacency dicts or lists
  (no edge lists). Trees need `left`/`right` or `children`; node values come
  from `val value data key item` or the first primitive attr.
- Graph layout is a circle, fine up to about 20 to 30 nodes.
- Call tree includes every call, constructors too.

## Roadmap

Agreed order: (1) language-neutral foundation, done; (2) JavaScript engine,
done; (3) better structure views; (4) backend with sandboxed runners for C++,
Java and C, each a new `Runner`; (5) accounts and progress on that same
backend.

## Backlog

- Pin any variable as a pointer by hand.
- Watch expressions (`hi - lo`, `len(stack)`) updated every step.
- Live counters of steps and loop iterations (complexity feel).
- Shareable link with code, language and views in the URL.
- Edge-list graph input, better layout for large graphs.
- Hide constructors and other noise in the call tree.
- JavaScript async functions and generators.
- Split CodeMirror into its own chunk (only edit mode needs it).
- More learning-first features in the spirit of guess mode.
