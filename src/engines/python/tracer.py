"""Runs user code under sys.settrace and records every step in the shared trace format.

A step holds the line, the event, every live user frame and a heap delta: only
objects that are new or changed since the previous step, plus ids that stopped
being reachable. Primitives are stored inline; everything else lives in the
heap by a stable id, so aliasing is visible.
"""

import sys
import json
import types
import inspect
import builtins
import collections

from stepthrough_helpers import HELPERS

MAX_STEPS = 3000
MAX_ITEMS = 100
MAX_REPR = 200
USER_FILE = "<your code>"
HIDDEN_GLOBALS = frozenset({
    "__builtins__", "__name__", "__doc__", "__package__", "__loader__",
    "__spec__", "__annotations__", "__file__", "__cached__",
})
PRIM_KINDS = {
    type(None): "none", bool: "bool", int: "int", float: "float", str: "str", complex: "other",
}
SEQUENCE_KINDS = (
    (collections.deque, "deque"), (list, "list"), (tuple, "tuple"), ((set, frozenset), "set"),
)
FUNCTION_TYPES = (types.FunctionType, types.BuiltinFunctionType, types.MethodType)


class _StepLimit(Exception):
    pass


def _is_dunder(name):
    return name.startswith("__") and name.endswith("__")


def _short_repr(value):
    try:
        text = repr(value)
    except Exception:
        text = f"<{type(value).__name__}>"
    return text if len(text) <= MAX_REPR else text[:MAX_REPR] + "..."


def _utf16_len(text):
    return len(text.encode("utf-16-le")) // 2


class _Ids:
    """Small stable ids. Holding each object keeps CPython from reusing its id()."""

    def __init__(self):
        self._ids = {}

    def of(self, obj):
        entry = self._ids.get(id(obj))
        if entry is None:
            entry = (obj, len(self._ids) + 1)
            self._ids[id(obj)] = entry
        return entry[1]


class _Encoder:
    def __init__(self, ids):
        self.ids = ids

    def value(self, value, heap):
        kind = PRIM_KINDS.get(type(value))
        if kind is not None:
            prim = {"t": "p", "k": kind, "v": _short_repr(value)}
            if kind == "str":
                prim["s"] = value[:MAX_REPR]
            return prim
        oid = str(self.ids.of(value))
        if oid not in heap:
            heap[oid] = None
            heap[oid] = self.obj(value, heap)
        return {"t": "r", "id": oid}

    def items(self, values, heap):
        out = []
        for v in values:
            if len(out) >= MAX_ITEMS:
                break
            out.append(self.value(v, heap))
        return out

    def attrs(self, mapping, heap, skip_dunders):
        return [[k, self.value(v, heap)] for k, v in mapping.items() if not (skip_dunders and _is_dunder(k))]

    def obj(self, value, heap):
        type_name = type(value).__name__
        for cls, kind in SEQUENCE_KINDS:
            if isinstance(value, cls):
                return {"kind": kind, "type": type_name, "items": self.items(value, heap), "size": len(value)}
        if isinstance(value, dict):
            entries = []
            for k, v in value.items():
                if len(entries) >= MAX_ITEMS:
                    break
                entries.append([self.value(k, heap), self.value(v, heap)])
            return {"kind": "dict", "type": type_name, "entries": entries, "size": len(value)}
        if isinstance(value, FUNCTION_TYPES):
            try:
                sig = str(inspect.signature(value))
            except (TypeError, ValueError):
                sig = "(...)"
            name = getattr(value, "__qualname__", getattr(value, "__name__", "function"))
            return {"kind": "function", "type": type_name, "name": name, "sig": sig}
        if isinstance(value, type):
            bases = [b.__name__ for b in value.__bases__ if b is not object]
            own = value.__module__ == "__main__"
            return {"kind": "class", "type": type_name, "name": value.__name__, "bases": bases,
                    "attrs": self.attrs(value.__dict__, heap, True) if own else []}
        if isinstance(value, types.ModuleType):
            return {"kind": "module", "type": type_name, "name": value.__name__}
        if hasattr(value, "__dict__") and not isinstance(value, types.GeneratorType):
            return {"kind": "instance", "type": type_name, "attrs": self.attrs(vars(value), heap, False)}
        return {"kind": "other", "type": type_name, "repr": _short_repr(value)}


