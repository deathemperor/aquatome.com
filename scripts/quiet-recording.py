#!/usr/bin/env python3
"""A screen recording on a quiet Mac: scripts/quiet-recording.py [minutes] <command> ...

It takes the simulator turn, then the checks turn, so nothing of ours tests or builds beside it: CI's flows, TestFlight's
archive and the engine's and leads' test runs wait for it and aren't skipped. (The engine's site build isn't queued, so the
load check and frames-check.py are what catch one running beside a take.) What's already running finishes first.

It gives both turns back without recording (exit 75) if the checks turn doesn't come within 15 minutes, or the Mac is still
too loaded 3 minutes after that: a take then loses its frames. Once recording it holds them 10 minutes by default, 20 at
most (exit 124 if that runs out). Stopped, or its queue's process killed, it stops the command too. The command mustn't take a
queue itself: it would wait for its own turn.
"""
import fcntl
import os
import signal
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.realpath(__file__))
SIM_RUN = os.path.join(HERE, "../apps/ios/scripts/sim-run.py")
MAC_STATUS = os.path.join(HERE, "mac-status.py")
CHECKS = os.path.expanduser("~/.cache/aquatome/checks.lock")
DEFAULT_MINUTES, MOST_MINUTES = 10, 20
# How long the simulator turn sits idle for the checks turn: the jobs waiting behind it count this against their time limits.
CHECKS_WAIT = float(os.environ.get("QUIET_CHECKS_WAIT_MINUTES", 15))
QUIET_WAIT = os.environ.get("QUIET_WAIT_MINUTES", "3")
MINUTE = float(os.environ.get("QUIET_MINUTE_SECONDS", 60))
NOT_RECORDED = 75
QUEUES = {"sim-run.py", "checks.sh"}


def usage():
    print(f"usage: scripts/quiet-recording.py [minutes, {MOST_MINUTES} at most] <command>, which mustn't take a queue itself", file=sys.stderr)
    sys.exit(64)


def start(args):
    """Takes the simulator turn: sim-run.py runs this script again, holding it."""
    minutes = DEFAULT_MINUTES
    if args and args[0].isdigit():
        minutes, args = int(args[0]), args[1:]
    if not args or not 1 <= minutes <= MOST_MINUTES or QUEUES & {os.path.basename(a) for a in args}:
        usage()
    os.execv(SIM_RUN, [SIM_RUN, sys.executable, os.path.realpath(__file__), "--holding", str(minutes), *args])


class GaveUp(Exception):
    pass


def holding(minutes, command):
    parent = os.getppid()
    child = None

    def stop():
        """The command and whatever it started: it runs in a group of its own."""
        if child is None or child.poll() is not None:
            return
        for signum, wait in ((signal.SIGTERM, 5), (signal.SIGKILL, 2)):
            try:
                os.killpg(child.pid, signum)
                child.wait(wait)
                return
            except subprocess.TimeoutExpired:
                continue
            except ProcessLookupError:
                return

    def asked_to_stop(signum, _frame):
        stop()
        sys.exit(128 + signum)

    for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(signum, asked_to_stop)

    # flock, as lockf does, so this waits in the same first-come queue; a poll would lose its place. Not checks.sh, whose
    # stepping back for a kept turn would wait for a run that is itself waiting for the simulator turn held here.
    os.makedirs(os.path.dirname(CHECKS), exist_ok=True)
    lock = os.open(CHECKS, os.O_CREAT | os.O_RDWR, 0o666)
    give_up = time.time() + CHECKS_WAIT * 60

    def tick(_signum, _frame):
        if os.getppid() != parent or time.time() > give_up:
            raise GaveUp

    signal.signal(signal.SIGALRM, tick)
    signal.setitimer(signal.ITIMER_REAL, 0.2, 0.2)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX)
    except GaveUp:
        print(f"not recorded: no checks turn within {CHECKS_WAIT:g} minutes", file=sys.stderr)
        sys.exit(NOT_RECORDED)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)

    if subprocess.run([sys.executable, MAC_STATUS, "--wait", QUIET_WAIT]).returncode != 0:
        print("not recorded: still too loaded", file=sys.stderr)
        sys.exit(NOT_RECORDED)
    if os.getppid() != parent:
        sys.exit(1)

    deadline = time.time() + minutes * MINUTE
    child = subprocess.Popen(command, start_new_session=True)
    while child.poll() is None:
        if time.time() > deadline:
            stop()
            sys.exit(124)
        if os.getppid() != parent:  # the simulator turn has gone with it
            stop()
            sys.exit(1)
        time.sleep(0.1)
    sys.exit(child.returncode if child.returncode >= 0 else 128 - child.returncode)


def main():
    args = sys.argv[1:]
    if args[:1] == ["--holding"]:
        holding(int(args[1]), args[2:])
    start(args)


if __name__ == "__main__":
    main()
