#!/usr/bin/env python3
"""The chief of staff keeps the next turn for one run (AGENTS.md, This Mac):
scripts/next-turn.py [--sim | --checks] <the run's pid, or a word only it has, such as its folder's> [minutes, 30, at most 120]

A pid keeps the turn in its own queue (a sim-run.py's, or the checks queue's); a word, in both unless --sim or --checks.

Both queues are first come, first served: their lock wakes its waiters in the order they came. While a turn is kept, a run
that reaches the front before the named one steps back behind it: apps/ios/scripts/sim-run.py's runs, and scripts/checks.sh's.
A job queued with plain lockf can't step back and isn't seen by its words: name it by its pid. The turn is taken once the
named run has it, or lapses with its minutes or its pid. On 2026-11-09 the chief of staff gave the photo grid's build and
flows the next turns, ahead of two engine cycles, main's job and a lead's run, and neither queue had a way to.

scripts/next-turn.py --kept <sim|checks> <pid,...> <its folder and command>: prints whom the queue's next turn is kept for
and exits 0 when that run steps back; exits 1 when it goes, taking the turn kept for it (any of its pids named counts).
"""
import os
import subprocess
import sys
import time

DIR = os.path.expanduser("~/.cache/aquatome")
GRANTER = os.path.expanduser("~/.config/aquatome/owner-report-thread")
MAX_MINUTES = 120


def alive(pid):
    """Whether pid is a process; a number too large for one isn't."""
    try:
        os.kill(pid, 0)
        return True
    except PermissionError:  # another user's
        return True
    except (ProcessLookupError, OverflowError, ValueError):
        return False


def kept_for(queue, pids, text):
    """Whom the queue's next turn is kept for, when it isn't this run (its pids, folder and command); None when it's this
    one, which takes it, or the turn lapsed, or the pid it named is gone. sim-run.py has its own copy: it runs from copies
    of the app's folder."""
    path = os.path.join(DIR, f"{queue}.next")
    try:
        with open(path) as f:
            until, who = f.read().split(maxsplit=1)
        until = float(until)
    except (OSError, ValueError):
        return None
    if who.isdigit():
        gone, mine = not alive(int(who)), int(who) in pids
    else:
        gone, mine = False, who in text
    if mine or gone or time.time() > until:
        try:
            os.unlink(path)
        except OSError:
            pass
        return None
    return who


def keep(args):
    try:
        with open(GRANTER) as f:
            granter = f.read().strip()
    except OSError:
        granter = ""
    if not granter or os.environ.get("T3CODE_THREAD_ID") != granter:
        sys.exit("next-turn: only the chief of staff keeps the next turn for a run, from their own thread (AGENTS.md, This Mac)")
    queues = ("sim", "checks")
    if args[:1] in (["--sim"], ["--checks"]):
        queues, args = (args[0][2:],), args[1:]
    if not args or not args[0].strip():  # A blank name, from a pgrep that found nothing, would keep the turn for no one.
        sys.exit(__doc__)
    who, minutes = args[0], min(float(args[1]) if len(args) > 1 else 30.0, MAX_MINUTES)
    if who.isdigit():
        if not alive(int(who)):
            sys.exit(f"next-turn: no process {who} on this Mac")
        # A pid is one queue's run: kept in the other, the turn would wait there for nothing.
        command = subprocess.run(["ps", "-ww", "-o", "args=", "-p", who], capture_output=True, text=True).stdout
        queues = ("sim",) if "sim-run.py" in command else ("checks",)
    os.makedirs(DIR, exist_ok=True)
    for queue in queues:
        with open(os.path.join(DIR, f"{queue}.next"), "w") as f:
            f.write(f"{time.time() + minutes * 60:.0f} {who}")
    names = {"sim": "simulator", "checks": "checks"}
    print(f"next-turn: the next {' and '.join(names[q] for q in queues)} turn kept for {who}, for up to {minutes:g} min", flush=True)


def main():
    if sys.argv[1:2] == ["--kept"]:
        who = kept_for(sys.argv[2], {int(p) for p in sys.argv[3].split(",") if p.isdigit()}, " ".join(sys.argv[4:]))
        if who:
            print(who)
        return 0 if who else 1
    keep(sys.argv[1:])
    return 0


if __name__ == "__main__":
    sys.exit(main())
