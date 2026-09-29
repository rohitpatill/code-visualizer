import { ScopeChain } from '../../shared/scope'
import type { Cell } from './values'

export class Scope extends ScopeChain<Cell> {}
