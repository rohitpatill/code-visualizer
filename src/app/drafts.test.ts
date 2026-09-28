// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { python } from '../engines/python'
import { loadDraft, saveDraft, starterDraft } from './drafts'
import { KEYS } from './storage'

beforeEach(() => localStorage.clear())

describe('drafts', () => {
  it('starts from the engine starter sample', () => {
    expect(loadDraft(python)).toEqual(starterDraft(python))
    expect(starterDraft(python).code).toContain('def fact')
  })

  it('round-trips a saved draft per language', () => {
    saveDraft('python', { code: 'x = 1', call: 'f()', views: { a: 'array' } })
    saveDraft('javascript', { code: 'let x = 2', call: '', views: {} })
    expect(loadDraft(python)).toEqual({ code: 'x = 1', call: 'f()', views: { a: 'array' } })
  })

  it('migrates drafts saved before languages existed into Python', () => {
    localStorage.setItem(KEYS.legacyCode, 'print(1)')
    localStorage.setItem(KEYS.legacyViews, JSON.stringify({ nums: 'array' }))
    expect(loadDraft(python)).toEqual({ code: 'print(1)', call: '', views: { nums: 'array' } })
  })

  it('ignores a corrupt draft', () => {
    localStorage.setItem(KEYS.draft('python'), '{not json')
    expect(loadDraft(python)).toEqual(starterDraft(python))
  })
})
