import { useEffect } from 'react'
import { useStore } from './store'

const TYPING = 'input, textarea, select, .cm-editor'

export function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      if (!s.run || s.guideOpen) return
      if (e.target instanceof Element && e.target.closest(TYPING)) return
      if (e.key === 'ArrowRight' && e.shiftKey) s.stepOver()
      else if (e.key === 'ArrowUp' && e.shiftKey) s.stepOut()
      else if (e.key === 'ArrowRight') s.next()
      else if (e.key === 'ArrowLeft') s.go(s.index - 1)
      else if (e.key === 'Home') s.go(0)
      else if (e.key === 'End') s.go(s.run.trace.length - 1)
      else if (e.key === ' ') s.togglePlay()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
