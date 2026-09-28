import type { PyodideInterface } from 'pyodide'
import type { WorkerScope } from '../protocol'
import { PYODIDE_CDN } from './pyodide'
import { type RunTrace, installTracer } from './runtime'

const scope = self as unknown as WorkerScope

const ready: Promise<RunTrace> = (async () => {
  const { loadPyodide } = (await import(/* @vite-ignore */ `${PYODIDE_CDN}pyodide.mjs`)) as {
    loadPyodide: (options: { indexURL: string }) => Promise<PyodideInterface>
  }
  return installTracer(await loadPyodide({ indexURL: PYODIDE_CDN }))
})()

ready.then(
  () => scope.postMessage({ type: 'ready' }),
  (err: unknown) => scope.postMessage({ type: 'load-error', message: String(err) }),
)

scope.onmessage = async ({ data }) => {
  try {
    const runTrace = await ready
    scope.postMessage({ type: 'result', id: data.id, json: runTrace(data.code, data.stdin) })
  } catch (err) {
    scope.postMessage({ type: 'crash', id: data.id, message: String(err) })
  }
}
