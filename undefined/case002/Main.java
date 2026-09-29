import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

        System.out.println(0.1 + 0.2); System.out.println(1.0 / 0); System.out.println(-1.0 / 0); System.out.println(0.0 / 0);
        System.out.println(100.0 / 3); System.out.println(1e7); System.out.println(1e-5); System.out.println(123456789.123);
        System.out.println(Math.pow(2, 10)); System.out.println(Math.sqrt(2)); System.out.println(Math.floor(-2.5) + " " + Math.ceil(-2.5) + " " + Math.round(-0.5) + " " + Math.round(2.5));
        System.out.println(Math.max(3, 7L) + " " + Math.max(1, 2.0) + " " + Math.min(-0.0, 0.0) + " " + Math.floorMod(-7, 3) + " " + Math.floorDiv(-7, 3) + " " + Math.hypot(3, 4) + " " + Math.cbrt(27));
        System.out.println(Double.MAX_VALUE + " " + Double.MIN_VALUE + " " + Float.MAX_VALUE + " " + 1.0f / 3 + " " + (0.1f + 0.2f));
        System.out.println(Double.compare(1.5, 2.5) + " " + Double.isNaN(0.0 / 0) + " " + Double.parseDouble(" 3.5 ") + " " + Integer.parseInt("-42") + " " + Long.parseLong("9000000000"));
    }
}
