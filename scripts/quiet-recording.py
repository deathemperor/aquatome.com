#!/usr/bin/env python3
"""A screen recording on a quiet Mac: scripts/quiet-recording.py [minutes] <command> ...

It takes the simulator turn, then the checks turn, so nothing of ours tests or builds beside it: CI's flows, TestFlight's
archive and the engine's and leads' test runs wait for it and aren't skipped. (The engine's site build isn't queued, so the
load check and frames-check.py are what catch one running beside a take.) What's already running finishes first.

It gives both turns back without recording (exit 75) if the checks turn doesn't come within 15 minutes, or the Mac is still
too loaded 3 minutes after that: a take then loses its frames. Once recording it holds them 10 minutes by default, 20 at
most (exit 124 if that runs out). Stopped or killed, it stops the command too. The command mustn't take a queue itself: it
would wait for its own turn. It doesn't step back for a kept checks turn: it holds the simulator turn while it waits.
"""
import fcntl
import os
import select
import signal
import subprocess
import sys
import threading
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
    os.execv(SIM_RUN, [SIM_RUN, sys.executable, os.path.realpath(__file__), "--holding", str(os.getpid()), str(minutes), *args])


def guard(seconds, closed_when_holder_goes, command):
    """Runs the command, in this process's group, and stops the group at the limit or when the holder has gone, however it
    went: the holder keeps the pipe's other end open, and the system closes it even after a SIGKILL."""
    child = subprocess.Popen(command)
    deadline = time.time() + seconds
    while child.poll() is None:
        holder_gone = select.select([closed_when_holder_goes], [], [], 0.1)[0]
        out_of_time = time.time() > deadline
        if holder_gone or out_of_time:
            signal.signal(signal.SIGTERM, signal.SIG_IGN)  # the group's stop is for the command
            os.killpg(0, signal.SIGTERM)
            try:
                child.wait(5)
            except subprocess.TimeoutExpired:
                os.killpg(0, signal.SIGKILL)
            os._exit(124 if out_of_time else 1)
    sys.exit(child.returncode if child.returncode >= 0 else 128 - child.returncode)


def holding(wrapper, minutes, command):
    """Runs under sim-run.py, so with the simulator turn held. `wrapper` is sim-run.py's pid: if it has gone, so has that turn."""
    give_up = time.time() + CHECKS_WAIT * 60
    read_end, write_end = os.pipe()
    runner = None

    def watch():
        # A thread, so the wait for the checks turn is one call to flock: a timer's tick interrupts it, and calling it again
        # goes to the back of the queue.
        while True:
            if os.getppid() != wrapper:
                os._exit(1)
            if give_up and time.time() > give_up:
                os.write(2, f"not recorded: no checks turn within {CHECKS_WAIT:g} minutes\n".encode())
                os._exit(NOT_RECORDED)
            time.sleep(0.2)

    def asked_to_stop(signum, _frame):
        try:
            os.close(write_end)  # the guard stops the command
        except OSError:
            pass
        if runner is None:
            sys.exit(128 + signum)

    for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(signum, asked_to_stop)
    threading.Thread(target=watch, daemon=True).start()

    # flock, as lockf does, so this waits in the same first-come queue. Not checks.sh, whose stepping back for a kept turn
    # would wait for a run that is itself waiting for the simulator turn held here.
    os.makedirs(os.path.dirname(CHECKS), exist_ok=True)
    lock = os.open(CHECKS, os.O_CREAT | os.O_RDWR, 0o666)
    fcntl.flock(lock, fcntl.LOCK_EX)
    give_up = None

    if subprocess.run([sys.executable, MAC_STATUS, "--wait", QUIET_WAIT]).returncode != 0:
        print("not recorded: still too loaded", file=sys.stderr)
        sys.exit(NOT_RECORDED)

    # A session of its own: its group is what gets stopped. Started after the pipe, so a stop landing here still closes it.
    runner = subprocess.Popen([sys.executable, os.path.realpath(__file__), "--guard", str(minutes * MINUTE), str(read_end), *command],
                              start_new_session=True, pass_fds=(read_end,))
    os.close(read_end)
    code = runner.wait()  # so the turns are held until the command has stopped, however it was asked to
    sys.exit(code if code >= 0 else 128 - code)


def main():
    args = sys.argv[1:]
    if args[:1] == ["--holding"]:
        holding(int(args[1]), int(args[2]), args[3:])
    if args[:1] == ["--guard"]:
        guard(float(args[1]), int(args[2]), args[3:])
    start(args)


if __name__ == "__main__":
    main()
