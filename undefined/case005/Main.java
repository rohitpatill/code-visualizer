import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {
    static class InsufficientFunds extends RuntimeException {
        int need;
        InsufficientFunds(int need) { super("need " + need); this.need = need; }
    }
    static int tricky() { try { return 1; } finally { System.out.println("in finally"); } }
    static void risky(int x) { if (x == 0) throw new IllegalArgumentException("zero"); }
    static int recurse(int n) { return recurse(n + 1) + 1; }

    public static void main(String[] args) throws Exception {

        try { int[] a = new int[2]; a[5] = 1; } catch (ArrayIndexOutOfBoundsException ex) { System.out.println("caught " + ex.getMessage()); }
        try { Object o = "x"; Integer n = (Integer) o; } catch (ClassCastException ex) { System.out.println("cast"); }
        try { throw new InsufficientFunds(50); } catch (InsufficientFunds ex) { System.out.println(ex.getMessage() + " " + ex.need + " " + (ex instanceof RuntimeException)); }
        System.out.println(tricky());
        try { risky(0); } catch (IllegalArgumentException | ArithmeticException ex) { System.out.println("multi " + ex); } finally { System.out.println("finally"); }
        try { Integer.parseInt("12a"); } catch (NumberFormatException ex) { System.out.println(ex.getMessage()); }
        try { new ArrayList<Integer>().iterator().next(); } catch (NoSuchElementException ex) { System.out.println("empty " + ex); }
        try { List.of(1).add(2); } catch (UnsupportedOperationException ex) { System.out.println("immutable " + ex.getMessage()); }
        try { throw new Exception("outer", new RuntimeException("inner")); } catch (Exception ex) { System.out.println(ex.getMessage() + " <- " + ex.getCause().getMessage()); }
        try { recurse(0); } catch (StackOverflowError ex) { System.out.println("deep"); }
    }
}
