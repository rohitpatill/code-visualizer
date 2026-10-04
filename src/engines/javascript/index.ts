import { joinSource } from '../../app/source'
import { resolveSamples } from '../../samples/catalog'
import type { Engine } from '../types'
import { WorkerRunner } from '../workerRunner'
import { highlightJavaScript } from './highlight'
import { javascriptSamples } from './samples'

const samples = resolveSamples(javascriptSamples)

export const javascript: Engine = {
  id: 'javascript',
  label: 'JavaScript',
  createRunner: () =>
    new WorkerRunner(() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }), 'JavaScript'),
  buildProgram: joinSource,
  editorLanguage: () => import('@codemirror/lang-javascript').then((m) => m.javascript()),
  highlight: highlightJavaScript,
  lineComment: '//',
  samples,
  starterSample: samples.find((s) => s.id === 'factorial') ?? samples[0]!,
  copy: {
    solutionShape: 'just a function',
    callExample: 'const result = reverseList(buildList([1, 2, 3]))',
    callPlaceholder: 'const result = maxDepth(buildTree([3, 9, 20]))',
    callHint: 'For LeetCode code that only defines a function. It runs after your code. buildList and buildTree are built in.',
    containers: 'arrays, objects, maps and sets',
    nullLiteral: 'null',
    inputCall: 'prompt()',
    inputPlaceholder: 'One line per prompt() call',
    helpers: ['ListNode', 'TreeNode', 'buildList([1, 2, 3])', 'buildTree([1, 2, 3, null, 4])'],
  },
}
