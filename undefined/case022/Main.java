import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {

    public static void main(String[] args) throws Exception {

        int[][] edges = {{0, 1, 4}, {0, 2, 1}, {2, 1, 2}, {1, 3, 1}, {2, 3, 5}};
        List<List<int[]>> adj = new ArrayList<>();
        for (int i = 0; i < 4; i++) adj.add(new ArrayList<>());
        for (int[] e : edges) adj.get(e[0]).add(new int[]{e[1], e[2]});
        int[] dist = new int[4]; Arrays.fill(dist, Integer.MAX_VALUE); dist[0] = 0;
        PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingInt(a -> a[1]));
        pq.add(new int[]{0, 0});
        while (!pq.isEmpty()) {
            int[] cur = pq.poll();
            if (cur[1] > dist[cur[0]]) continue;
            for (int[] next : adj.get(cur[0])) {
                if (dist[cur[0]] + next[1] < dist[next[0]]) { dist[next[0]] = dist[cur[0]] + next[1]; pq.add(new int[]{next[0], dist[next[0]]}); }
            }
        }
        System.out.println(Arrays.toString(dist));
        char[][] grid = {"S.#".toCharArray(), "..#".toCharArray(), "#.E".toCharArray()};
        int[][] dirs = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
        boolean[][] seen = new boolean[3][3];
        Deque<int[]> q = new ArrayDeque<>(); q.offer(new int[]{0, 0, 0}); seen[0][0] = true;
        int steps = -1;
        while (!q.isEmpty()) {
            int[] cell = q.poll();
            if (grid[cell[0]][cell[1]] == 'E') { steps = cell[2]; break; }
            for (int[] d : dirs) {
                int nr = cell[0] + d[0], nc = cell[1] + d[1];
                if (nr < 0 || nc < 0 || nr >= 3 || nc >= 3 || seen[nr][nc] || grid[nr][nc] == '#') continue;
                seen[nr][nc] = true; q.offer(new int[]{nr, nc, cell[2] + 1});
            }
        }
        System.out.println(steps);
        int n = 6; int[][] pre = {{5, 2}, {5, 0}, {4, 0}, {4, 1}, {2, 3}, {3, 1}};
        List<Integer>[] out = new List[n]; int[] indeg = new int[n];
        for (int i = 0; i < n; i++) out[i] = new ArrayList<>();
        for (int[] p : pre) { out[p[0]].add(p[1]); indeg[p[1]]++; }
        Queue<Integer> ready = new LinkedList<>();
        for (int i = 0; i < n; i++) if (indeg[i] == 0) ready.add(i);
        List<Integer> order = new ArrayList<>();
        while (!ready.isEmpty()) { int u = ready.poll(); order.add(u); for (int v : out[u]) if (--indeg[v] == 0) ready.add(v); }
        System.out.println(order);
    }
}
