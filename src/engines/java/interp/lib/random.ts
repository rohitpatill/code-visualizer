import { toPrim } from '../convert'
import { Fault } from '../errors'
import type { Machine } from '../machine'
import { boolR, doubleR, intR, longR, refR } from '../ops'
import { NativeObj, type R } from '../values'
import { noMethod } from './common'

// java.util.Random's own linear congruential generator, so a seeded Random
// produces the same numbers as a real run.

const MULTIPLIER = 0x5deece66dn
const MASK = (1n << 48n) - 1n

const scramble = (seed: bigint) => (seed ^ MULTIPLIER) & MASK

function next(obj: NativeObj, bits: number): number {
  const seed = (obj.state.seed! * MULTIPLIER + 0xbn) & MASK
  obj.state.seed = seed
  return Number(BigInt.asIntN(32, seed >> BigInt(48 - bits)))
}

function nextBounded(obj: NativeObj, bound: number): number {
  if (bound <= 0) throw new Fault('IllegalArgumentException', 'bound must be positive')
  let r = next(obj, 31)
  const m = bound - 1
  if ((bound & m) === 0) return Number((BigInt(bound) * BigInt(r)) >> 31n)
  for (let u = r; ((u - (r = u % bound) + m) | 0) < 0; u = next(obj, 31));
  return r
}

/** Random.nextInt(origin, bound), as JDK 17's bounded generator computes it. */
function nextInRange(obj: NativeObj, origin: number, bound: number): number {
  if (origin >= bound) throw new Fault('IllegalArgumentException', 'bound must be greater than origin')
  let r = next(obj, 32)
  const n = (bound - origin) | 0
  const m = (n - 1) | 0
  if ((n & m) === 0) return ((r & m) + origin) | 0
  if (n > 0) {
    for (let u = r >>> 1; ((u + m - (r = u % n)) | 0) < 0; u = next(obj, 32) >>> 1);
    return (r + origin) | 0
  }
  while (r < origin || r >= bound) r = next(obj, 32)
  return r
}

export function newRandom(args: readonly R[]): R {
  const seed = args[0] ? BigInt(toPrim(args[0], 'long') as bigint) : BigInt(Math.floor(Math.random() * 2 ** 48))
  return refR(new NativeObj('random', { seed: scramble(seed) }))
}

export function randomMethod(_m: Machine, obj: NativeObj, name: string, args: readonly R[]): R {
  const int = (i: number) => toPrim(args[i]!, 'int') as number
  switch (name) {
    case 'nextInt':
      if (args.length === 2) return intR(nextInRange(obj, int(0), int(1)))
      return intR(args.length ? nextBounded(obj, int(0)) : next(obj, 32))
    case 'nextLong':
      return longR(BigInt.asIntN(64, (BigInt(next(obj, 32)) << 32n) + BigInt(next(obj, 32))))
    case 'nextDouble':
      return doubleR((next(obj, 26) * 2 ** 27 + next(obj, 27)) * 2 ** -53)
    case 'nextBoolean':
      return boolR(next(obj, 1) !== 0)
    case 'setSeed':
      obj.state.seed = scramble(BigInt(toPrim(args[0]!, 'long') as bigint))
      return { type: { t: 'void' }, value: null }
    default:
      throw noMethod('Random', name)
  }
}
