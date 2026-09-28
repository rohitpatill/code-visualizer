// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { javascript } from '../engines/javascript'
import { python } from '../engines/python'
import { KEYS } from './storage'
import { persistDrafts, useStore } from './store'

const initial = useStore.getState()

beforeEach(() => {
  localStorage.clear()
  useStore.setState(initial, true)
})

describe('language switching', () => {
  it('keeps a separate draft per language, even without storage', () => {
    const s = useStore.getState()
    s.setCode('x = 1')
    s.setView('nums', 'array')
    s.setEngine('javascript')
    expect(useStore.getState()).toMatchObject({ engine: javascript, code: javascript.starterSample.code, views: {} })
    useStore.getState().setCode('let y = 2;')
    useStore.getState().setEngine('python')
    expect(useStore.getState()).toMatchObject({ engine: python, code: 'x = 1', views: { nums: 'array' } })
    useStore.getState().setEngine('javascript')
    expect(useStore.getState().code).toBe('let y = 2;')
  })

  it('closes any open run and clears breakpoints on switch', () => {
    useStore.getState().toggleBreakpoint(3)
    useStore.getState().setEngine('javascript')
    expect(useStore.getState()).toMatchObject({ run: null, breakpoints: new Set() })
  })

  it('persists the language and the active draft', () => {
    const stop = persistDrafts()
    useStore.getState().setEngine('javascript')
    useStore.getState().setCode('let z = 3;')
    stop()
    expect(localStorage.getItem(KEYS.language)).toBe('javascript')
    expect(JSON.parse(localStorage.getItem(KEYS.draft('javascript'))!)).toMatchObject({ code: 'let z = 3;' })
  })
})
