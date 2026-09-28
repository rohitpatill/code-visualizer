import type { Extension } from '@codemirror/state'
import type { Views } from '../structures/types'

export interface Sample {
  group: string
  name: string
  code: string
  /** Code that calls the solution, run after `code`. */
  call?: string
  views?: Views
}

export interface Token {
  text: string
  cls: string | null
}

export interface EngineCopy {
  callPlaceholder: string
  callHint: string
  callExample: string
  /** The language's null literal, e.g. None. */
  nullLiteral: string
  /** How user code reads a line of input, e.g. input(). */
  inputCall: string
  /** Helpers available without defining them, as code snippets. */
  helpers: readonly string[]
}

export interface Engine {
  id: string
  label: string
  createWorker(): Worker
  editorLanguage(): Extension
  highlight(line: string): Token[]
  samples: readonly Sample[]
  starterSample: Sample
  copy: EngineCopy
}
