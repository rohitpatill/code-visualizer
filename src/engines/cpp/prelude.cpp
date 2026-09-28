// LeetCode-style helpers, available without defining them. Parsed before the
// user's code and run without recording steps; user definitions replace them.

struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};

// buildList({1, 2, 3}) -> head of 1 -> 2 -> 3
ListNode* buildList(vector<int> values) {
    ListNode* head = nullptr;
    for (int i = (int)values.size() - 1; i >= 0; i--) head = new ListNode(values[i], head);
    return head;
}

// buildTree("[3,9,20,null,null,15,7]") -> root, in LeetCode's level order
TreeNode* buildTree(string text) {
    vector<string> parts;
    string cur;
    for (char ch : text) {
        if (ch == '[' || ch == ']' || ch == ' ') continue;
        if (ch == ',') {
            parts.push_back(cur);
            cur = "";
        } else {
            cur += ch;
        }
    }
    if (!cur.empty()) parts.push_back(cur);
    if (parts.empty() || parts[0] == "null") return nullptr;
    TreeNode* root = new TreeNode(stoi(parts[0]));
    queue<TreeNode*> q;
    q.push(root);
    int i = 1;
    int n = parts.size();
    while (!q.empty() && i < n) {
        TreeNode* node = q.front();
        q.pop();
        if (i < n && parts[i] != "null") {
            node->left = new TreeNode(stoi(parts[i]));
            q.push(node->left);
        }
        i++;
        if (i < n && parts[i] != "null") {
            node->right = new TreeNode(stoi(parts[i]));
            q.push(node->right);
        }
        i++;
    }
    return root;
}
