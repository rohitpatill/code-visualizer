import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

        Set<String> hs = new HashSet<>(Arrays.asList("pear", "apple", "fig", "kiwi", "banana", "cherry"));
        System.out.println(hs); System.out.println(hs.contains("fig") + " " + hs.add("fig") + " " + hs.remove("kiwi") + " " + hs.size()); System.out.println(hs);
        Set<Integer> ints = new HashSet<>(); for (int x : new int[]{42, 7, 19, 1024, -3, 16, 100}) ints.add(x); System.out.println(ints);
        TreeSet<Integer> ts = new TreeSet<>(List.of(50, 20, 80, 10, 30));
        System.out.println(ts + " " + ts.first() + " " + ts.last() + " " + ts.floor(25) + " " + ts.ceiling(25) + " " + ts.lower(10) + " " + ts.higher(80) + " " + ts.headSet(30) + " " + ts.tailSet(30));
        System.out.println(ts.pollFirst()); System.out.println(ts);
        TreeMap<String, Integer> tm = new TreeMap<>(); tm.put("delta", 4); tm.put("alpha", 1); tm.put("charlie", 3); tm.put("bravo", 2);
        System.out.println(tm + " " + tm.firstKey() + " " + tm.lastEntry() + " " + tm.floorKey("c") + " " + tm.ceilingKey("c") + " " + tm.headMap("charlie") + " " + tm.tailMap("charlie"));
        TreeMap<Integer, String> desc = new TreeMap<>(Comparator.reverseOrder()); desc.put(1, "a"); desc.put(3, "c"); desc.put(2, "b"); System.out.println(desc);
        Set<List<Integer>> seen = new HashSet<>(); seen.add(List.of(1, 2)); System.out.println(seen.contains(Arrays.asList(1, 2)) + " " + seen.add(new ArrayList<>(List.of(1, 2))));
        Set<Character> lhs = new LinkedHashSet<>(); for (char ch : "banana".toCharArray()) lhs.add(ch); System.out.println(lhs);
    }
}
