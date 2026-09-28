import { useCallback, useEffect, useRef, useState } from 'react'
import { Trace } from '../trace/Trace'
import type { WorkerRequest, WorkerResponse } from './protocol'
import type { Engine } from './types'

const TIMEOUT_MS = 15_000

export type EngineStatus = 'loading' | 'ready' | 'running' | 'failed'

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

// Owns one engine worker. A run that hangs (say, a loop that swallows the
// step-limit exception) gets the worker killed and a fresh one started.
export function useEngine(engine: Engine) {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const nextId = useRef(0)
  const [status, setStatus] = useState<EngineStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const settle = useCallback((trace: Trace) => {
    const pending = pendingRef.current
    if (!pending) return
    clearTimeout(pending.timer)
    pendingRef.current = null
    pending.resolve(trace)
  }, [])

  const start = useCallback(() => {
    const worker = engine.createWorker()
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.type === 'ready') setStatus('ready')
      else if (data.type === 'load-error') {
        setStatus('failed')
        setLoadError(data.message)
      } else if (pendingRef.current?.id === data.id) {
        settle(data.type === 'result' ? parseTrace(data.json) : Trace.failed(data.message))
        setStatus('ready')
      }
    }
    worker.onerror = (event) => {
      event.preventDefault()
      setStatus('failed')
      setLoadError(event.message || `The ${engine.label} worker failed to start`)
      settle(Trace.failed(`The ${engine.label} runner stopped unexpectedly.`))
    }
    workerRef.current = worker
    setStatus('loading')
    setLoadError(null)
  }, [engine, settle])

  useEffect(() => {
    start()
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      settle(Trace.failed('The run was cancelled.'))
    }
  }, [start, settle])

  const run = useCallback(
    (code: string, stdin: string): Promise<Trace> => {
      const worker = workerRef.current
      if (!worker || pendingRef.current) return Promise.resolve(Trace.failed('Another run is still in progress.'))
      return new Promise<Trace>((resolve) => {
        const id = ++nextId.current
        const timer = setTimeout(() => {
          worker.terminate()
          settle(Trace.failed(`Stopped after ${TIMEOUT_MS / 1000} seconds. The code probably never finishes.`))
          start()
        }, TIMEOUT_MS)
        pendingRef.current = { id, resolve, timer }
        setStatus('running')
        worker.postMessage({ id, code, stdin } satisfies WorkerRequest)
      })
    },
    [settle, start],
  )

  return { status, loadError, run }
}
