#!/usr/bin/env python3
"""A simulator test run takes its turn on this Mac, then runs: apps/ios/scripts/sim-run.py xcodebuild test ...

Leads' runs and the runner's jobs share one queue (~/.cache/aquatome/sim.lock), separate from the checks lock, so vitest
doesn't wait behind an hour of flows. A job's stop reaches the command, as `exec` does in ios.yml: lockf(1) wouldn't pass
it on, which left xcodebuild running with no parent on 2026-11-04. Copies of the simulator are capped at MAX_COPIES.
"""
import fcntl
import os
import re
import signal
import subprocess
import sys
import time

LOCK = os.path.expanduser("~/.cache/aquatome/sim.lock")
MAX_COPIES = 2


def capped(argv):
    out = list(argv)
    for i, arg in enumerate(out[:-1]):
        if arg == "-parallel-testing-worker-count" and re.fullmatch(r"\d+", out[i + 1]):
            out[i + 1] = str(min(int(out[i + 1]), MAX_COPIES))
    return out


def main():
    argv = capped(sys.argv[1:])
    if not argv:
        sys.exit(__doc__)
    os.makedirs(os.path.dirname(LOCK), exist_ok=True)
    lock = os.open(LOCK, os.O_CREAT | os.O_RDWR, 0o644)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print(f"sim-run: waiting for the simulator run before this one: {os.pread(lock, 300, 0).decode(errors='replace')}", flush=True)
        started = time.time()
        fcntl.flock(lock, fcntl.LOCK_EX)
        print(f"sim-run: its turn after {(time.time() - started) / 60:.0f} min", flush=True)
    os.ftruncate(lock, 0)
    os.pwrite(lock, f"pid {os.getpid()}, from {os.getcwd()}, since {time.strftime('%H:%M')}".encode(), 0)

    child = None

    def forward(signum, _frame):
        if child is None:
            sys.exit(128 + signum)
        child.send_signal(signum)

    for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(signum, forward)
    # The lock's descriptor isn't inherited, so a daemon the command leaves behind doesn't keep the turn.
    child = subprocess.Popen(argv)
    code = child.wait()
    sys.exit(128 - code if code < 0 else code)


if __name__ == "__main__":
    main()
