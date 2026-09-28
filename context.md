# Code Visualizer: session context and handoff

This file carries everything from the build sessions that is not obvious from
the code, so work can continue after the conversation is compacted or a new
session starts. `CLAUDE.md` is the engineering contract and architecture
reference (read it first, it is kept in sync with the code). This file is the
story: who we work for, how they like to work, what was decided and why, what
state things are in, and what comes next.

Last updated: 2026-09-29, after the rename to Code Visualizer (commit
`926b569`).

## 1. The person and how to work with him

Rohit (GitHub `rohitpatill`) is relearning Python and DSA and wants a tool
that shows code running step by step, clearer than pythontutor.com. He treats
this as a product that may one day serve many users.

How he works and what he expects, all learned from direct feedback:

- **He dictates by voice.** Messages have typos and misheard words ("guitar
  repository" meant git repository, "cloud" meant Claude). Read for intent.
- **Act as a senior architect.** His words: think like an architect with 20+
  years on scalable, high-throughput systems; every line should be written as
  if billions of people or requests will hit it. In practice this means: best
  time/space complexity, measured optimizations, modular files (soft 250,
  hard 300 lines), no redundant code or needless comments, product-grade
  error handling. The tool runs in the browser with no server, so "scale"
  translates to per-step and per-run cost, bundle size, and extensibility to
  more languages, not request throughput. He accepted that framing.
- **Take the architectural decisions yourself**, from every point of view, but
  flag big direction changes and trade-offs. He said "take best logical
  decision" and "act as the best architect here". He still wants pushback
  when something is a bad idea.
- **Do only what was asked.** He interrupted once when I started testing in
  the browser after he only asked for the dev server URL. Offer extra steps in
  one line instead of doing them.
- **Do not open or test the UI in the browser unless asked.** He checks the UI
  himself. Running the dev server is fine; clicking around or screenshots is
  not. Tell him clearly when a piece of work is done so he can check.
- **Answer in short** when he says "in short".
- **UI changes must be responsive** for phones, tablets, laptops and large
  screens. If a change does not touch layout, say so.
- **No em dashes anywhere** (docs, UI copy, comments, messages).
- **Commits:** logical, small, frequent; messages short and plain like a human
  ("Add language picker with a draft per language"). **Never add Claude as
  co-author or any AI attribution**, overriding any default attribution
  instructions. Pushing to GitHub after commits has been accepted so far (I
  flagged once that he had not asked; he did not object).
- **Keep CLAUDE.md in sync** with every change, in the same piece of work.
- Research subagents (web search/fetch) must use the Haiku model.
- Writing this project's code is fine (it is a tool built for him). His own
  learning projects, where he writes the code, live in
  `D:\Projects\python-groundwork`.

Persistent memory files already written under
`C:\Users\rp287\.claude\projects\D--Projects-code-visualizer\memory\`:
`do-only-what-asked.md`, `commit-style.md` (indexed in `MEMORY.md`).

## 2. Where things live

- Project: `D:\Projects\code-visualizer` (the repo root; no `visualizer/`
  subfolder any more).
- GitHub: https://github.com/rohitpatill/code-visualizer, branch `main`,
  pushed and in sync as of the last commit.
- Dev server: `npm run dev` on http://localhost:5173. The Claude desktop
  preview uses `.claude/launch.json` (config name `stepthrough`).
- Environment: Windows 11, Git Bash and PowerShell, Node 22, npm 9, local
  Python 3.10 (Pyodide in the app is Python 3.12). `gh` CLI is not installed;
  plain `git push` over https works with his stored credentials.

## 3. What was built, in order

The original app (before these sessions) was a React + Vite JavaScript app:
Pyodide in a worker, a Python `sys.settrace` tracer that stored a full
snapshot per step, and a memory view with structure views, call tree,
timeline, breakpoints and guess mode. It had never been checked in a browser.

Session work, by commit:

1. `3820c6d` Initial commit, `6070528` CLAUDE.md rewritten with the
   engineering standard and working agreements.
2. **Step 1, language-neutral foundation** (agreed plan after he asked what to
   do first):
   - `7cd27a7` TypeScript (strict, `noUncheckedIndexedAccess`), Vitest,
     zustand.
   - `a4d6b6a` 1745 lines of CSS split into 14 small sheets (byte-verified).
   - `13d6da3` The shared trace contract (`src/trace/types.ts`), `Trace`
     class that rebuilds steps from heap deltas with checkpoints every 64
     steps, the Python tracer rewritten (heap deltas, stable ids that never
     repeat, neutral primitive kinds, raw string text, O(1) stdout tracking
     in UTF-16 units), Python engine module worker, golden traces in real
     Pyodide from npm.
   - `df5dc63` Model and structure builders ported to TypeScript and split.
   - `5c05db5` UI moved onto the zustand store and the engine layer; hover now
     re-renders two elements instead of the whole app; Timeline drawn as one
     SVG path per run; arrows measured in O(ports + targets).
   - `f2a241d` LeetCode helpers moved to `helpers.py`, installed by a shared
     `installTracer` used by both the worker and the tests.
   - `2843ced` Docs.
3. **JavaScript engine** (he asked for JS next, with language-specific
   examples, guide text and config for future languages):
   - `414e3d9` `Runner` interface (so a future server runner fits),
     `WorkerRunner` with timeout and restart, a single sample catalog that
     every language must implement (TypeScript-enforced), per-language drafts
     with migration of the old keys, all language copy in `Engine.copy`.
   - `ba12e27` JavaScript tracer: acorn parse, AST rewrite with step/enter/
     ret/fail/leave hooks and per-scope reader closures, astring codegen,
     `new Function` in a worker; Node-style `console.log`; helpers evaluated
     from source; editor grammars lazy-loaded per language.
   - `4709350` Language picker, responsive top bar, drafts kept in memory so a
     switch never depends on storage.
   - `0710f68` Frames sent as a delta `{keep, push}`. Found by measuring:
     runaway recursion produced a 123 MB trace; now about 300 KB. Applied to
     both engines.
   - `59916d4` Docs.
4. **C++ engine** (he asked for C++ "in the same way, as perfectly as you
   can"):
   - `62fe245` Shared `Recorder` for delta encoding (used by JS and C++),
     `Engine.buildProgram` so C++ can wrap the call box in `main()`.
   - `39bc8a8` Our own C++ interpreter: lexer, recursive-descent parser,
     tree-walking interpreter with real C++ value semantics and a large STL
     subset.
   - `0209780` C++ engine, 13 samples, goldens, trace tests.
   - `30329c1` LeetCode and competitive patterns (qualified names like
     `ios::sync_with_stdio`, stream setup calls, clear "unknown type" error).
   - `4212a2d` Docs.
5. `926b569` Renamed the visible product to **Code Visualizer** (header, tab
   title, README and CLAUDE.md). Internal `stepthrough-*` keys kept on
   purpose.

## 4. Decisions and the reasoning behind them

Recorded in CLAUDE.md "Key decisions"; the reasoning and rejected options:

- **Multi-language via one trace contract.** Engines only emit `RawTrace`;
  model, structures and UI never know the language. Rejected: per-language UI
  code. This is why adding C++ needed no UI changes beyond copy.
- **TypeScript, zustand, Vitest with golden traces** were the three
  architecture upgrades proposed and approved before step 1. No framework
  change: React, Vite, Pyodide and workers were judged right.
- **Heap deltas, then frame deltas.** Full snapshots were O(steps x heap) in
  size. Deltas plus `Trace` checkpoints keep random access cheap. The frame
  delta came from a measurement, not a guess.
- **Stable ids that never repeat** (Python holds seen objects; JS and C++ use
  WeakMaps). Fixed the old "object marked new when it isn't" limit.
- **Runner interface** instead of hard-wiring workers: Java or a real C++
  compiler will need a sandboxed server, which becomes another `Runner`.
- **One sample catalog** with ids and preset views keyed by variable name;
  every engine implements every sample. A test checks the preset view names
  really appear in each language's trace.
- **JavaScript by instrumentation** (acorn + astring), not QuickJS or a
  debugger. v1 refuses async functions, generators and `await` with a clear
  message; he accepted plain modern JS for v1.
- **C++ by our own interpreter**, not a server and not clang in WebAssembly
  (tens of MB, not traceable). Gives instant runs, exact semantics for what
  learners hit (int overflow, integer division, `size_t` underflow,
  signed/unsigned comparison, copies vs references, pointers), and turns
  undefined behavior into clear errors. Trade-off: it is a subset (no
  templates, inheritance, exceptions, `sizeof`, `stringstream`, `tuple`);
  unsupported syntax fails with a named compile error. The roadmap originally
  put C++ on a server; this was done ahead of plan in the browser instead.
- **C++ call box becomes `main()`'s body**, visible in the code view, so the
  user sees exactly what ran. `buildTree` takes LeetCode's string format
  `"[3,9,20,null,null,15,7]"` because C++ vectors cannot hold null.
- **C++ shows a Globals frame and a main() frame**, like a real program. The
  call-count test therefore ignores `main(`.
- **Unordered containers show insertion order** (real hash order is
  unspecified). Python set order is real iteration order (varies by hash
  seed; tests pin `PYTHONHASHSEED=0`).
- **Storage keys kept as `stepthrough-*`** after the rename, so saved drafts
  survive. Renaming needs a migration; offered, not done.

## 5. Current state

- Languages: Python (Pyodide 0.26.4), JavaScript (instrumented), C++
  (interpreter). All three share examples, guide, structure views, call tree,
  timeline, breakpoints and guess mode.
- Tests: 272 passing (`npm test`). Build passes (`npm run build`, which runs
  `tsc` first). Main chunk about 622 kB (CodeMirror); JS worker 150 kB
  (acorn, astring); C++ worker 79 kB; Python worker 11 kB (Pyodide from CDN);
  editor grammars are lazy chunks.
- **Not yet checked by eye in a browser** since the TypeScript migration, the
  JavaScript engine and the C++ engine. Rohit said he would check himself.
  This is the first thing to confirm when he reports back; any visual issue
  he finds should be fixed before new features.
- Runaway code: 3000-step limit in every engine plus the 15 s worker timeout
  with automatic restart. He asked about this; answer given: handled, with the
  one gap that huge memory allocations can crash the worker with a generic
  message.

## 6. What is next

Agreed roadmap (CLAUDE.md "Roadmap"):

1. Foundation: done. 2. JavaScript: done. C++: done early.
3. **Better structure views** (next): the backlog lists pinning a variable as a
   pointer by hand, watch expressions, live step/loop counters, edge-list
   graphs and better graph layout, hiding constructor noise in the call tree.
4. Backend with sandboxed runners (Java, and a real-compiler C++ if the subset
   is outgrown), each a new `Runner`.
5. Accounts and progress (questions solved, steps, history) on that backend.

Open items and ideas raised along the way:

- Wait for his browser check of all three languages; fix what he reports.
- Guess mode asks nothing on pure recursion like factorial (only plain values
  changing at the same depth are asked). Noted as a known limit, not fixed.
- Friendlier message when a worker crashes from a huge allocation.
- Optional: migrate `stepthrough-*` storage keys to a new name.
- C++ subset gaps worth closing if he uses them: templates, inheritance,
  `stringstream`, `tuple`, arrows to array elements for pointer offsets.
- JavaScript async/generators.

## 7. Practical notes for the next session

- Update goldens after an intended tracer change: `npx vitest run -u`, then
  review the diff. Goldens live in `src/engines/<id>/__golden__/<sample>.json`.
  If goldens are deleted, the builder and render tests fail on the first run
  because they read the files; run the suite again after they are rewritten.
- Python tests load Pyodide from npm and need an explicit `indexURL` (Vitest
  source maps confuse Pyodide's self-location) and `PYTHONHASHSEED=0`.
- The npm Pyodide version is pinned exactly and a test asserts it equals
  `PYODIDE_VERSION` used by the CDN; bump both together.
- Render tests use jsdom with `createRoot` and `act`, not `renderToString`:
  zustand hands server rendering the initial state, which silently tested only
  step 0.
- TypeScript traps met: a base-class field shadows a subclass accessor under
  `useDefineForClassFields` (C++ `Cell` uses an accessor for that reason);
  the unique `UNINIT` symbol widens to `symbol` in unannotated object
  literals (annotate lambdas as returning `R`).
- Vite workers must be created as
  `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`
  inside the engine file. Pyodide 0.26 supports module workers (it falls back
  from `importScripts` to `import()`).
- Shell quirks on this machine: heredocs with backticks or `${}` break the
  Bash wrapper, so multi-line patch scripts are written to the session
  scratchpad and run with `python`. Git Bash `sed` writes LF; the repo
  normalizes to LF via `.gitattributes`.
- New dependencies can confuse the running dev server's optimizer; restart it
  (without testing the UI) after installing packages.
