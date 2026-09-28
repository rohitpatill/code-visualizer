import { createContext } from 'react'
import { useStore } from '../../app/store'

export interface Cover {
  /** Heap ids drawn inside a structure card. */
  coveredBy: ReadonlyMap<string, string>
  /** Heap ids that are the root of a structure card. */
  roots: ReadonlySet<string>
}

export const CoverContext = createContext<Cover>({ coveredBy: new Map(), roots: new Set() })

/** Subscribes to hover for one id only, so hovering re-renders two elements, not the tree. */
export const useIsHot = (id: string | null | undefined): boolean => useStore((s) => !!id && s.hovered === id)
