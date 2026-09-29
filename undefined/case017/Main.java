import java.util.*;
import java.util.function.*;
import java.io.*;

public class Main {
    interface Named { default String describe() { return "I am " + name(); } String name(); }
    static abstract class Shape implements Named {
        static int count = 0;
        Shape() { count++; }
        abstract double area();
        public String name() { return getClass().getSimpleName().toLowerCase(); }
    }
    static class Circle extends Shape {
        double r;
        Circle(double r) { super(); this.r = r; }
        double area() { return Math.PI * r * r; }
        @Override public String toString() { return "Circle(" + r + ")"; }
    }
    static class Square extends Shape {
        int side;
        Square(int side) { this.side = side; }
        double area() { return side * side; }
        public String name() { return "square " + super.name(); }
        @Override public String toString() { return "Square[" + side + "]"; }
        @Override public boolean equals(Object other) { return other instanceof Square s && s.side == side; }
        @Override public int hashCode() { return Integer.hashCode(side); }
    }

    public static void main(String[] args) throws Exception {

        List<Shape> shapes = List.of(new Circle(1), new Square(2), new Square(3));
        double total = 0;
        for (Shape s : shapes) { total += s.area(); System.out.println(s + " " + s.name() + " " + s.describe()); }
        System.out.printf("%.2f %d%n", total, Shape.count);
        Square sq = new Square(4); Shape sh = sq; Object o = sh;
        System.out.println((o instanceof Shape) + " " + (o instanceof Square) + " " + (o instanceof Circle) + " " + sq.equals(new Square(4)) + " " + (sq.hashCode() == new Square(4).hashCode()));
        Set<Square> set = new HashSet<>(List.of(new Square(1), new Square(1), new Square(2))); System.out.println(set.size());
        if (o instanceof Square s2 && s2.side > 3) System.out.println("pattern " + s2.side);
    }
}
