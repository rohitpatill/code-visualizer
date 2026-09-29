import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {
    static class Node { int val; Node next; Node(int val, Node next) { this.val = val; this.next = next; } }
    static class Tree {
        int val; Tree left, right;
        Tree(int val) { this(val, null, null); }
        Tree(int val, Tree left, Tree right) { this.val = val; this.left = left; this.right = right; }
    }
    static void walk(Tree t, List<Integer> out) { if (t == null) return; walk(t.left, out); out.add(t.val); walk(t.right, out); }
    static int height(Tree t) { return t == null ? 0 : 1 + Math.max(height(t.left), height(t.right)); }
    static boolean isValid(Tree t, long lo, long hi) { return t == null || (t.val > lo && t.val < hi && isValid(t.left, lo, t.val) && isValid(t.right, t.val, hi)); }

    public static void main(String[] args) throws Exception {

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
        System.out.println(inorder + " " + levels + " " + height(root) + " " + isValid(root, Long.MIN_VALUE, Long.MAX_VALUE));
    }
}
