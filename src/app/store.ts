import { create } from 'zustand'
import { defaultEngine } from '../engines/registry'
import type { Engine, Sample } from '../engines/types'
import { type Question, questionFor, sameAnswer } from '../model/guess'
import type { ViewName, Views } from '../structures/types'
import type { Trace } from '../trace/Trace'
import { findStep, isBreakpointHit, stepOutTarget, stepOverTarget } from './navigation'
import { KEYS, readJSON, readText, write } from './storage'

export const SPEEDS = [
  { label: 'Slow', ms: 1200 },
  { label: 'Normal', ms: 600 },
  { label: 'Fast', ms: 200 },
] as const

export type Tab = 'memory' | 'calls'

export interface Quiz {
  question: Question
  input: string
  result: 'right' | 'wrong' | null
}

export interface Run {
  trace: Trace
  source: string
}

interface State {
  engine: Engine
  code: string
  call: string
  stdin: string
  views: Views
  run: Run | null
  index: number
  playing: boolean
  speed: number
  tab: Tab
  breakpoints: ReadonlySet<number>
  guessMode: boolean
  quiz: Quiz | null
  score: { right: number; total: number }
  hovered: string | null
  guideOpen: boolean
}

interface Actions {
  setCode(code: string): void
  setCall(call: string): void
  setStdin(stdin: string): void
  loadSample(sample: Sample): void
  setView(name: string, view: ViewName | null): void
  openRun(trace: Trace, source: string): void
  closeRun(): void
  go(index: number): void
  next(): void
  stepOver(): void
  stepOut(): void
  nextBreakpoint(): void
  tick(): void
  togglePlay(): void
  setSpeed(speed: number): void
  setTab(tab: Tab): void
  toggleBreakpoint(line: number): void
  toggleGuess(): void
  setQuizInput(input: string): void
  checkGuess(): void
  setHovered(id: string | null): void
  setGuideOpen(open: boolean): void
}

export type Store = State & Actions

const lastIndex = (run: Run | null) => (run ? run.trace.length - 1 : 0)

export const useStore = create<Store>()((set, get) => ({
  engine: defaultEngine,
  code: readText(KEYS.code) ?? defaultEngine.starterSample.code,
  call: readText(KEYS.call) ?? '',
  stdin: '',
  views: readJSON<Views>(KEYS.views, {}),
  run: null,
  index: 0,
  playing: false,
  speed: 1,
  tab: 'memory',
  breakpoints: new Set(),
  guessMode: false,
  quiz: null,
  score: { right: 0, total: 0 },
  hovered: null,
  guideOpen: readText(KEYS.seenGuide) === null,

  setCode: (code) => set({ code }),
  setCall: (call) => set({ call }),
  setStdin: (stdin) => set({ stdin }),
  loadSample: (sample) =>
    set({ code: sample.code, call: sample.call ?? '', views: sample.views ?? {}, breakpoints: new Set() }),
  setView: (name, view) =>
    set(({ views }) => {
      const { [name]: _, ...rest } = views
      return { views: view ? { ...rest, [name]: view } : rest }
    }),

  openRun: (trace, source) =>
    set({ run: { trace, source }, index: 0, playing: false, quiz: null, score: { right: 0, total: 0 }, tab: 'memory', hovered: null }),
  closeRun: () => set({ run: null, playing: false, quiz: null, hovered: null }),

  go: (index) => set(({ run }) => ({ index: Math.max(0, Math.min(lastIndex(run), index)), quiz: null })),
  next: () => {
    const { run, index, guessMode, quiz, go } = get()
    if (!run || index >= lastIndex(run)) return
    if (!guessMode || quiz?.result) return go(index + 1)
    if (quiz) return
    const records = run.trace.records
    const question = questionFor(records[index]!, records[index + 1]!)
    if (question) set({ quiz: { question, input: '', result: null } })
    else go(index + 1)
  },
  stepOver: () => {
    const { run, index, go } = get()
    if (run) go(stepOverTarget(run.trace.records, index))
  },
  stepOut: () => {
    const { run, index, go } = get()
    if (run) go(stepOutTarget(run.trace.records, index))
  },
  nextBreakpoint: () => {
    const { run, index, breakpoints, go } = get()
    if (run) go(findStep(run.trace.records, index, (r) => isBreakpointHit(r, breakpoints)))
  },
  tick: () => {
    const { run, index, breakpoints } = get()
    const upcoming = run?.trace.records[index + 1]
    if (!upcoming) return set({ playing: false })
    const atEnd = index + 1 >= lastIndex(run)
    set({ index: index + 1, quiz: null, playing: !atEnd && !isBreakpointHit(upcoming, breakpoints) })
  },
  togglePlay: () => {
    const { run, index, playing } = get()
    if (!run) return
    if (index >= lastIndex(run)) set({ index: 0, playing: true, quiz: null })
    else set({ playing: !playing })
  },
  setSpeed: (speed) => set({ speed }),
  setTab: (tab) => set({ tab }),
  toggleBreakpoint: (line) =>
    set(({ breakpoints }) => {
      const next = new Set(breakpoints)
      if (!next.delete(line)) next.add(line)
      return { breakpoints: next }
    }),

  toggleGuess: () => set(({ guessMode }) => ({ guessMode: !guessMode, quiz: null })),
  setQuizInput: (input) => set(({ quiz }) => (quiz ? { quiz: { ...quiz, input } } : {})),
  checkGuess: () => {
    const { quiz, score } = get()
    if (!quiz || quiz.result) return
    const right = sameAnswer(quiz.input, quiz.question.answer)
    set({
      quiz: { ...quiz, result: right ? 'right' : 'wrong' },
      score: { right: score.right + (right ? 1 : 0), total: score.total + 1 },
    })
  },

  setHovered: (hovered) => set({ hovered }),
  setGuideOpen: (guideOpen) => {
    if (!guideOpen) write(KEYS.seenGuide, '1')
    set({ guideOpen })
  },
}))

/** Saves drafts and view choices whenever they change. */
export function persistDrafts(): () => void {
  return useStore.subscribe((s, prev) => {
    if (s.code !== prev.code) write(KEYS.code, s.code)
    if (s.call !== prev.call) write(KEYS.call, s.call)
    if (s.views !== prev.views) write(KEYS.views, JSON.stringify(s.views))
  })
}
