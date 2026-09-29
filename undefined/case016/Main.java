import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

        int[] a = {5, 2, 9, 1, 5, 6};
        int[] b = Arrays.copyOf(a, 8); int[] c = Arrays.copyOfRange(a, 1, 4); Arrays.sort(a);
        System.out.println(Arrays.toString(a) + " " + Arrays.toString(b) + " " + Arrays.toString(c) + " " + Arrays.binarySearch(a, 6) + " " + Arrays.binarySearch(a, 3));
        int[] filled = new int[4]; Arrays.fill(filled, 7); Arrays.fill(filled, 1, 3, 0); System.out.println(Arrays.toString(filled) + " " + Arrays.equals(filled, new int[]{7, 0, 0, 7}));
        long[] ls = new long[3]; double[] ds = new double[2]; boolean[] bs = new boolean[2]; String[] ss = new String[2]; char[] chs = new char[2];
        System.out.println(Arrays.toString(ls) + Arrays.toString(ds) + Arrays.toString(bs) + Arrays.toString(ss) + (int) chs[0]);
        List<Integer> fixed = Arrays.asList(3, 1, 2); Collections.sort(fixed); System.out.println(fixed + " " + Arrays.asList(new int[]{1, 2}).size());
        String[] names = {"b", "a", "c"}; List<String> view = Arrays.asList(names); view.set(0, "z"); System.out.println(names[0] + " " + view);
        List<Integer> nums = new ArrayList<>(Collections.nCopies(3, 0)); Collections.swap(nums, 0, 2); nums.set(0, 5); Collections.swap(nums, 0, 2); System.out.println(nums);
        int[][] grid = new int[2][3]; grid[1][2] = 7; System.out.println(Arrays.deepToString(grid) + " " + grid.length + " " + grid[0].length);
        int[] clone = a.clone(); clone[0] = 99; System.out.println(a[0] + " " + clone[0] + " " + (a == clone) + " " + Arrays.equals(a, a.clone()));
        Integer[] objs = {3, 1, 2}; Arrays.sort(objs); System.out.println(Arrays.toString(objs) + " " + Arrays.asList(objs).indexOf(2) + " " + Objects.hash(1, "a") + " " + Objects.equals(null, null));
    }
}
