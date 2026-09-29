import { describe, expect, it } from 'vitest'
import { resolveSamples } from '../../samples/catalog'
import { Trace } from '../../trace/Trace'
import type { Frame, HeapObject, RawTrace, Ref, StepRecord, Value } from '../../trace/types'
import { java } from '.'
import { runTrace } from './interp/run'
import { javaSamples } from './samples'

type Expanded = Omit<RawTrace, 'steps'> & { steps: readonly StepRecord[]; heap: (i: number) => ReadonlyMap<string, HeapObject> }

const raw = (code: string, stdin = ''): RawTrace => JSON.parse(runTrace(code, stdin)) as RawTrace
const trace = (code: string): Expanded => {
  const r = raw(code)
  const t = new Trace(r)
  return { ...r, steps: t.records, heap: (i) => t.step(i).heap }
}
const main = (body: string, members = '') => `import java.util.*;\n\npublic class Main {\n${members}  public static void main(String[] args) {\n${body}\n  }\n}\n`
const top = (s: StepRecord): Frame => s.frames[s.frames.length - 1]!
const varOf = (s: StepRecord, name: string): Value | undefined => top(s).vars.find(([n]) => n === name)?.[1]
const lastIndex = (t: Expanded) => t.steps.length - 1

describe('Java tracer', () => {
  describe('golden traces', () => {
    for (const sample of resolveSamples(javaSamples)) {
      it(sample.name, async () => {
        const golden = raw(java.buildProgram(sample.code, sample.call ?? ''))
        expect(golden.error).toBeNull()
        expect(golden.truncated).toBe(false)
        await expect(`${JSON.stringify(golden, null, 1)}\n`).toMatchFileSnapshot(`__golden__/${sample.id}.json`)
      })
    }
  })

  it('wraps the call box in a main method when the code has none', () => {
    expect(java.buildProgram('class S {}', 'int x = 1;')).toBe(
      'class S {}\n\npublic class Main {\n    public static void main(String[] args) {\n        int x = 1;\n    }\n}\n',
    )
    expect(java.buildProgram('class Main {}', 'f();')).toContain('public class Program {')
    expect(java.buildProgram(main(''), '')).toBe(main(''))
  })

  it('records globals, main and calls as frames, and ends on the global frame', () => {
    const t = trace(main('    int r = twice(3);', '  static int twice(int x) {\n    return x * 2;\n  }\n'))
    const events = t.steps.map((s) => `${s.event}:${s.line}:${s.frames.map((f) => f.name).join('>')}`)
    expect(events).toEqual([
      'call:7:globals>Main.main',
      'line:8:globals>Main.main',
      'call:4:globals>Main.main>Main.twice',
      'line:5:globals>Main.main>Main.twice',
      'return:5:globals>Main.main>Main.twice',
      'return:9:globals>Main.main',
      'return:10:globals',
    ])
    expect(t.steps[0]!.frames[0]!.global).toBe(true)
  })

  it('shows static fields in the global frame, set by a <clinit> frame', () => {
    const t = trace(main('    count++;', '  static int count = 5;\n'))
    expect(t.steps[0]!.frames.map((f) => f.name)).toEqual(['globals', 'Main.<clinit>'])
    expect(t.steps[lastIndex(t)]!.frames[0]!.vars).toEqual([['count', { t: 'p', k: 'int', v: '6' }]])
  })

  it('shows uninitialized locals as ? and chars, strings and doubles as Java literals', () => {
    const t = trace(main('    int x;\n    char c = \'a\';\n    String s = "hi";\n    double d = 3;\n    long n = 1L << 40;\n    x = 1;'))
    const s = t.steps[lastIndex(t) - 2]!
    expect(varOf(s, 'x')).toEqual({ t: 'p', k: 'other', v: '?' })
    expect(varOf(s, 'c')).toEqual({ t: 'p', k: 'str', v: "'a'", s: 'a' })
    expect(varOf(s, 's')).toEqual({ t: 'p', k: 'str', v: '"hi"', s: 'hi' })
    expect(varOf(s, 'd')).toEqual({ t: 'p', k: 'float', v: '3.0' })
    expect(varOf(s, 'n')).toEqual({ t: 'p', k: 'int', v: '1099511627776' })
  })

  it('draws arrays, collections and nodes as heap objects with Java type names', () => {
    const t = trace(
      main(
        '    int[] a = {1, 2};\n    List<Integer> l = new ArrayList<>(List.of(3));\n    Map<String, Integer> m = new HashMap<>();\n    m.put("a", 1);\n' +
          '    Deque<Integer> d = new ArrayDeque<>();\n    d.push(1);\n    Set<Integer> s = new TreeSet<>(List.of(2, 1));\n    PriorityQueue<Integer> pq = new PriorityQueue<>();\n' +
          '    TreeNode n = new TreeNode(5);\n    int end = 0;',
      ),
    )
    const at = lastIndex(t) - 1
    const heap = t.heap(at)
    const kind = (name: string) => heap.get((varOf(t.steps[at]!, name) as Ref).id)
    expect(kind('a')).toMatchObject({ kind: 'list', type: 'int[]', size: 2 })
    expect(kind('l')).toMatchObject({ kind: 'list', type: 'ArrayList<Integer>' })
    expect(kind('m')).toMatchObject({ kind: 'dict', type: 'HashMap<String, Integer>' })
    expect(kind('d')).toMatchObject({ kind: 'deque', type: 'ArrayDeque<Integer>', stackTop: 'first' })
    expect(kind('s')).toMatchObject({ kind: 'set', type: 'TreeSet<Integer>', items: [{ v: '1' }, { v: '2' }] })
    expect(kind('pq')).toMatchObject({ kind: 'list', type: 'PriorityQueue<Integer>' })
    expect(kind('n')).toMatchObject({ kind: 'instance', type: 'TreeNode' })
  })

  it('shows this in instance methods and constructors', () => {
    const t = trace(main('    Counter c = new Counter();\n    c.inc();', '  static class Counter {\n    int v;\n    Counter() { v = 1; }\n    void inc() {\n      v++;\n    }\n  }\n'))
    const inMethod = t.steps.find((s) => top(s).name === 'Counter.inc')!
    expect(top(inMethod).vars[0]![0]).toBe('this')
    expect(t.steps.some((s) => top(s).name === 'new Counter')).toBe(true)
  })

  it('merges statements on one line into one step', () => {
    const t = trace(main('    int a = 1; int b = 2;\n    int c = 3;'))
    expect(t.steps.filter((s) => s.event === 'line').map((s) => s.line)).toEqual([5, 6])
  })

  it('never records steps inside the built-in helpers', () => {
    const t = trace(main('    ListNode h = buildList(1, 2, 3);\n    TreeNode r = buildTree(1, 2, 3);\n    int x = Integer.parseInt("5");'))
    expect(t.steps.every((s) => s.frames.every((f) => !/LeetCode|ListNode|TreeNode|Exception/.test(f.name)))).toBe(true)
  })

  it('records an exception where it is thrown and again in each caller it passes through', () => {
    const t = trace(main('    int r = divide(1, 0);', '  static int divide(int a, int b) {\n    return a / b;\n  }\n'))
    const thrown = t.steps.filter((s) => s.event === 'exception').map((s) => `${top(s).name}:${s.exc}`)
    expect(thrown).toEqual([
      'Main.divide:java.lang.ArithmeticException: / by zero',
      'Main.main:java.lang.ArithmeticException: / by zero',
      'globals:java.lang.ArithmeticException: / by zero',
    ])
    expect(t.error).toEqual({ message: 'Exception in thread "main" java.lang.ArithmeticException: / by zero', line: 5 })
  })

  it('reports compile errors with a line, before or during the run', () => {
    expect(raw(main('    int x = 5')).error).toEqual({ message: "Compile error: expected ';', found '}'", line: 6 })
    expect(raw('class A {}').error?.message).toContain('no main method')
    const lossy = raw(main('    int x = 2.5;'))
    expect(lossy.error).toEqual({ message: 'Compile error: incompatible types: possible lossy conversion from double to int', line: 5 })
    expect(raw(main('    int x;\n    x++;')).error?.message).toBe('Compile error: variable x might not have been initialized')
  })
})
