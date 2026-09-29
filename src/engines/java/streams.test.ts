import { describe, expect, it } from 'vitest'
import { main, output } from './testing'

// Each expected output is what the program printed on a real JDK.

describe('Java streams, collectors and Optional', () => {
  it('pipelines run lazily, one element at a time', () => {
    expect(output(main(`
        List<Integer> nums = List.of(5, 2, 8, 1, 9, 3);
        List<Integer> out = nums.stream()
            .filter(n -> { System.out.println("filter " + n); return n > 2; })
            .map(n -> { System.out.println("map " + n); return n * 10; })
            .limit(2)
            .collect(Collectors.toList());
        System.out.println(out);
        Stream.of("b", "a", "c").peek(s -> System.out.println("before " + s)).sorted().forEach(s -> System.out.println("after " + s));
        long counted = nums.stream().peek(n -> System.out.println("never " + n)).map(n -> n + 1).count();
        long filtered = nums.stream().peek(n -> System.out.print(n + " ")).filter(n -> n % 2 == 1).count();
        System.out.println(counted + " " + filtered);
        System.out.println(Stream.iterate(1, x -> { System.out.print("f" + x + " "); return x * 3; }).limit(4).collect(Collectors.toList()));
        Stream<Integer> once = nums.stream();
        once.count();
        try { once.count(); } catch (IllegalStateException e) { System.out.println(e.getMessage()); }
        Optional<Integer> firstBig = nums.stream().filter(n -> { System.out.print("?" + n); return n > 7; }).findFirst();
        System.out.println(" " + firstBig + " " + nums.stream().anyMatch(n -> n > 100) + " " + nums.stream().allMatch(n -> n > 0) + " " + nums.stream().noneMatch(n -> n == 9));`))).toBe('filter 5\nmap 5\nfilter 2\nfilter 8\nmap 8\n[50, 80]\nbefore b\nbefore a\nbefore c\nafter a\nafter b\nafter c\n5 2 8 1 9 3 6 4\nf1 f3 f9 [1, 3, 9, 27]\nstream has already been operated upon or closed\n?5?2?8 Optional[8] false true false\n')
  })

  it('sources, mapping and terminal operations', () => {
    expect(output(main(`
        int[] arr = {4, 1, 7, 3, 7, 9};
        System.out.println(Arrays.stream(arr).sum() + " " + Arrays.stream(arr).max().getAsInt() + " " + Arrays.stream(arr).min() + " " + Arrays.stream(arr).average() + " " + Arrays.stream(arr).count());
        System.out.println(Arrays.toString(Arrays.stream(arr).distinct().sorted().toArray()) + " " + Arrays.toString(Arrays.stream(arr, 1, 4).map(x -> x * x).toArray()));
        System.out.println(IntStream.range(0, 5).sum() + " " + IntStream.rangeClosed(1, 5).reduce(1, (a, b) -> a * b) + " " + IntStream.range(5, 1).count() + " " + LongStream.rangeClosed(1, 20).reduce(1L, (a, b) -> a * b));
        List<String> words = Arrays.asList("banana", "Apple", "cherry", "date", "fig", "apple");
        System.out.println(words.stream().map(String::toLowerCase).distinct().sorted().collect(Collectors.toList()));
        System.out.println(words.stream().sorted(Comparator.comparing(String::length).thenComparing(Comparator.reverseOrder())).toList());
        System.out.println(words.stream().mapToInt(String::length).boxed().collect(Collectors.toList()) + " " + words.stream().mapToInt(String::length).summaryStatistics());
        System.out.println(words.stream().filter(w -> w.length() > 4).map(w -> w.charAt(0)).map(String::valueOf).collect(Collectors.joining("|", "<", ">")));
        System.out.println(String.join(",", words.stream().skip(2).limit(3).toList()) + " " + words.stream().max(Comparator.naturalOrder()).get() + " " + words.stream().min(Comparator.comparing(String::length)).orElse("none"));
        System.out.println("hello world".chars().filter(Character::isLetter).mapToObj(c -> String.valueOf((char) c)).collect(Collectors.joining()) + " " + "a1b22c".chars().filter(Character::isDigit).count());
        List<List<Integer>> nested = List.of(List.of(1, 2), List.of(), List.of(3, 4, 5));
        System.out.println(nested.stream().flatMap(List::stream).map(x -> x * 2).collect(Collectors.toList()) + " " + nested.stream().mapToInt(List::size).max().getAsInt());
        System.out.println(Stream.of(1, 2, 3, 10, 4, 1).takeWhile(x -> x < 5).toList() + " " + Stream.of(1, 2, 3, 10, 4, 1).dropWhile(x -> x < 5).toList());
        String[] upper = Stream.of("x", "y").map(String::toUpperCase).toArray(String[]::new);
        Object[] objs = Stream.of(1, "two").toArray();
        System.out.println(Arrays.toString(upper) + " " + upper.length + " " + Arrays.toString(objs) + " " + Stream.of(3, 4).reduce(Integer::sum) + " " + Stream.of(3, 4).reduce(10, Integer::sum) + " " + Stream.<Integer>empty().reduce(Integer::sum));
        int[] counter = {0};
        System.out.println(Stream.generate(() -> ++counter[0]).limit(3).map(x -> x * x).toList() + " " + IntStream.iterate(1, i -> i <= 100, i -> i * 2).boxed().toList() + " " + Stream.concat(Stream.of(1), Stream.of(2, 3)).count());
        System.out.println(IntStream.of(3, 1, 2).boxed().sorted(Collections.reverseOrder()).mapToInt(Integer::intValue).sum() + " " + DoubleStream.of(1.5, 2.5).map(d -> d * 2).sum() + " " + IntStream.range(0, 4).mapToObj(i -> "i" + i).collect(Collectors.toList()) + " " + IntStream.range(0, 3).asDoubleStream().boxed().toList());
        StringBuilder sb = Stream.of("p", "q").collect(StringBuilder::new, StringBuilder::append, StringBuilder::append);
        System.out.println(sb + " " + Stream.of(5, 6).iterator().next() + " " + "one\\ntwo\\r\\nthree\\n".lines().toList());`))).toBe('31 9 OptionalInt[1] OptionalDouble[5.166666666666667] 6\n[1, 3, 4, 7, 9] [1, 49, 9]\n10 120 0 2432902008176640000\n[apple, banana, cherry, date, fig]\n[fig, date, apple, Apple, cherry, banana]\n[6, 5, 6, 4, 3, 5] IntSummaryStatistics{count=6, sum=29, min=3, average=4.833333, max=6}\n<b|A|c|a>\ncherry,date,fig fig fig\nhelloworld 3\n[2, 4, 6, 8, 10] 3\n[1, 2, 3] [10, 4, 1]\n[X, Y] 2 [1, two] Optional[7] 17 Optional.empty\n[1, 4, 9] [1, 2, 4, 8, 16, 32, 64] 3\n6 8.0 [i0, i1, i2, i3] [0.0, 1.0, 2.0]\npq 5 [one, two, three]\n')
  })

  it('Collectors: grouping, partitioning and maps', () => {
    expect(output(main(`
        List<String> words = List.of("apple", "avocado", "banana", "blueberry", "cherry", "kiwi", "Aa", "BB", "fig");
        Map<Character, List<String>> byFirst = words.stream().collect(Collectors.groupingBy(w -> w.charAt(0)));
        System.out.println(byFirst);
        Map<Integer, Long> byLength = words.stream().collect(Collectors.groupingBy(String::length, Collectors.counting()));
        System.out.println(byLength + " " + byLength.get(6).getClass().getSimpleName());
        Map<String, List<String>> collide = Stream.of("Aa", "BB", "Aa").collect(Collectors.groupingBy(w -> w));
        Map<String, Integer> collideToMap = Stream.of("Aa", "BB").collect(Collectors.toMap(w -> w, String::length));
        Map<String, Integer> collideMerge = Stream.of("Aa", "BB").collect(Collectors.toMap(w -> w, String::length, Integer::sum));
        System.out.println(collide + " " + collideToMap + " " + collideMerge);
        TreeMap<Integer, Set<String>> sorted = words.stream().collect(Collectors.groupingBy(String::length, TreeMap::new, Collectors.mapping(String::toUpperCase, Collectors.toCollection(TreeSet::new))));
        System.out.println(sorted + " " + sorted.firstKey());
        Map<Boolean, List<String>> parts = words.stream().collect(Collectors.partitioningBy(w -> w.length() > 4));
        Map<Boolean, Long> partCounts = words.stream().collect(Collectors.partitioningBy(w -> w.contains("e"), Collectors.counting()));
        System.out.println(parts + " " + partCounts + " " + parts.get(true).size());
        Map<Character, Integer> totals = words.stream().collect(Collectors.toMap(w -> w.charAt(0), String::length, Integer::sum, LinkedHashMap::new));
        System.out.println(totals);
        try { words.stream().collect(Collectors.toMap(String::length, w -> w)); } catch (IllegalStateException e) { System.out.println(e.getMessage()); }
        System.out.println(words.stream().collect(Collectors.summingInt(String::length)) + " " + words.stream().collect(Collectors.averagingInt(String::length)) + " " + words.stream().collect(Collectors.averagingDouble(w -> w.length() * 0.1)) + " " + words.stream().collect(Collectors.summingDouble(w -> 0.1)));
        System.out.println(words.stream().collect(Collectors.toSet()).size() + " " + words.stream().collect(Collectors.minBy(Comparator.comparing(String::length))) + " " + words.stream().collect(Collectors.maxBy(Comparator.naturalOrder())) + " " + Stream.<String>empty().collect(Collectors.minBy(Comparator.naturalOrder())));
        System.out.println(words.stream().collect(Collectors.collectingAndThen(Collectors.toList(), List::size)) + " " + words.stream().collect(Collectors.summarizingInt(String::length)) + " " + words.stream().collect(Collectors.reducing(0, String::length, Integer::sum)));
        System.out.println(words.stream().collect(Collectors.groupingBy(String::length, Collectors.filtering(w -> w.startsWith("b"), Collectors.toList()))));
        System.out.println(words.stream().collect(Collectors.groupingBy(w -> w.length() % 3, Collectors.joining("+"))) + " " + words.stream().collect(Collectors.teeing(Collectors.counting(), Collectors.joining(), (n, s) -> n + ":" + s.length())));
        Map<String, Integer> freq = new HashMap<>();
        for (String w : "the cat and the hat and the bat".split(" ")) freq.merge(w, 1, Integer::sum);
        List<String> top = freq.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey())).map(Map.Entry::getKey).limit(3).collect(Collectors.toList());
        System.out.println(top + " " + freq.entrySet().stream().max(Map.Entry.comparingByValue()).get().getKey() + " " + freq.values().stream().mapToInt(Integer::intValue).sum() + " " + freq.keySet().stream().sorted().findFirst().get());`))).toBe('{A=[Aa], a=[apple, avocado], B=[BB], b=[banana, blueberry], c=[cherry], f=[fig], k=[kiwi]}\n{2=2, 3=1, 4=1, 5=1, 6=2, 7=1, 9=1} Long\n{BB=[BB], Aa=[Aa, Aa]} {Aa=2, BB=2} {BB=2, Aa=2}\n{2=[AA, BB], 3=[FIG], 4=[KIWI], 5=[APPLE], 6=[BANANA, CHERRY], 7=[AVOCADO], 9=[BLUEBERRY]} 2\n{false=[kiwi, Aa, BB, fig], true=[apple, avocado, banana, blueberry, cherry]} {false=6, true=3} 5\n{a=12, b=15, c=6, k=4, A=2, B=2, f=3}\nDuplicate key 6 (attempted merging values banana and cherry)\n44 4.888888888888889 0.48888888888888893 0.9\n9 Optional[Aa] Optional[kiwi] Optional.empty\n9 IntSummaryStatistics{count=9, sum=44, min=2, average=4.888889, max=9} 44\n{2=[], 3=[], 4=[], 5=[], 6=[banana], 7=[], 9=[blueberry]}\n{0=banana+blueberry+cherry+fig, 1=avocado+kiwi, 2=apple+Aa+BB} 9:44\n[the, and, bat] the 8 and\n')
  })

  it('Optional, summary statistics and double sums', () => {
    expect(output(main(`
        Optional<String> some = Optional.of("java"), none = Optional.empty(), maybe = Optional.ofNullable(null);
        System.out.println(some + " " + none + " " + maybe + " " + some.isPresent() + " " + none.isEmpty() + " " + some.get() + " " + none.orElse("other") + " " + maybe.orElseGet(() -> "made"));
        System.out.println(some.map(String::length) + " " + some.filter(s -> s.startsWith("x")) + " " + some.flatMap(s -> Optional.of(s + "!")) + " " + none.map(String::length) + " " + some.equals(Optional.of("java")) + " " + some.or(() -> Optional.of("z")).get());
        some.ifPresent(s -> System.out.println("has " + s));
        none.ifPresentOrElse(s -> System.out.println("has " + s), () -> System.out.println("nothing"));
        try { none.get(); } catch (NoSuchElementException e) { System.out.println(e.getMessage()); }
        try { none.orElseThrow(() -> new IllegalArgumentException("missing")); } catch (IllegalArgumentException e) { System.out.println(e.getMessage()); }
        try { Optional.of(null); } catch (NullPointerException e) { System.out.println("npe"); }
        OptionalInt oi = IntStream.of(4, 8).max();
        OptionalDouble od = IntStream.of(1, 2).average();
        System.out.println(oi + " " + od + " " + IntStream.empty().max() + " " + oi.getAsInt() + " " + od.getAsDouble() + " " + IntStream.empty().average().orElse(-1) + " " + OptionalInt.of(3).equals(OptionalInt.of(3)));
        double[] tenths = new double[10];
        Arrays.fill(tenths, 0.1);
        double loop = 0;
        for (double d : tenths) loop += d;
        System.out.println(loop + " " + Arrays.stream(tenths).sum() + " " + DoubleStream.of(0.1, 0.2, 0.3).sum() + " " + DoubleStream.of(0.1, 0.2, 0.3).average().getAsDouble());
        IntSummaryStatistics is = IntStream.of(3, 9, -2).summaryStatistics();
        DoubleSummaryStatistics ds = DoubleStream.of(1.5, 2.25).summaryStatistics();
        System.out.println(is + " " + is.getAverage() + " " + is.getSum());
        System.out.println(ds + " " + ds.getMax() + " " + new IntSummaryStatistics() + " " + LongStream.of(5, 7).summaryStatistics());
        System.out.println(IntStream.of(Integer.MAX_VALUE, 1).sum() + " " + IntStream.of(Integer.MAX_VALUE, 1).average().getAsDouble() + " " + IntStream.of(Integer.MAX_VALUE, 1).asLongStream().sum());`))).toBe('Optional[java] Optional.empty Optional.empty true true java other made\nOptional[4] Optional.empty Optional[java!] Optional.empty true java\nhas java\nnothing\nNo value present\nmissing\nnpe\nOptionalInt[8] OptionalDouble[1.5] OptionalInt.empty 8 1.5 -1.0 true\n0.9999999999999999 1.0 0.6 0.19999999999999998\nIntSummaryStatistics{count=3, sum=10, min=-2, average=3.333333, max=9} 3.3333333333333335 10\nDoubleSummaryStatistics{count=2, sum=3.750000, min=1.500000, average=1.875000, max=2.250000} 2.25 IntSummaryStatistics{count=0, sum=0, min=2147483647, average=0.000000, max=-2147483648} LongSummaryStatistics{count=2, sum=12, min=5, average=6.000000, max=7}\n-2147483648 1.073741824E9 2147483648\n')
  })

  it('LeetCode habits with streams', () => {
    expect(output(main(`
        int[] nums = {3, 1, 4, 1, 5, 9, 2, 6};
        int[] desc = Arrays.stream(nums).boxed().sorted(Collections.reverseOrder()).mapToInt(Integer::intValue).toArray();
        System.out.println(Arrays.toString(desc) + " " + Arrays.stream(nums).filter(x -> x % 2 == 0).count());
        String[] strs = {"eat", "tea", "tan", "ate", "nat", "bat"};
        Map<String, List<String>> groups = Arrays.stream(strs).collect(Collectors.groupingBy(s -> { char[] c = s.toCharArray(); Arrays.sort(c); return new String(c); }));
        System.out.println(new ArrayList<>(groups.values()));
        Map<Integer, Long> freq = Arrays.stream(nums).boxed().collect(Collectors.groupingBy(Function.identity(), Collectors.counting()));
        List<Integer> topK = freq.entrySet().stream().sorted((a, b) -> Long.compare(b.getValue(), a.getValue())).limit(2).map(Map.Entry::getKey).collect(Collectors.toList());
        System.out.println(freq + " " + topK);
        List<int[]> pairs = IntStream.range(0, 3).boxed().flatMap(i -> IntStream.range(i + 1, 3).mapToObj(j -> new int[]{i, j})).collect(Collectors.toList());
        System.out.println(pairs.stream().map(Arrays::toString).collect(Collectors.joining(" ")));
        List<Integer> list = IntStream.rangeClosed(1, 6).boxed().collect(Collectors.toList());
        list.removeIf(x -> x % 3 == 0);
        System.out.println(list + " " + list.stream().mapToInt(x -> x).sum() + " " + list.stream().map(String::valueOf).collect(Collectors.joining("->")));
        char[] letters = "stream".toCharArray();
        String sortedLetters = new String(letters).chars().sorted().mapToObj(c -> String.valueOf((char) c)).collect(Collectors.joining());
        System.out.println(sortedLetters + " " + IntStream.range(0, nums.length).filter(i -> nums[i] == 1).boxed().toList() + " " + IntStream.range(0, nums.length).map(i -> nums[nums.length - 1 - i]).boxed().toList());
        List<Person> people = List.of(new Person("Ann", 31), new Person("Bob", 25), new Person("Cid", 31));
        System.out.println(people.stream().sorted(Comparator.comparingInt(Person::age).thenComparing(Person::name, Comparator.reverseOrder())).map(Person::name).toList() + " " + people.stream().collect(Collectors.groupingBy(Person::age, TreeMap::new, Collectors.mapping(Person::name, Collectors.joining("/")))));
        System.out.println(people.stream().mapToInt(Person::age).average().getAsDouble() + " " + people.stream().map(Person::age).reduce(0, Integer::sum) + " " + people.stream().anyMatch(p -> p.name().equals("Bob")));`,
      `    record Person(String name, int age) {}
`))).toBe('[9, 6, 5, 4, 3, 2, 1, 1] 3\n[[eat, tea, ate], [bat], [tan, nat]]\n{1=2, 2=1, 3=1, 4=1, 5=1, 6=1, 9=1} [1, 2]\n[0, 1] [0, 2] [1, 2]\n[1, 2, 4, 5] 12 1->2->4->5\naemrst [1, 3] [6, 2, 9, 5, 1, 4, 1, 3]\n[Bob, Cid, Ann] {25=Bob, 31=Ann/Cid}\n29.0 87 true\n')
  })
})
