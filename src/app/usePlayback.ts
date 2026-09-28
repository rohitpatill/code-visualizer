import { useEffect } from 'react'
import { SPEEDS, useStore } from './store'

export function usePlayback(): void {
  const playing = useStore((s) => s.playing)
  const index = useStore((s) => s.index)
  const speed = useStore((s) => s.speed)
  const tick = useStore((s) => s.tick)

  useEffect(() => {
    if (!playing) return
    const timer = setTimeout(tick, SPEEDS[speed]?.ms ?? SPEEDS[1].ms)
    return () => clearTimeout(timer)
  }, [playing, index, speed, tick])
}
