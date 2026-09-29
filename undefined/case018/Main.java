import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {
    static class Bank {
        String street; int accounts = 0;
        Bank(String street) { this.street = street; }
        Account open(int amount) { accounts++; return new Account(amount); }
        class Account {
            int balance;
            Account(int balance) { this.balance = balance; }
            void deposit(int x) { balance += x; }
            String label() { return street + "#" + accounts; }
        }
        static class Point { static String origin() { return "(0,0)"; } }
    }
    static class Counter { int total; Counter add(int x) { total += x; return this; } }

    public static void main(String[] args) throws Exception {

        Bank bank = new Bank("Main St");
        Bank.Account a = bank.open(100);
        Bank.Account b = bank.open(50);
        a.deposit(25);
        System.out.println(a.balance + " " + b.balance + " " + a.label() + " " + bank.accounts + " " + Bank.Point.origin());
        Comparator<String> byLength = new Comparator<String>() {
            @Override public int compare(String x, String y) { return x.length() - y.length(); }
        };
        List<String> ws = new ArrayList<>(List.of("ccc", "a", "bb"));
        ws.sort(byLength); System.out.println(ws);
        int base = 10;
        Runnable r = () -> System.out.println("base is " + base);
        r.run();
        Counter counter = new Counter(); counter.add(5).add(7); System.out.println(counter.total);
    }
}
