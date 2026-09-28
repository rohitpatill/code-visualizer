import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerRequest, WorkerResponse } from './protocol'
import { WorkerRunner } from './workerRunner'

const RAW = JSON.stringify({ steps: [], truncated: false, error: null, stdout: 'hi', maxSteps: 3000 })

class FakeWorker {
  static spawned: FakeWorker[] = []
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  sent: WorkerRequest[] = []
  terminated = false

  constructor() {
    FakeWorker.spawned.push(this)
  }

  postMessage(message: WorkerRequest) {
    this.sent.push(message)
  }

  terminate() {
    this.terminated = true
  }

  emit(data: WorkerResponse) {
    this.onmessage?.({ data } as MessageEvent<WorkerResponse>)
  }
}

const make = () => new WorkerRunner(() => new FakeWorker() as unknown as Worker, 'Test', 1000)
const lastWorker = () => FakeWorker.spawned[FakeWorker.spawned.length - 1]!

beforeEach(() => {
  FakeWorker.spawned = []
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('WorkerRunner', () => {
  it('reports loading, then ready, and notifies subscribers', () => {
    const runner = make()
    const listener = vi.fn()
    runner.subscribe(listener)
    expect(runner.getState().status).toBe('loading')
    lastWorker().emit({ type: 'ready' })
    expect(runner.getState()).toEqual({ status: 'ready', error: null })
    expect(listener).toHaveBeenCalledOnce()
  })

  it('resolves a run with the parsed trace', async () => {
    const runner = make()
    lastWorker().emit({ type: 'ready' })
    const pending = runner.run('x = 1', '')
    expect(runner.getState().status).toBe('running')
    const { id } = lastWorker().sent[0]!
    lastWorker().emit({ type: 'result', id, json: RAW })
    expect((await pending).stdout).toBe('hi')
    expect(runner.getState().status).toBe('ready')
  })

  it('refuses a second run while one is in progress', async () => {
    const runner = make()
    lastWorker().emit({ type: 'ready' })
    void runner.run('a', '')
    expect((await runner.run('b', '')).error?.message).toContain('in progress')
  })

  it('kills a hung worker, reports the timeout and starts a fresh one', async () => {
    const runner = make()
    const first = lastWorker()
    first.emit({ type: 'ready' })
    const pending = runner.run('while True: pass', '')
    vi.advanceTimersByTime(1000)
    expect((await pending).error?.message).toContain('Stopped after 1 seconds')
    expect(first.terminated).toBe(true)
    expect(FakeWorker.spawned).toHaveLength(2)
    expect(runner.getState().status).toBe('loading')
  })

  it('turns a crash and a load failure into readable errors', async () => {
    const runner = make()
    lastWorker().emit({ type: 'ready' })
    const pending = runner.run('x', '')
    lastWorker().emit({ type: 'crash', id: lastWorker().sent[0]!.id, message: 'boom' })
    expect((await pending).error?.message).toBe('boom')
    lastWorker().emit({ type: 'load-error', message: 'offline' })
    expect(runner.getState()).toEqual({ status: 'failed', error: 'offline' })
  })

  it('ignores results for a run it no longer waits on', async () => {
    const runner = make()
    lastWorker().emit({ type: 'ready' })
    const pending = runner.run('x', '')
    lastWorker().emit({ type: 'result', id: 999, json: RAW })
    lastWorker().emit({ type: 'result', id: lastWorker().sent[0]!.id, json: 'not json' })
    expect((await pending).error?.message).toContain('could not be read')
  })
})
