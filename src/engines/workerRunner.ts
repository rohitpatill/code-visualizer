import { Trace } from '../trace/Trace'
import type { WorkerRequest, WorkerResponse } from './protocol'
import type { Runner, RunnerState, RunnerStatus } from './runner'

export const RUN_TIMEOUT_MS = 15_000

interface Pending {
  id: number
  resolve: (trace: Trace) => void
  timer: ReturnType<typeof setTimeout>
}

function parseTrace(json: string): Trace {
  try {
    return Trace.parse(json)
  } catch (err) {
    return Trace.failed(`The trace could not be read: ${String(err)}`)
  }
}

// Runs an engine in a Web Worker. A run that hangs (say, a loop that swallows
// the step-limit exception) gets the worker killed and a fresh one started.
export class WorkerRunner implements Runner {
  private worker: Worker | null = null
  private pending: Pending | null = null
  private nextId = 0
  private state: RunnerState = { status: 'loading', error: null }
  private readonly listeners = new Set<() => void>()

  constructor(
    private readonly spawn: () => Worker,
    private readonly label: string,
    private readonly timeoutMs = RUN_TIMEOUT_MS,
  ) {
    this.start()
  }

  getState = (): RunnerState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  run = (code: string, stdin: string): Promise<Trace> => {
    const worker = this.worker
    if (!worker || this.pending) return Promise.resolve(Trace.failed('Another run is still in progress.'))
    return new Promise<Trace>((resolve) => {
      const id = ++this.nextId
      const timer = setTimeout(() => {
        worker.terminate()
        this.settle(Trace.failed(`Stopped after ${this.timeoutMs / 1000} seconds. The code probably never finishes.`))
        this.start()
      }, this.timeoutMs)
      this.pending = { id, resolve, timer }
      this.setStatus('running')
      worker.postMessage({ id, code, stdin } satisfies WorkerRequest)
    })
  }

  private setStatus(status: RunnerStatus, error: string | null = null): void {
    this.state = { status, error }
    for (const listener of this.listeners) listener()
  }

  private settle(trace: Trace): void {
    const pending = this.pending
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending = null
    pending.resolve(trace)
  }

  private start(): void {
    const worker = this.spawn()
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.type === 'ready') this.setStatus('ready')
      else if (data.type === 'load-error') this.setStatus('failed', data.message)
      else if (this.pending?.id === data.id) {
        this.settle(data.type === 'result' ? parseTrace(data.json) : Trace.failed(data.message))
        this.setStatus('ready')
      }
    }
    worker.onerror = (event) => {
      event.preventDefault()
      this.setStatus('failed', event.message || `The ${this.label} worker failed to start`)
      this.settle(Trace.failed(`The ${this.label} runner stopped unexpectedly.`))
    }
    this.worker = worker
    this.setStatus('loading')
  }
}
