#!/usr/bin/env python3
"""How this Mac is doing, and whether a recording would keep its frames (AGENTS.md, This Mac).

  scripts/mac-status.py            a line each; exits 0 if it's quiet enough to record, 1 if it's too loaded
  scripts/mac-status.py --wait 3   waits up to that many minutes for it to be quiet, then the same
  scripts/mac-status.py --cap ID   exits 2, saying who's up, if booting that simulator (its id or name) would pass the cap,
                                   or saying so if there's too little free space to start one
  scripts/mac-status.py --space    exits 3 if free space is under the floor (20 GB); warns under 30 GB, saying where it is
  scripts/mac-status.py --where    where the disk is: simulators, Xcode's build folders, worktrees (the status says it under 30 GB)
  scripts/mac-status.py --hook     the same, for a session's device_open (.claude/settings.json)
"""
import glob
import json
import os
import re
import subprocess
import sys
import time

# What a recording needs. The v2 Lab's takes of one card opening (2026-11-10, the load within 5 minutes of each): 17-18
# frames at a load of 146 and 16-27 at up to 228 on all 16 cores, 12-15 of those frames at 137 with 10 cores at work, and
# the opening lost (one frame carrying 54% of its change) at 400-850.
RECORD_LOAD = 200
RECORD_CORES = 12
# Simulators up at once. A 0.4 s job on this Mac, its median and 90th percentile over 2026-11-08 to 10: 0.4 s and 1.2 s with
# two up on 16 cores, 1.7 s and 11 s with three; with cores taken away by heat, 2.5-5 s with one or two and 18 s with three.
CAP = 3
CAP_HOT = 2
# Past about 1,000 the counter wraps to near nothing (AGENTS.md), and a 1-minute load can't be under the limit with the
# 5-minute one this high: at 12:31 that day, the fastest fall seen, they read 214 and 474.
WRAPPED = 600
# Free space. At 23:45 on 2026-11-13 a TestFlight upload stopped at 12 GB free, and no one was watching. Under 30 GB the
# sweep tells the chief of staff (machine-sweep.mjs); under 20, what an upload needs, no simulator starts here, and
# `--space` says no to whatever asks.
SPACE_WARN = 30
SPACE_STOP = 20
PAUSE = float(os.environ.get("MAC_STATUS_PAUSE", 15))


def run(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=120).stdout


def load():
    """The 1-minute and 5-minute load."""
    words = run("sysctl", "-n", "vm.loadavg").split()
    return float(words[1]), float(words[2])


def cores():
    """(at work, all): macOS takes cores away from work under heat. None where it can't say."""
    try:
        everyone = int(run("sysctl", "-n", "hw.ncpu"))
        return bin(int(run("sysctl", "-n", "kern.sched_recommended_cores"))).count("1"), everyone
    except (OSError, ValueError):
        return None


def free_gb():
    """Free space on the disk the home folder is on, in GB (10^9 bytes). None where df can't say."""
    try:
        return int(run("df", "-Pk", os.path.expanduser("~")).strip().splitlines()[-1].split()[3]) * 1024 / 1e9
    except (OSError, ValueError, IndexError):
        return None


def short_of_space():
    """Why nothing big should start for want of space, or None. What can't be read doesn't stop anything."""
    free = free_gb()
    if free is None or free >= SPACE_STOP:
        return None
    return (f"{free:.0f} GB free on this Mac, under the {SPACE_STOP} GB floor (AGENTS.md, This Mac): nothing big starts until "
            "there's more. Ask the chief of staff who clears what; simulators are most of it.")


def size_gb(path):
    """A folder's size in GB, or None where it isn't there or du can't say in time."""
    if not os.path.isdir(path):
        return None
    try:
        return int(run("du", "-sk", path).split()[0]) * 1024 / 1e9
    except (OSError, ValueError, IndexError, subprocess.TimeoutExpired):
        return None


def where_space():
    """Where the disk has gone, a line each, for under the warning: so whoever reads it sees where without asking."""
    home = os.path.expanduser("~")
    known = simulators()
    worktrees = os.path.join(home, ".infinitus/worktrees/aquatome.com")
    found = [
        ("simulators", size_gb(os.path.join(home, "Library/Developer/CoreSimulator/Devices")), f", {len(known)} of them, {len(booted(known))} up"),
        ("Xcode's build folders", size_gb(os.path.join(home, "Library/Developer/Xcode/DerivedData")), ""),
        ("worktrees", size_gb(worktrees), f" in {len(os.listdir(worktrees))} folders (the sweep takes merged ones at 03:35)" if os.path.isdir(worktrees) else ""),
    ]
    return [f"  {what}: {gb:.0f} GB{more}" for what, gb, more in found if gb is not None]


def cap(now):
    return CAP_HOT if now and now[0] < now[1] else CAP


def simulators():
    try:
        return [d for ds in json.loads(run("xcrun", "simctl", "list", "devices", "-j"))["devices"].values() for d in ds]
    except (OSError, ValueError, KeyError):
        return []


def booted(known):
    """{udid: name} of the simulators up."""
    return {d["udid"]: d["name"] for d in known if d.get("state") == "Booted"}


def owners():
    """{udid: the folder a device session on it came from}."""
    found = {}
    for path in glob.glob(os.path.expanduser("~/.agent-device/device-claims/*.json")):
        try:
            with open(path) as f:
                claim = json.load(f)
            found[claim["device"]["id"]] = os.path.basename(claim["workspace"])
        except (OSError, ValueError, KeyError):
            pass
    return found


