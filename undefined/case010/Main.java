import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

        System.out.printf("%d|%5d|%-5d|%05d|%,d|%+d|%x|%X|%o%n", 42, 42, 42, 42, 1234567, 7, 255, 255, 8);
        System.out.printf("%.2f|%8.3f|%-8.1f|%e|%.3e|%,.2f|%.0f%n", Math.PI, Math.E, 2.25, 12345.678, 0.00012, 9876543.21, 2.5);
        System.out.printf("%s|%10s|%-10s|%S|%.3s|%c|%b|%%|%n", "hi", "right", "left", "up", "abcdef", 'z', true);
        System.out.println(String.format("%s scored %d (%.1f%%)", "Ana", 9, 90.0) + " " + String.format("%3$s %1$s %2$s", "a", "b", "c"));
        System.out.println(String.format("[%6.2f] [%-6b] [%x] [%s]", -1.5, false, -255, Arrays.asList(1, 2)));
    }
}
