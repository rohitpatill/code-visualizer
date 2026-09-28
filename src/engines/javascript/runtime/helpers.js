// LeetCode-style helpers, available in user code without defining them.
// Evaluated from source at run time, so class names survive minification
// and the tracer never records these lines.

class ListNode {
  constructor(val = 0, next = null) {
    this.val = val
    this.next = next
  }
}

class TreeNode {
  constructor(val = 0, left = null, right = null) {
    this.val = val
    this.left = left
    this.right = right
  }
}

/** buildList([1, 2, 3]) -> head ListNode of 1 -> 2 -> 3 */
function buildList(values) {
  let head = null
  for (let i = values.length - 1; i >= 0; i--) head = new ListNode(values[i], head)
  return head
}

/** buildTree([1, 2, 3, null, 4]) -> root TreeNode, LeetCode level order */
function buildTree(values) {
  if (!values.length || values[0] === null) return null
  const root = new TreeNode(values[0])
  const queue = [root]
  let head = 0
  let i = 1
  while (head < queue.length && i < values.length) {
    const node = queue[head++]
    if (i < values.length && values[i] !== null) {
      node.left = new TreeNode(values[i])
      queue.push(node.left)
    }
    i++
    if (i < values.length && values[i] !== null) {
      node.right = new TreeNode(values[i])
      queue.push(node.right)
    }
    i++
  }
  return root
}

return { ListNode, TreeNode, buildList, buildTree }
