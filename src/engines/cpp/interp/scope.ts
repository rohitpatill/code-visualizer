import type { Cell } from './values'

export class Scope {
  readonly vars = new Map<string, Cell>()

  constructor(readonly parent: Scope | null) {}

  find(name: string, stopAt: Scope | null = null): Cell | undefined {
    for (let s: Scope | null = this; s && s !== stopAt; s = s.parent) {
      const cell = s.vars.get(name)
      if (cell) return cell
    }
    return undefined
  }
}
