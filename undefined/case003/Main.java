import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

        Integer a = 127, b = 127, c = 128, d = 128;
        Long e = 127L, f = 127L;
        System.out.println((a == b) + " " + (c == d) + " " + c.equals(d) + " " + (e == f) + " " + (c == 128) + " " + a.compareTo(c));
        String s1 = "hi", s2 = "hi", s3 = new String("hi"), s4 = "h" + "i", h = "h", s5 = h + "i";
        System.out.println((s1 == s2) + " " + (s1 == s3) + " " + (s1 == s4) + " " + (s1 == s5) + " " + (s1 == s5.intern()) + " " + s1.equals(s3) + " " + (s1 == s1.substring(0)));
        List<Integer> list = new ArrayList<>(List.of(1000, 1000));
        System.out.println((list.get(0) == list.get(1)) + " " + list.get(0).equals(list.get(1)) + " " + (list.get(0) == 1000));
        Object o = 42; System.out.println((o instanceof Integer) + " " + (o instanceof Number) + " " + (o instanceof String));
    }
}