class _Output:
    def __init__(self):
        self.parts = []
        self.length = 0

    def write(self, text):
        self.parts.append(text)
        self.length += _utf16_len(text)
        return len(text)

    def flush(self):
        pass

    def text(self):
        return "".join(self.parts)


class _Tracer:
    def __init__(self, stdin_lines):
        self.steps = []
        self.out = _Output()
        self.stdin_lines = collections.deque(stdin_lines)
        self.frame_ids = _Ids()
        self.encoder = _Encoder(_Ids())
        self.prev_heap = {}

    def user_frames(self, frame):
        chain = []
        while frame is not None:
            if frame.f_code.co_filename == USER_FILE:
                chain.append(frame)
            frame = frame.f_back
        chain.reverse()
        return chain

    def encode_frame(self, frame, heap):
        is_module = frame.f_code.co_name == "<module>"
        if is_module:
            items = [(k, v) for k, v in frame.f_globals.items() if k not in HIDDEN_GLOBALS]
        else:
            items = [(k, v) for k, v in frame.f_locals.items() if not _is_dunder(k)]
        return {
            "id": self.frame_ids.of(frame),
            "name": "module" if is_module else getattr(frame.f_code, "co_qualname", frame.f_code.co_name),
            "line": frame.f_lineno,
            "global": is_module,
            "vars": [[k, self.encoder.value(v, heap)] for k, v in items],
        }

    def heap_delta(self, heap):
        prev = self.prev_heap
        changed = {oid: obj for oid, obj in heap.items() if prev.get(oid) != obj}
        removed = [oid for oid in prev if oid not in heap]
        self.prev_heap = heap
        delta = {}
        if changed:
            delta["set"] = changed
        if removed:
            delta["del"] = removed
        return delta

    def snapshot(self, frame, event, arg):
        if len(self.steps) >= MAX_STEPS:
            raise _StepLimit()
        heap = {}
        step = {
            "line": frame.f_lineno,
            "event": event,
            "frames": [self.encode_frame(f, heap) for f in self.user_frames(frame)],
            "out": self.out.length,
        }
        if event == "return":
            step["ret"] = self.encoder.value(arg, heap)
        elif event == "exception":
            exc_type, exc_value, _ = arg
            step["exc"] = f"{exc_type.__name__}: {exc_value}"
        step["heap"] = self.heap_delta(heap)
        self.steps.append(step)

    def trace(self, frame, event, arg):
        if frame.f_code.co_filename != USER_FILE:
            return None
        if event == "call" and frame.f_code.co_name == "<module>":
            return self.trace
        self.snapshot(frame, event, arg)
        return self.trace

    def fake_input(self, prompt=""):
        self.out.write(str(prompt))
        if not self.stdin_lines:
            raise EOFError("input() ran out of lines. Add more in the input box.")
        line = self.stdin_lines.popleft()
        self.out.write(line + "\n")
        return line


def _error_line(tb):
    line = None
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == USER_FILE:
            line = tb.tb_lineno
        tb = tb.tb_next
    return line


def _result(steps, truncated, error, stdout):
    return json.dumps(
        {"steps": steps, "truncated": truncated, "error": error, "stdout": stdout, "maxSteps": MAX_STEPS},
        ensure_ascii=False, separators=(",", ":"),
    )


def run_trace(code, stdin_text=""):
    try:
        compiled = compile(code, USER_FILE, "exec")
    except SyntaxError as e:
        return _result([], False, {"message": f"{type(e).__name__}: {e.msg}", "line": e.lineno}, "")

    tracer = _Tracer(stdin_text.splitlines())
    user_builtins = dict(builtins.__dict__)
    user_builtins["input"] = tracer.fake_input
    user_builtins.update(HELPERS)
    user_globals = {"__builtins__": user_builtins, "__name__": "__main__"}

    error = None
    truncated = False
    old_stdout = sys.stdout
    sys.stdout = tracer.out
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

    return _result(tracer.steps, truncated, error, tracer.out.text())
