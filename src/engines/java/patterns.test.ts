import { describe, expect, it } from 'vitest'
import { main, output } from './testing'

// Each expected output is what the program printed on a real JDK.

describe('LeetCode and competitive Java patterns', () => {
  it('two sum, anagrams and sliding window', () => {
    expect(output(main(`
        System.out.println(Arrays.toString(twoSum(new int[]{2, 7, 11, 15}, 9)) + " " + Arrays.toString(twoSum(new int[]{3, 2, 4}, 6)));
        Map<String, List<String>> groups = new HashMap<>();
        for (String w : new String[]{"eat", "tea", "tan", "ate", "nat", "bat"}) {
            char[] key = w.toCharArray(); Arrays.sort(key);
            groups.computeIfAbsent(new String(key), k -> new ArrayList<>()).add(w);
        }
        System.out.println(groups.values());
        System.out.println(longestUnique("abcabcbb") + " " + longestUnique("pwwkew") + " " + longestUnique(""));`,
      `    static int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            Integer j = seen.get(target - nums[i]);
            if (j != null) return new int[]{j, i};
            seen.put(nums[i], i);
        }
        return new int[0];
    }
    static int longestUnique(String s) {
        Map<Character, Integer> last = new HashMap<>();
        int best = 0, left = 0;
        for (int right = 0; right < s.length(); right++) {
            char ch = s.charAt(right);
            if (last.containsKey(ch) && last.get(ch) >= left) left = last.get(ch) + 1;
            last.put(ch, right);
            best = Math.max(best, right - left + 1);
        }
        return best;
    }
`))).toBe('[0, 1] [1, 2]\n[[eat, tea, ate], [bat], [tan, nat]]\n3 3 0\n')
  })

  it('Dijkstra, grid BFS and topological sort', () => {
    expect(output(main(`
        int[][] edges = {{0, 1, 4}, {0, 2, 1}, {2, 1, 2}, {1, 3, 1}, {2, 3, 5}};
        List<List<int[]>> adj = new ArrayList<>();
        for (int i = 0; i < 4; i++) adj.add(new ArrayList<>());
        for (int[] e : edges) adj.get(e[0]).add(new int[]{e[1], e[2]});
        int[] dist = new int[4]; Arrays.fill(dist, Integer.MAX_VALUE); dist[0] = 0;
        PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingInt(a -> a[1]));
        pq.add(new int[]{0, 0});
        while (!pq.isEmpty()) {
            int[] cur = pq.poll();
            if (cur[1] > dist[cur[0]]) continue;
            for (int[] next : adj.get(cur[0])) {
                if (dist[cur[0]] + next[1] < dist[next[0]]) { dist[next[0]] = dist[cur[0]] + next[1]; pq.add(new int[]{next[0], dist[next[0]]}); }
            }
        }
        System.out.println(Arrays.toString(dist));
        char[][] grid = {"S.#".toCharArray(), "..#".toCharArray(), "#.E".toCharArray()};
        int[][] dirs = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
        boolean[][] seen = new boolean[3][3];
        Deque<int[]> q = new ArrayDeque<>(); q.offer(new int[]{0, 0, 0}); seen[0][0] = true;
        int steps = -1;
        while (!q.isEmpty()) {
            int[] cell = q.poll();
            if (grid[cell[0]][cell[1]] == 'E') { steps = cell[2]; break; }
            for (int[] d : dirs) {
                int nr = cell[0] + d[0], nc = cell[1] + d[1];
                if (nr < 0 || nc < 0 || nr >= 3 || nc >= 3 || seen[nr][nc] || grid[nr][nc] == '#') continue;
                seen[nr][nc] = true; q.offer(new int[]{nr, nc, cell[2] + 1});
            }
        }
        System.out.println(steps);
        int n = 6; int[][] pre = {{5, 2}, {5, 0}, {4, 0}, {4, 1}, {2, 3}, {3, 1}};
        List<Integer>[] out = new List[n]; int[] indeg = new int[n];
        for (int i = 0; i < n; i++) out[i] = new ArrayList<>();
        for (int[] p : pre) { out[p[0]].add(p[1]); indeg[p[1]]++; }
        Queue<Integer> ready = new LinkedList<>();
        for (int i = 0; i < n; i++) if (indeg[i] == 0) ready.add(i);
        List<Integer> order = new ArrayList<>();
        while (!ready.isEmpty()) { int u = ready.poll(); order.add(u); for (int v : out[u]) if (--indeg[v] == 0) ready.add(v); }
        System.out.println(order);`))).toBe('[0, 3, 1, 4]\n4\n[4, 5, 2, 0, 3, 1]\n')
  })

  it('trie, union-find and backtracking', () => {
    expect(output(main(`
        Trie trie = new Trie();
        for (String w : new String[]{"apple", "app", "bat"}) trie.insert(w);
        System.out.println(trie.search("app") + " " + trie.search("ap") + " " + trie.startsWith("ba") + " " + trie.startsWith("c"));
        int[] parent = new int[5]; for (int i = 0; i < 5; i++) parent[i] = i;
        int[][] links = {{0, 1}, {1, 2}, {3, 4}};
        int comps = 5;
        for (int[] l : links) { int a = find(parent, l[0]), b = find(parent, l[1]); if (a != b) { parent[a] = b; comps--; } }
        System.out.println(comps + " " + (find(parent, 0) == find(parent, 2)) + " " + (find(parent, 0) == find(parent, 3)));
        List<List<Integer>> res = new ArrayList<>();
        subsets(new int[]{1, 2, 3}, 0, new ArrayList<>(), res);
        System.out.println(res);
        List<String> perms = new ArrayList<>(); permute("", "abc", perms); System.out.println(perms);`,
      `    static class TrieNode { TrieNode[] next = new TrieNode[26]; boolean end; }
    static class Trie {
        TrieNode root = new TrieNode();
        void insert(String w) {
            TrieNode node = root;
            for (char c : w.toCharArray()) {
                if (node.next[c - 'a'] == null) node.next[c - 'a'] = new TrieNode();
                node = node.next[c - 'a'];
            }
            node.end = true;
        }
        TrieNode walk(String w) {
            TrieNode node = root;
            for (char c : w.toCharArray()) { node = node.next[c - 'a']; if (node == null) return null; }
            return node;
        }
        boolean search(String w) { TrieNode n = walk(w); return n != null && n.end; }
        boolean startsWith(String p) { return walk(p) != null; }
    }
    static int find(int[] parent, int x) { while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    static void subsets(int[] nums, int start, List<Integer> path, List<List<Integer>> res) {
        res.add(new ArrayList<>(path));
        for (int i = start; i < nums.length; i++) { path.add(nums[i]); subsets(nums, i + 1, path, res); path.remove(path.size() - 1); }
    }
    static void permute(String prefix, String rest, List<String> out) {
        if (rest.isEmpty()) { out.add(prefix); return; }
        for (int i = 0; i < rest.length(); i++) permute(prefix + rest.charAt(i), rest.substring(0, i) + rest.substring(i + 1), out);
    }
`))).toBe('true false true false\n2 true false\n[[], [1], [1, 2], [1, 2, 3], [1, 3], [2], [2, 3], [3]]\n[abc, acb, bac, bca, cab, cba]\n')
  })

  it('DP, intervals, bits and binary search on the answer', () => {
    expect(output(main(`
        final int MOD = 1_000_000_007;
        long[] ways = new long[51]; ways[0] = 1; ways[1] = 1;
        for (int i = 2; i <= 50; i++) ways[i] = (ways[i - 1] + ways[i - 2]) % MOD;
        System.out.println(ways[50] + " " + ways[10]);
        int[] coins = {1, 5, 11}; int amount = 15; int[] dp = new int[amount + 1]; Arrays.fill(dp, amount + 1); dp[0] = 0;
        for (int a = 1; a <= amount; a++) for (int c : coins) if (c <= a) dp[a] = Math.min(dp[a], dp[a - c] + 1);
        System.out.println(dp[amount]);
        int[][] intervals = {{1, 3}, {8, 10}, {2, 6}, {15, 18}, {17, 20}};
        Arrays.sort(intervals, (x, y) -> Integer.compare(x[0], y[0]));
        List<int[]> merged = new ArrayList<>();
        for (int[] iv : intervals) {
            if (merged.isEmpty() || merged.get(merged.size() - 1)[1] < iv[0]) merged.add(iv);
            else merged.get(merged.size() - 1)[1] = Math.max(merged.get(merged.size() - 1)[1], iv[1]);
        }
        System.out.println(Arrays.deepToString(merged.toArray(new int[0][])));
        int x = 0b1011; System.out.println(Integer.bitCount(x) + " " + (x & -x) + " " + (x >> 1) + " " + Integer.toBinaryString(x ^ 0xF) + " " + ((x & (1 << 2)) != 0) + " " + Long.bitCount(-1L));
        int[] piles = {3, 6, 7, 11}; int lo = 1, hi = 11;
        while (lo < hi) { int mid = lo + (hi - lo) / 2; int hours = 0; for (int p : piles) hours += (p + mid - 1) / mid; if (hours <= 8) hi = mid; else lo = mid + 1; }
        System.out.println(lo);
        String s = "A man, a plan, a canal: Panama"; StringBuilder clean = new StringBuilder();
        for (char ch : s.toCharArray()) if (Character.isLetterOrDigit(ch)) clean.append(Character.toLowerCase(ch));
        System.out.println(clean.toString().equals(clean.reverse().toString()) + " " + clean.length());`))).toBe('365010934 89\n3\n[[1, 6], [8, 10], [15, 20]]\n3 1 5 100 false 64\n4\ntrue 21\n')
  })

  it('linked lists and trees built by hand', () => {
    expect(output(main(`
        Node head = new Node(1, new Node(2, new Node(3, new Node(4, null))));
        Node slow = head, fast = head;
        while (fast != null && fast.next != null) { slow = slow.next; fast = fast.next.next; }
        System.out.println("middle " + slow.val);
        Node prev = null, cur = head;
        while (cur != null) { Node nxt = cur.next; cur.next = prev; prev = cur; cur = nxt; }
        StringBuilder sb = new StringBuilder(); for (Node p = prev; p != null; p = p.next) sb.append(p.val).append(p.next == null ? "" : "->");
        System.out.println(sb);
        Tree root = new Tree(4, new Tree(2, new Tree(1), new Tree(3)), new Tree(6, new Tree(5), null));
        List<Integer> inorder = new ArrayList<>(); walk(root, inorder);
        List<List<Integer>> levels = new ArrayList<>();
        Queue<Tree> q = new LinkedList<>(); q.add(root);
        while (!q.isEmpty()) {
            int size = q.size(); List<Integer> level = new ArrayList<>();
            for (int i = 0; i < size; i++) { Tree t = q.poll(); level.add(t.val); if (t.left != null) q.add(t.left); if (t.right != null) q.add(t.right); }
            levels.add(level);
        }
        System.out.println(inorder + " " + levels + " " + height(root) + " " + isValid(root, Long.MIN_VALUE, Long.MAX_VALUE));`,
      `    static class Node { int val; Node next; Node(int val, Node next) { this.val = val; this.next = next; } }
    static class Tree {
        int val; Tree left, right;
        Tree(int val) { this(val, null, null); }
        Tree(int val, Tree left, Tree right) { this.val = val; this.left = left; this.right = right; }
    }
    static void walk(Tree t, List<Integer> out) { if (t == null) return; walk(t.left, out); out.add(t.val); walk(t.right, out); }
    static int height(Tree t) { return t == null ? 0 : 1 + Math.max(height(t.left), height(t.right)); }
    static boolean isValid(Tree t, long lo, long hi) { return t == null || (t.val > lo && t.val < hi && isValid(t.left, lo, t.val) && isValid(t.right, t.val, hi)); }
`))).toBe('middle 3\n4->3->2->1\n[1, 2, 3, 4, 5, 6] [[4], [2, 6], [1, 3, 5]] 3 true\n')
  })
})
