import { describe, expect, it } from 'vitest'
import { main, output } from './testing'

// Each expected output is what the program printed on a real JDK.

describe('Java strings and formatting', () => {
  it('String methods', () => {
    expect(output(main(`
        String s = "Hello, World";
        System.out.println(s.length() + " " + s.charAt(4) + " " + s.indexOf('o') + " " + s.indexOf("o", 5) + " " + s.lastIndexOf('o') + " " + s.indexOf("xyz"));
        System.out.println(s.substring(7) + "|" + s.substring(0, 5) + "|" + s.toUpperCase() + "|" + s.toLowerCase() + "|" + s.replace('l', 'L') + "|" + s.replace("World", "Java"));
        System.out.println(s.contains("World") + " " + s.startsWith("Hell") + " " + s.endsWith("ld") + " " + s.isEmpty() + " " + "  ".isBlank() + " " + "  pad  ".trim() + "|" + "  pad  ".strip() + "|");
        System.out.println("ab".repeat(3) + " " + String.join("-", "a", "b", "c") + " " + String.join("/", List.of("x", "y")) + " " + String.valueOf(3.5) + String.valueOf(true) + String.valueOf('c'));
        System.out.println("apple".compareTo("banana") + " " + "b".compareTo("a") + " " + "abc".equalsIgnoreCase("ABC") + " " + "Abc".compareToIgnoreCase("abd"));
        char[] cs = "dcba".toCharArray(); Arrays.sort(cs); System.out.println(new String(cs) + " " + String.valueOf(cs, 1, 2) + " " + cs.length);
        System.out.println(Arrays.toString("a1b2c3".split("\\\\d")) + " " + Arrays.toString("one  two".split(" ")) + " " + Arrays.toString("x".split(",")) + " " + "a-b-c".replaceAll("-", "+") + " " + "2024-01-15".matches("\\\\d{4}-\\\\d{2}-\\\\d{2}"));
        String t = ""; for (int i = 0; i < 3; i++) t += i; System.out.println(t + " " + t.hashCode() + " " + "".hashCode() + " " + "Aa".hashCode() + " " + "BB".hashCode());`))).toBe('12 o 4 8 8 -1\nWorld|Hello|HELLO, WORLD|hello, world|HeLLo, WorLd|Hello, Java\ntrue true true false true pad|pad|\nababab a-b-c x/y 3.5truec\n-1 1 true -1\nabcd bc 4\n[a, b, c] [one, , two] [x] a+b+c true\n012 47697 0 2112 2112\n')
  })

  it('StringBuilder', () => {
    expect(output(main(`
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 5; i++) sb.append(i).append(',');
        sb.setLength(sb.length() - 1);
        System.out.println(sb + " " + sb.length() + " " + sb.charAt(2) + " " + sb.indexOf("3"));
        sb.insert(0, "[").append("]").reverse();
        System.out.println(sb);
        sb.reverse().deleteCharAt(0).setCharAt(0, 'X');
        sb.replace(1, 3, "--").delete(sb.length() - 2, sb.length());
        System.out.println(sb.toString() + " " + new StringBuilder("racecar").reverse().toString().equals("racecar"));
        StringBuilder a = new StringBuilder("x"); StringBuilder b = a; b.append("y"); System.out.println(a + " " + (a == b) + " " + a.toString().equals(b.toString()));`))).toBe('0,1,2,3,4 9 1 6\n]4,3,2,1,0[\nX--,2,3, true\nxy true true\n')
  })

  it('printf and String.format', () => {
    expect(output(main(`
        System.out.printf("%d|%5d|%-5d|%05d|%,d|%+d|%x|%X|%o%n", 42, 42, 42, 42, 1234567, 7, 255, 255, 8);
        System.out.printf("%.2f|%8.3f|%-8.1f|%e|%.3e|%,.2f|%.0f%n", Math.PI, Math.E, 2.25, 12345.678, 0.00012, 9876543.21, 2.5);
        System.out.printf("%s|%10s|%-10s|%S|%.3s|%c|%b|%%|%n", "hi", "right", "left", "up", "abcdef", 'z', true);
        System.out.println(String.format("%s scored %d (%.1f%%)", "Ana", 9, 90.0) + " " + String.format("%3$s %1$s %2$s", "a", "b", "c"));
        System.out.println(String.format("[%6.2f] [%-6b] [%x] [%s]", -1.5, false, -255, Arrays.asList(1, 2)));`))).toBe('42|   42|42   |00042|1,234,567|+7|ff|FF|10\n3.14|   2.718|2.3     |1.234568e+04|1.200e-04|9,876,543.21|3\nhi|     right|left      |UP|abc|z|true|%|\nAna scored 9 (90.0%) c a b\n[ -1.50] [false ] [ffffff01] [[1, 2]]\n')
  })
})
