import { resolveSamples } from '../../samples/catalog'
import type { Engine } from '../types'
import { WorkerRunner } from '../workerRunner'
import { highlightPython } from './highlight'
import { pythonSamples } from './samples'

const samples = resolveSamples(pythonSamples)

export const python: Engine = {
  id: 'python',
  label: 'Python',
  createRunner: () => new WorkerRunner(() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }), 'Python'),
  editorLanguage: () => import('@codemirror/lang-python').then((m) => m.python()),
  highlight: highlightPython,
  samples,
  starterSample: samples.find((s) => s.id === 'factorial') ?? samples[0]!,
  copy: {
    solutionShape: 'a class Solution',
    callExample: 'result = Solution().reverseList(build_list([1, 2, 3]))',
    callPlaceholder: 'result = Solution().maxDepth(build_tree([3, 9, 20]))',
    callHint: 'For LeetCode code that only defines a class. It runs after your code. build_list and build_tree are built in.',
    containers: 'lists, dicts and objects',
    nullLiteral: 'None',
    inputCall: 'input()',
    helpers: ['ListNode', 'TreeNode', 'build_list([1, 2, 3])', 'build_tree([1, 2, 3, None, 4])'],
  },
}
