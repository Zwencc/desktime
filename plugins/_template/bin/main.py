"""Minimal DeskTime plugin backend.

JSON-RPC 2.0 over stdio, framed the way LSP frames it (a Content-Length header,
a blank line, then the JSON). That framing was chosen because every language has
a library for it — this file exists to show that you do not need one: the whole
protocol is the forty lines below.

Two things the host will call:

    initialize   once, before anything else
    shutdown     once, when the plugin is being stopped

Anything else arrives as ``plugin/<method>`` and is whatever your widget asks
for through ``desktime.call(...)``.

To push data at your widget without being asked, write a notification — a
message with a ``method`` and no ``id``. It arrives as ``desktime.on(name, fn)``.
"""

import json
import sys
import threading
import time


def read_message():
    """Reads one framed message, or None when the host has closed the pipe."""
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
    sys.stdout.buffer.write(b"Content-Length: %d\r\n\r\n" % len(body))
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()


def reply(request_id, result):
    write_message({"jsonrpc": "2.0", "id": request_id, "result": result})


def notify(name, payload):
    """Pushes to the widget. No id, so the host does not wait for an answer."""
    write_message({"jsonrpc": "2.0", "method": name, "params": payload})


def tick_loop(stop):
    """Pushes something every five seconds, for `desktime.on('tick', …)`.

    This is the half a plugin cannot do from the frontend: the widget renders
    what arrives instead of asking on a timer. Delete it if your plugin only
    ever answers questions.
    """
    while not stop.wait(5.0):
        notify("tick", {"at": time.time()})


def main():
    stop = threading.Event()

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
            # Anything you answer here is available to the host; the shape is
            # yours. Printing to stderr goes to logs/plugins/<id>.log.
            print("template backend ready", file=sys.stderr)
            threading.Thread(target=tick_loop, args=(stop,), daemon=True).start()
            reply(request_id, {"capabilities": ["ping"]})
            continue

        if method == "plugin/ping":
            reply(request_id, {"pong": time.time()})
            continue

        # Unknown methods must still be answered, or the caller waits out its
        # five-second timeout for nothing.
        reply(request_id, {"error": "unknown method: %s" % method})

    stop.set()


if __name__ == "__main__":
    main()
