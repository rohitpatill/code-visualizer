import { resolveSamples } from '../../samples/catalog'
import type { Engine } from '../types'
import { WorkerRunner } from '../workerRunner'
import { highlightCpp } from './highlight'
import { cppSamples } from './samples'
import { buildCppProgram } from './source'

const samples = resolveSamples(cppSamples)

export const cpp: Engine = {
  id: 'cpp',
  label: 'C++',
  createRunner: () => new WorkerRunner(() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }), 'C++'),
  buildProgram: buildCppProgram,
  editorLanguage: () => import('@codemirror/lang-cpp').then((m) => m.cpp()),
  highlight: highlightCpp,
  lineComment: '//',
  samples,
  starterSample: samples.find((s) => s.id === 'factorial') ?? samples[0]!,
  copy: {
    solutionShape: 'a class Solution',
    callExample: 'ListNode* result = Solution().reverseList(buildList({1, 2, 3}));',
    callPlaceholder: 'int result = Solution().maxDepth(buildTree("[3,9,20]"));',
    callHint: 'For LeetCode code that only defines a class. It becomes the body of main(). buildList and buildTree are built in.',
    containers: 'vectors, maps, sets, structs and nodes',
    nullLiteral: 'nullptr',
    inputCall: 'cin',
    inputPlaceholder: 'Values for cin, separated by spaces or lines',
    helpers: ['ListNode', 'TreeNode', 'buildList({1, 2, 3})', 'buildTree("[1,2,3,null,4]")'],
  },
}
