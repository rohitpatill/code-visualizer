import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

        String s = "Hello, World";
        System.out.println(s.length() + " " + s.charAt(4) + " " + s.indexOf('o') + " " + s.indexOf("o", 5) + " " + s.lastIndexOf('o') + " " + s.indexOf("xyz"));
        System.out.println(s.substring(7) + "|" + s.substring(0, 5) + "|" + s.toUpperCase() + "|" + s.toLowerCase() + "|" + s.replace('l', 'L') + "|" + s.replace("World", "Java"));
        System.out.println(s.contains("World") + " " + s.startsWith("Hell") + " " + s.endsWith("ld") + " " + s.isEmpty() + " " + "  ".isBlank() + " " + "  pad  ".trim() + "|" + "  pad  ".strip() + "|");
        System.out.println("ab".repeat(3) + " " + String.join("-", "a", "b", "c") + " " + String.join("/", List.of("x", "y")) + " " + String.valueOf(3.5) + String.valueOf(true) + String.valueOf('c'));
        System.out.println("apple".compareTo("banana") + " " + "b".compareTo("a") + " " + "abc".equalsIgnoreCase("ABC") + " " + "Abc".compareToIgnoreCase("abd"));
        char[] cs = "dcba".toCharArray(); Arrays.sort(cs); System.out.println(new String(cs) + " " + String.valueOf(cs, 1, 2) + " " + cs.length);
        System.out.println(Arrays.toString("a1b2c3".split("\\d")) + " " + Arrays.toString("one  two".split(" ")) + " " + Arrays.toString("x".split(",")) + " " + "a-b-c".replaceAll("-", "+") + " " + "2024-01-15".matches("\\d{4}-\\d{2}-\\d{2}"));
        String t = ""; for (int i = 0; i < 3; i++) t += i; System.out.println(t + " " + t.hashCode() + " " + "".hashCode() + " " + "Aa".hashCode() + " " + "BB".hashCode());
    }
}
