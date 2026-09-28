"""LeetCode-style helpers, available in user code without defining them.

This is its own module, so the tracer never records its lines.
"""

import collections


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


def build_list(values):
    """build_list([1, 2, 3]) -> head ListNode of 1 -> 2 -> 3"""
    head = None
    for v in reversed(values):
        head = ListNode(v, head)
    return head


def build_tree(values):
    """build_tree([1, 2, 3, None, 4]) -> root TreeNode, LeetCode level order"""
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue = collections.deque([root])
    i = 1
    while queue and i < len(values):
        node = queue.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            queue.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            queue.append(node.right)
        i += 1
    return root


HELPERS = {"ListNode": ListNode, "TreeNode": TreeNode, "build_list": build_list, "build_tree": build_tree}
