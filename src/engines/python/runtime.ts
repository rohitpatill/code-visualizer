import type { PyodideInterface } from 'pyodide'
import helpersSource from './helpers.py?raw'
import tracerSource from './tracer.py?raw'

export type RunTrace = (code: string, stdin: string) => string

/** Installs the helpers module and the tracer into a fresh interpreter. */
export function installTracer(pyodide: PyodideInterface): RunTrace {
  pyodide.FS.writeFile('stepthrough_helpers.py', helpersSource)
  pyodide.runPython(tracerSource)
  return pyodide.globals.get('run_trace') as RunTrace
}
