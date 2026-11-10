#!/usr/bin/env python3
"""How this Mac is doing, and whether a recording would keep its frames (AGENTS.md, This Mac).

  scripts/mac-status.py            a line each; exits 0 if it's quiet enough to record, 1 if it's too loaded
  scripts/mac-status.py --wait 3   waits up to that many minutes for it to be quiet, then the same
  scripts/mac-status.py --cap ID   exits 2, saying who's up, if booting that simulator would pass the cap
  scripts/mac-status.py --hook     the same, for a session's device_open (.claude/settings.json)
"""
import glob
import json
import os
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
PAUSE = float(os.environ.get("MAC_STATUS_PAUSE", 15))


def run(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=120).stdout


def load():
    return float(run("sysctl", "-n", "vm.loadavg").split()[1])


def cores():
    """(at work, all): macOS takes cores away from work under heat. All at work where it can't say."""
    try:
        everyone = int(run("sysctl", "-n", "hw.ncpu"))
        return bin(int(run("sysctl", "-n", "kern.sched_recommended_cores"))).count("1"), everyone
    except ValueError:
        return 16, 16


def cap():
    at_work, everyone = cores()
    return CAP_HOT if at_work < everyone else CAP


def booted():
    """{udid: name} of the simulators up."""
    devices = json.loads(run("xcrun", "simctl", "list", "devices", "booted", "-j") or '{"devices": {}}')["devices"]
    return {d["udid"]: d["name"] for ds in devices.values() for d in ds}


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
    """Why a recording would lose frames now, or None."""
    now, (at_work, _) = load(), cores()
    if now > RECORD_LOAD:
        return f"load {now:.0f}, and a recording needs {RECORD_LOAD} or less"
    if at_work < RECORD_CORES:
        return f"heat has left {at_work} cores at work, and a recording needs {RECORD_CORES}"
    return None


def status():
    at_work, everyone = cores()
    up = booted()
    print(f"load {load():.0f} (a recording needs {RECORD_LOAD} or less)")
    print(f"cores at work {at_work} of {everyone}" + (f": heat took {everyone - at_work}, so at most {CAP_HOT} simulators" if at_work < everyone else ""))
    print(f"simulators up {len(up)}, at most {cap()}: {named(up)}")
    try:
        with open(os.path.expanduser("~/.cache/aquatome/sim.lock")) as f:
            print(f"simulator turn: {f.read() or 'free'}")
    except OSError:
        pass
    reason = too_loaded()
    print(f"too loaded to record: {reason}" if reason else "quiet enough to record")
    return 1 if reason else 0


def over_cap(udid):
    """What refuses this simulator's boot, or None: one that's already up isn't another."""
    up = booted()
    limit = cap()
    if udid in up or len(up) < limit:
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
    elif args[:1] == ["--hook"]:
        # Whatever goes wrong here, the session's call goes on: this is a limit, not a lock.
        try:
            given = json.load(sys.stdin)["tool_input"]
            reason = over_cap(given["id"]) if given.get("hostId", "local") == "local" else None
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
