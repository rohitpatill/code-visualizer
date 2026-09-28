import { python as pythonLanguage } from '@codemirror/lang-python'
import type { Engine } from '../types'
import { highlightPython } from './highlight'
import { samples } from './samples'

export const python: Engine = {
  id: 'python',
  label: 'Python',
  createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  editorLanguage: pythonLanguage,
  highlight: highlightPython,
  samples,
  starterSample: samples.find((s) => s.name === 'Factorial') ?? samples[0]!,
  copy: {
    callPlaceholder: 'result = Solution().maxDepth(build_tree([3, 9, 20]))',
    callHint: 'For LeetCode code that only defines a class. It runs after your code. build_list and build_tree are built in.',
    callExample: 'result = Solution().reverseList(build_list([1, 2, 3]))',
    nullLiteral: 'None',
    inputCall: 'input()',
    helpers: ['ListNode', 'TreeNode', 'build_list([1, 2, 3])', 'build_tree([1, 2, 3, None, 4])'],
  },
}
