// Static C++ types for the supported subset. The interpreter carries a type
// with every value, which is what gives integer division, overflow, char
// arithmetic and copy-versus-reference their real C++ meaning.

export interface IntType {
  t: 'int'
  name: string
  bits: 8 | 16 | 32 | 64
  unsigned: boolean
}

export type CType =
  | { t: 'void' }
  | { t: 'bool' }
  | { t: 'char' }
  | IntType
  | { t: 'float'; name: 'float' | 'double' }
  | { t: 'string' }
  | { t: 'vector' | 'deque' | 'queue' | 'stack'; of: CType }
  | { t: 'pq'; of: CType; greater: boolean }
  | { t: 'map'; key: CType; val: CType; ordered: boolean }
  | { t: 'set'; of: CType; ordered: boolean }
  | { t: 'pair'; a: CType; b: CType }
  | { t: 'array'; of: CType; size: number }
  | { t: 'ptr'; to: CType }
  | { t: 'class'; name: string }
  | { t: 'auto' }
  | { t: 'fn' }
  | { t: 'iter'; of: CType }
  | { t: 'stream' }
  | { t: 'cmp'; greater: boolean }

export type SeqType = Extract<CType, { t: 'vector' | 'deque' | 'queue' | 'stack' | 'pq' | 'array' }>

const int = (name: string, bits: IntType['bits'], unsigned: boolean): IntType => ({ t: 'int', name, bits, unsigned })

export const T = {
  void: { t: 'void' } as CType,
  bool: { t: 'bool' } as CType,
  char: { t: 'char' } as CType,
  int: int('int', 32, false),
  unsigned: int('unsigned int', 32, true),
  long: int('long', 64, false),
  longLong: int('long long', 64, false),
  unsignedLongLong: int('unsigned long long', 64, true),
  sizeT: int('size_t', 64, true),
  short: int('short', 16, false),
  double: { t: 'float', name: 'double' } as CType,
  float: { t: 'float', name: 'float' } as CType,
  string: { t: 'string' } as CType,
  auto: { t: 'auto' } as CType,
  fn: { t: 'fn' } as CType,
  stream: { t: 'stream' } as CType,
} as const

/** Integer spellings, normalized: `long long int`, `unsigned`, `int64_t` and friends. */
export function intFromWords(words: readonly string[]): IntType | null {
  const set = new Set(words)
  const unsigned = set.has('unsigned')
  const longs = words.filter((w) => w === 'long').length
  if (set.has('short')) return int(unsigned ? 'unsigned short' : 'short', 16, unsigned)
  if (longs >= 2) return unsigned ? T.unsignedLongLong : T.longLong
  if (longs === 1) return int(unsigned ? 'unsigned long' : 'long', 64, unsigned)
  if (set.has('int') || set.has('unsigned') || set.has('signed')) return unsigned ? T.unsigned : T.int
  return null
}

export const NAMED_INTS: Readonly<Record<string, IntType>> = {
  size_t: T.sizeT,
  int64_t: T.longLong,
  int32_t: T.int,
  uint64_t: T.unsignedLongLong,
  uint32_t: T.unsigned,
  int8_t: int('int8_t', 8, false),
  uint8_t: int('uint8_t', 8, true),
}

export const isInt = (t: CType): t is IntType => t.t === 'int'
export const isArithmetic = (t: CType) => t.t === 'int' || t.t === 'float' || t.t === 'char' || t.t === 'bool'
export const isSeq = (t: CType): t is SeqType =>
  t.t === 'vector' || t.t === 'deque' || t.t === 'queue' || t.t === 'stack' || t.t === 'pq' || t.t === 'array'

/** Element type of anything iterable, or null. */
export function elementOf(t: CType): CType | null {
  switch (t.t) {
    case 'vector':
    case 'deque':
    case 'queue':
    case 'stack':
    case 'pq':
    case 'array':
    case 'set':
      return t.of
    case 'string':
      return T.char
    case 'map':
      return { t: 'pair', a: t.key, b: t.val }
    default:
      return null
  }
}

export function typeName(t: CType): string {
  switch (t.t) {
    case 'int':
      return t.name
    case 'float':
      return t.name
    case 'vector':
    case 'deque':
    case 'queue':
    case 'stack':
      return `${t.t}<${typeName(t.of)}>`
    case 'pq':
      return t.greater ? `priority_queue<${typeName(t.of)}, greater>` : `priority_queue<${typeName(t.of)}>`
    case 'map':
      return `${t.ordered ? 'map' : 'unordered_map'}<${typeName(t.key)}, ${typeName(t.val)}>`
    case 'set':
      return `${t.ordered ? 'set' : 'unordered_set'}<${typeName(t.of)}>`
    case 'pair':
      return `pair<${typeName(t.a)}, ${typeName(t.b)}>`
    case 'array':
      return `${typeName(t.of)}[${t.size}]`
    case 'ptr':
      return `${typeName(t.to)}*`
    case 'class':
      return t.name
    case 'iter':
      return 'iterator'
    case 'fn':
      return 'function'
    case 'cmp':
      return t.greater ? 'greater' : 'less'
    default:
      return t.t
  }
}

export function sameType(a: CType, b: CType): boolean {
  return typeName(a) === typeName(b)
}
