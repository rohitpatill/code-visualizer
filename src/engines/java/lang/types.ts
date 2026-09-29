// Java types as the interpreter needs them. Generic arguments are kept for
// display (`ArrayList<Integer>`) and erased for behavior, as in Java.

export type PrimName = 'boolean' | 'byte' | 'short' | 'char' | 'int' | 'long' | 'float' | 'double'

export type JType =
  | { t: 'prim'; name: PrimName }
  | { t: 'void' }
  | { t: 'var' }
  | { t: 'array'; of: JType }
  | { t: 'ref'; name: string; args: JType[] }

type PrimType = Extract<JType, { t: 'prim' }>
export type RefType = Extract<JType, { t: 'ref' }>

const prim = (name: PrimName): PrimType => ({ t: 'prim', name })
export const ref = (name: string, args: JType[] = []): RefType => ({ t: 'ref', name, args })
export const arrayOf = (of: JType, dims = 1): JType => (dims <= 0 ? of : arrayOf({ t: 'array', of }, dims - 1))

export const T = {
  boolean: prim('boolean'),
  byte: prim('byte'),
  short: prim('short'),
  char: prim('char'),
  int: prim('int'),
  long: prim('long'),
  float: prim('float'),
  double: prim('double'),
  void: { t: 'void' } as JType,
  var: { t: 'var' } as JType,
  object: ref('Object'),
  string: ref('String'),
} as const

export const PRIM_NAMES: ReadonlySet<string> = new Set<PrimName>(['boolean', 'byte', 'short', 'char', 'int', 'long', 'float', 'double'])

export const BOX: Readonly<Record<PrimName, string>> = {
  boolean: 'Boolean',
  byte: 'Byte',
  short: 'Short',
  char: 'Character',
  int: 'Integer',
  long: 'Long',
  float: 'Float',
  double: 'Double',
}

const UNBOX: Readonly<Record<string, PrimName>> = Object.fromEntries(Object.entries(BOX).map(([p, b]) => [b, p as PrimName]))

/** The primitive a type holds directly or boxes, or null. */
export function primOf(t: JType): PrimName | null {
  if (t.t === 'prim') return t.name
  return t.t === 'ref' ? (UNBOX[t.name] ?? null) : null
}

const WIDER: Readonly<Record<PrimName, readonly PrimName[]>> = {
  boolean: [],
  byte: ['short', 'int', 'long', 'float', 'double'],
  short: ['int', 'long', 'float', 'double'],
  char: ['int', 'long', 'float', 'double'],
  int: ['long', 'float', 'double'],
  long: ['float', 'double'],
  float: ['double'],
  double: [],
}

/** Java's widening primitive conversions (JLS 5.1.2), plus identity. */
export const widens = (from: PrimName, to: PrimName): boolean => from === to || WIDER[from].includes(to)

export function typeName(t: JType): string {
  switch (t.t) {
    case 'prim':
      return t.name
    case 'array':
      return `${typeName(t.of)}[]`
    case 'ref':
      return t.args.length ? `${t.name}<${t.args.map(typeName).join(', ')}>` : t.name
    default:
      return t.t
  }
}
