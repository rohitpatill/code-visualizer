import { describe, expect, it } from 'vitest'
import { main, output } from './testing'

// Each expected output is what the program printed on a real JDK.

describe('Java semantics', () => {
  it('int arithmetic, overflow and shifts', () => {
    expect(output(main(`
        int a = Integer.MAX_VALUE; a++;
        long big = Long.MAX_VALUE; big++;
        System.out.println(a + " " + big + " " + (7 / 2) + " " + (-7 / 2) + " " + (-7 % 3) + " " + (7 % -3));
        System.out.println((1 << 31) + " " + (1 << 32) + " " + (-16 >> 2) + " " + (-16 >>> 28) + " " + (1L << 63) + " " + (-1L >>> 60));
        int x = 100000; System.out.println(x * x + " " + (long) x * x + " " + Math.multiplyExact(3, 4));
        System.out.println(Integer.MIN_VALUE / -1 + " " + Math.abs(Integer.MIN_VALUE) + " " + (-Integer.MIN_VALUE) + " " + (5 & 3) + " " + (5 | 3) + " " + (5 ^ 3) + " " + (~5));`))).toBe('-2147483648 -9223372036854775808 3 -3 -1 1\n-2147483648 1 -4 15 -9223372036854775808 15\n1410065408 10000000000 12\n-2147483648 -2147483648 -2147483648 1 7 6 -6\n')
  })

  it('casts, char arithmetic and compound assignment', () => {
    expect(output(main(`
        char c = 'a'; c += 2; c++;
        System.out.println(c); System.out.println(c + 1); System.out.println((char) (c + 1)); System.out.println("" + c + 1);
        System.out.println('a' + 'b' + "c"); System.out.println("c" + 'a' + 'b'); System.out.println((int) 'A' + " " + (char) 66);
        byte b = 10; b += 300; short s = 1; s *= 1000; int i = 5; i /= 2.5; i += 3.7; long l = 1; l <<= 40;
        System.out.println(b + " " + s + " " + i + " " + l);
        System.out.println((int) 3.99 + " " + (int) -3.99 + " " + (int) 1e20 + " " + (long) -1e30 + " " + (int) Double.NaN + " " + (byte) 200 + " " + (short) 70000 + " " + (char) 97 + " " + (int) 'z');
        double d = 7; float f = 1.1f; System.out.println(d / 2 + " " + f * 3 + " " + (double) f + " " + (f == 1.1) + " " + (float) 0.1 + " " + 10 / 4 * 1.0);`))).toBe('d\n101\ne\nd1\n195c\ncab\n65 B\n54 1000 5 1099511627776\n3 -3 2147483647 -9223372036854775808 0 -56 4464 a 122\n3.5 3.3000002 1.100000023841858 false 0.1 2.0\n')
  })

  it('doubles print the way Java prints them', () => {
    expect(output(main(`
        System.out.println(0.1 + 0.2); System.out.println(1.0 / 0); System.out.println(-1.0 / 0); System.out.println(0.0 / 0);
        System.out.println(100.0 / 3); System.out.println(1e7); System.out.println(1e-5); System.out.println(123456789.123);
        System.out.println(Math.pow(2, 10)); System.out.println(Math.sqrt(2)); System.out.println(Math.floor(-2.5) + " " + Math.ceil(-2.5) + " " + Math.round(-0.5) + " " + Math.round(2.5));
        System.out.println(Math.max(3, 7L) + " " + Math.max(1, 2.0) + " " + Math.min(-0.0, 0.0) + " " + Math.floorMod(-7, 3) + " " + Math.floorDiv(-7, 3) + " " + Math.hypot(3, 4) + " " + Math.cbrt(27));
        System.out.println(Double.MAX_VALUE + " " + Double.MIN_VALUE + " " + Float.MAX_VALUE + " " + 1.0f / 3 + " " + (0.1f + 0.2f));
        System.out.println(Double.compare(1.5, 2.5) + " " + Double.isNaN(0.0 / 0) + " " + Double.parseDouble(" 3.5 ") + " " + Integer.parseInt("-42") + " " + Long.parseLong("9000000000"));`))).toBe('0.30000000000000004\nInfinity\n-Infinity\nNaN\n33.333333333333336\n1.0E7\n1.0E-5\n1.23456789123E8\n1024.0\n1.4142135623730951\n-3.0 -2.0 0 3\n7 2.0 -0.0 2 -3 5.0 3.0\n1.7976931348623157E308 4.9E-324 3.4028235E38 0.33333334 0.3\n-1 true 3.5 -42 9000000000\n')
  })

  it('boxing caches and string identity', () => {
    expect(output(main(`
        Integer a = 127, b = 127, c = 128, d = 128;
        Long e = 127L, f = 127L;
        System.out.println((a == b) + " " + (c == d) + " " + c.equals(d) + " " + (e == f) + " " + (c == 128) + " " + a.compareTo(c));
        String s1 = "hi", s2 = "hi", s3 = new String("hi"), s4 = "h" + "i", h = "h", s5 = h + "i";
        System.out.println((s1 == s2) + " " + (s1 == s3) + " " + (s1 == s4) + " " + (s1 == s5) + " " + (s1 == s5.intern()) + " " + s1.equals(s3) + " " + (s1 == s1.substring(0)));
        List<Integer> list = new ArrayList<>(List.of(1000, 1000));
        System.out.println((list.get(0) == list.get(1)) + " " + list.get(0).equals(list.get(1)) + " " + (list.get(0) == 1000));
        Object o = 42; System.out.println((o instanceof Integer) + " " + (o instanceof Number) + " " + (o instanceof String));`))).toBe('true false true true true -1\ntrue false true false true true true\nfalse true true\ntrue true false\n')
  })

  it('switch, labels and loops', () => {
    expect(output(main(`
        for (String s : new String[]{"a", "b", "c"}) {
            switch (s) {
                case "a": System.out.print("A");
                case "b": System.out.print("B"); break;
                default: System.out.print("?");
            }
        }
        System.out.println();
        for (int n = 1; n <= 4; n++) {
            String kind = switch (n) {
                case 1, 2 -> "small";
                case 3 -> { String t = "mid"; yield t + "dle"; }
                default -> "big";
            };
            System.out.print(kind + " ");
        }
        System.out.println();
        outer:
        for (int i = 0; i < 4; i++) {
            for (int j = 0; j < 4; j++) {
                if (j == 2) continue outer;
                if (i == 3) break outer;
                System.out.print(i + "" + j + " ");
            }
        }
        System.out.println();
        int k = 0; do { k += 3; } while (k < 10); System.out.println(k);
        char grade = 'B';
        switch (grade) { case 'A' -> System.out.println("top"); case 'B', 'C' -> System.out.println("ok"); default -> System.out.println("low"); }`))).toBe('ABB?\nsmall small middle big \n00 01 10 11 20 21 \n12\nok\n')
  })

  it('exceptions: catch, finally, custom and chained', () => {
    expect(output(main(`
        try { int[] a = new int[2]; a[5] = 1; } catch (ArrayIndexOutOfBoundsException ex) { System.out.println("caught " + ex.getMessage()); }
        try { Object o = "x"; Integer n = (Integer) o; } catch (ClassCastException ex) { System.out.println("cast"); }
        try { throw new InsufficientFunds(50); } catch (InsufficientFunds ex) { System.out.println(ex.getMessage() + " " + ex.need + " " + (ex instanceof RuntimeException)); }
        System.out.println(tricky());
        try { risky(0); } catch (IllegalArgumentException | ArithmeticException ex) { System.out.println("multi " + ex); } finally { System.out.println("finally"); }
        try { Integer.parseInt("12a"); } catch (NumberFormatException ex) { System.out.println(ex.getMessage()); }
        try { new ArrayList<Integer>().iterator().next(); } catch (NoSuchElementException ex) { System.out.println("empty " + ex); }
        try { List.of(1).add(2); } catch (UnsupportedOperationException ex) { System.out.println("immutable " + ex.getMessage()); }
        try { throw new Exception("outer", new RuntimeException("inner")); } catch (Exception ex) { System.out.println(ex.getMessage() + " <- " + ex.getCause().getMessage()); }
        try { recurse(0); } catch (StackOverflowError ex) { System.out.println("deep"); }`,
      `    static class InsufficientFunds extends RuntimeException {
        int need;
        InsufficientFunds(int need) { super("need " + need); this.need = need; }
    }
    static int tricky() { try { return 1; } finally { System.out.println("in finally"); } }
    static void risky(int x) { if (x == 0) throw new IllegalArgumentException("zero"); }
    static int recurse(int n) { return recurse(n + 1) + 1; }
`))).toBe('caught Index 5 out of bounds for length 2\ncast\nneed 50 50 true\nin finally\n1\nmulti java.lang.IllegalArgumentException: zero\nfinally\nFor input string: "12a"\nempty java.util.NoSuchElementException\nimmutable null\nouter <- inner\ndeep\n')
  })

  it('Scanner reads tokens and lines', () => {
    expect(output(main(`
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        String rest = sc.nextLine();
        String line = sc.nextLine();
        long sum = 0;
        for (int i = 0; i < n; i++) sum += sc.nextLong();
        double d = sc.nextDouble();
        String word = sc.next();
        System.out.println(n + " [" + rest + "] [" + line + "] " + sum + " " + d + " " + word + " " + sc.hasNextInt() + " " + sc.hasNext());
        while (sc.hasNext()) System.out.print(sc.next() + ";");
        System.out.println();`), '3\nhello world\n10 20 30000000000\n2.5 end x y\n')).toBe('3 [] [hello world] 30000000030 2.5 end false true\nx;y;\n')
  })

  it('BufferedReader and StringTokenizer', () => {
    expect(output(main(`
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(br.readLine().trim());
        StringTokenizer st = new StringTokenizer(br.readLine());
        int total = 0;
        while (st.hasMoreTokens()) total += Integer.parseInt(st.nextToken());
        String[] parts = br.readLine().split(",");
        PrintWriter out = new PrintWriter(new BufferedWriter(new OutputStreamWriter(System.out)));
        out.println(n + " " + total + " " + Arrays.toString(parts) + " " + br.readLine());
        out.printf("%d-%s%n", 7, "x");
        out.flush();`), '5\n1 2 3 4\na,b,,c\n')).toBe('5 10 [a, b, , c] null\n7-x\n')
  })

  it('ternaries, casts and instanceof on objects', () => {
    expect(output(main(`
        Object[] things = {1, "two", 3.0, 'c', null, new int[]{1}, List.of(1)};
        for (Object o : things) {
            String kind = o == null ? "null" : o instanceof Integer i ? "int " + (i + 1) : o instanceof String s ? "str " + s.length() : o instanceof Double ? "double" : o instanceof Character ? "char" : o instanceof int[] arr ? "array " + arr.length : "other";
            System.out.print(kind + "; ");
        }
        System.out.println();
        Object n = 5; int back = (Integer) n; long wide = back; double dbl = (double) back / 2;
        System.out.println(back + " " + wide + " " + dbl + " " + (char) (back + 'a') + " " + ((Object) "s").getClass().getSimpleName());
        int a = 3, b = 4; int max = a > b ? a : b; String cmp = a == b ? "eq" : a < b ? "lt" : "gt";
        System.out.println(max + " " + cmp + " " + (a > 2 && b > 2) + " " + (a > 5 || b > 5) + " " + !(a == 3) + " " + (true ^ false));
        int i = 0; int[] arr = new int[3]; arr[i++] = i; arr[i] = i++ + ++i; System.out.println(Arrays.toString(arr) + " " + i);
        int y = 10; y -= y++ - --y; System.out.println(y);`))).toBe('int 2; str 3; double; char; null; array 1; other; \n5 5 2.5 f String\n4 lt true false false true\n[1, 4, 0] 3\n10\n')
  })
})
