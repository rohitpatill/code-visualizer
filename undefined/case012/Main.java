import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

        Queue<Integer> q = new LinkedList<>(); q.offer(1); q.add(2); q.offer(3);
        System.out.println(q); System.out.println(q.peek() + " " + q.poll() + " " + q.size()); System.out.println(q);
        Deque<Integer> dq = new ArrayDeque<>(); dq.push(1); dq.push(2); dq.addLast(3); dq.offerFirst(0);
        System.out.println(dq); System.out.println(dq.peekFirst() + " " + dq.peekLast() + " " + dq.pop() + " " + dq.pollLast()); System.out.println(dq);
        Stack<Character> st = new Stack<>(); st.push('a'); st.push('b'); st.push('c');
        System.out.println(st); System.out.println(st.peek() + " " + st.pop() + " " + st.search('a') + " " + st.empty()); System.out.println(st);
        Deque<int[]> cells = new ArrayDeque<>(); cells.offer(new int[]{1, 2}); int[] cell = cells.poll();
        System.out.println(cell[0] + cell[1] + " " + cells.isEmpty() + " " + cells.poll());
        LinkedList<String> ll = new LinkedList<>(List.of("x", "y")); ll.addFirst("w"); ll.removeLast(); System.out.println(ll + " " + ll.getFirst() + " " + ll.get(1));
    }
}
