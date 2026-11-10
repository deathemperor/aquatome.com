#!/usr/bin/env python3
"""The engine's Chrome windows on the owner's screen now: scripts/chrome-windows.py [--count]. Once Chrome has opened it is
minimized (packages/engine/src/chrome-window.ts), so this says none, but for a second or two while one opens. Exit 1 if there
are any, 2 if it can't tell. machine-metric.py records the count every 10 minutes as chrome_on_screen."""
import json
import re
import subprocess
import sys

# Windows in the normal layer that are on screen now; a minimized one isn't listed. No permission needed for owner and bounds.
WINDOWS = ("ObjC.import('CoreGraphics');JSON.stringify(ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1, 0)))"
           ".filter(w => w.kCGWindowLayer === 0).map(w => w.kCGWindowOwnerPID))")


def run(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=60)


def engine_chromes():
    """pid to profile, for the Chromes the engine opened: automation's flag, on one of its profiles, and no helper process."""
    found = {}
    for line in run("ps", "-A", "-ww", "-o", "pid=,command=").stdout.splitlines():
        profile = re.search(r"--user-data-dir=\S*/(chrome-profile[\w-]*)(\s|$)", line)
        if profile and "--enable-automation" in line and "--type=" not in line:
            found[int(line.split()[0])] = profile.group(1)
    return found


def main():
    count_only = sys.argv[1:] == ["--count"]
    chromes = engine_chromes()
    try:
        on_screen = [chromes[pid] for pid in json.loads(run("osascript", "-l", "JavaScript", "-e", WINDOWS).stdout) if pid in chromes]
    except ValueError:
        print("can't tell: the window list didn't read", file=sys.stderr)
        sys.exit(2)
    if count_only:
        print(len(on_screen))
    elif on_screen:
        print("on the owner's screen:", ", ".join(sorted(on_screen)))
    else:
        print(f"none on the owner's screen ({len(chromes)} of the engine's Chromes open)")
    sys.exit(1 if on_screen else 0)


if __name__ == "__main__":
    main()
