import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(br.readLine().trim());
        StringTokenizer st = new StringTokenizer(br.readLine());
        int total = 0;
        while (st.hasMoreTokens()) total += Integer.parseInt(st.nextToken());
        String[] parts = br.readLine().split(",");
        PrintWriter out = new PrintWriter(new BufferedWriter(new OutputStreamWriter(System.out)));
        out.println(n + " " + total + " " + Arrays.toString(parts) + " " + br.readLine());
        out.printf("%d-%s%n", 7, "x");
        out.flush();
    }
}
