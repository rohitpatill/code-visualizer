// Runs Python off the main thread so a long trace never freezes the page.
importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js')

const ready = (async () => {
  const pyodide = await loadPyodide()
  const tracerSource = await (await fetch('tracer.py')).text()
  pyodide.runPython(tracerSource)
  return pyodide
})()

ready
  .then(() => postMessage({ type: 'ready' }))
  .catch((err) => postMessage({ type: 'load-error', message: String(err) }))

onmessage = async (event) => {
  const { id, code, stdin } = event.data
  try {
    const pyodide = await ready
    const runTrace = pyodide.globals.get('run_trace')
    const json = runTrace(code, stdin || '')
    runTrace.destroy()
    postMessage({ type: 'result', id, result: JSON.parse(json) })
  } catch (err) {
    postMessage({ type: 'result', id, result: { steps: [], error: { message: String(err), line: null } } })
  }
}
