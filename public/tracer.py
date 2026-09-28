"""Runs user code under sys.settrace and records a snapshot of memory at every step.

Each step holds: the line, the event (call / line / return / exception), every
live frame with its variables, and every heap object reachable from them.
Primitives (None, bool, int, float, complex, str) are stored inline. Everything
else is stored in the heap by id() and referenced, so aliasing is visible.
"""

import sys
import json
import types
import inspect
import builtins
import collections

MAX_STEPS = 3000
MAX_ITEMS = 100
MAX_REPR = 200
USER_FILE = "<your code>"
HIDDEN_GLOBALS = {
    "__builtins__", "__name__", "__doc__", "__package__", "__loader__",
    "__spec__", "__annotations__", "__file__", "__cached__",
}
PRIMITIVES = (type(None), bool, int, float, complex, str)


class _StepLimit(Exception):
    pass


def _is_dunder(name):
    return name.startswith("__") and name.endswith("__")


def _short_repr(value):
    try:
        text = repr(value)
    except Exception:
        text = f"<{type(value).__name__}>"
    if len(text) > MAX_REPR:
        text = text[:MAX_REPR] + "..."
    return text


def _encode(value, heap):
    if type(value) in PRIMITIVES:
        return {"t": "p", "k": type(value).__name__, "v": _short_repr(value)}
    oid = str(id(value))
    if oid not in heap:
        heap[oid] = None  # placeholder so cycles stop here
        heap[oid] = _encode_object(value, heap)
    return {"t": "r", "id": oid}


def _encode_items(values, heap):
    items = []
    for i, v in enumerate(values):
        if i >= MAX_ITEMS:
            break
        items.append(_encode(v, heap))
    return items


def _encode_object(value, heap):
    if isinstance(value, collections.deque):
        return {"kind": "deque", "items": _encode_items(value, heap), "size": len(value)}
    if isinstance(value, list):
        return {"kind": "list", "items": _encode_items(value, heap), "size": len(value)}
    if isinstance(value, tuple):
        return {"kind": "tuple", "items": _encode_items(value, heap), "size": len(value)}
    if isinstance(value, (set, frozenset)):
        return {"kind": "set", "frozen": isinstance(value, frozenset),
                "items": _encode_items(value, heap), "size": len(value)}
    if isinstance(value, dict):
        entries = []
        for i, (k, v) in enumerate(value.items()):
            if i >= MAX_ITEMS:
                break
            entries.append([_encode(k, heap), _encode(v, heap)])
        return {"kind": "dict", "entries": entries, "size": len(value)}
    if isinstance(value, (types.FunctionType, types.BuiltinFunctionType, types.MethodType)):
        try:
            sig = str(inspect.signature(value))
        except (TypeError, ValueError):
            sig = "(...)"
        name = getattr(value, "__qualname__", getattr(value, "__name__", "function"))
        return {"kind": "function", "name": name, "sig": sig}
    if isinstance(value, type):
        attrs = [[k, _encode(v, heap)] for k, v in value.__dict__.items() if not _is_dunder(k)]
        bases = [b.__name__ for b in value.__bases__ if b is not object]
        return {"kind": "class", "name": value.__name__, "bases": bases, "attrs": attrs}
    if isinstance(value, types.ModuleType):
        return {"kind": "module", "name": value.__name__}
    if hasattr(value, "__dict__") and not isinstance(value, types.GeneratorType):
        attrs = [[k, _encode(v, heap)] for k, v in vars(value).items()]
        return {"kind": "instance", "cls": type(value).__name__, "attrs": attrs}
    return {"kind": "other", "type": type(value).__name__, "repr": _short_repr(value)}


