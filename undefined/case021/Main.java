import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {
    static int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            Integer j = seen.get(target - nums[i]);
            if (j != null) return new int[]{j, i};
            seen.put(nums[i], i);
        }
        return new int[0];
    }
    static int longestUnique(String s) {
        Map<Character, Integer> last = new HashMap<>();
        int best = 0, left = 0;
        for (int right = 0; right < s.length(); right++) {
            char ch = s.charAt(right);
            if (last.containsKey(ch) && last.get(ch) >= left) left = last.get(ch) + 1;
            last.put(ch, right);
            best = Math.max(best, right - left + 1);
        }
        return best;
    }

    public static void main(String[] args) throws Exception {

        System.out.println(Arrays.toString(twoSum(new int[]{2, 7, 11, 15}, 9)) + " " + Arrays.toString(twoSum(new int[]{3, 2, 4}, 6)));
        Map<String, List<String>> groups = new HashMap<>();
        for (String w : new String[]{"eat", "tea", "tan", "ate", "nat", "bat"}) {
            char[] key = w.toCharArray(); Arrays.sort(key);
            groups.computeIfAbsent(new String(key), k -> new ArrayList<>()).add(w);
        }
        System.out.println(groups.values());
        System.out.println(longestUnique("abcabcbb") + " " + longestUnique("pwwkew") + " " + longestUnique(""));
    }
}
