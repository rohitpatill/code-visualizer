// Built-in helpers and exceptions, available without imports. Parsed before
// the user's code and run without recording steps; user classes replace them.

class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}

class TreeNode {
    int val;
    TreeNode left;
    TreeNode right;
    TreeNode() {}
    TreeNode(int val) { this.val = val; }
    TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; }
}

class LeetCode {
    // buildList(1, 2, 3) -> head of 1 -> 2 -> 3
    static ListNode buildList(int... values) {
        ListNode head = null;
        for (int i = values.length - 1; i >= 0; i--) head = new ListNode(values[i], head);
        return head;
    }

    // buildTree(3, 9, 20, null, null, 15, 7) -> root, in LeetCode's level order
    static TreeNode buildTree(Integer... values) {
        if (values.length == 0 || values[0] == null) return null;
        TreeNode root = new TreeNode(values[0]);
        Queue<TreeNode> queue = new LinkedList<>();
        queue.add(root);
        int i = 1;
        while (!queue.isEmpty() && i < values.length) {
            TreeNode node = queue.poll();
            if (i < values.length && values[i] != null) {
                node.left = new TreeNode(values[i]);
                queue.add(node.left);
            }
            i++;
            if (i < values.length && values[i] != null) {
                node.right = new TreeNode(values[i]);
                queue.add(node.right);
            }
            i++;
        }
        return root;
    }
}

class Throwable {
    String message;
    Throwable cause;
    Throwable() {}
    Throwable(String message) { this.message = message; }
    Throwable(String message, Throwable cause) { this.message = message; this.cause = cause; }
    Throwable(Throwable cause) { this.cause = cause; if (cause != null) message = cause.toString(); }
    String getMessage() { return message; }
    String getLocalizedMessage() { return message; }
    Throwable getCause() { return cause; }
}

class Exception extends Throwable {
    Exception() {}
    Exception(String message) { super(message); }
    Exception(String message, Throwable cause) { super(message, cause); }
    Exception(Throwable cause) { super(cause); }
}

class Error extends Throwable {
    Error() {}
    Error(String message) { super(message); }
}

class RuntimeException extends Exception {
    RuntimeException() {}
    RuntimeException(String message) { super(message); }
    RuntimeException(String message, Throwable cause) { super(message, cause); }
    RuntimeException(Throwable cause) { super(cause); }
}

class IOException extends Exception {
    IOException() {}
    IOException(String message) { super(message); }
}

class InterruptedException extends Exception {
    InterruptedException() {}
    InterruptedException(String message) { super(message); }
}

class CloneNotSupportedException extends Exception {
    CloneNotSupportedException() {}
    CloneNotSupportedException(String message) { super(message); }
}

class ArithmeticException extends RuntimeException {
    ArithmeticException() {}
    ArithmeticException(String message) { super(message); }
}

class ClassCastException extends RuntimeException {
    ClassCastException() {}
    ClassCastException(String message) { super(message); }
}

class IllegalArgumentException extends RuntimeException {
    IllegalArgumentException() {}
    IllegalArgumentException(String message) { super(message); }
    IllegalArgumentException(String message, Throwable cause) { super(message, cause); }
}

class NumberFormatException extends IllegalArgumentException {
    NumberFormatException() {}
    NumberFormatException(String message) { super(message); }
}

class PatternSyntaxException extends IllegalArgumentException {
    PatternSyntaxException(String message) { super(message); }
}

class IllegalStateException extends RuntimeException {
    IllegalStateException() {}
    IllegalStateException(String message) { super(message); }
    IllegalStateException(String message, Throwable cause) { super(message, cause); }
}

class IndexOutOfBoundsException extends RuntimeException {
    IndexOutOfBoundsException() {}
    IndexOutOfBoundsException(String message) { super(message); }
}

class ArrayIndexOutOfBoundsException extends IndexOutOfBoundsException {
    ArrayIndexOutOfBoundsException() {}
    ArrayIndexOutOfBoundsException(String message) { super(message); }
}

class StringIndexOutOfBoundsException extends IndexOutOfBoundsException {
    StringIndexOutOfBoundsException() {}
    StringIndexOutOfBoundsException(String message) { super(message); }
}

class NegativeArraySizeException extends RuntimeException {
    NegativeArraySizeException() {}
    NegativeArraySizeException(String message) { super(message); }
}

class NullPointerException extends RuntimeException {
    NullPointerException() {}
    NullPointerException(String message) { super(message); }
}

class UnsupportedOperationException extends RuntimeException {
    UnsupportedOperationException() {}
    UnsupportedOperationException(String message) { super(message); }
}

class ConcurrentModificationException extends RuntimeException {
    ConcurrentModificationException() {}
    ConcurrentModificationException(String message) { super(message); }
}

class NoSuchElementException extends RuntimeException {
    NoSuchElementException() {}
    NoSuchElementException(String message) { super(message); }
}

class InputMismatchException extends NoSuchElementException {
    InputMismatchException() {}
    InputMismatchException(String message) { super(message); }
}

class EmptyStackException extends RuntimeException {
    EmptyStackException() {}
}

class IllegalFormatException extends IllegalArgumentException {
    IllegalFormatException(String message) { super(message); }
}

class IllegalFormatConversionException extends IllegalFormatException {
    IllegalFormatConversionException(String message) { super(message); }
}

class MissingFormatArgumentException extends IllegalFormatException {
    MissingFormatArgumentException(String message) { super(message); }
}

class UnknownFormatConversionException extends IllegalFormatException {
    UnknownFormatConversionException(String message) { super(message); }
}

class StackOverflowError extends Error {
    StackOverflowError() {}
    StackOverflowError(String message) { super(message); }
}

class OutOfMemoryError extends Error {
    OutOfMemoryError() {}
    OutOfMemoryError(String message) { super(message); }
}

class AssertionError extends Error {
    AssertionError() {}
    AssertionError(String message) { super(message); }
}
