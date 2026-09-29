import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

        Map<String, Integer> m = new HashMap<>();
        for (String w : "to be or not to be that is the question".split(" ")) m.merge(w, 1, Integer::sum);
        System.out.println(m + " " + m.size() + " " + m.get("be") + " " + m.get("zzz") + " " + m.containsKey("or") + " " + m.containsValue(2));
        m.remove("that"); m.putIfAbsent("is", 99); m.putIfAbsent("new", 1); m.compute("to", (k, v) -> v * 10);
        System.out.println(m.keySet() + " " + m.values());
        for (Map.Entry<String, Integer> e : m.entrySet()) if (e.getValue() > 1) System.out.print(e.getKey() + "=" + e.getValue() + ";");
        System.out.println();
        Map<Integer, List<Integer>> g = new HashMap<>();
        int[][] edges = {{1, 2}, {1, 3}, {2, 3}, {17, 1}, {33, 2}};
        for (int[] e : edges) { g.computeIfAbsent(e[0], k -> new ArrayList<>()).add(e[1]); g.computeIfAbsent(e[1], k -> new ArrayList<>()).add(e[0]); }
        System.out.println(g);
        Map<Character, Integer> freq = new HashMap<>(); for (char ch : "mississippi".toCharArray()) freq.put(ch, freq.getOrDefault(ch, 0) + 1);
        System.out.println(freq);
        Map<Integer, String> big = new HashMap<>(); for (int i = 0; i < 30; i += 3) big.put(i * 11, "v" + i);
        System.out.println(big.keySet());
        Map<String, Integer> lhm = new LinkedHashMap<>(); lhm.put("z", 1); lhm.put("a", 2); lhm.put("m", 3); System.out.println(lhm);
    }
}
