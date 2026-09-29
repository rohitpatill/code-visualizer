import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

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
        int y = 10; y -= y++ - --y; System.out.println(y);
    }
}
