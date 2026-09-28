import type { Sample } from '../engines/types'
import type { Views } from '../structures/types'

interface CatalogEntry {
  id: string
  group: string
  name: string
  /** Views keyed by variable name; every language's version must use these names. */
  views?: Views
}

// The one list of examples. Each language implements every entry (or marks it
// null), so the menu and the guide stay in step across languages.
export const CATALOG = [
  { id: 'aliasing', group: 'Basics', name: 'Aliasing: two names, one list' },
  { id: 'counting-words', group: 'Basics', name: 'Dict: counting words' },
  { id: 'factorial', group: 'Recursion', name: 'Factorial' },
  { id: 'fibonacci', group: 'Recursion', name: 'Fibonacci (try the Call tree tab)' },
  { id: 'binary-search', group: 'Arrays', name: 'Binary search', views: { nums: 'array' } },
  { id: 'sliding-window', group: 'Arrays', name: 'Sliding window: best sum of k', views: { nums: 'array' } },
  { id: 'two-pointers', group: 'Arrays', name: 'Two pointers: palindrome', views: { s: 'array' } },
  {
    id: 'reverse-list',
    group: 'Linked lists',
    name: 'Reverse a linked list (LeetCode style)',
    views: { head: 'list', prev: 'list' },
  },
  { id: 'tree-depth', group: 'Trees', name: 'Max depth of a binary tree', views: { root: 'tree' } },
  { id: 'islands', group: 'Grids', name: 'Count islands (DFS on a grid)', views: { grid: 'grid' } },
  { id: 'bfs', group: 'Graphs', name: 'Breadth-first search', views: { graph: 'graph', queue: 'queue' } },
  { id: 'valid-parentheses', group: 'Stacks and heaps', name: 'Valid parentheses (stack)', views: { stack: 'stack' } },
  { id: 'min-heap', group: 'Stacks and heaps', name: 'Min-heap', views: { heap: 'heap' } },
] as const satisfies readonly CatalogEntry[]

export type SampleId = (typeof CATALOG)[number]['id']

export interface SampleCode {
  code: string
  /** Code that calls the solution, run after `code`. */
  call?: string
  /** Overrides the catalog name where the language's wording differs. */
  name?: string
}

/** A language's version of every catalog entry; null where it has none. */
export type SampleSet = Readonly<Record<SampleId, SampleCode | null>>

export function resolveSamples(set: SampleSet): Sample[] {
  return CATALOG.flatMap((entry): Sample[] => {
    const impl: SampleCode | null = set[entry.id]
    if (!impl) return []
    const views: Views | undefined = 'views' in entry ? entry.views : undefined
    return [{ id: entry.id, group: entry.group, name: impl.name ?? entry.name, code: impl.code, call: impl.call, views }]
  })
}
