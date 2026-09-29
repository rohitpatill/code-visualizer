import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {
    record Point(int x, int y) {
        Point { if (x < 0) throw new IllegalArgumentException("negative x: " + x); }
        double dist() { return Math.sqrt(x * x + y * y); }
    }
    static class Pair<A, B> {
        final A first; final B second;
        Pair(A first, B second) { this.first = first; this.second = second; }
        Pair<B, A> swap() { return new Pair<>(second, first); }
    }
    static <T extends Comparable<T>> T max(List<T> items) {
        T best = items.get(0);
        for (T item : items) if (item.compareTo(best) > 0) best = item;
        return best;
    }
    static int sum(int... xs) { int s = 0; for (int x : xs) s += x; return s; }
    static <T> void swap(T[] a, int i, int j) { T t = a[i]; a[i] = a[j]; a[j] = t; }

    public static void main(String[] args) throws Exception {

        Point p = new Point(3, 4), q = new Point(3, 4);
        System.out.println(p + " " + p.x() + " " + p.dist() + " " + p.equals(q) + " " + (p == q) + " " + (p.hashCode() == q.hashCode()));
        try { new Point(-1, 0); } catch (IllegalArgumentException ex) { System.out.println(ex.getMessage()); }
        Pair<String, Integer> pair = new Pair<>("age", 30); System.out.println(pair.first + "=" + pair.second + " " + pair.swap().first);
        System.out.println(max(List.of(3, 9, 4)) + " " + max(List.of("pear", "apple")) + " " + sum() + " " + sum(1) + " " + sum(1, 2, 3) + " " + sum(new int[]{4, 5}));
        Integer[] arr = {1, 2, 3}; swap(arr, 0, 2); System.out.println(Arrays.toString(arr));
        Map<Point, String> names = new HashMap<>(); names.put(p, "P"); System.out.println(names.get(q));
    }
}
