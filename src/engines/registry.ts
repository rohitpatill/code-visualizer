import { cpp } from './cpp'
import { java } from './java'
import { javascript } from './javascript'
import { python } from './python'
import type { Engine } from './types'

export const engines: readonly Engine[] = [python, javascript, java, cpp]

export const defaultEngine: Engine = python

export const findEngine = (id: string): Engine => engines.find((e) => e.id === id) ?? defaultEngine
