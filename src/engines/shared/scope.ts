/** Nested block scopes of one interpreted program: names to storage, innermost first. */
export class ScopeChain<V> {
  readonly vars = new Map<string, V>()

  constructor(readonly parent: ScopeChain<V> | null) {}

  find(name: string, stopAt: ScopeChain<V> | null = null): V | undefined {
    for (let s: ScopeChain<V> | null = this; s && s !== stopAt; s = s.parent) {
      const found = s.vars.get(name)
      if (found) return found
    }
    return undefined
  }
}
