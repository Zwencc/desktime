"""System monitor backend for DeskTime.

The point of this plugin is to be the first real one: it exercises every part of
the backend contract that `_template` only demonstrates — a real reading, a
push the widget did not ask for, and a process that can be killed to watch the
host restart it.

Deliberately **no dependencies**. `psutil` would be the obvious choice and is
the wrong one for a sample: a plugin that needs `pip install` before it runs is
a plugin nobody tries. Everything below uses the standard library and, on
Windows, ctypes against the same APIs psutil would call.

Protocol: JSON-RPC 2.0 framed the way LSP frames it. See `_template/bin/main.py`
for the smallest possible version of these forty lines.
"""

import ctypes
import json
import shutil
import sys
import threading
import time

IS_WINDOWS = sys.platform == "win32"


# ── Readings ───────────────────────────────────────────────────────────────
#
# CPU has no instantaneous value: it is a ratio between two samples of counters
# that only ever increase. So the previous sample is kept and each reading is
# the delta — which is also why the first reading after startup is skipped.

_previous_times = None


def _windows_cpu_percent():
    """CPU busy percentage since the previous call, via GetSystemTimes."""
    global _previous_times

    class FILETIME(ctypes.Structure):
        _fields_ = [("low", ctypes.c_uint32), ("high", ctypes.c_uint32)]

        def value(self):
            return (self.high << 32) | self.low

    idle, kernel, user = FILETIME(), FILETIME(), FILETIME()
    if not ctypes.windll.kernel32.GetSystemTimes(
        ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user)
    ):
        return None

    current = (idle.value(), kernel.value(), user.value())
    if _previous_times is None:
        _previous_times = current
        return None

    idle_delta = current[0] - _previous_times[0]
    # Kernel time already includes idle time, so total is kernel + user.
    total_delta = (current[1] - _previous_times[1]) + (current[2] - _previous_times[2])
    _previous_times = current

    if total_delta <= 0:
        return None
    return round((1 - idle_delta / total_delta) * 100, 1)


def _windows_memory_percent():
    class MEMORYSTATUSEX(ctypes.Structure):
        _fields_ = [
            ("dwLength", ctypes.c_uint32),
            ("dwMemoryLoad", ctypes.c_uint32),
            ("ullTotalPhys", ctypes.c_uint64),
            ("ullAvailPhys", ctypes.c_uint64),
            ("ullTotalPageFile", ctypes.c_uint64),
            ("ullAvailPageFile", ctypes.c_uint64),
            ("ullTotalVirtual", ctypes.c_uint64),
            ("ullAvailVirtual", ctypes.c_uint64),
            ("ullAvailExtendedVirtual", ctypes.c_uint64),
        ]

    status = MEMORYSTATUSEX()
    status.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
        return None, None

    used_gb = (status.ullTotalPhys - status.ullAvailPhys) / (1024 ** 3)
    total_gb = status.ullTotalPhys / (1024 ** 3)
    return float(status.dwMemoryLoad), (round(used_gb, 1), round(total_gb, 1))


def sample():
    """One reading of everything. Missing values come back as None, not zero —
    zero is a real CPU load and would be a lie."""
    cpu = _windows_cpu_percent() if IS_WINDOWS else None
    if IS_WINDOWS:
        memory, memory_gb = _windows_memory_percent()
    else:
        memory, memory_gb = None, None

    try:
        usage = shutil.disk_usage(sys.executable[:3] if IS_WINDOWS else "/")
        disk = round(usage.used / usage.total * 100, 1)
    except OSError:
        disk = None

    return {
        "cpu": cpu,
        "memory": memory,
        "memoryGb": memory_gb,
        "disk": disk,
        "at": time.time(),
    }


# ── Protocol ───────────────────────────────────────────────────────────────

_write_lock = threading.Lock()

# Seconds between pushes. Declared in plugin.json, set by the host's settings
# window, and delivered here by the widget — see `plugin/configure` below. Read
# fresh on every loop, so a change takes effect within one interval.
_interval = 2.0


def read_message():
    length = 0
    while True:
        line = sys.stdin.buffer.readline()
        if not line:
            return None
        line = line.strip()
        if not line:
            break
        if line.lower().startswith(b"content-length:"):
            length = int(line.split(b":", 1)[1])

    if length == 0:
        return None
    return json.loads(sys.stdin.buffer.read(length))


def write_message(message):
    body = json.dumps(message).encode("utf-8")
    # The push thread and the request thread both write here.
    with _write_lock:
        sys.stdout.buffer.write(b"Content-Length: %d\r\n\r\n" % len(body))
        sys.stdout.buffer.write(body)
        sys.stdout.buffer.flush()


def reply(request_id, result):
    write_message({"jsonrpc": "2.0", "id": request_id, "result": result})


def notify(name, payload):
    write_message({"jsonrpc": "2.0", "method": name, "params": payload})


def push_loop(stop):
    """Pushes a reading every `_interval` seconds without being asked.

    This is the half a plugin cannot do from the frontend alone, and the reason
    the protocol has notifications at all: the widget renders whatever arrives
    rather than polling for it.

    The first push comes early on purpose. CPU load is a ratio between two
    samples, so the very first reading of it is always None — waiting out a whole
    interval before the second sample would leave a dash on screen for that long.
    """
    if stop.wait(0.3):
        return
    notify("sample", sample())

    while not stop.wait(_interval):
        notify("sample", sample())


def main():
    global _interval

    stop = threading.Event()
    pusher = None

    while True:
        message = read_message()
        if message is None:
            break

        method = message.get("method", "")
        request_id = message.get("id")

        if method == "shutdown":
            reply(request_id, None)
            break

        if method == "initialize":
            # Prime the CPU counters so the first real reading has a delta.
            sample()
            pusher = threading.Thread(target=push_loop, args=(stop,), daemon=True)
            pusher.start()
            reply(request_id, {"capabilities": ["sample"]})
            continue

        if method == "plugin/sample":
            reply(request_id, sample())
            continue

        if method == "plugin/configure":
            interval = (message.get("params") or {}).get("interval")
            if isinstance(interval, (int, float)) and interval > 0:
                _interval = float(interval)
            reply(request_id, {"interval": _interval})
            continue

        # Unknown methods still get an answer, or the caller waits out its
        # five-second timeout for nothing.
        reply(request_id, {"error": "unknown method: %s" % method})

    stop.set()
    if pusher is not None:
        pusher.join(timeout=1.0)


if __name__ == "__main__":
    main()
