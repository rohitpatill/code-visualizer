import type { SampleSet } from '../../samples/catalog'

export const javascriptSamples: SampleSet = {
  aliasing: {
    name: 'Aliasing: two names, one array',
    code: `const a = [1, 2, 3];
const b = a;
const c = [...a];
b.push(4);
c.push(99);
console.log(a, b, c);
`,
  },
  'counting-words': {
    name: 'Object: counting words',
    code: `const words = ["the", "cat", "saw", "the", "dog"];
const counts = {};
for (const w of words) {
  counts[w] = (counts[w] ?? 0) + 1;
}
console.log(counts);
`,
  },
  factorial: {
    code: `function fact(n) {
  if (n <= 1) {
    return 1;
  }
  return n * fact(n - 1);
}

const result = fact(4);
console.log(result);
`,
  },
  fibonacci: {
    code: `function fib(n) {
  if (n < 2) {
    return n;
  }
  return fib(n - 1) + fib(n - 2);
}

console.log(fib(4));
`,
  },
  'binary-search': {
    code: `const nums = [1, 3, 5, 7, 9, 11, 13];
const target = 11;
let lo = 0;
let hi = nums.length - 1;
let mid = -1;
while (lo <= hi) {
  mid = Math.floor((lo + hi) / 2);
  if (nums[mid] === target) {
    break;
  } else if (nums[mid] < target) {
    lo = mid + 1;
  } else {
    hi = mid - 1;
  }
}
console.log("found at", mid);
`,
  },
  'sliding-window': {
    code: `const nums = [2, 1, 5, 1, 3, 2];
const k = 3;
let window = 0;
for (let i = 0; i < k; i++) {
  window += nums[i];
}
let best = window;
for (let right = k; right < nums.length; right++) {
  const left = right - k + 1;
  window += nums[right] - nums[left - 1];
  best = Math.max(best, window);
}
console.log(best);
`,
  },
  'two-pointers': {
    code: `const s = "racecar";
let left = 0;
let right = s.length - 1;
let ok = true;
while (left < right) {
  if (s[left] !== s[right]) {
    ok = false;
    break;
  }
  left++;
  right--;
}
console.log(ok);
`,
  },
  'reverse-list': {
    code: `var reverseList = function (head) {
  let prev = null;
  let curr = head;
  while (curr) {
    const nxt = curr.next;
    curr.next = prev;
    prev = curr;
    curr = nxt;
  }
  return prev;
};
`,
    call: `const result = reverseList(buildList([1, 2, 3, 4]));`,
  },
  'tree-depth': {
    code: `var maxDepth = function (root) {
  if (!root) {
    return 0;
  }
  const left = maxDepth(root.left);
  const right = maxDepth(root.right);
  return 1 + Math.max(left, right);
};
`,
    call: `const tree = buildTree([3, 9, 20, null, null, 15, 7]);
const result = maxDepth(tree);`,
  },
  islands: {
    code: `const grid = [
  [1, 1, 0, 0],
  [1, 0, 0, 1],
  [0, 0, 1, 1],
];
const rows = grid.length;
const cols = grid[0].length;

function sink(r, c) {
  if (r < 0 || c < 0 || r >= rows || c >= cols || grid[r][c] === 0) {
    return;
  }
  grid[r][c] = 0;
  sink(r + 1, c);
  sink(r - 1, c);
  sink(r, c + 1);
  sink(r, c - 1);
}

let islands = 0;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    if (grid[r][c] === 1) {
      islands++;
      sink(r, c);
    }
  }
}
console.log(islands);
`,
  },
  bfs: {
    code: `const graph = {
  A: ["B", "C"],
  B: ["A", "D"],
  C: ["A", "D"],
  D: ["B", "C", "E"],
  E: ["D"],
};
const visited = new Set(["A"]);
const queue = ["A"];
const order = [];
while (queue.length > 0) {
  const node = queue.shift();
  order.push(node);
  for (const nei of graph[node]) {
    if (!visited.has(nei)) {
      visited.add(nei);
      queue.push(nei);
    }
  }
}
console.log(order);
`,
  },
  'valid-parentheses': {
    code: `const s = "([]{})";
const pairs = { ")": "(", "]": "[", "}": "{" };
const stack = [];
let valid = true;
for (const ch of s) {
  if (ch in pairs) {
    if (stack.length === 0 || stack.pop() !== pairs[ch]) {
      valid = false;
      break;
    }
  } else {
    stack.push(ch);
  }
}
console.log(valid && stack.length === 0);
`,
  },
  'min-heap': {
    name: 'Min-heap: push and sift up',
    code: `const heap = [];

function push(x) {
  heap.push(x);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = Math.floor((i - 1) / 2);
    if (heap[parent] <= heap[i]) {
      break;
    }
    [heap[parent], heap[i]] = [heap[i], heap[parent]];
    i = parent;
  }
}

for (const x of [5, 3, 8, 1, 9, 2]) {
  push(x);
}
console.log(heap);
`,
  },
}
