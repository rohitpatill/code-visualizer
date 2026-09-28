import { describe, expect, it } from 'vitest'
import { resolveSamples } from '../../samples/catalog'
import { Trace } from '../../trace/Trace'
import type { Frame, HeapObject, RawTrace, Ref, StepRecord, Value } from '../../trace/types'
import { cpp } from '.'
import { runTrace } from './interp/run'
import { cppSamples } from './samples'

type Expanded = Omit<RawTrace, 'steps'> & { steps: readonly StepRecord[]; heap: (i: number) => ReadonlyMap<string, HeapObject> }

const raw = (code: string, stdin = ''): RawTrace => JSON.parse(runTrace(code, stdin)) as RawTrace
const trace = (code: string): Expanded => {
  const r = raw(code)
  const t = new Trace(r)
  return { ...r, steps: t.records, heap: (i) => t.step(i).heap }
}
const main = (body: string) => `int main() {\n${body}\n}\n`
const top = (s: StepRecord): Frame => s.frames[s.frames.length - 1]!
const varOf = (s: StepRecord, name: string): Value | undefined => top(s).vars.find(([n]) => n === name)?.[1]
const lastIndex = (t: Expanded) => t.steps.length - 1

describe('C++ tracer', () => {
  describe('golden traces', () => {
    for (const sample of resolveSamples(cppSamples)) {
      it(sample.name, async () => {
        const golden = raw(cpp.buildProgram(sample.code, sample.call ?? ''))
        expect(golden.error).toBeNull()
        expect(golden.truncated).toBe(false)
        await expect(`${JSON.stringify(golden, null, 1)}\n`).toMatchFileSnapshot(`__golden__/${sample.id}.json`)
      })
    }
  })

  it('wraps the call box in main() when the code has none', () => {
    expect(cpp.buildProgram('class S {};', 'int x = 1;')).toBe('class S {};\n\nint main() {\n    int x = 1;\n}\n')
    expect(cpp.buildProgram('int main() {}', '')).toBe('int main() {}')
  })

  it('records globals, main and calls as frames, and ends on the global frame', () => {
    const t = trace('int g = 1;\nint twice(int x) {\n  return x * 2;\n}\n' + main('  int r = twice(g);'))
    const events = t.steps.map((s) => `${s.event}:${s.line}:${s.frames.map((f) => f.name).join('>')}`)
    expect(events).toEqual([
      'line:1:globals',
      'call:5:globals>main',
      'line:6:globals>main',
      'call:2:globals>main>twice',
      'line:3:globals>main>twice',
      'return:3:globals>main>twice',
      'return:7:globals>main',
      'return:7:globals',
    ])
    expect(t.steps[0]!.frames[0]!.global).toBe(true)
  })

  it('shows uninitialized variables as ? and chars and strings as literals', () => {
    const t = trace(main("  int x;\n  char c = 'a';\n  string s = \"hi\";\n  x = 1;"))
    const s = t.steps[lastIndex(t) - 2]!
    expect(varOf(s, 'x')).toEqual({ t: 'p', k: 'other', v: '?' })
    expect(varOf(s, 'c')).toEqual({ t: 'p', k: 'str', v: "'a'", s: 'a' })
    expect(varOf(s, 's')).toEqual({ t: 'p', k: 'str', v: '"hi"', s: 'hi' })
  })

  it('draws containers and nodes as heap objects with C++ type names', () => {
    const t = trace(main('  vector<int> v = {1, 2};\n  map<string, int> m = {{"a", 1}};\n  TreeNode* n = new TreeNode(5);\n  int end = 0;'))
    const at = lastIndex(t) - 1
    const heap = t.heap(at)
    const kind = (name: string) => heap.get((varOf(t.steps[at]!, name) as Ref).id)
    expect(kind('v')).toMatchObject({ kind: 'list', type: 'vector<int>', size: 2 })
    expect(kind('m')).toMatchObject({ kind: 'dict', type: 'map<string, int>' })
    expect(kind('n')).toMatchObject({ kind: 'instance', type: 'TreeNode' })
  })

  it('shows this in methods and &name for pointers to locals', () => {
    const t = trace('struct C {\n  int v = 0;\n  void inc() {\n    v++;\n  }\n};\n' + main('  C c;\n  c.inc();\n  int x = 3;\n  int* p = &x;\n  int end = 0;'))
    const inMethod = t.steps.find((s) => top(s).name === 'C::inc')!
    expect(top(inMethod).vars[0]![0]).toBe('this')
    expect(varOf(t.steps[lastIndex(t) - 1]!, 'p')).toEqual({ t: 'p', k: 'other', v: '&x' })
  })

  it('merges statements on one line into one step', () => {
    const t = trace(main('  int a = 1; int b = 2;\n  int c = 3;'))
    expect(t.steps.filter((s) => s.event === 'line').map((s) => s.line)).toEqual([2, 3])
  })

  it('never records steps inside the built-in helpers', () => {
    const t = trace(main('  ListNode* h = buildList({1, 2, 3});\n  TreeNode* r = buildTree("[1,2,3]");'))
    expect(t.steps.every((s) => s.frames.every((f) => !/build|ListNode|TreeNode/.test(f.name)))).toBe(true)
  })
})
