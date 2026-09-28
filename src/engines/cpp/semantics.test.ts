import { describe, expect, it } from 'vitest'
import { runTrace } from './interp/run'
import type { RawTrace } from '../../trace/types'

const run = (body: string, stdin = '') => JSON.parse(runTrace(body, stdin)) as RawTrace
const main = (body: string) => `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n${body}\n}\n`
const out = (body: string, stdin = '') => {
  const r = run(main(body), stdin)
  if (r.error) throw new Error(r.error.message)
  return r.stdout
}
const errorOf = (source: string) => run(source).error

describe('C++ arithmetic', () => {
  it('divides integers by truncating toward zero', () => {
    expect(out('cout << 7 / 2 << " " << -7 / 2 << " " << -7 % 3 << " " << 7.0 / 2;')).toBe('3 -3 -1 3.5')
  })

  it('wraps int overflow and unsigned underflow', () => {
    expect(out('int x = INT_MAX; x++; unsigned u = 0; u--; long long y = 1LL << 40;\ncout << x << " " << u << " " << y;')).toBe(
      '-2147483648 4294967295 1099511627776',
    )
    expect(out('int a = 100000; int b = a * a; long long c = (long long)a * a;\ncout << b << " " << c;')).toBe('1410065408 10000000000')
  })

  it('has size_t pitfalls exactly like C++', () => {
    expect(out('vector<int> v;\ncout << v.size() - 1;')).toBe('18446744073709551615')
    expect(out('vector<int> v = {1, 2, 3};\ncout << (-1 < v.size());')).toBe('0')
  })

  it('treats char as a small integer', () => {
    expect(out("char c = 'a' + 1;\ncout << c << ' ' << (int)c << ' ' << 'a' + 1;")).toBe('b 98 98')
  })

  it('prints doubles the way cout does', () => {
    expect(out('cout << 3.14159265 << " " << 1e6 << " " << 0.1 + 0.2 << " " << 100.0 / 3 << " " << fixed << setprecision(2) << 2.5;')).toBe(
      '3.14159 1e+06 0.3 33.3333 2.50',
    )
  })

  it('converts on assignment', () => {
    expect(out('int i = 3.99; double d = 1 / 2; double e = 1.0 / 2; bool b = 5;\ncout << i << " " << d << " " << e << " " << b;')).toBe('3 0 0.5 1')
  })
})

describe('C++ values, references and pointers', () => {
  it('copies on assignment and aliases through references', () => {
    expect(out('vector<int> a = {1};\nvector<int> b = a;\nvector<int>& c = a;\nc.push_back(3);\nc.push_back(4);\ncout << a.size() << b.size() << c.size();')).toBe('313')
  })

  it('passes by value and by reference', () => {
    const src = `#include <vector>\nusing namespace std;\nvoid byValue(vector<int> v) { v.push_back(1); }\nvoid byRef(vector<int>& v) { v.push_back(1); }\nint main() {\n  vector<int> v;\n  byValue(v);\n  byRef(v);\n  cout << v.size();\n}\n`
    expect(run(src).stdout).toBe('1')
  })

  it('reads and writes through pointers', () => {
    expect(out('int x = 5;\nint* p = &x;\n*p = 7;\nint* arr = new int[3];\narr[1] = 4;\n*(arr + 2) = 9;\ncout << x << arr[1] << arr[2];\ndelete[] arr;')).toBe('749')
  })

  it('range-for copies by value and writes by reference', () => {
    expect(out('vector<int> v = {1, 2};\nfor (int x : v) x *= 10;\nfor (int& x : v) x += 1;\ncout << v[0] << v[1];')).toBe('23')
  })
})

describe('C++ classes', () => {
  it('runs constructors, member init lists, methods and this', () => {
    const src = `struct Point {\n  int x, y;\n  Point(int a, int b) : x(a), y(b) {}\n  int sum() const { return x + this->y; }\n  bool operator<(const Point& o) const { return x < o.x; }\n};\nint main() {\n  vector<Point> ps = {Point(3, 1), Point(1, 2)};\n  sort(ps.begin(), ps.end());\n  cout << ps[0].x << ps[0].sum();\n}\n`
    expect(run(src).stdout).toBe('13')
  })

  it('supports aggregates, pointers to nodes and LeetCode helpers', () => {
    const src = `struct P { int a; int b; };\nint main() {\n  P p = {1, 2};\n  ListNode* h = buildList({5, 6});\n  TreeNode* t = buildTree("[1,2,3,null,4]");\n  cout << p.a + p.b << h->next->val << t->left->right->val;\n}\n`
    expect(run(src).stdout).toBe('364')
  })

  it('lets user code replace the built-in helpers', () => {
    const src = `struct ListNode { int val; ListNode* next; ListNode(int v) : val(v), next(nullptr) {} };\nint main() { ListNode n(4); cout << n.val; }\n`
    expect(run(src).stdout).toBe('4')
  })
})

