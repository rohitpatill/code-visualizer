import { useCallback, useEffect, useRef, useState } from 'react'

const TIMEOUT_MS = 15000

// Owns the Pyodide worker. If a run hangs (e.g. an infinite loop that swallows
// our step-limit exception), the worker is killed and a fresh one is started.
export function usePython() {
  const workerRef = useRef(null)
  const pendingRef = useRef(null)
  const [status, setStatus] = useState('loading') // loading | ready | running | failed
  const [loadError, setLoadError] = useState(null)

  const startWorker = useCallback(() => {
    const worker = new Worker('/pyodide-worker.js')
    worker.onmessage = (event) => {
      const msg = event.data
      if (msg.type === 'ready') setStatus('ready')
      if (msg.type === 'load-error') {
        setStatus('failed')
        setLoadError(msg.message)
      }
      if (msg.type === 'result' && pendingRef.current?.id === msg.id) {
        clearTimeout(pendingRef.current.timer)
        pendingRef.current.resolve(msg.result)
        pendingRef.current = null
        setStatus('ready')
      }
    }
    workerRef.current = worker
  }, [])

  useEffect(() => {
    startWorker()
    return () => workerRef.current?.terminate()
  }, [startWorker])

  const run = useCallback(
    (code, stdin) =>
      new Promise((resolve) => {
        const id = Math.random().toString(36).slice(2)
        const timer = setTimeout(() => {
          workerRef.current.terminate()
          pendingRef.current = null
          setStatus('loading')
          startWorker()
          resolve({
            steps: [],
            error: { message: `Stopped after ${TIMEOUT_MS / 1000} seconds. The code probably never finishes.`, line: null },
          })
        }, TIMEOUT_MS)
        pendingRef.current = { id, resolve, timer }
        setStatus('running')
        workerRef.current.postMessage({ id, code, stdin })
      }),
    [startWorker],
  )

  return { status, loadError, run }
}
