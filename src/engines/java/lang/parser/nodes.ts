import type { Expr, Stmt } from '../ast'

type Without<U, K extends PropertyKey> = U extends unknown ? Omit<U, K> : never

export const exprNode = (line: number, e: Without<Expr, 'line'>): Expr => ({ ...e, line }) as Expr
export const stmtNode = (line: number, s: Without<Stmt, 'line'>): Stmt => ({ ...s, line }) as Stmt
