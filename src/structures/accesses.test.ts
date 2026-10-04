import { describe, expect, it } from 'vitest'
import { engines } from '../engines/registry'
import type { SampleId } from '../samples/catalog'
import { golden, sampleOf } from '../test/goldens'
import { Trace } from '../trace/Trace'
import type { Heap, HeapObject, Step, Value } from '../trace/types'
import { type LineComment, scanAccesses } from './accesses'
import { buildIndexMarks } from './indexMarks'

const show = (source: string, comment: LineComment = '//') =>
  scanAccesses(source, comment).map((a) => `${a.base.join('.')}${a.levels.map((l) => `[${l.names.join(':')}${l.follow ? '' : '!'}]`).join('')}`)

describe('scanAccesses', () => {
  it('reads nested subscripts at any depth', () => {
    expect(show('dp[i][j][k] = grid[r][c] + 1')).toEqual(['dp[i][j][k]', 'grid[r][c]'])
  })

  it('stops following at an expression index but keeps the names before it', () => {
    expect(show('x = dp[i][j - 1] + dp[i - 1][j]')).toEqual(['dp[i][!]'])
  })

  it('reads fields, arrows and index calls', () => {
    expect(show('this.nums[i]; self.grid[r][c]; node->kids[k]; grid.get(r).get(c); s.charAt(p); m.getOrDefault(key, 0)')).toEqual([
      'this.nums[i]',
      'self.grid[r][c]',
      'node.kids[k]',
      'grid[r][c]',
      's[p]',
      'm[key]',
    ])
  })

  it('reads slice bounds but does not follow them', () => {
    expect(show('best = sum(nums[lo:hi]) + sum(nums[:mid])', '#')).toEqual(['nums[lo:hi!]', 'nums[mid!]'])
  })

  it('finds subscripts inside subscripts', () => {
    expect(show('a[b[i]]')).toEqual(['b[i]'])
  })

  it('skips comments, strings and declarations', () => {
    expect(show('// a[i]\n/* b[j] */ s = "c[k]"; int[] d = new int[n]; String[] e;')).toEqual([])
    expect(show('x = a[n // 2]  # b[j]\ns = "c[k]"', '#')).toEqual([])
  })
})

const int = (n: number): Value => ({ t: 'p', k: 'int', v: String(n) })
const ref = (id: string): Value => ({ t: 'r', id })
const list = (items: Value[]): HeapObject => ({ kind: 'list', type: 'list', items, size: items.length })

function stepOf(globals: [string, Value][], local: [string, Value][] | null, heap: [string, HeapObject][]): Step {
  const frames = [{ id: 1, name: 'g', line: 1, global: true, vars: globals }]
  if (local) frames.push({ id: 2, name: 'f', line: 1, global: false, vars: local })
  return { line: 1, event: 'line', frames, heap: new Map(heap) as Heap, stdout: '', touched: new Set() }
}

describe('buildIndexMarks', () => {
  const jagged: [string, HeapObject][] = [
    ['1', list([ref('2'), ref('3')])],
    ['2', list([int(1)])],
    ['3', list([int(1), int(2), int(3)])],
  ]

  it('marks each level of a jagged array on its own row object', () => {
    const marks = buildIndexMarks(stepOf([['g', ref('1')], ['r', int(1)], ['c', int(2)]], null, jagged), scanAccesses('g[r][c]', '//'))
    expect(marks.get('1')).toEqual([{ name: 'r', index: 1, active: true }])
    expect(marks.get('3')).toEqual([{ name: 'c', index: 2, active: true }])
    expect(marks.has('2')).toBe(false)
  })

  it('follows an alias passed under another name and dims the paused caller', () => {
    const step = stepOf([['nums', ref('2')], ['i', int(0)]], [['arr', ref('2')], ['j', int(0)]], jagged)
    const marks = buildIndexMarks(step, scanAccesses('nums[i]; arr[j]', '//'))
    expect(marks.get('2')).toEqual(
      expect.arrayContaining([
        { name: 'j', index: 0, active: true },
        { name: 'i', index: 0, active: false },
      ]),
    )
  })

  it('reads implicit fields through this', () => {
    const heap: [string, HeapObject][] = [...jagged, ['9', { kind: 'instance', type: 'S', attrs: [['nums', ref('3')]] }]]
    const marks = buildIndexMarks(stepOf([], [['this', ref('9')], ['i', int(1)]], heap), scanAccesses('nums[i]', '//'))
    expect(marks.get('3')).toEqual([{ name: 'i', index: 1, active: true }])
  })

  it('adds common pointer names only to containers the code indexes', () => {
    const step = stepOf([['nums', ref('3')], ['other', ref('2')], ['lo', int(0)], ['mid', int(1)]], null, jagged)
    const marks = buildIndexMarks(step, scanAccesses('nums[mid]', '//'))
    expect(marks.get('3')?.map((m) => m.name).sort()).toEqual(['lo', 'mid'])
    expect(marks.has('2')).toBe(false)
  })
})

describe.each(engines)('index marks on samples: $label', (engine) => {
  const seen = (id: SampleId) => {
    const sample = sampleOf(engine, id)
    const accesses = scanAccesses(engine.buildProgram(sample.code, sample.call ?? ''), engine.lineComment)
    const trace = new Trace(golden(engine, sample))
    const out = new Set<string>()
    for (let i = 0; i < trace.length; i++) {
      const step = trace.step(i)
      for (const [key, marks] of buildIndexMarks(step, accesses)) {
        const kind = step.heap.get(key)?.kind ?? 'string'
        for (const m of marks) out.add(`${kind}:${m.name}`)
      }
    }
    return out
  }

  it('marks grid rows with r and cells with c', () => {
    const marks = seen('islands')
    expect(marks).toContain('list:r')
    expect(marks).toContain('list:c')
  })

  it('marks a dict row by its key and a string by its pointers', () => {
    expect(seen('counting-words')).toContain('dict:w')
    const s = seen('two-pointers')
    expect(s).toContain('string:left')
    expect(s).toContain('string:right')
  })
})
