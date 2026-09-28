import type { SampleSet } from '../../samples/catalog'

const header = (...libs: string[]) => `${libs.map((l) => `#include <${l}>`).join('\n')}\nusing namespace std;\n\n`

export const cppSamples: SampleSet = {
  aliasing: {
    name: 'References vs copies: one vector, two names',
    code: `${header('iostream', 'vector')}int main() {
    vector<int> a = {1, 2, 3};
    vector<int>& b = a;
    vector<int> c = a;
    b.push_back(4);
    c.push_back(99);
    cout << a.size() << " " << b.size() << " " << c.size() << endl;
}
`,
  },
  'counting-words': {
    name: 'Map: counting words',
    code: `${header('iostream', 'map', 'string', 'vector')}int main() {
    vector<string> words = {"the", "cat", "saw", "the", "dog"};
    map<string, int> counts;
    for (const string& w : words) {
        counts[w]++;
    }
    for (auto& [word, n] : counts) {
        cout << word << ": " << n << endl;
    }
}
`,
  },
  factorial: {
    code: `${header('iostream')}int fact(int n) {
    if (n <= 1) {
        return 1;
    }
    return n * fact(n - 1);
}

int main() {
    int result = fact(4);
    cout << result << endl;
}
`,
  },
  fibonacci: {
    code: `${header('iostream')}int fib(int n) {
    if (n < 2) {
        return n;
    }
    return fib(n - 1) + fib(n - 2);
}

int main() {
    cout << fib(4) << endl;
}
`,
  },
  'binary-search': {
    code: `${header('iostream', 'vector')}int main() {
    vector<int> nums = {1, 3, 5, 7, 9, 11, 13};
    int target = 11;
    int lo = 0;
    int hi = nums.size() - 1;
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
    cout << "found at " << mid << endl;
}
`,
  },
  'sliding-window': {
    code: `${header('iostream', 'vector')}int main() {
    vector<int> nums = {2, 1, 5, 1, 3, 2};
    int k = 3;
    int window = 0;
    for (int i = 0; i < k; i++) {
        window += nums[i];
    }
    int best = window;
    for (int right = k; right < nums.size(); right++) {
        int left = right - k + 1;
        window += nums[right] - nums[left - 1];
        best = max(best, window);
    }
    cout << best << endl;
}
`,
  },
  'two-pointers': {
    code: `${header('iostream', 'string')}int main() {
    string s = "racecar";
    int left = 0;
    int right = s.size() - 1;
    bool ok = true;
    while (left < right) {
        if (s[left] != s[right]) {
            ok = false;
            break;
        }
        left++;
        right--;
    }
    cout << boolalpha << ok << endl;
}
`,
  },
  'reverse-list': {
    code: `${header('iostream')}class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        ListNode* prev = nullptr;
        ListNode* curr = head;
        while (curr) {
            ListNode* nxt = curr->next;
            curr->next = prev;
            prev = curr;
            curr = nxt;
        }
        return prev;
    }
};
`,
    call: `ListNode* result = Solution().reverseList(buildList({1, 2, 3, 4}));`,
  },
  'tree-depth': {
    code: `${header('iostream', 'algorithm')}class Solution {
public:
    int maxDepth(TreeNode* root) {
        if (!root) {
            return 0;
        }
        int left = maxDepth(root->left);
        int right = maxDepth(root->right);
        return 1 + max(left, right);
    }
};
`,
    call: `TreeNode* tree = buildTree("[3,9,20,null,null,15,7]");
int result = Solution().maxDepth(tree);`,
  },
  islands: {
    code: `${header('iostream', 'vector')}vector<vector<int>> grid = {
    {1, 1, 0, 0},
    {1, 0, 0, 1},
    {0, 0, 1, 1},
};
int rows = grid.size();
int cols = grid[0].size();

void sink(int r, int c) {
    if (r < 0 || c < 0 || r >= rows || c >= cols || grid[r][c] == 0) {
        return;
    }
    grid[r][c] = 0;
    sink(r + 1, c);
    sink(r - 1, c);
    sink(r, c + 1);
    sink(r, c - 1);
}

int main() {
    int islands = 0;
    for (int r = 0; r < rows; r++) {
        for (int c = 0; c < cols; c++) {
            if (grid[r][c] == 1) {
                islands++;
                sink(r, c);
            }
        }
    }
    cout << islands << endl;
}
`,
  },
  bfs: {
    code: `${header('iostream', 'map', 'queue', 'set', 'vector')}int main() {
    map<char, vector<char>> graph = {
        {'A', {'B', 'C'}},
        {'B', {'A', 'D'}},
        {'C', {'A', 'D'}},
        {'D', {'B', 'C', 'E'}},
        {'E', {'D'}},
    };
    set<char> visited = {'A'};
    queue<char> queue;
    queue.push('A');
    vector<char> order;
    while (!queue.empty()) {
        char node = queue.front();
        queue.pop();
        order.push_back(node);
        for (char nei : graph[node]) {
            if (!visited.count(nei)) {
                visited.insert(nei);
                queue.push(nei);
            }
        }
    }
    for (char c : order) {
        cout << c << " ";
    }
    cout << endl;
}
`,
  },
  'valid-parentheses': {
    code: `${header('iostream', 'map', 'stack', 'string')}int main() {
    string s = "([]{})";
    map<char, char> pairs = {{')', '('}, {']', '['}, {'}', '{'}};
    stack<char> stack;
    bool valid = true;
    for (char ch : s) {
        if (pairs.count(ch)) {
            if (stack.empty() || stack.top() != pairs[ch]) {
                valid = false;
                break;
            }
            stack.pop();
        } else {
            stack.push(ch);
        }
    }
    cout << boolalpha << (valid && stack.empty()) << endl;
}
`,
  },
  'min-heap': {
    name: 'Min-heap with priority_queue',
    code: `${header('iostream', 'queue', 'vector')}int main() {
    priority_queue<int, vector<int>, greater<int>> heap;
    for (int x : {5, 3, 8, 1, 9, 2}) {
        heap.push(x);
    }
    int smallest = heap.top();
    heap.pop();
    cout << smallest << " " << heap.size() << endl;
}
`,
  },
}
