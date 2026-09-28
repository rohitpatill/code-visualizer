import type { SampleSet } from '../../samples/catalog'

export const pythonSamples: SampleSet = {
  aliasing: {
    code: `a = [1, 2, 3]
b = a
c = a[:]
b.append(4)
c.append(99)
print(a, b, c)
`,
  },
  'counting-words': {
    code: `words = ["the", "cat", "saw", "the", "dog"]
counts = {}
for w in words:
    counts[w] = counts.get(w, 0) + 1
print(counts)
`,
  },
  factorial: {
    code: `def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)

result = fact(4)
print(result)
`,
  },
  fibonacci: {
    code: `def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

print(fib(4))
`,
  },
  'binary-search': {
    code: `nums = [1, 3, 5, 7, 9, 11, 13]
target = 11
lo, hi = 0, len(nums) - 1
while lo <= hi:
    mid = (lo + hi) // 2
    if nums[mid] == target:
        break
    elif nums[mid] < target:
        lo = mid + 1
    else:
        hi = mid - 1
print("found at", mid)
`,
  },
  'sliding-window': {
    code: `nums = [2, 1, 5, 1, 3, 2]
k = 3
window = best = sum(nums[:k])
for right in range(k, len(nums)):
    left = right - k + 1
    window += nums[right] - nums[left - 1]
    best = max(best, window)
print(best)
`,
  },
  'two-pointers': {
    code: `s = "racecar"
left, right = 0, len(s) - 1
ok = True
while left < right:
    if s[left] != s[right]:
        ok = False
        break
    left += 1
    right -= 1
print(ok)
`,
  },
  'reverse-list': {
    code: `class Solution:
    def reverseList(self, head):
        prev = None
        curr = head
        while curr:
            nxt = curr.next
            curr.next = prev
            prev = curr
            curr = nxt
        return prev
`,
    call: `result = Solution().reverseList(build_list([1, 2, 3, 4]))`,
  },
  'tree-depth': {
    code: `class Solution:
    def maxDepth(self, root):
        if not root:
            return 0
        left = self.maxDepth(root.left)
        right = self.maxDepth(root.right)
        return 1 + max(left, right)
`,
    call: `tree = build_tree([3, 9, 20, None, None, 15, 7])
result = Solution().maxDepth(tree)`,
  },
  islands: {
    code: `grid = [
    [1, 1, 0, 0],
    [1, 0, 0, 1],
    [0, 0, 1, 1],
]
rows, cols = len(grid), len(grid[0])

def sink(r, c):
    if r < 0 or c < 0 or r >= rows or c >= cols or grid[r][c] == 0:
        return
    grid[r][c] = 0
    sink(r + 1, c)
    sink(r - 1, c)
    sink(r, c + 1)
    sink(r, c - 1)

islands = 0
for r in range(rows):
    for c in range(cols):
        if grid[r][c] == 1:
            islands += 1
            sink(r, c)
print(islands)
`,
  },
  bfs: {
    code: `from collections import deque

graph = {
    "A": ["B", "C"],
    "B": ["A", "D"],
    "C": ["A", "D"],
    "D": ["B", "C", "E"],
    "E": ["D"],
}
visited = {"A"}
queue = deque(["A"])
order = []
while queue:
    node = queue.popleft()
    order.append(node)
    for nei in graph[node]:
        if nei not in visited:
            visited.add(nei)
            queue.append(nei)
print(order)
`,
  },
  'valid-parentheses': {
    code: `s = "([]{})"
pairs = {")": "(", "]": "[", "}": "{"}
stack = []
valid = True
for ch in s:
    if ch in pairs:
        if not stack or stack.pop() != pairs[ch]:
            valid = False
            break
    else:
        stack.append(ch)
print(valid and not stack)
`,
  },
  'min-heap': {
    name: 'Min-heap with heapq',
    code: `import heapq

heap = []
for x in [5, 3, 8, 1, 9, 2]:
    heapq.heappush(heap, x)
smallest = heapq.heappop(heap)
print(smallest, heap)
`,
  },
}
