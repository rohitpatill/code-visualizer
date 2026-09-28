import { type ObjectLess, compareVals } from '../compare'
import type { Cell, MapVal, SetVal, Val } from '../values'

// std::map and std::set iterate in key order. The unordered containers use
// insertion order here; a real hash table's order is unspecified.

export function orderedMapEntries(map: MapVal, less: ObjectLess): { key: Val; cell: Cell }[] {
  const entries = [...map.entries.values()]
  return map.type.ordered ? entries.sort((a, b) => compareVals(a.key, b.key, less)) : entries
}

export function orderedKeys(set: SetVal, less: ObjectLess): Val[] {
  const keys = [...set.keys.values()]
  return set.type.ordered ? keys.sort((a, b) => compareVals(a, b, less)) : keys
}
