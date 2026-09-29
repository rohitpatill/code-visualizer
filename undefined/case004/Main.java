import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

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
        switch (grade) { case 'A' -> System.out.println("top"); case 'B', 'C' -> System.out.println("ok"); default -> System.out.println("low"); }
    }
}
