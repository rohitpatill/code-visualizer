import { useSyncExternalStore } from 'react'
import type { Runner, RunnerState } from './runner'
import type { Engine } from './types'

// One runner per engine for the whole session, so switching languages back
// and forth never reloads an interpreter.
const pool = new Map<string, Runner>()

export function runnerFor(engine: Engine): Runner {
  let runner = pool.get(engine.id)
  if (!runner) {
    runner = engine.createRunner()
    pool.set(engine.id, runner)
  }
  return runner
}

export function useRunner(engine: Engine): RunnerState & { run: Runner['run'] } {
  const runner = runnerFor(engine)
  const state = useSyncExternalStore(runner.subscribe, runner.getState)
  return { ...state, run: runner.run }
}
