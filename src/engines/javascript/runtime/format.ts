// console.log formatting, close to Node's so LeetCode habits carry over.

const MAX_DEPTH = 2
const MAX_ITEMS = 100
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`

function functionLabel(fn: Function): string {
  const source = Function.prototype.toString.call(fn)
  if (source.startsWith('class')) return `[class ${fn.name || '(anonymous)'}]`
  return fn.name ? `[Function: ${fn.name}]` : '[Function (anonymous)]'
}

function constructorName(obj: object): string | null {
  const proto: unknown = Object.getPrototypeOf(obj)
  if (proto === null || proto === Object.prototype) return null
  const ctor: unknown = Object.getOwnPropertyDescriptor(proto, 'constructor')?.value
  return typeof ctor === 'function' && ctor.name ? ctor.name : 'Object'
}

function list(items: string[], total: number, open: string, close: string): string {
  if (total > items.length) items.push(`... ${total - items.length} more items`)
  return items.length ? `${open} ${items.join(', ')} ${close}` : `${open}${close}`
}

function inspect(value: unknown, depth: number, seen: Set<object>): string {
  switch (typeof value) {
    case 'string':
      return quote(value)
    case 'number':
      return Object.is(value, -0) ? '-0' : String(value)
    case 'bigint':
      return `${value}n`
    case 'function':
      return functionLabel(value)
    case 'object':
      break
    default:
      return String(value)
  }
  if (value === null) return 'null'
  if (seen.has(value)) return '[Circular]'
  if (value instanceof Error) return `${value.name}: ${value.message}`
  if (value instanceof Date) return value.toISOString()
  if (value instanceof RegExp) return String(value)
  if (depth > MAX_DEPTH) return Array.isArray(value) ? '[Array]' : '[Object]'
  seen.add(value)
  const inner = (v: unknown) => inspect(v, depth + 1, seen)
  try {
    if (Array.isArray(value)) return list(value.slice(0, MAX_ITEMS).map(inner), value.length, '[', ']')
    if (value instanceof Map) {
      const entries = [...value].slice(0, MAX_ITEMS).map(([k, v]) => `${inner(k)} => ${inner(v)}`)
      return `Map(${value.size}) ${list(entries, value.size, '{', '}')}`
    }
    if (value instanceof Set) return `Set(${value.size}) ${list([...value].slice(0, MAX_ITEMS).map(inner), value.size, '{', '}')}`
    const keys = Object.keys(value)
    const props = keys.slice(0, MAX_ITEMS).map((k) => {
      const desc = Object.getOwnPropertyDescriptor(value, k)
      const shown = desc && 'value' in desc ? inner(desc.value) : '[Getter]'
      return `${IDENTIFIER.test(k) ? k : quote(k)}: ${shown}`
    })
    const body = list(props, keys.length, '{', '}')
    const name = constructorName(value)
    return name ? `${name} ${body}` : body
  } finally {
    seen.delete(value)
  }
}

export function formatArgs(args: readonly unknown[]): string {
  return args.map((a) => (typeof a === 'string' ? a : inspect(a, 0, new Set()))).join(' ')
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return `Uncaught ${formatArgs([error])}`
}
