import { describe, expect, it } from 'vitest'
import { joinSource } from '../../app/source'
import { resolveSamples } from '../../samples/catalog'
import type { Frame, RawTrace, Ref, StepRecord, Value } from '../../trace/types'
import { runTrace } from './runtime/run'
import { javascriptSamples } from './samples'

const trace = (code: string, stdin = ''): RawTrace => JSON.parse(runTrace(code, stdin)) as RawTrace

const top = (s: StepRecord): Frame => s.frames[s.frames.length - 1]!
const varOf = (s: StepRecord, name: string): Value | undefined => top(s).vars.find(([n]) => n === name)?.[1]
const last = (raw: RawTrace) => raw.steps[raw.steps.length - 1]!
const lines = (raw: RawTrace) => raw.steps.filter((s) => s.event === 'line').map((s) => s.line)

describe('javascript tracer', () => {
  describe('golden traces', () => {
    for (const sample of resolveSamples(javascriptSamples)) {
      it(sample.name, async () => {
        const raw = trace(joinSource(sample.code, sample.call ?? ''))
        expect(raw.error).toBeNull()
        expect(raw.truncated).toBe(false)
        await expect(`${JSON.stringify(raw, null, 1)}\n`).toMatchFileSnapshot(`__golden__/${sample.id}.json`)
      })
    }
  })

  it('reports syntax errors with their line', () => {
    const raw = trace('let x = 1;\nif (x {\n')
    expect(raw.steps).toHaveLength(0)
    expect(raw.error?.message).toMatch(/^SyntaxError: /)
    expect(raw.error?.line).toBe(2)
  })

  it('reports runtime errors on the deepest user line', () => {
    const raw = trace('function f(n) {\n  return n.x.y;\n}\nf({});\n')
    expect(raw.error?.message).toContain('TypeError')
    expect(raw.error?.line).toBe(2)
    expect(raw.steps.some((s) => s.event === 'exception')).toBe(true)
  })

  it('refuses async code and reserved names with a clear message', () => {
    expect(trace('async function f() {}\n').error?.message).toContain('not supported yet')
    expect(trace('const __stX = 1;\n').error?.message).toContain('reserved')
  })

  it('stops endless loops, even empty ones, at the step limit', () => {
    for (const code of ['while (true) {}\n', 'for (;;);\n', 'const f = () => f();\nf();\n']) {
      const raw = trace(code)
      expect(raw.truncated).toBe(true)
      expect(raw.steps).toHaveLength(raw.maxSteps)
    }
  })

  it('shows let and const only once they are initialized', () => {
    const raw = trace('let a = 1;\nconst b = 2;\n')
    expect(top(raw.steps[0]!).vars.map(([n]) => n)).toEqual([])
    expect(top(raw.steps[1]!).vars.map(([n]) => n)).toEqual(['a'])
  })

  it('gives every loop iteration its own step and binding', () => {
    const raw = trace('let s = 0;\nfor (let i = 0; i < 3; i++) s += i;\nconst done = s;\n')
    expect(lines(raw)).toEqual([1, 2, 2, 2, 2, 3])
    expect(raw.steps.filter((s) => s.line === 2).map((s) => varOf(s, 'i'))).toEqual([0, 1, 2, 3].map((v) => ({ t: 'p', k: 'int', v: String(v) })))
  })

  it('merges statements that share a line into one step', () => {
    expect(lines(trace('let a = 1; let b = 2;\nlet c = 3;\n'))).toEqual([1, 2])
  })

  it('records calls, returns and implicit returns as frames', () => {
    const raw = trace('function f(x) {\n  const y = x * 2;\n}\nf(3);\n')
    const events = raw.steps.map((s) => `${s.event}:${s.line}:${s.frames.length}`)
    expect(events).toEqual(['line:4:1', 'call:1:2', 'line:2:2', 'return:3:2', 'return:4:1'])
    expect(raw.steps[1]!.frames[1]!.name).toBe('f')
    expect(varOf(raw.steps[1]!, 'x')).toEqual({ t: 'p', k: 'int', v: '3' })
  })

  it('shows this in methods and names them after their class', () => {
    const raw = trace('class P {\n  constructor(x) {\n    this.x = x;\n  }\n}\nconst p = new P(5);\n')
    const inCtor = raw.steps.find((s) => s.event === 'return' && top(s).name === 'P.constructor')!
    expect(top(inCtor).vars.map(([n]) => n)).toEqual(['this', 'x'])
  })

  it('keeps one id per object and marks aliasing', () => {
    const raw = trace('const a = [1];\nconst b = a;\nconst end = 1;\n')
    expect((varOf(last(raw), 'a') as Ref).id).toBe((varOf(last(raw), 'b') as Ref).id)
  })

  it('encodes arrays, objects, maps, sets and instances in the shared kinds', () => {
    const raw = trace('class Node { constructor() { this.v = 1; } }\nconst x = [[1], { a: 2 }, new Map([[1, 2]]), new Set([3]), new Node()];\nconst end = 1;\n')
    const step = last(raw)
    const heap = Object.assign({}, ...raw.steps.map((s) => s.heap.set ?? {}))
    const list = heap[(varOf(step, 'x') as Ref).id]
    const kinds = list.items.map((v: Ref) => `${heap[v.id].kind}:${heap[v.id].type}`)
    expect(kinds).toEqual(['list:Array', 'dict:Object', 'dict:Map', 'set:Set', 'instance:Node'])
  })

  it('prints like Node and feeds prompt() from stdin', () => {
    const raw = trace('console.log("n", 1, [1, "a"], { a: null }, new Map([["k", 1]]));\nconst name = prompt("? ");\n', 'Ada')
    expect(raw.stdout).toBe("n 1 [ 1, 'a' ] { a: null } Map(1) { 'k' => 1 }\n? Ada\n")
  })

  it('never runs user getters while recording', () => {
    const raw = trace('let calls = 0;\nconst o = { get g() { calls++; return 1; } };\nconsole.log(o);\nconst end = calls;\n')
    expect(varOf(last(raw), 'end')).toEqual({ t: 'p', k: 'int', v: '0' })
  })

  it('lets user code define its own helpers', () => {
    const raw = trace('class ListNode {\n  constructor(v) { this.v = v; }\n}\nconst n = new ListNode(1);\nconst end = 1;\n')
    expect(raw.error).toBeNull()
  })
})
