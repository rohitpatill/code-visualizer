import { describe, expect, it } from 'vitest'
import { main, output } from './testing'

// Each expected output is what the program printed on a real JDK.

describe('Java classes, records and lambdas', () => {
  it('inheritance, abstract classes and interfaces', () => {
    expect(output(main(`
        List<Shape> shapes = List.of(new Circle(1), new Square(2), new Square(3));
        double total = 0;
        for (Shape s : shapes) { total += s.area(); System.out.println(s + " " + s.name() + " " + s.describe()); }
        System.out.printf("%.2f %d%n", total, Shape.count);
        Square sq = new Square(4); Shape sh = sq; Object o = sh;
        System.out.println((o instanceof Shape) + " " + (o instanceof Square) + " " + (o instanceof Circle) + " " + sq.equals(new Square(4)) + " " + (sq.hashCode() == new Square(4).hashCode()));
        Set<Square> set = new HashSet<>(List.of(new Square(1), new Square(1), new Square(2))); System.out.println(set.size());
        if (o instanceof Square s2 && s2.side > 3) System.out.println("pattern " + s2.side);`,
      `    interface Named { default String describe() { return "I am " + name(); } String name(); }
    static abstract class Shape implements Named {
        static int count = 0;
        Shape() { count++; }
        abstract double area();
        public String name() { return getClass().getSimpleName().toLowerCase(); }
    }
    static class Circle extends Shape {
        double r;
        Circle(double r) { super(); this.r = r; }
        double area() { return Math.PI * r * r; }
        @Override public String toString() { return "Circle(" + r + ")"; }
    }
    static class Square extends Shape {
        int side;
        Square(int side) { this.side = side; }
        double area() { return side * side; }
        public String name() { return "square " + super.name(); }
        @Override public String toString() { return "Square[" + side + "]"; }
        @Override public boolean equals(Object other) { return other instanceof Square s && s.side == side; }
        @Override public int hashCode() { return Integer.hashCode(side); }
    }
`))).toBe('Circle(1.0) circle I am circle\nSquare[2] square square I am square square\nSquare[3] square square I am square square\n16.14 3\ntrue true false true true\n2\npattern 4\n')
  })

  it('inner, nested and anonymous classes', () => {
    expect(output(main(`
        Bank bank = new Bank("Main St");
        Bank.Account a = bank.open(100);
        Bank.Account b = bank.open(50);
        a.deposit(25);
        System.out.println(a.balance + " " + b.balance + " " + a.label() + " " + bank.accounts + " " + Bank.Point.origin());
        Comparator<String> byLength = new Comparator<String>() {
            @Override public int compare(String x, String y) { return x.length() - y.length(); }
        };
        List<String> ws = new ArrayList<>(List.of("ccc", "a", "bb"));
        ws.sort(byLength); System.out.println(ws);
        int base = 10;
        Runnable r = () -> System.out.println("base is " + base);
        r.run();
        Counter counter = new Counter(); counter.add(5).add(7); System.out.println(counter.total);`,
      `    static class Bank {
        String street; int accounts = 0;
        Bank(String street) { this.street = street; }
        Account open(int amount) { accounts++; return new Account(amount); }
        class Account {
            int balance;
            Account(int balance) { this.balance = balance; }
            void deposit(int x) { balance += x; }
            String label() { return street + "#" + accounts; }
        }
        static class Point { static String origin() { return "(0,0)"; } }
    }
    static class Counter { int total; Counter add(int x) { total += x; return this; } }
`))).toBe('125 50 Main St#2 2 (0,0)\n[a, bb, ccc]\nbase is 10\n12\n')
  })

  it('records, generics and varargs', () => {
    expect(output(main(`
        Point p = new Point(3, 4), q = new Point(3, 4);
        System.out.println(p + " " + p.x() + " " + p.dist() + " " + p.equals(q) + " " + (p == q) + " " + (p.hashCode() == q.hashCode()));
        try { new Point(-1, 0); } catch (IllegalArgumentException ex) { System.out.println(ex.getMessage()); }
        Pair<String, Integer> pair = new Pair<>("age", 30); System.out.println(pair.first + "=" + pair.second + " " + pair.swap().first);
        System.out.println(max(List.of(3, 9, 4)) + " " + max(List.of("pear", "apple")) + " " + sum() + " " + sum(1) + " " + sum(1, 2, 3) + " " + sum(new int[]{4, 5}));
        Integer[] arr = {1, 2, 3}; swap(arr, 0, 2); System.out.println(Arrays.toString(arr));
        Map<Point, String> names = new HashMap<>(); names.put(p, "P"); System.out.println(names.get(q));`,
      `    record Point(int x, int y) {
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
`))).toBe('Point[x=3, y=4] 3 5.0 true false true\nnegative x: -1\nage=30 30\n9 pear 0 1 6 9\n[3, 2, 1]\nP\n')
  })

  it('lambdas, functional interfaces and method references', () => {
    expect(output(main(`
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
        int[] counter = {0}; Runnable inc = () -> counter[0]++; inc.run(); inc.run(); System.out.println(counter[0]);`,
      `    interface Calculator { int calc(int a, int b); }
    static int apply(BinaryOperator<Integer> op, int a, int b) { return op.apply(a, b); }
`))).toBe('49 5 true false HI! 10\n[x]\n4;1;3;\n[40, 10, 30]\na1 b2 \n42 9 12\n2\n')
  })

  it('enums with fields, methods and switch', () => {
    expect(output(main(`
        for (Planet p : Planet.values()) System.out.printf("%s %d %.1f %s%n", p, p.ordinal(), p.gravity(), p.name().toLowerCase());
        Dir d = Dir.valueOf("LEFT");
        System.out.println(d + " " + d.turn() + " " + d.turn().turn() + " " + (d == Dir.LEFT) + " " + d.compareTo(Dir.UP) + " " + Dir.values().length);
        switch (d) {
            case UP -> System.out.println("up");
            case LEFT, RIGHT -> System.out.println("sideways");
            default -> System.out.println("down");
        }
        int score = switch (Dir.DOWN) { case UP -> 1; case DOWN -> 2; default -> 0; };
        Map<Dir, Integer> moves = new TreeMap<>(); moves.put(Dir.RIGHT, 1); moves.put(Dir.UP, 2); moves.put(Dir.LEFT, 3);
        List<Dir> sorted = new ArrayList<>(List.of(Dir.RIGHT, Dir.UP, Dir.DOWN)); Collections.sort(sorted);
        System.out.println(score + " " + moves + " " + sorted + " " + Dir.UP.getDeclaringClass().getSimpleName());
        try { Dir.valueOf("NORTH"); } catch (IllegalArgumentException ex) { System.out.println(ex.getMessage()); }`,
      `    enum Dir {
        UP, RIGHT, DOWN, LEFT;
        Dir turn() { return values()[(ordinal() + 1) % values().length]; }
    }
    enum Planet {
        MERCURY(3.7), EARTH(9.8), JUPITER(24.8);
        private final double g;
        Planet(double g) { this.g = g; }
        double gravity() { return g; }
    }
`))).toBe('MERCURY 0 3.7 mercury\nEARTH 1 9.8 earth\nJUPITER 2 24.8 jupiter\nLEFT UP RIGHT true 3 4\nsideways\n2 {UP=2, RIGHT=1, LEFT=3} [UP, RIGHT, DOWN] Dir\nNo enum constant Main.Dir.NORTH\n')
  })
})
