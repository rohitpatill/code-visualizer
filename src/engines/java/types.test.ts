import { describe, expect, it } from 'vitest'
import { main, output } from './testing'

// Each expected output is what the program printed on a real JDK.

describe('Java enum bodies, enum collections and classes that extend collections', () => {
  it('enum constants with bodies, EnumMap and EnumSet', () => {
    expect(output(main(`
        for (Op op : Op.values()) System.out.println(op + " " + op.symbol + " " + op.apply(6, 3) + " " + op.getDeclaringClass().getSimpleName() + " " + (op instanceof Op));
        System.out.println(Op.valueOf("MINUS").apply(1, 2) + " " + Op.TIMES.describe() + " " + Op.PLUS.compareTo(Op.TIMES));
        EnumMap<Day, Integer> hours = new EnumMap<>(Day.class);
        hours.put(Day.FRI, 4); hours.put(Day.MON, 8); hours.merge(Day.MON, 1, Integer::sum); hours.put(Day.WED, 6);
        System.out.println(hours + " " + hours.size() + " " + hours.containsKey(Day.TUE) + " " + hours.get(Day.SUN));
        for (Map.Entry<Day, Integer> e : hours.entrySet()) System.out.print(e.getKey().ordinal() + "=" + e.getValue() + " ");
        System.out.println();
        hours.remove(Day.MON);
        Map<Day, Integer> copy = new EnumMap<>(hours);
        System.out.println(copy + " " + copy.equals(hours) + " " + new HashMap<>(copy).equals(copy));
        EnumSet<Day> weekend = EnumSet.of(Day.SUN, Day.SAT);
        EnumSet<Day> week = EnumSet.complementOf(weekend);
        EnumSet<Day> mid = EnumSet.range(Day.TUE, Day.THU);
        System.out.println(weekend + " " + week + " " + mid + " " + EnumSet.allOf(Day.class).size() + " " + EnumSet.noneOf(Day.class));
        week.removeAll(mid); week.add(Day.MON);
        System.out.println(week + " " + week.contains(Day.FRI) + " " + EnumSet.copyOf(List.of(Day.FRI, Day.MON)));
        try { hours.put(null, 1); } catch (NullPointerException ex) { System.out.println("null key"); }
        try { EnumSet.copyOf(new ArrayList<Day>()); } catch (IllegalArgumentException ex) { System.out.println(ex.getMessage()); }
        Map<Day, List<String>> plan = new EnumMap<>(Day.class);
        plan.computeIfAbsent(Day.THU, k -> new ArrayList<>()).add("gym");
        plan.computeIfAbsent(Day.MON, k -> new ArrayList<>()).add("work");
        plan.computeIfAbsent(Day.THU, k -> new ArrayList<>()).add("read");
        System.out.println(plan + " " + Day.class.getSimpleName());`,
      `    enum Day { MON, TUE, WED, THU, FRI, SAT, SUN }
    enum Op {
        PLUS("+") { int apply(int a, int b) { return a + b; } },
        MINUS("-") { int apply(int a, int b) { return a - b; } },
        TIMES("*") {
            int apply(int a, int b) { return a * b; }
            @Override String describe() { return "times, not " + super.describe(); }
        };
        final String symbol;
        Op(String symbol) { this.symbol = symbol; }
        abstract int apply(int a, int b);
        String describe() { return "op " + symbol; }
    }
`))).toBe('PLUS + 9 Op true\nMINUS - 3 Op true\nTIMES * 18 Op true\n-1 times, not op * -2\n{MON=9, WED=6, FRI=4} 3 false null\n0=9 2=6 4=4 \n{WED=6, FRI=4} true true\n[SAT, SUN] [MON, TUE, WED, THU, FRI] [TUE, WED, THU] 7 []\n[MON, FRI] true [MON, FRI]\nnull key\nCollection is empty\n{MON=[work], THU=[gym, read]} Day\n')
  })

  it('classes that extend the built-in collections', () => {
    expect(output(main(`
        LRUCache cache = new LRUCache(2);
        cache.put(1, 1); cache.put(2, 2);
        System.out.println(cache.get(1) + " " + cache);
        cache.put(3, 3);
        System.out.println(cache.get(2) + " " + cache + " " + cache.size() + " " + cache.containsKey(1) + " " + cache.keySet());
        cache.put(4, 4);
        System.out.println(cache.get(1) + " " + cache.get(3) + " " + cache.get(4) + " " + cache + " " + (cache instanceof Map) + " " + cache.getClass().getSimpleName());
        Map<String, Integer> recent = new LinkedHashMap<>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Integer> eldest) {
                System.out.println("eldest " + eldest.getKey() + " of " + size());
                return size() > 2;
            }
        };
        recent.put("a", 1); recent.put("b", 2); recent.get("a"); recent.put("c", 3); recent.merge("d", 4, Integer::sum); recent.putIfAbsent("a", 9);
        System.out.println(recent + " " + recent.size());
        Counter words = new Counter();
        for (String w : "to be or not to be".split(" ")) words.add(w);
        System.out.println(words + " " + words.get("to") + " " + words.top() + " " + words.equals(Map.of("to", 2, "be", 2, "or", 1, "not", 1)));
        Map<String, Integer> copy = new HashMap<>(words);
        copy.put("x", 0);
        System.out.println(copy.size() + " " + words.size() + " " + new TreeMap<>(words));
        Bag bag = new Bag();
        bag.add(3); bag.add(-1); bag.add(2); bag.addAll(List.of(5, 4));
        Collections.sort(bag);
        int total = 0;
        for (int x : bag) total += x;
        System.out.println(bag + " " + total + " " + bag.adds + " " + bag.get(0) + " " + bag.stream().mapToInt(Integer::intValue).max().getAsInt() + " " + bag.equals(List.of(-1, 2, 3, 4, 5)) + " " + (bag instanceof ArrayList));
        List<String> init = new ArrayList<>() {{ add("x"); add("y"); }};
        Map<String, Integer> ages = new HashMap<>() {{ put("ann", 30); put("bob", 25); }};
        System.out.println(init + " " + ages + " " + init.size());
        MaxHeap heap = new MaxHeap();
        heap.addAll(List.of(3, 9, 1, 7));
        System.out.println(heap.poll() + " " + heap.poll() + " " + heap.peek() + " " + heap.size());
        Dice dice = new Dice();
        System.out.println(dice.roll() + " " + dice.roll() + " " + dice.roll() + " " + dice.nextInt(100));`,
      `    static class LRUCache extends LinkedHashMap<Integer, Integer> {
        private final int capacity;
        LRUCache(int capacity) {
            super(capacity, 0.75f, true);
            this.capacity = capacity;
        }
        public int get(int key) { return super.getOrDefault(key, -1); }
        public void put(int key, int value) { super.put(key, value); }
        @Override
        protected boolean removeEldestEntry(Map.Entry<Integer, Integer> eldest) { return size() > capacity; }
    }
    static class Counter extends HashMap<String, Integer> {
        void add(String w) { put(w, getOrDefault(w, 0) + 1); }
        String top() {
            String best = null;
            for (Map.Entry<String, Integer> e : entrySet()) if (best == null || e.getValue() > get(best)) best = e.getKey();
            return best;
        }
    }
    static class Bag extends ArrayList<Integer> {
        int adds = 0;
        @Override
        public boolean add(Integer x) { adds++; return super.add(x); }
    }
    static class MaxHeap extends PriorityQueue<Integer> {
        MaxHeap() { super(Collections.reverseOrder()); }
    }
    static class Dice extends Random {
        Dice() { super(42); }
        int roll() { return nextInt(6) + 1; }
    }
`))).toBe('1 {2=2, 1=1}\n-1 {1=1, 3=3} 2 true [1, 3]\n-1 3 4 {3=3, 4=4} true LRUCache\neldest a of 1\neldest a of 2\neldest b of 3\neldest a of 3\neldest c of 3\n{d=4, a=9} 2\n{not=1, be=2, or=1, to=2} 2 be true\n5 4 {be=2, not=1, or=1, to=2}\n[-1, 2, 3, 4, 5] 13 3 -1 5 true true\n[x, y] {ann=30, bob=25} 2\n9 7 3 2\n3 4 1 84\n')
  })

  it('classes, records, enums and interfaces declared inside methods', () => {
    expect(output(main(`
        record Pair(int a, int b) {
            int sum() { return a + b; }
        }
        enum Move { LEFT, RIGHT }
        interface Shape { double area(); }
        List<Pair> pairs = new ArrayList<>(List.of(new Pair(3, 1), new Pair(1, 2), new Pair(2, 2)));
        pairs.sort(Comparator.comparingInt(Pair::sum).thenComparingInt(Pair::a));
        System.out.println(pairs + " " + pairs.get(0).sum() + " " + new Pair(1, 2).equals(new Pair(1, 2)) + " " + Move.valueOf("RIGHT").ordinal() + " " + Arrays.toString(Move.values()));
        int base = 10;
        String label = "n";
        class Node {
            int val;
            Node next;
            Node(int val) { this.val = val + base; }
            Node push(int v) { Node n = new Node(v); n.next = this; return n; }
            public String toString() { return label + val + (next == null ? "" : "," + next); }
        }
        Node list = new Node(1).push(2).push(3);
        System.out.println(list + " " + list.next.val);
        Shape square = () -> 4.0;
        class Circle implements Shape {
            final double r;
            Circle(double r) { this.r = r; }
            public double area() { return Math.PI * r * r; }
        }
        List<Shape> shapes = List.of(square, new Circle(1), new Circle(2));
        double total = 0;
        for (Shape s : shapes) total += s.area();
        System.out.printf("%.3f %s%n", total, new Main().helper());`,
      `    String helper() {
        final int bonus = 5;
        class Local {
            int get() { return bonus * 2 + twice(1); }
        }
        record Point(int x, int y) {}
        return new Local().get() + " " + new Point(1, 2);
    }
    static int twice(int x) { return 2 * x; }
`))).toBe('[Pair[a=1, b=2], Pair[a=2, b=2], Pair[a=3, b=1]] 3 true 1 [LEFT, RIGHT]\nn13,n12,n11 12\n19.708 12 Point[x=1, y=2]\n')
  })
})
