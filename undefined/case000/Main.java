import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

        int a = Integer.MAX_VALUE; a++;
        long big = Long.MAX_VALUE; big++;
        System.out.println(a + " " + big + " " + (7 / 2) + " " + (-7 / 2) + " " + (-7 % 3) + " " + (7 % -3));
        System.out.println((1 << 31) + " " + (1 << 32) + " " + (-16 >> 2) + " " + (-16 >>> 28) + " " + (1L << 63) + " " + (-1L >>> 60));
        int x = 100000; System.out.println(x * x + " " + (long) x * x + " " + Math.multiplyExact(3, 4));
        System.out.println(Integer.MIN_VALUE / -1 + " " + Math.abs(Integer.MIN_VALUE) + " " + (-Integer.MIN_VALUE) + " " + (5 & 3) + " " + (5 | 3) + " " + (5 ^ 3) + " " + (~5));
    }
}
