import { describe, expect, it } from 'vitest'
import { main, output } from './testing'

// Each expected output is what the program printed on a real JDK.

describe('Java collections', () => {
  it('ArrayList operations', () => {
    expect(output(main(`
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
        try { for (Integer v : copy) copy.add(v); } catch (ConcurrentModificationException ex) { System.out.println("CME"); }`))).toBe('[7, 4, 8, 1, 2] 5 7 2 true -1\n[1, 2, 4, 7, 8] 8 1\n[8, 7, 4, 2, 1]\n[7, 1] false\n[20, 10, 1, 7] [10, 1] 2 true\n[1] a,b\n[[1, 2], []] 2\nCME\n')
  })

  it('queues, deques and stacks', () => {
    expect(output(main(`
        Queue<Integer> q = new LinkedList<>(); q.offer(1); q.add(2); q.offer(3);
        System.out.println(q); System.out.println(q.peek() + " " + q.poll() + " " + q.size()); System.out.println(q);
        Deque<Integer> dq = new ArrayDeque<>(); dq.push(1); dq.push(2); dq.addLast(3); dq.offerFirst(0);
        System.out.println(dq); System.out.println(dq.peekFirst() + " " + dq.peekLast() + " " + dq.pop() + " " + dq.pollLast()); System.out.println(dq);
        Stack<Character> st = new Stack<>(); st.push('a'); st.push('b'); st.push('c');
        System.out.println(st); System.out.println(st.peek() + " " + st.pop() + " " + st.search('a') + " " + st.empty()); System.out.println(st);
        Deque<int[]> cells = new ArrayDeque<>(); cells.offer(new int[]{1, 2}); int[] cell = cells.poll();
        System.out.println(cell[0] + cell[1] + " " + cells.isEmpty() + " " + cells.poll());
        LinkedList<String> ll = new LinkedList<>(List.of("x", "y")); ll.addFirst("w"); ll.removeLast(); System.out.println(ll + " " + ll.getFirst() + " " + ll.get(1));`))).toBe('[1, 2, 3]\n1 1 2\n[2, 3]\n[0, 2, 1, 3]\n0 3 0 3\n[2, 1]\n[a, b, c]\nc c 2 false\n[a, b]\n3 true null\n[w, x] w x\n')
  })

  it('HashMap and friends', () => {
    expect(output(main(`
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
        Map<String, Integer> lhm = new LinkedHashMap<>(); lhm.put("z", 1); lhm.put("a", 2); lhm.put("m", 3); System.out.println(lhm);`))).toBe('{the=1, that=1, not=1, or=1, be=2, question=1, is=1, to=2} 8 2 null true true\n[the, new, not, or, be, question, is, to] [1, 1, 1, 1, 2, 1, 1, 20]\nbe=2;to=20;\n{33=[2], 17=[1], 1=[2, 3, 17], 2=[1, 3, 33], 3=[1, 2]}\n{p=2, s=4, i=4, m=1}\n[0, 33, 66, 99, 132, 165, 198, 231, 264, 297]\n{z=1, a=2, m=3}\n')
  })

  it('sets, TreeMap and TreeSet', () => {
    expect(output(main(`
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
        Set<Character> lhs = new LinkedHashSet<>(); for (char ch : "banana".toCharArray()) lhs.add(ch); System.out.println(lhs);`))).toBe('[banana, apple, cherry, pear, kiwi, fig]\ntrue false true 5\n[banana, apple, cherry, pear, fig]\n[1024, 16, -3, 19, 100, 7, 42]\n[10, 20, 30, 50, 80] 10 80 20 30 null null [10, 20] [30, 50, 80]\n10\n[20, 30, 50, 80]\n{alpha=1, bravo=2, charlie=3, delta=4} alpha delta=4 bravo charlie {alpha=1, bravo=2} {charlie=3, delta=4}\n{3=c, 2=b, 1=a}\ntrue false\n[b, a, n]\n')
  })

  it('PriorityQueue and comparators', () => {
    expect(output(main(`
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
        int[][] intervals = {{5, 6}, {1, 3}, {2, 4}}; Arrays.sort(intervals, (a, b) -> a[0] - b[0]); System.out.println(Arrays.deepToString(intervals));`))).toBe('[1, 2, 4, 5, 3] [5, 3, 4, 1, 2] 1 5\n54321 true\n[1, 2, 3, 5]\n4:1 2:3 1:5 3:5 \n[fig, kiwi, pear, apple, banana]\n[banana, apple, kiwi, pear, fig]\n[3, 2, 1]\n[[1, 3], [2, 4], [5, 6]]\n')
  })

  it('Arrays and Collections utilities', () => {
    expect(output(main(`
        int[] a = {5, 2, 9, 1, 5, 6};
        int[] b = Arrays.copyOf(a, 8); int[] c = Arrays.copyOfRange(a, 1, 4); Arrays.sort(a);
        System.out.println(Arrays.toString(a) + " " + Arrays.toString(b) + " " + Arrays.toString(c) + " " + Arrays.binarySearch(a, 6) + " " + Arrays.binarySearch(a, 3));
        int[] filled = new int[4]; Arrays.fill(filled, 7); Arrays.fill(filled, 1, 3, 0); System.out.println(Arrays.toString(filled) + " " + Arrays.equals(filled, new int[]{7, 0, 0, 7}));
        long[] ls = new long[3]; double[] ds = new double[2]; boolean[] bs = new boolean[2]; String[] ss = new String[2]; char[] chs = new char[2];
        System.out.println(Arrays.toString(ls) + Arrays.toString(ds) + Arrays.toString(bs) + Arrays.toString(ss) + (int) chs[0]);
        List<Integer> fixed = Arrays.asList(3, 1, 2); Collections.sort(fixed); System.out.println(fixed + " " + Arrays.asList(new int[]{1, 2}).size());
        String[] names = {"b", "a", "c"}; List<String> view = Arrays.asList(names); view.set(0, "z"); System.out.println(names[0] + " " + view);
        List<Integer> nums = new ArrayList<>(Collections.nCopies(3, 0)); Collections.swap(nums, 0, 2); nums.set(0, 5); Collections.swap(nums, 0, 2); System.out.println(nums);
        int[][] grid = new int[2][3]; grid[1][2] = 7; System.out.println(Arrays.deepToString(grid) + " " + grid.length + " " + grid[0].length);
        int[] clone = a.clone(); clone[0] = 99; System.out.println(a[0] + " " + clone[0] + " " + (a == clone) + " " + Arrays.equals(a, a.clone()));
        Integer[] objs = {3, 1, 2}; Arrays.sort(objs); System.out.println(Arrays.toString(objs) + " " + Arrays.asList(objs).indexOf(2) + " " + Objects.hash(1, "a") + " " + Objects.equals(null, null));`))).toBe('[1, 2, 5, 5, 6, 9] [5, 2, 9, 1, 5, 6, 0, 0] [2, 9, 1] 4 -3\n[7, 0, 0, 7] true\n[0, 0, 0][0.0, 0.0][false, false][null, null]0\n[1, 2, 3] 1\nz [z, a, c]\n[0, 0, 5]\n[[0, 0, 0], [0, 0, 7]] 2 3\n1 99 false true\n[1, 2, 3] 1 1089 true\n')
  })

  it('seeded Random, LRU order and try-with-resources', () => {
    expect(output(main(`
        Random rnd = new Random(42);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 5; i++) sb.append(rnd.nextInt(100)).append(' ');
        sb.append(rnd.nextInt()).append(' ').append(rnd.nextInt(7)).append(' ').append(rnd.nextInt(5, 10)).append(' ').append(rnd.nextBoolean()).append(' ').append(rnd.nextLong());
        System.out.println(sb);
        System.out.printf("%.6f%n", new Random(7).nextDouble());
        Map<Integer, String> lru = new LinkedHashMap<>(16, 0.75f, true);
        lru.put(1, "a"); lru.put(2, "b"); lru.put(3, "c"); lru.get(1); lru.put(2, "B"); lru.getOrDefault(3, "?");
        System.out.println(lru + " " + lru.keySet().iterator().next());
        try (Resource r1 = new Resource("one"); Resource r2 = new Resource("two")) {
            System.out.println("using " + r1.name + " and " + r2.name);
            throw new IllegalStateException("boom");
        } catch (IllegalStateException ex) {
            System.out.println("caught " + ex.getMessage());
        } finally {
            System.out.println("done");
        }
        try (PrintWriter out = new PrintWriter(System.out)) {
            out.println("flushed by close");
        }`,
      `    static class Resource implements AutoCloseable {
        String name;
        Resource(String name) { this.name = name; System.out.println("open " + name); }
        public void close() { System.out.println("close " + name); }
    }
`))).toBe('30 63 48 84 70 -248792245 1 8 true 1684641590762760125\n0.730699\n{1=a, 2=B, 3=c} 1\nopen one\nopen two\nusing one and two\nclose two\nclose one\ncaught boom\ndone\nflushed by close\n')
  })
})
