import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {
    static class TrieNode { TrieNode[] next = new TrieNode[26]; boolean end; }
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

    public static void main(String[] args) throws Exception {

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
        List<String> perms = new ArrayList<>(); permute("", "abc", perms); System.out.println(perms);
    }
}
