/// <reference types="node" />
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { loadPyodide, version } from 'pyodide'
import { beforeAll, describe, expect, it } from 'vitest'
import { joinSource } from '../../app/source'
import type { RawTrace, Ref } from '../../trace/types'
import { PYODIDE_VERSION } from './pyodide'
import { samples } from './samples'
import tracerSource from './tracer.py?raw'

let runTrace: (code: string, stdin: string) => string

const trace = (code: string, stdin = ''): RawTrace => JSON.parse(runTrace(code, stdin)) as RawTrace

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const refOf = (raw: RawTrace, step: number, name: string): Ref => {
  const frames = raw.steps[step]!.frames
  const value = frames[frames.length - 1]!.vars.find(([n]) => n === name)![1]
  if (value.t !== 'r') throw new Error(`${name} is not a reference`)
  return value
}

beforeAll(async () => {
  const indexURL = `${dirname(createRequire(import.meta.url).resolve('pyodide/package.json'))}/`
  const pyodide = await loadPyodide({ indexURL, env: { PYTHONHASHSEED: '0' } })
  pyodide.runPython(tracerSource)
  runTrace = pyodide.globals.get('run_trace')
})

describe('python tracer', () => {
  it('matches the pyodide version the browser loads', () => {
    expect(version).toBe(PYODIDE_VERSION)
  })

  describe('golden traces', () => {
    for (const sample of samples) {
      it(sample.name, async () => {
        const raw = trace(joinSource(sample.code, sample.call ?? ''))
        expect(raw.error).toBeNull()
        expect(raw.truncated).toBe(false)
        await expect(`${JSON.stringify(raw, null, 1)}\n`).toMatchFileSnapshot(`__golden__/${slug(sample.name)}.json`)
      })
    }
  })

  it('reports syntax errors with their line', () => {
    const raw = trace('x = 1\nif x\n')
    expect(raw.steps).toHaveLength(0)
    expect(raw.error).toEqual({ message: expect.stringContaining('SyntaxError') as string, line: 2 })
  })

  it('reports runtime errors on the user line', () => {
    const raw = trace('def f():\n    return 1 / 0\nf()\n')
    expect(raw.error?.message).toContain('ZeroDivisionError')
    expect(raw.error?.line).toBe(2)
    expect(raw.steps.some((s) => s.event === 'exception')).toBe(true)
  })

  it('stops endless loops at the step limit', () => {
    const raw = trace('while True:\n    pass\n')
    expect(raw.truncated).toBe(true)
    expect(raw.steps).toHaveLength(raw.maxSteps)
  })

  it('feeds input() from stdin and echoes it', () => {
    const raw = trace('name = input("? ")\nprint(name)\n', 'Ada')
    expect(raw.stdout).toBe('? Ada\nAda\n')
  })

  it('counts output in UTF-16 units so the UI can slice it', () => {
    const raw = trace('print("😀")\nx = 1\n')
    expect(raw.stdout.slice(0, raw.steps[raw.steps.length - 1]!.out)).toBe('😀\n')
  })

  it('keeps one id per object and never reuses freed ids', () => {
    const raw = trace('a = [1]\nb = a\nfor _ in range(3):\n    t = [0]\nend = 1\n')
    const last = raw.steps.length - 1
    expect(refOf(raw, last, 'a').id).toBe(refOf(raw, last, 'b').id)
    const ids = new Set(
      raw.steps.flatMap((s) => s.frames[0]!.vars.filter(([n]) => n === 't').map(([, v]) => (v as Ref).id)),
    )
    expect(ids.size).toBe(3)
  })

  it('sends an object only on steps where it changes', () => {
    const raw = trace('a = [1]\nx = 0\nx = 1\na.append(2)\ndone = 1\n')
    const id = refOf(raw, raw.steps.length - 1, 'a').id
    const sent = raw.steps.filter((s) => s.heap.set?.[id]).length
    expect(sent).toBe(2)
  })

  it('marks the module frame as global and keeps raw string text', () => {
    const raw = trace('s = "a\\nb"\ndone = 1\n')
    const frame = raw.steps[raw.steps.length - 1]!.frames[0]!
    expect(frame.global).toBe(true)
    expect(frame.vars.find(([n]) => n === 's')![1]).toEqual({ t: 'p', k: 'str', v: "'a\\nb'", s: 'a\nb' })
  })
})
