export interface WorkerRequest {
  id: number
  code: string
  stdin: string
}

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'load-error'; message: string }
  | { type: 'result'; id: number; json: string }
  | { type: 'crash'; id: number; message: string }

/** The slice of a dedicated worker's global scope that engine workers use. */
export interface WorkerScope {
  postMessage(message: WorkerResponse): void
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
}
