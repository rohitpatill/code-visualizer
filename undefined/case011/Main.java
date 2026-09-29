import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

        List<Integer> list = new ArrayList<>();
        for (int x : new int[]{5, 3, 8, 1, 9, 2}) list.add(x);
        list.add(0, 7); list.set(2, 4); list.remove(1); list.remove(Integer.valueOf(9));
        System.out.println(list + " " + list.size() + " " + list.get(0) + " " + list.indexOf(8) + " " + list.contains(2) + " " + list.lastIndexOf(100));
        Collections.sort(list); System.out.println(list + " " + Collections.max(list) + " " + Collections.min(list));
        list.sort(Collections.reverseOrder()); System.out.println(list);
        list.removeIf(x -> x % 2 == 0); System.out.println(list + " " + list.isEmpty());
        List<Integer> copy = new ArrayList<>(list); copy.addAll(List.of(10, 20)); Collections.reverse(copy);
        System.out.println(copy + " " + copy.subList(1, 3) + " " + Collections.frequency(List.of(1, 2, 1), 1) + " " + list.equals(List.of(7, 1)));
        Iterator<Integer> it = copy.iterator(); while (it.hasNext()) if (it.next() > 5) it.remove();
        System.out.println(copy + " " + String.join(",", List.of("a", "b")));
        List<List<Integer>> nested = new ArrayList<>(); nested.add(new ArrayList<>(List.of(1))); nested.get(0).add(2); nested.add(List.of());
        System.out.println(nested + " " + nested.get(0).size());
        try { for (Integer v : copy) copy.add(v); } catch (ConcurrentModificationException ex) { System.out.println("CME"); }
    }
}
