#!/usr/bin/env python3
"""A simulator test run takes its turn on this Mac, then runs: apps/ios/scripts/sim-run.py xcodebuild test ...

Leads' runs and the runner's jobs share one queue (~/.cache/aquatome/sim.lock), separate from the checks lock, so vitest
doesn't wait behind an hour of flows. A job's stop reaches the command, as `exec` does in ios.yml: lockf(1) wouldn't pass
it on, which left xcodebuild running with no parent on 2026-11-04. Copies of the simulator are capped at MAX_COPIES. The
runner's jobs on this Mac wait while macOS has taken cores away from work, before they take their turn (cool). While a run has its turn, its
simulator's photo and media analysis runs in the background (quiet).
"""
import fcntl
import os
import re
import signal
import subprocess
import sys
import threading
import time

LOCK = os.path.expanduser("~/.cache/aquatome/sim.lock")
MAX_COPIES = 2
# Under heat macOS takes cores away from work: on 2026-11-08 it ran work on 6-8 of its 16, and a 0.4 s job took up to 54 s.
# Its heat level alone says less: it read heavy with all 16 cores at work and that job at 0.3 s.
COOL_MINUTES = float(os.environ.get("SIM_RUN_COOL_MINUTES", 30))
COOL_PAUSE = float(os.environ.get("SIM_RUN_COOL_PAUSE", 30))
# A simulator's own analysis daemons, never the Mac's: their path is inside a simulator runtime's RuntimeRoot.
ANALYSIS = re.compile(r"/CoreSimulator/.*/RuntimeRoot/System/Library/PrivateFrameworks/(MediaAnalysis|PhotoAnalysis)\.framework/")
QUIET_PAUSE = float(os.environ.get("SIM_RUN_QUIET_PAUSE", 20))


def capped(argv):
    out = list(argv)
    for i, arg in enumerate(out[:-1]):
        if arg in ("-parallel-testing-worker-count", "-maximum-parallel-testing-workers") and re.fullmatch(r"\d+", out[i + 1]):
            out[i + 1] = str(min(int(out[i + 1]), MAX_COPIES))
    # Parallel with no count: Xcode would choose how many.
    if "YES" in [b for a, b in zip(out, out[1:]) if a == "-parallel-testing-enabled"] and not {"-parallel-testing-worker-count", "-maximum-parallel-testing-workers"} & set(out):
        out += ["-parallel-testing-worker-count", str(MAX_COPIES)]
    return out


def cores_taken():
    """How many of the Mac's cores macOS has taken away from work (kern.sched_recommended_cores). 0 where it can't say."""
    try:
        read = lambda name: int(subprocess.run(["sysctl", "-n", name], capture_output=True, text=True, timeout=10).stdout)
        return max(0, read("hw.ncpu") - bin(read("kern.sched_recommended_cores")).count("1"))
    except (OSError, ValueError, subprocess.SubprocessError):
        return 0


def cool():
    """This Mac's runner's jobs (main's iOS runs) wait while cores are taken away, up to COOL_MINUTES, before they queue: the
    engine's runs do the same (cool, scripts/cycle-checks.sh). Leads' runs don't wait here, nor do jobs on GitHub's Macs,
    which run this script too and whose heat isn't this Mac's."""
    if os.environ.get("RUNNER_ENVIRONMENT") != "self-hosted":
        return
    waited = 0.0
    while waited < COOL_MINUTES * 60 and (taken := cores_taken()):
        if waited == 0:
            print(f"sim-run: the Mac is hot, {taken} of its cores taken away: waiting up to {COOL_MINUTES:.0f} min before taking a turn", flush=True)
        time.sleep(COOL_PAUSE)
        waited += max(COOL_PAUSE, 0.001)
    if waited:
        print(f"sim-run: went on after {waited / 60:.0f} min", flush=True)


def quiet():
    """A simulator's photo and media analysis (mediaanalysisd, photoanalysisd) runs at background priority while a run
    has its turn. On 2026-11-08, after main's simulator booted, mediaanalysisd took 3.4 cores at normal priority for 8 min,
    for nothing the tests read, and a 0.4 s job on the Mac took up to 23 s. It still runs, on what's left over."""
    done = set()
    while True:
        try:
            out = subprocess.run(["ps", "-A", "-ww", "-o", "pid=,args="], capture_output=True, text=True, timeout=10).stdout
        except (OSError, subprocess.SubprocessError):
            out = ""
        for line in out.splitlines():
            pid, _, args = line.strip().partition(" ")
            if pid in done or not ANALYSIS.search(args):
                continue
            done.add(pid)
            try:
                os.setpriority(os.PRIO_PROCESS, int(pid), 20)
                subprocess.run(["taskpolicy", "-b", "-p", pid], capture_output=True, timeout=10)
            except (OSError, ValueError, subprocess.SubprocessError):
                pass
        time.sleep(QUIET_PAUSE)


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
    threading.Thread(target=quiet, daemon=True).start()
    code = child.wait()
    sys.exit(128 - code if code < 0 else code)


if __name__ == "__main__":
    main()