def named(up):
    who = owners()
    return ", ".join(f"{name} ({who[udid]})" if udid in who else name for udid, name in up.items()) or "none"


def too_loaded():
    """Why a recording would lose frames now, or None. What can't be read isn't taken as quiet."""
    try:
        one, five = load()
    except (OSError, ValueError, IndexError):
        return "the load can't be read"
    now = cores()
    if one > RECORD_LOAD or five > WRAPPED:
        return f"load {max(one, five if five > WRAPPED else 0):.0f}, and a recording needs {RECORD_LOAD} or less"
    if now is None:
        return "the cores at work can't be read"
    if now[0] < RECORD_CORES:
        return f"heat has left {now[0]} cores at work, and a recording needs {RECORD_CORES}"
    return None


def alive(pid):
    try:
        os.kill(pid, 0)
    except PermissionError:  # another user's
        return True
    except (OSError, OverflowError):
        return False
    return True


def turn():
    """Who has the simulator turn: sim-run.py leaves its line there when it's done."""
    try:
        with open(os.path.expanduser("~/.cache/aquatome/sim.lock")) as f:
            line = f.read()
    except OSError:
        return "free"
    match = re.match(r"pid (\d+)", line)
    return line if match and alive(int(match.group(1))) else "free"


def two_names():
    """The engine's batches under two names, a line each: no run publishes, renames or drops them until a person puts their
    names right (cycle-checks.sh, two_names). Each engine clone keeps its own record in its git folder."""
    lines = []
    for record in sorted(glob.glob(os.path.expanduser("~/.local/share/aquatome/*/.git/aquatome-two-names"))):
        clone = record.split(os.sep)[-3]
        try:
            with open(record) as f:
                rows = [line.rstrip("\n").split("\t") for line in f if line.strip()]
        except OSError:
            continue
        for row in rows:
            if len(row) >= 4:
                runs = int(row[1]) if row[1].isdigit() else 0
                lines.append(f"under two names, in {clone}: {row[0]}, left by {runs} run{'' if runs == 1 else 's'}: {row[3]}")
    return lines


def status():
    now = cores()
    up = booted(simulators())
    try:
        print(f"load {load()[0]:.0f} (a recording needs {RECORD_LOAD} or less)")
    except (OSError, ValueError, IndexError):
        print("load unknown")
    if now:
        print(f"cores at work {now[0]} of {now[1]}" + (f": heat took {now[1] - now[0]}, so at most {CAP_HOT} simulators" if now[0] < now[1] else ""))
    else:
        print("cores at work unknown")
    print(f"simulators up {len(up)}, at most {cap(now)}: {named(up)}")
    print(f"simulator turn: {turn()}")
    free = free_gb()
    if free is None:
        print("free space unknown")
    else:
        print(f"free space {free:.0f} GB" + (f": under {SPACE_STOP} GB, no simulator or upload starts" if free < SPACE_STOP
                                             else f": under {SPACE_WARN} GB, the sweep tells the chief of staff" if free < SPACE_WARN else ""))
        if free < SPACE_WARN:
            print("\n".join(where_space()))
    for line in two_names():
        print(line)
    reason = too_loaded()
    print(f"too loaded to record: {reason}" if reason else "quiet enough to record")
    return 1 if reason else 0


def over_cap(device):
    """What refuses this simulator's boot (its id or name), or None. One that's already up isn't another, and what isn't an
    iOS simulator here, an Android emulator, isn't counted."""
    known = simulators()
    if not any(device in (d["udid"], d["name"]) for d in known):
        return None
    up = booted(known)
    if device in up or device in up.values():
        return None
    short = short_of_space()
    if short:
        return short
    limit = cap(cores())
    if len(up) < limit:
        return None
    return (f"At most {limit} simulators up on this Mac (AGENTS.md, This Mac), and {len(up)} are: {named(up)}. Close yours with "
            "`agent-device close --shutdown`, or ask its lead; scripts/mac-status.py shows them.")


def main():
    args = sys.argv[1:]
    if args[:1] == ["--wait"]:
        deadline = time.time() + float(args[1]) * 60
        while too_loaded() and time.time() < deadline:
            time.sleep(PAUSE)
    elif args[:1] == ["--cap"]:
        reason = over_cap(args[1])
        if reason:
            print(reason, file=sys.stderr)
            sys.exit(2)
        return
    elif args[:1] == ["--space"]:
        short = short_of_space()
        if short:
            print("\n".join([short, *where_space()]), file=sys.stderr)
            sys.exit(3)
        free = free_gb()
        if free is not None and free < SPACE_WARN:
            print("\n".join([f"{free:.0f} GB free on this Mac, under {SPACE_WARN} GB: the sweep tells the chief of staff", *where_space()]), file=sys.stderr)
        return
    elif args[:1] == ["--where"]:
        print("\n".join(where_space()))
        return
    elif args[:1] == ["--hook"]:
        # Whatever goes wrong here, the session's call goes on: this is a limit, not a lock.
        try:
            given = json.load(sys.stdin)["tool_input"]
            reason = over_cap(given["deviceId"]) if given.get("deviceId") and given.get("hostId", "local") == "local" else None
        except Exception:
            reason = None
        if reason:
            print(reason, file=sys.stderr)
            sys.exit(2)
        return
    elif args:
        sys.exit(__doc__)
    sys.exit(status())


if __name__ == "__main__":
    main()
