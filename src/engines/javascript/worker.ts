import type { WorkerScope } from '../protocol'
import { runTrace } from './runtime/run'

const scope = self as unknown as WorkerScope

scope.onmessage = ({ data }) => {
  try {
    scope.postMessage({ type: 'result', id: data.id, json: runTrace(data.code, data.stdin) })
  } catch (err) {
    scope.postMessage({ type: 'crash', id: data.id, message: String(err) })
  }
}

scope.postMessage({ type: 'ready' })
