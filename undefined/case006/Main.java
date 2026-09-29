import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        String rest = sc.nextLine();
        String line = sc.nextLine();
        long sum = 0;
        for (int i = 0; i < n; i++) sum += sc.nextLong();
        double d = sc.nextDouble();
        String word = sc.next();
        System.out.println(n + " [" + rest + "] [" + line + "] " + sum + " " + d + " " + word + " " + sc.hasNextInt() + " " + sc.hasNext());
        while (sc.hasNext()) System.out.print(sc.next() + ";");
        System.out.println();
    }
}
