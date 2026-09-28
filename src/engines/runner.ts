import type { Trace } from '../trace/Trace'

export type RunnerStatus = 'loading' | 'ready' | 'running' | 'failed'

export interface RunnerState {
  status: RunnerStatus
  error: string | null
}

/**
 * Executes code and returns its trace. A browser worker is one implementation;
 * a remote sandbox (for compiled languages) is another. The UI only sees this.
 */
export interface Runner {
  /** Returns the same object until the state changes. */
  getState(): RunnerState
  subscribe(listener: () => void): () => void
  run(code: string, stdin: string): Promise<Trace>
}
