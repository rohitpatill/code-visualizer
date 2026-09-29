import type { SampleSet } from '../../samples/catalog'

const program = (imports: string, body: string, members = '') =>
  `${imports ? `${imports}\n\n` : ''}public class Main {\n${members}    public static void main(String[] args) {\n${body}    }\n}\n`

export const javaSamples: SampleSet = {
  aliasing: {
    code: program(
      'import java.util.*;',
      `        List<Integer> a = new ArrayList<>(List.of(1, 2, 3));
        List<Integer> b = a;
        List<Integer> c = new ArrayList<>(a);
        b.add(4);
        c.add(99);
        System.out.println(a + " " + b + " " + c);
`,
    ),
  },
  'counting-words': {
    name: 'HashMap: counting words',
    code: program(
      'import java.util.*;',
      `        String[] words = {"the", "cat", "saw", "the", "dog"};
        Map<String, Integer> counts = new HashMap<>();
        for (String w : words) {
            counts.put(w, counts.getOrDefault(w, 0) + 1);
        }
        System.out.println(counts);
`,
    ),
  },
  factorial: {
    code: program(
      '',
      `        int result = fact(4);
        System.out.println(result);
`,
      `    static int fact(int n) {
        if (n <= 1) {
            return 1;
        }
        return n * fact(n - 1);
    }

`,
    ),
  },
  fibonacci: {
    code: program(
      '',
      `        System.out.println(fib(4));
`,
      `    static int fib(int n) {
        if (n < 2) {
            return n;
        }
        return fib(n - 1) + fib(n - 2);
    }

`,
    ),
  },
  'binary-search': {
    code: program(
      '',
      `        int[] nums = {1, 3, 5, 7, 9, 11, 13};
        int target = 11;
        int lo = 0;
        int hi = nums.length - 1;
        int mid = -1;
        while (lo <= hi) {
            mid = (lo + hi) / 2;
            if (nums[mid] == target) {
                break;
            } else if (nums[mid] < target) {
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        System.out.println("found at " + mid);
`,
    ),
  },
  'sliding-window': {
    code: program(
      '',
      `        int[] nums = {2, 1, 5, 1, 3, 2};
        int k = 3;
        int window = 0;
        for (int i = 0; i < k; i++) {
            window += nums[i];
        }
        int best = window;
        for (int right = k; right < nums.length; right++) {
            int left = right - k + 1;
            window += nums[right] - nums[left - 1];
            best = Math.max(best, window);
        }
        System.out.println(best);
`,
    ),
  },
  'two-pointers': {
    code: program(
      '',
      `        String s = "racecar";
        int left = 0;
        int right = s.length() - 1;
        boolean ok = true;
        while (left < right) {
            if (s.charAt(left) != s.charAt(right)) {
                ok = false;
                break;
            }
            left++;
            right--;
        }
        System.out.println(ok);
`,
    ),
  },
  'reverse-list': {
    code: `class Solution {
    public ListNode reverseList(ListNode head) {
        ListNode prev = null;
        ListNode curr = head;
        while (curr != null) {
            ListNode nxt = curr.next;
            curr.next = prev;
            prev = curr;
            curr = nxt;
        }
        return prev;
    }
}
`,
    call: 'ListNode result = new Solution().reverseList(buildList(1, 2, 3, 4));',
  },
  'tree-depth': {
    code: `class Solution {
    public int maxDepth(TreeNode root) {
        if (root == null) {
            return 0;
        }
        int left = maxDepth(root.left);
        int right = maxDepth(root.right);
        return 1 + Math.max(left, right);
    }
}
`,
    call: `TreeNode tree = buildTree(3, 9, 20, null, null, 15, 7);
int result = new Solution().maxDepth(tree);`,
  },
  islands: {
    code: program(
      '',
      `        int islands = 0;
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                if (grid[r][c] == 1) {
                    islands++;
                    sink(r, c);
                }
            }
        }
        System.out.println(islands);
`,
      `    static int[][] grid = {
        {1, 1, 0, 0},
        {1, 0, 0, 1},
        {0, 0, 1, 1},
    };
    static int rows = grid.length;
    static int cols = grid[0].length;

    static void sink(int r, int c) {
        if (r < 0 || c < 0 || r >= rows || c >= cols || grid[r][c] == 0) {
            return;
        }
        grid[r][c] = 0;
        sink(r + 1, c);
        sink(r - 1, c);
        sink(r, c + 1);
        sink(r, c - 1);
    }

`,
    ),
  },
  bfs: {
    code: program(
      'import java.util.*;',
      `        Map<Character, List<Character>> graph = new HashMap<>();
        graph.put('A', List.of('B', 'C'));
        graph.put('B', List.of('A', 'D'));
        graph.put('C', List.of('A', 'D'));
        graph.put('D', List.of('B', 'C', 'E'));
        graph.put('E', List.of('D'));
        Set<Character> visited = new HashSet<>();
        visited.add('A');
        Queue<Character> queue = new LinkedList<>();
        queue.add('A');
        List<Character> order = new ArrayList<>();
        while (!queue.isEmpty()) {
            char node = queue.poll();
            order.add(node);
            for (char nei : graph.get(node)) {
                if (!visited.contains(nei)) {
                    visited.add(nei);
                    queue.add(nei);
                }
            }
        }
        System.out.println(order);
`,
    ),
  },
  'valid-parentheses': {
    code: program(
      'import java.util.*;',
      `        String s = "([]{})";
        Map<Character, Character> pairs = Map.of(')', '(', ']', '[', '}', '{');
        Stack<Character> stack = new Stack<>();
        boolean valid = true;
        for (char ch : s.toCharArray()) {
            if (pairs.containsKey(ch)) {
                if (stack.isEmpty() || !stack.peek().equals(pairs.get(ch))) {
                    valid = false;
                    break;
                }
                stack.pop();
            } else {
                stack.push(ch);
            }
        }
        System.out.println(valid && stack.isEmpty());
`,
    ),
  },
  'min-heap': {
    name: 'Min-heap with PriorityQueue',
    code: program(
      'import java.util.*;',
      `        PriorityQueue<Integer> heap = new PriorityQueue<>();
        for (int x : new int[]{5, 3, 8, 1, 9, 2}) {
            heap.add(x);
        }
        int smallest = heap.poll();
        System.out.println(smallest + " " + heap);
`,
    ),
  },
}
