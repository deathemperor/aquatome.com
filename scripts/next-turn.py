#!/usr/bin/env python3
"""The chief of staff keeps the next turn for one run, in the simulator queue and in the checks queue (AGENTS.md, This Mac):
scripts/next-turn.py <the run's pid, or a word from its folder or command> [minutes, 30 if not given]

Both queues are first come, first served: their lock wakes its waiters in the order they came. While a turn is kept, a run
that reaches the front before the named one steps back behind it: apps/ios/scripts/sim-run.py's runs, and scripts/checks.sh's.
A job queued with plain lockf can't step back and isn't seen by its words: name it by its pid. The turn is taken once the
named run has it, or lapses with its minutes or its pid. On 2026-11-09 the chief of staff gave the photo grid's build and
flows the next turns, ahead of two engine cycles, main's job and a lead's run, and neither queue had a way to.

scripts/next-turn.py --kept <sim|checks> <pid> <its folder and command>: prints whom the queue's next turn is kept for and
exits 0 when that run steps back; exits 1 when it goes, taking the turn kept for it.
"""
import os
import sys
import time

DIR = os.path.expanduser("~/.cache/aquatome")
GRANTER = os.path.expanduser("~/.config/aquatome/owner-report-thread")


def kept_for(queue, pid, text):
    """Whom the queue's next turn is kept for, when it isn't this run (its pid, folder and command); None when it's this
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
        try:
            os.kill(int(who), 0)
            gone = False
        except ProcessLookupError:
            gone = True
        except PermissionError:  # another user's, alive
            gone = False
        mine = int(who) == pid
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
    if not args:
        sys.exit(__doc__)
    who, minutes = args[0], float(args[1]) if len(args) > 1 else 30.0
    os.makedirs(DIR, exist_ok=True)
    for queue in ("sim", "checks"):
        with open(os.path.join(DIR, f"{queue}.next"), "w") as f:
            f.write(f"{time.time() + minutes * 60:.0f} {who}")
    print(f"next-turn: the next simulator turn and the next checks turn are kept for {who}, for up to {minutes:g} min", flush=True)


def main():
    if sys.argv[1:2] == ["--kept"]:
        who = kept_for(sys.argv[2], int(sys.argv[3]), " ".join(sys.argv[4:]))
        if who:
            print(who)
        return 0 if who else 1
    keep(sys.argv[1:])
    return 0


if __name__ == "__main__":
    sys.exit(main())
