import type { JObject } from './values'

/**
 * A Java exception raised by the runtime or the library, such as
 * ArithmeticException for `/ by zero`. It becomes a real exception object in
 * the frame where it happened, so user code can catch it.
 */
export class Fault extends Error {
  constructor(
    readonly cls: string,
    readonly detail: string | null = null,
  ) {
    super(detail ? `${cls}: ${detail}` : cls)
  }
}

/** A thrown Java exception object on its way to a catch. `line` is where it was thrown. */
export class JavaThrow extends Error {
  constructor(
    readonly exc: JObject,
    readonly line: number,
  ) {
    super('java exception')
  }
}

/** Something javac would have rejected, found while running (the interpreter has no type checker). Not catchable. */
export class CompileStop extends Error {}

/** System.exit: the program ends here, without running finally blocks. */
export class ExitSignal extends Error {}
