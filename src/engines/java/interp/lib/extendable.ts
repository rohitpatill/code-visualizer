/** Built-in classes a program may extend: the object then wraps a real one, and inherited methods go to it. */
const EXTENDABLE = new Set([
  'ArrayList', 'LinkedList', 'ArrayDeque', 'Stack', 'Vector', 'HashMap', 'LinkedHashMap', 'TreeMap', 'HashSet', 'LinkedHashSet', 'TreeSet',
  'PriorityQueue', 'Random',
])

const FINAL = new Set(['String', 'StringBuilder', 'StringBuffer', 'Integer', 'Long', 'Double', 'Float', 'Short', 'Byte', 'Character', 'Boolean', 'Math', 'System', 'Scanner', 'Optional'])

export const isExtendableLib = (name: string): boolean => EXTENDABLE.has(name)

/** Why `name` cannot be extended, or null if it can (or is not a built-in class at all). */
export function extendError(name: string): string | null {
  if (FINAL.has(name)) return `cannot inherit from final ${name}`
  if (name === 'Thread') return 'threads are not supported by the visualizer'
  return null
}
