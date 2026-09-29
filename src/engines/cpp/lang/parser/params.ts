import type { Param } from '../ast'
import { CompileError } from '../../../shared/syntax'
import type { Cursor } from './cursor'
import { parseExpr } from './expressions'
import { parseBaseType, parseDeclarator } from './typeSpec'

/** `(const vector<int>& nums, int k = 0)`. Array parameters decay to pointers, as in C++. */
export function parseParams(c: Cursor): Param[] {
  c.expect('(')
  const params: Param[] = []
  if (c.at('void') && c.at(')', 1)) c.next()
  while (!c.at(')')) {
    if (c.at('...')) throw new CompileError('variadic functions are not supported', c.line)
    const declared = parseDeclarator(c, parseBaseType(c))
    let type = declared.type
    const name = c.peek().kind === 'ident' ? c.next().text : `arg${params.length}`
    while (c.accept('[')) {
      while (!c.at(']') && !c.done) c.next()
      c.expect(']')
      type = { t: 'ptr', to: type }
    }
    const def = c.accept('=') ? parseExpr(c) : null
    params.push({ name, type, ref: declared.ref, def })
    if (!c.accept(',')) break
  }
  c.expect(')')
  return params
}
