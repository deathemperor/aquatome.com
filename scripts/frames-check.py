#!/usr/bin/env python3
"""Whether a screen recording kept the frames of its moves (a card opening, a page closing): the count the Machine Load Lead
and the v2 Lab agreed on 2026-11-10.

  scripts/frames-check.py <video> --expected 18[,12]

Expected is each big move's frames, in the order they come: its length in the app times the recording's rate. A take with
fewer big moves than that fails. A move passes
with 90% of them captured (frames that differ from the one before) and no one frame carrying over 30% of its change, which
is what a capture that jumped looks like: in the take that lost a card's opening, its first frame carried 54%. Exits 0 if
all pass, 1 if not, 2 if no move was found.
"""
import statistics
import subprocess
import sys

W, H = 107, 232
RATE = 30
CHANGED = 0.4  # a frame's mean difference from the last, 0-255, that counts as changing
GAP = 4  # still frames that end a move
BIG = 0.3  # of the largest move's change: smaller ones (a picture settling) aren't judged
ENOUGH = 0.9
LARGEST_STEP = 0.3


def rate(path):
    """Frames a second, from the usual gap between frames: an average would count a take's idle stretches against it."""
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "packet=pts_time", "-of", "csv=p=0", path],
                         capture_output=True, text=True, check=True).stdout
    times = sorted(float(t.strip().rstrip(",")) for t in out.split())
    return 1 / statistics.median(b - a for a, b in zip(times, times[1:]))


def steps(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"scale={W}:{H},format=gray", "-fps_mode", "passthrough", "-f", "rawvideo", "-"],
                         capture_output=True, check=True).stdout
    frames = [raw[i:i + W * H][::7] for i in range(0, len(raw) - W * H + 1, W * H)]
    return [0.0] + [sum(abs(a - b) for a, b in zip(frames[i], frames[i - 1])) / len(frames[i]) for i in range(1, len(frames))]


def moves(diffs):
    found, start, last = [], None, None
    for i, d in enumerate(diffs):
        if d > CHANGED:
            if start is not None and i - last > GAP:
                found.append((start, last))
                start = None
            start = i if start is None else start
            last = i
    return found + ([(start, last)] if start is not None else [])


def main():
    if len(sys.argv) != 4 or sys.argv[2] != "--expected":
        sys.exit(__doc__)
    path, expected = sys.argv[1], [int(n) for n in sys.argv[3].split(",")]
    fps = rate(path)
    diffs = steps(path)
    found = moves(diffs)
    largest = max((sum(diffs[a:b + 1]) for a, b in found), default=0)
    big = [(a, b) for a, b in found if sum(diffs[a:b + 1]) >= BIG * largest]
    if not big:
        print(f"{path}: no move found")
        sys.exit(2)
    ok = fps >= RATE - 1 and len(big) >= len(expected)
    print(f"{path}: {fps:.0f} frames a second" + ("" if fps >= RATE - 1 else f", and a recording needs {RATE}"))
    if len(big) < len(expected):
        print(f"  {len(big)} big moves found, {len(expected)} expected")
    for n, (a, b) in enumerate(big):
        seg = diffs[a:b + 1]
        captured = sum(1 for d in seg if d > CHANGED)
        share = max(seg) / sum(seg)
        want = expected[n] if n < len(expected) else expected[-1]
        passed = captured >= ENOUGH * want and share <= LARGEST_STEP
        ok = ok and passed
        print(f"  move {n + 1}, frames {a}-{b}: {captured} of {want} expected, largest step {share:.0%}: {'kept' if passed else 'LOST FRAMES'}")
    print("every frame kept" if ok else "frames lost")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
