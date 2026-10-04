import { resolveSamples } from '../../samples/catalog'
import type { Engine } from '../types'
import { WorkerRunner } from '../workerRunner'
import { highlightJava } from './highlight'
import { javaSamples } from './samples'
import { buildJavaProgram } from './source'

const samples = resolveSamples(javaSamples)

export const java: Engine = {
  id: 'java',
  label: 'Java',
  createRunner: () => new WorkerRunner(() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }), 'Java'),
  buildProgram: buildJavaProgram,
  editorLanguage: () => import('@codemirror/lang-java').then((m) => m.java()),
  highlight: highlightJava,
  lineComment: '//',
  samples,
  starterSample: samples.find((s) => s.id === 'factorial') ?? samples[0]!,
  copy: {
    solutionShape: 'a class Solution',
    callExample: 'ListNode result = new Solution().reverseList(buildList(1, 2, 3));',
    callPlaceholder: 'int result = new Solution().maxDepth(buildTree(3, 9, 20));',
    callHint: 'For LeetCode code that only defines a class. It becomes the body of main(). buildList and buildTree are built in.',
    containers: 'arrays, lists, maps, sets and objects',
    nullLiteral: 'null',
    inputCall: 'Scanner',
    inputPlaceholder: 'Values for Scanner, separated by spaces or lines',
    helpers: ['ListNode', 'TreeNode', 'buildList(1, 2, 3)', 'buildTree(1, 2, 3, null, 4)'],
  },
}
