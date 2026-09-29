import type { Machine } from './machine'
import type { JVal } from './values'

/** The element type of a primitive stream (IntStream, LongStream, DoubleStream), or null for Stream<T>. */
export type StreamPrim = 'int' | 'long' | 'double' | null

/**
 * A java.util.stream pipeline. Elements are pulled one at a time through
 * generators, so lambdas run in the order Java runs them: each element passes
 * every stage before the next one starts, `sorted` waits for all of them, and
 * `limit` or `findFirst` stop the source early.
 */
export class StreamVal {
  used = false

  constructor(
    readonly prim: StreamPrim,
    readonly items: IterableIterator<JVal>,
    /** The element count when Java knows it without running the pipeline (its SIZED flag), so count() skips the work. */
    readonly size: (() => number) | null,
  ) {}
}

type OptionalKind = 'Optional' | 'OptionalInt' | 'OptionalLong' | 'OptionalDouble'

/** Optional and its primitive versions. An empty one has no value at all, which is not the same as null. */
export class OptionalVal {
  constructor(
    readonly kind: OptionalKind,
    readonly value: JVal | undefined,
  ) {}
}

/** A Collector from java.util.stream.Collectors: make a container, add each element, finish into the result. */
export interface CollectorSpec {
  start(m: Machine): unknown
  add(m: Machine, acc: unknown, v: JVal): unknown
  finish(m: Machine, acc: unknown): JVal
}

export class CollectorVal {
  constructor(readonly spec: CollectorSpec) {}
}

/** A downstream collector's container while groupingBy fills its map; replaced by the finished value before anyone sees the map. */
export class PendingVal {
  constructor(readonly acc: unknown) {}
}

/** IntSummaryStatistics, LongSummaryStatistics and DoubleSummaryStatistics. */
export class StatsVal {
  count = 0n
  /** A long for int and long statistics; for doubles, Java's compensated sum as [sum, compensation, simple sum]. */
  sum: bigint | number[]
  min: number | bigint
  max: number | bigint

  constructor(readonly prim: 'int' | 'long' | 'double') {
    this.sum = prim === 'double' ? [0, 0, 0] : 0n
    this.min = prim === 'int' ? 2147483647 : prim === 'long' ? 9223372036854775807n : Infinity
    this.max = prim === 'int' ? -2147483648 : prim === 'long' ? -9223372036854775808n : -Infinity
  }
}
