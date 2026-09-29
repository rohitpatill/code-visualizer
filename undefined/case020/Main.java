import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {
    interface Calculator { int calc(int a, int b); }
    static int apply(BinaryOperator<Integer> op, int a, int b) { return op.apply(a, b); }

    public static void main(String[] args) throws Exception {

        Function<Integer, Integer> square = x -> x * x;
        BiFunction<Integer, Integer, Integer> add = (a, b) -> a + b;
        Predicate<String> empty = String::isEmpty;
        Supplier<List<String>> maker = ArrayList::new;
        UnaryOperator<String> shout = s -> s.toUpperCase() + "!";
        System.out.println(square.apply(7) + " " + add.apply(2, 3) + " " + empty.test("") + " " + empty.negate().test("") + " " + shout.apply("hi") + " " + square.andThen(x -> x + 1).apply(3));
        List<String> made = maker.get(); made.add("x"); System.out.println(made);
        List<Integer> nums = new ArrayList<>(List.of(4, 1, 3));
        nums.forEach(n -> System.out.print(n + ";")); System.out.println();
        nums.replaceAll(n -> n * 10); System.out.println(nums);
        Map<String, Integer> m = new TreeMap<>(); m.put("b", 2); m.put("a", 1);
        m.forEach((k, v) -> System.out.print(k + v + " ")); System.out.println();
        Calculator times = (a, b) -> a * b; System.out.println(times.calc(6, 7) + " " + apply(Math::max, 3, 9) + " " + apply(Integer::sum, 3, 9));
        int[] counter = {0}; Runnable inc = () -> counter[0]++; inc.run(); inc.run(); System.out.println(counter[0]);
    }
}