describe('C++ standard library', () => {
  it('orders map and set keys and inserts on map[]', () => {
    expect(out('map<string, int> m;\nm["b"] = 2;\nm["a"]++;\nint missing = m["z"];\nfor (auto& [k, v] : m) cout << k << v << " ";\ncout << m.count("q") << m.size();')).toBe(
      'a1 b2 z0 03',
    )
    expect(out('set<int> s = {3, 1, 3, 2};\nfor (int x : s) cout << x;\ncout << s.count(2) << *s.begin();')).toBe('12311')
  })

  it('runs queue, stack and a min priority_queue', () => {
    expect(
      out(
        'queue<int> q; q.push(1); q.push(2); q.pop();\nstack<int> st; st.push(1); st.push(2);\npriority_queue<int, vector<int>, greater<int>> pq;\nfor (int x : {5, 1, 3}) pq.push(x);\ncout << q.front() << st.top() << pq.top();',
      ),
    ).toBe('221')
  })

  it('handles strings', () => {
    expect(
      out('string s = "hello";\ns += " world";\ns[0] = \'H\';\ncout << s.substr(6) << s.find("o") << (s.find("z") == string::npos) << s.size() << to_string(42) + "!" << stoi("17") + 1;'),
    ).toBe('world4' + '1' + '11' + '42!' + '18')
    expect(out('string s = "dcba";\nsort(s.begin(), s.end());\nstring r = s;\nreverse(r.begin(), r.end());\ncout << s << r;')).toBe('abcddcba')
  })

  it('sorts with lambdas and captures by reference and by copy', () => {
    expect(out('vector<int> v = {1, 3, 2};\nint calls = 0;\nsort(v.begin(), v.end(), [&](int a, int b) { calls++; return a > b; });\nint k = 5;\nauto f = [=]() { return k + 1; };\nk = 100;\ncout << v[0] << v[2] << (calls > 0) << f();')).toBe('3116')
  })

  it('supports recursive std::function lambdas', () => {
    expect(out('function<int(int)> fib = [&](int n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); };\ncout << fib(7);')).toBe('13')
  })

  it('runs the common algorithms', () => {
    expect(
      out(
        'vector<int> v = {4, 1, 4, 2, 2};\nsort(v.begin(), v.end());\nv.erase(unique(v.begin(), v.end()), v.end());\ncout << accumulate(v.begin(), v.end(), 0) << *max_element(v.begin(), v.end()) << (lower_bound(v.begin(), v.end(), 2) - v.begin()) << max({3, 9, 4}) << min(2, 7);\nint a = 1, b = 2; swap(a, b); cout << a << b;',
      ),
    ).toBe('7419221')
    expect(out('vector<int> p = {1, 2, 3};\nnext_permutation(p.begin(), p.end());\ncout << p[0] << p[1] << p[2];')).toBe('132')
  })

  it('builds nested vectors and C arrays', () => {
    expect(out('vector<vector<int>> g(3, vector<int>(4, 0));\ng[1][2] = 5;\nint a[5] = {1, 2};\nint dp[2][3] = {};\nint n = 3;\nint b[n];\nb[2] = 7;\ncout << g[1][2] << g.size() << g[0].size() << a[1] << a[4] << dp[1][2] << b[2];')).toBe(
      '5342007',
    )
  })
})

describe('C++ control flow and input', () => {
  it('runs switch fallthrough, do-while, continue, ternary and comma', () => {
    expect(out('int n = 0;\nswitch (2) { case 1: n += 1; case 2: n += 2; case 3: n += 3; break; default: n = 100; }\nint i = 0;\ndo { i++; } while (i < 3);\nint s = 0;\nfor (int j = 0, k = 10; j < 4; j++, k--) { if (j == 1) continue; s += j; }\ncout << n << i << s << (n > 4 ? "y" : "n");')).toBe('535y')
  })

  it('reads cin, getline and loops until input ends', () => {
    expect(out('int a; string w;\ncin >> a >> w;\nstring line;\ngetline(cin, line);\ngetline(cin, line);\nint x, total = 0;\nwhile (cin >> x) total += x;\ncout << a << w << line << total;', '5 hi\nfull line\n1 2 3\n')).toBe('5hifull line6')
  })

  it('prints with printf', () => {
    expect(out('printf("%d-%5.2f-%s-%c-%03d\\n", 7, 3.14159, "ok", 65, 5);')).toBe('7- 3.14-ok-A-005\n')
  })

  it('understands typedef, using, #define and auto', () => {
    const src = `#define MOD 1000000007\ntypedef long long ll;\nusing pii = pair<int, int>;\nint main() {\n  ll big = 1LL * MOD * 2;\n  pii p = {1, 2};\n  auto q = make_pair(3, 4);\n  cout << big << p.second << q.first;\n}\n`
    expect(run(src).stdout).toBe('200000001423')
  })
})

describe('C++ errors', () => {
  const lineOf = (body: string) => errorOf(main(body))
  it('reports runtime errors clearly, on the line that failed', () => {
    expect(lineOf('vector<int> v(3);\nint x = v[5];')).toMatchObject({ message: expect.stringContaining('index 5 is out of range') as string, line: 6 })
    expect(lineOf('int x;\nint y = x + 1;')?.message).toContain('before giving it a value')
    expect(lineOf('int z = 0;\nint w = 5 / z;')?.message).toContain('division by zero')
    expect(lineOf('ListNode* p = nullptr;\nint v = p->val;')?.message).toContain('null pointer')
    expect(lineOf('stack<int> s;\ns.pop();')?.message).toContain('empty')
  })

  it('reports compile errors and unsupported features with their line', () => {
    expect(errorOf('int main() {\n  int x = ;\n}\n')).toMatchObject({ message: expect.stringContaining('Compile error') as string, line: 2 })
    expect(errorOf('template <typename T>\nT id(T x) { return x; }\nint main() {}\n')?.message).toContain('templates are not supported')
    expect(errorOf('int helper() { return 1; }\n')?.message).toContain('no main()')
  })

  it('stops endless loops at the step limit and deep recursion as a stack overflow', () => {
    expect(run(main('while (true) {}')).truncated).toBe(true)
    const deep = run('int f(int n) { return f(n + 1); }\nint main() { f(0); }\n')
    expect(deep.truncated || deep.error?.message.includes('stack overflow')).toBe(true)
  })
})
