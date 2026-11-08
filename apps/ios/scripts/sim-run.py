#!/usr/bin/env python3
"""A simulator test run takes its turn on this Mac, then runs: apps/ios/scripts/sim-run.py xcodebuild test ...

Leads' runs and the runner's jobs share one queue (~/.cache/aquatome/sim.lock), separate from the checks lock, so vitest
doesn't wait behind an hour of flows. A job's stop reaches the command, as `exec` does in ios.yml: lockf(1) wouldn't pass
it on, which left xcodebuild running with no parent on 2026-11-04. Copies of the simulator are capped at MAX_COPIES. The
runner's jobs wait while the Mac is hot before they take their turn (cool).
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
# macOS's thermal pressure: 0 nominal, 1 moderate, 2 heavy, 3 trapping, 4 sleeping. At heavy it ran work on 6-8 of its 16
# cores, and a 0.4 s job took up to 54 s (2026-11-08).
HOT = 2
COOL_MINUTES = float(os.environ.get("SIM_RUN_COOL_MINUTES", 30))
COOL_PAUSE = float(os.environ.get("SIM_RUN_COOL_PAUSE", 30))


def capped(argv):
    out = list(argv)
    for i, arg in enumerate(out[:-1]):
        if arg in ("-parallel-testing-worker-count", "-maximum-parallel-testing-workers") and re.fullmatch(r"\d+", out[i + 1]):
            out[i + 1] = str(min(int(out[i + 1]), MAX_COPIES))
    # Parallel with no count: Xcode would choose how many.
    if "YES" in [b for a, b in zip(out, out[1:]) if a == "-parallel-testing-enabled"] and not {"-parallel-testing-worker-count", "-maximum-parallel-testing-workers"} & set(out):
        out += ["-parallel-testing-worker-count", str(MAX_COPIES)]
    return out


def thermal():
    try:
        out = subprocess.run(["notifyutil", "-g", "com.apple.system.thermalpressurelevel"], capture_output=True, text=True, timeout=10).stdout
        return int(out.split()[-1])
    except (OSError, ValueError, IndexError, subprocess.SubprocessError):
        return 0


def cool():
    """The runner's jobs (main's iOS runs) wait while the Mac is hot, up to COOL_MINUTES, before they queue: the engine's
    runs do the same (cool, scripts/cycle-checks.sh). Leads' runs don't wait here."""
    if not os.environ.get("GITHUB_ACTIONS"):
        return
    waited = 0.0
    while waited < COOL_MINUTES * 60 and thermal() >= HOT:
        if waited == 0:
            print(f"sim-run: the Mac is hot: waiting up to {COOL_MINUTES:.0f} min before taking a turn", flush=True)
        time.sleep(COOL_PAUSE)
        waited += max(COOL_PAUSE, 0.001)
    if waited:
        print(f"sim-run: went on after {waited / 60:.0f} min", flush=True)


def main():
    argv = capped(sys.argv[1:])
    if not argv:
        sys.exit(__doc__)
    cool()
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
    starting = False
    pending = []
    asked = False

    # The runner stops a job with SIGINT, then SIGTERM 7.5 s later, then SIGKILL 2.5 s after that, which this script can't
    # pass on: the second ask ends the command first, so it isn't left running while the next run takes its turn.
    def forward(signum, _frame):
        nonlocal asked
        if child is None:
            if not starting:
                sys.exit(128 + signum)
            # The command is starting: it gets the stop as soon as it has a number. On 2026-11-08 a stop that came while
            # Popen was returning ended this script alone (143) and left the command running with no parent.
            pending.append(signum)
            return
        child.send_signal(signal.SIGKILL if asked else signum)
        asked = True

    for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(signum, forward)
    # The lock's descriptor isn't inherited, so a daemon the command leaves behind doesn't keep the turn.
    starting = True
    child = subprocess.Popen(argv)
    for signum in pending:
        forward(signum, None)
    code = child.wait()
    sys.exit(128 - code if code < 0 else code)


if __name__ == "__main__":
    main()
