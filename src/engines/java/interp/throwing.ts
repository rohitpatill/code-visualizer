import { type ClassInfo, isSubtype } from './classes'
import { Fault, JavaThrow } from './errors'
import type { Machine } from './machine'
import { instantiate } from './objects'
import { T } from '../lang/types'
import { refR } from './ops'
import { type JObject, JStr } from './values'

const PACKAGE: Readonly<Record<string, string>> = {
  NoSuchElementException: 'java.util',
  InputMismatchException: 'java.util',
  ConcurrentModificationException: 'java.util',
  EmptyStackException: 'java.util',
  IllegalFormatException: 'java.util',
  IllegalFormatConversionException: 'java.util',
  MissingFormatArgumentException: 'java.util',
  UnknownFormatConversionException: 'java.util',
  PatternSyntaxException: 'java.util.regex',
  IOException: 'java.io',
}

export const isThrowable = (cls: ClassInfo) => isSubtype(cls, 'Throwable')

/** The name a stack trace prints: built-in exceptions with their package, user classes as they are. */
export const javaName = (cls: ClassInfo) => (cls.decl.prelude && isThrowable(cls) ? `${PACKAGE[cls.name] ?? 'java.lang'}.${cls.name}` : cls.name)

/** Throwable.toString: `java.lang.ArithmeticException: / by zero`. */
export function throwableText(exc: JObject): string {
  const message = exc.fields.get('message')?.value
  return message instanceof JStr ? `${javaName(exc.cls)}: ${message.s}` : javaName(exc.cls)
}

/** Starts an exception on its way up from the running frame, recording the step where it was thrown. */
export function throwObject(m: Machine, exc: JObject): JavaThrow {
  const line = m.frame.line
  m.record('exception', line, { exc: throwableText(exc) })
  return new JavaThrow(exc, line)
}

/** A runtime fault as a real exception object, thrown from the running frame. */
export function raise(m: Machine, fault: Fault): JavaThrow {
  const cls = m.classes.resolve(fault.cls, null)
  if (!cls) throw new Error(`missing built-in exception ${fault.cls}`)
  const args = fault.detail === null ? [] : [refR(m.intern(fault.detail), T.string)]
  return throwObject(m, instantiate(m, cls, args, null, null))
}

/** Faults become Java exceptions in the frame where they happened; everything else passes through unchanged. */
export const asThrow = (m: Machine, err: unknown): unknown => (err instanceof Fault ? raise(m, err) : err)
