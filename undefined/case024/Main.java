import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

        final int MOD = 1_000_000_007;
        long[] ways = new long[51]; ways[0] = 1; ways[1] = 1;
        for (int i = 2; i <= 50; i++) ways[i] = (ways[i - 1] + ways[i - 2]) % MOD;
        System.out.println(ways[50] + " " + ways[10]);
        int[] coins = {1, 5, 11}; int amount = 15; int[] dp = new int[amount + 1]; Arrays.fill(dp, amount + 1); dp[0] = 0;
        for (int a = 1; a <= amount; a++) for (int c : coins) if (c <= a) dp[a] = Math.min(dp[a], dp[a - c] + 1);
        System.out.println(dp[amount]);
        int[][] intervals = {{1, 3}, {8, 10}, {2, 6}, {15, 18}, {17, 20}};
        Arrays.sort(intervals, (x, y) -> Integer.compare(x[0], y[0]));
        List<int[]> merged = new ArrayList<>();
        for (int[] iv : intervals) {
            if (merged.isEmpty() || merged.get(merged.size() - 1)[1] < iv[0]) merged.add(iv);
            else merged.get(merged.size() - 1)[1] = Math.max(merged.get(merged.size() - 1)[1], iv[1]);
        }
        System.out.println(Arrays.deepToString(merged.toArray(new int[0][])));
        int x = 0b1011; System.out.println(Integer.bitCount(x) + " " + (x & -x) + " " + (x >> 1) + " " + Integer.toBinaryString(x ^ 0xF) + " " + ((x & (1 << 2)) != 0) + " " + Long.bitCount(-1L));
        int[] piles = {3, 6, 7, 11}; int lo = 1, hi = 11;
        while (lo < hi) { int mid = lo + (hi - lo) / 2; int hours = 0; for (int p : piles) hours += (p + mid - 1) / mid; if (hours <= 8) hi = mid; else lo = mid + 1; }
        System.out.println(lo);
        String s = "A man, a plan, a canal: Panama"; StringBuilder clean = new StringBuilder();
        for (char ch : s.toCharArray()) if (Character.isLetterOrDigit(ch)) clean.append(Character.toLowerCase(ch));
        System.out.println(clean.toString().equals(clean.reverse().toString()) + " " + clean.length());
    }
}
