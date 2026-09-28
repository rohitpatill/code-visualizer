import type { Extension } from '@codemirror/state'
import type { SampleId } from '../samples/catalog'
import type { Views } from '../structures/types'
import type { Runner } from './runner'

export interface Sample {
  id: SampleId
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

/** Every piece of UI copy that depends on the language. */
export interface EngineCopy {
  /** How LeetCode code looks in this language, e.g. "a class Solution". */
  solutionShape: string
  callExample: string
  callPlaceholder: string
  callHint: string
  /** The kinds of objects that live on the heap, e.g. "lists, dicts and objects". */
  containers: string
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
  createRunner(): Runner
  editorLanguage(): Extension
  highlight(line: string): Token[]
  samples: readonly Sample[]
  starterSample: Sample
  copy: EngineCopy
}
