import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

        PriorityQueue<Integer> minq = new PriorityQueue<>(List.of(5, 1, 4, 2, 3));
        PriorityQueue<Integer> maxq = new PriorityQueue<>((a, b) -> b - a); maxq.addAll(List.of(5, 1, 4, 2, 3));
        System.out.println(minq + " " + maxq + " " + minq.peek() + " " + maxq.peek());
        StringBuilder order = new StringBuilder(); while (!maxq.isEmpty()) order.append(maxq.poll()); System.out.println(order + " " + minq.remove(4)); System.out.println(minq);
        PriorityQueue<int[]> pq = new PriorityQueue<>((x, y) -> x[1] != y[1] ? Integer.compare(x[1], y[1]) : x[0] - y[0]);
        pq.offer(new int[]{1, 5}); pq.offer(new int[]{2, 3}); pq.offer(new int[]{3, 5}); pq.offer(new int[]{4, 1});
        while (!pq.isEmpty()) { int[] top = pq.poll(); System.out.print(top[0] + ":" + top[1] + " "); }
        System.out.println();
        List<String> words = new ArrayList<>(List.of("pear", "fig", "banana", "kiwi", "apple"));
        words.sort(Comparator.comparing(String::length).thenComparing(Comparator.naturalOrder())); System.out.println(words);
        words.sort(Comparator.comparingInt(String::length).reversed()); System.out.println(words);
        Integer[] boxed = {3, 1, 2}; Arrays.sort(boxed, Collections.reverseOrder()); System.out.println(Arrays.toString(boxed));
        int[][] intervals = {{5, 6}, {1, 3}, {2, 4}}; Arrays.sort(intervals, (a, b) -> a[0] - b[0]); System.out.println(Arrays.deepToString(intervals));
    }
}
