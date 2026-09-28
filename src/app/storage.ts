// localStorage can throw (private mode, quota, disabled storage); the app must keep working without it.

export const KEYS = {
  language: 'stepthrough-language',
  draft: (engineId: string) => `stepthrough-draft-${engineId}`,
  seenGuide: 'stepthrough-seen-guide',
  legacyCode: 'stepthrough-code',
  legacyCall: 'stepthrough-call',
  legacyViews: 'stepthrough-views',
} as const

export function readText(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function readJSON<T>(key: string, fallback: T): T {
  const text = readText(key)
  if (text === null) return fallback
  try {
    return (JSON.parse(text) as T | null) ?? fallback
  } catch {
    return fallback
  }
}

export function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Persistence is a convenience; losing it must not break the session.
  }
}
