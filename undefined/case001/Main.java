import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

        char c = 'a'; c += 2; c++;
        System.out.println(c); System.out.println(c + 1); System.out.println((char) (c + 1)); System.out.println("" + c + 1);
        System.out.println('a' + 'b' + "c"); System.out.println("c" + 'a' + 'b'); System.out.println((int) 'A' + " " + (char) 66);
        byte b = 10; b += 300; short s = 1; s *= 1000; int i = 5; i /= 2.5; i += 3.7; long l = 1; l <<= 40;
        System.out.println(b + " " + s + " " + i + " " + l);
        System.out.println((int) 3.99 + " " + (int) -3.99 + " " + (int) 1e20 + " " + (long) -1e30 + " " + (int) Double.NaN + " " + (byte) 200 + " " + (short) 70000 + " " + (char) 97 + " " + (int) 'z');
        double d = 7; float f = 1.1f; System.out.println(d / 2 + " " + f * 3 + " " + (double) f + " " + (f == 1.1) + " " + (float) 0.1 + " " + 10 / 4 * 1.0);
    }
}
