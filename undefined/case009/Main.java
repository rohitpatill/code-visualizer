import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 5; i++) sb.append(i).append(',');
        sb.setLength(sb.length() - 1);
        System.out.println(sb + " " + sb.length() + " " + sb.charAt(2) + " " + sb.indexOf("3"));
        sb.insert(0, "[").append("]").reverse();
        System.out.println(sb);
        sb.reverse().deleteCharAt(0).setCharAt(0, 'X');
        sb.replace(1, 3, "--").delete(sb.length() - 2, sb.length());
        System.out.println(sb.toString() + " " + new StringBuilder("racecar").reverse().toString().equals("racecar"));
        StringBuilder a = new StringBuilder("x"); StringBuilder b = a; b.append("y"); System.out.println(a + " " + (a == b) + " " + a.toString().equals(b.toString()));
    }
}
