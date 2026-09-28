import type { Engine } from '../engines/types'
import type { Views } from '../structures/types'
import { KEYS, readJSON, readText, write } from './storage'

/** What the user is editing in one language. Each language keeps its own. */
export interface Draft {
  code: string
  call: string
  views: Views
}

const isDraft = (d: unknown): d is Draft =>
  typeof d === 'object' && d !== null && typeof (d as Draft).code === 'string' && typeof (d as Draft).call === 'string'

// Drafts saved before languages existed used three separate keys and were always Python.
function legacyDraft(): Draft | null {
  const code = readText(KEYS.legacyCode)
  if (code === null) return null
  return { code, call: readText(KEYS.legacyCall) ?? '', views: readJSON<Views>(KEYS.legacyViews, {}) }
}

export function starterDraft(engine: Engine): Draft {
  const { code, call, views } = engine.starterSample
  return { code, call: call ?? '', views: views ?? {} }
}

export function loadDraft(engine: Engine): Draft {
  const saved = readJSON<unknown>(KEYS.draft(engine.id), null)
  if (isDraft(saved)) return { ...saved, views: saved.views ?? {} }
  return (engine.id === 'python' && legacyDraft()) || starterDraft(engine)
}

export function saveDraft(engineId: string, draft: Draft): void {
  write(KEYS.draft(engineId), JSON.stringify(draft))
}