class _Tracer:
    def __init__(self, stdin_lines):
        self.steps = []
        self.out = []
        self.stdin_lines = list(stdin_lines)
        self.frame_ids = {}  # id(frame) -> (frame, ordinal); frame kept alive so ids stay unique

    def frame_id(self, frame):
        key = id(frame)
        if key not in self.frame_ids:
            self.frame_ids[key] = (frame, len(self.frame_ids))
        return self.frame_ids[key][1]

    def user_frames(self, frame):
        chain = []
        f = frame
        while f is not None:
            if f.f_code.co_filename == USER_FILE:
                chain.append(f)
            f = f.f_back
        chain.reverse()
        return chain

    def snapshot(self, frame, event, arg):
        if len(self.steps) >= MAX_STEPS:
            raise _StepLimit()
        heap = {}
        frames = []
        for f in self.user_frames(frame):
            is_module = f.f_code.co_name == "<module>"
            if is_module:
                items = [(k, v) for k, v in f.f_globals.items() if k not in HIDDEN_GLOBALS]
            else:
                items = [(k, v) for k, v in f.f_locals.items() if not _is_dunder(k)]
            frames.append({
                "id": self.frame_id(f),
                "name": "Globals" if is_module else getattr(f.f_code, "co_qualname", f.f_code.co_name),
                "line": f.f_lineno,
                "vars": [[k, _encode(v, heap)] for k, v in items],
            })
        step = {
            "line": frame.f_lineno,
            "event": event,
            "func": frame.f_code.co_name,
            "frames": frames,
            "heap": heap,
            "stdout": "".join(self.out),
        }
        if event == "return":
            step["ret"] = _encode(arg, heap)
        if event == "exception":
            exc_type, exc_value, _ = arg
            step["exc"] = f"{exc_type.__name__}: {exc_value}"
        self.steps.append(step)

    def trace(self, frame, event, arg):
        if frame.f_code.co_filename != USER_FILE:
            return None
        if event == "call" and frame.f_code.co_name == "<module>":
            return self.trace  # the first line event covers this
        if event in ("call", "line", "return", "exception"):
            self.snapshot(frame, event, arg)
        return self.trace

    def fake_input(self, prompt=""):
        self.out.append(str(prompt))
        if not self.stdin_lines:
            raise EOFError("input() ran out of lines. Add more in the input box.")
        line = self.stdin_lines.pop(0)
        self.out.append(line + "\n")
        return line


# LeetCode-style helpers, available in user code without defining them.
# They live in this file, so their own lines are never traced.

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


def build_list(values):
    """build_list([1, 2, 3]) -> head ListNode of 1 -> 2 -> 3"""
    head = None
    for v in reversed(values):
        head = ListNode(v, head)
    return head


def build_tree(values):
    """build_tree([1, 2, 3, None, 4]) -> root TreeNode, LeetCode level order"""
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue = collections.deque([root])
    i = 1
    while queue and i < len(values):
        node = queue.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            queue.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            queue.append(node.right)
        i += 1
    return root


HELPERS = {"ListNode": ListNode, "TreeNode": TreeNode, "build_list": build_list, "build_tree": build_tree}


class _Writer:
    def __init__(self, out):
        self.out = out

    def write(self, text):
        self.out.append(text)
        return len(text)

    def flush(self):
        pass


def _error_line(tb):
    line = None
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == USER_FILE:
            line = tb.tb_lineno
        tb = tb.tb_next
    return line


def run_trace(code, stdin_text=""):
    try:
        compiled = compile(code, USER_FILE, "exec")
    except SyntaxError as e:
        return json.dumps({
            "steps": [], "truncated": False,
            "error": {"message": f"{type(e).__name__}: {e.msg}", "line": e.lineno},
        })

    tracer = _Tracer(stdin_text.splitlines())
    user_builtins = dict(builtins.__dict__)
    user_builtins["input"] = tracer.fake_input
    user_builtins.update(HELPERS)
    user_globals = {"__builtins__": user_builtins, "__name__": "__main__"}

    error = None
    truncated = False
    old_stdout = sys.stdout
    sys.stdout = _Writer(tracer.out)
    sys.settrace(tracer.trace)
    try:
        exec(compiled, user_globals)
    except _StepLimit:
        truncated = True
    except BaseException as e:
        error = {"message": f"{type(e).__name__}: {e}", "line": _error_line(e.__traceback__)}
    finally:
        sys.settrace(None)
        sys.stdout = old_stdout

    return json.dumps({
        "steps": tracer.steps,
        "truncated": truncated,
        "error": error,
        "stdout": "".join(tracer.out),
        "maxSteps": MAX_STEPS,
    })
