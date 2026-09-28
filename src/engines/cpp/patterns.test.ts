import { describe, expect, it } from 'vitest'
import type { RawTrace } from '../../trace/types'
import { cpp } from '.'
import { runTrace } from './interp/run'

const run = (code: string, call = '', stdin = '') => {
  const r = JSON.parse(runTrace(cpp.buildProgram(code, call), stdin)) as RawTrace
  if (r.error) throw new Error(`${r.error.message} (line ${r.error.line})`)
  return r.stdout
}

describe('LeetCode and competitive C++ patterns', () => {
  it('two sum with unordered_map, returning a braced list', () => {
    const code = `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < nums.size(); i++) {
            int need = target - nums[i];
            if (seen.count(need)) return {seen[need], i};
            seen[nums[i]] = i;
        }
        return {};
    }
};`
    expect(run(code, 'vector<int> nums = {2, 7, 11, 15};\nvector<int> ans = Solution().twoSum(nums, 9);\ncout << ans[0] << ans[1];')).toBe('01')
  })

  it('dijkstra with a min-heap of pairs and structured bindings', () => {
    const code = `int main() {
    vector<vector<pair<int, int>>> adj(4);
    adj[0].push_back({1, 4});
    adj[0].push_back({2, 1});
    adj[2].push_back({1, 2});
    adj[1].push_back({3, 1});
    vector<int> dist(4, INT_MAX);
    priority_queue<pair<int, int>, vector<pair<int, int>>, greater<pair<int, int>>> pq;
    dist[0] = 0;
    pq.push({0, 0});
    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();
        if (d > dist[u]) continue;
        for (auto& [v, w] : adj[u]) {
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                pq.push({dist[v], v});
            }
        }
    }
    for (int x : dist) cout << x << " ";
}`
    expect(run(code)).toBe('0 3 1 4 ')
  })

  it('grid BFS with a direction array', () => {
    const code = `int main() {
    vector<vector<char>> g = {{'.', '#'}, {'.', '.'}};
    int dirs[4][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
    queue<pair<int, int>> q;
    vector<vector<int>> seen(2, vector<int>(2, 0));
    q.push({0, 0});
    seen[0][0] = 1;
    int count = 0;
    while (!q.empty()) {
        auto [r, c] = q.front();
        q.pop();
        count++;
        for (auto& d : dirs) {
            int nr = r + d[0], nc = c + d[1];
            if (nr < 0 || nc < 0 || nr >= 2 || nc >= 2 || g[nr][nc] == '#' || seen[nr][nc]) continue;
            seen[nr][nc] = 1;
            q.push({nr, nc});
        }
    }
    cout << count;
}`
    expect(run(code)).toBe('3')
  })

  it('a trie with pointer arrays', () => {
    const code = `struct TrieNode {
    TrieNode* children[26] = {};
    bool end = false;
};
int main() {
    TrieNode* root = new TrieNode();
    for (string w : {"cat", "car"}) {
        TrieNode* node = root;
        for (char ch : w) {
            int i = ch - 'a';
            if (!node->children[i]) node->children[i] = new TrieNode();
            node = node->children[i];
        }
        node->end = true;
    }
    TrieNode* c = root->children['c' - 'a'];
    cout << (c->children['a' - 'a'] != nullptr) << c->children['a' - 'a']->children['r' - 'a']->end;
}`
    expect(run(code)).toBe('11')
  })

  it('merges lists with a dummy node on the stack', () => {
    const code = `class Solution {
public:
    ListNode* mergeTwoLists(ListNode* a, ListNode* b) {
        ListNode dummy(0);
        ListNode* tail = &dummy;
        while (a && b) {
            if (a->val < b->val) { tail->next = a; a = a->next; }
            else { tail->next = b; b = b->next; }
            tail = tail->next;
        }
        tail->next = a ? a : b;
        return dummy.next;
    }
};`
    expect(run(code, 'ListNode* m = Solution().mergeTwoLists(buildList({1, 4}), buildList({2, 3}));\nfor (ListNode* p = m; p; p = p->next) cout << p->val;')).toBe('1234')
  })

  it('map iterators, sorting intervals and counting chars', () => {
    const code = `int main() {
    map<string, int> m = {{"b", 2}, {"a", 1}};
    auto it = m.find("b");
    if (it != m.end()) it->second += 10;
    cout << m["b"] << m.begin()->first << " ";
    vector<vector<int>> iv = {{3, 4}, {1, 2}};
    sort(iv.begin(), iv.end(), [](const vector<int>& x, const vector<int>& y) { return x[0] < y[0]; });
    cout << iv[0][0] << " ";
    int cnt[26] = {0};
    string s = "banana";
    for (char ch : s) cnt[ch - 'a']++;
    cout << cnt['a' - 'a'] << cnt['n' - 'a'];
    int l = 0, r = s.size() - 1;
    while (l < r) swap(s[l++], s[r--]);
    cout << " " << s;
}`
    expect(run(code)).toBe('12a 1 32 ananab')
  })

  it('accepts the usual fast io boilerplate', () => {
    const code = `int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    long long total = 0;
    for (int i = 0; i < n; i++) {
        long long x;
        cin >> x;
        total += x;
    }
    cout << total << "\\n";
}`
    expect(run(code, '', '3\n1000000000000 2 3')).toBe('1000000000005\n')
  })

  it('explains unknown types instead of a confusing parse error', () => {
    const r = JSON.parse(runTrace('int main() {\n  stringstream ss("a b");\n}\n', '')) as RawTrace
    expect(r.error).toMatchObject({ message: expect.stringContaining("'stringstream'") as string, line: 2 })
  })
})
