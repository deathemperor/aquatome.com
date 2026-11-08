#!/usr/bin/env python3
"""One reading of this Mac, every 10 minutes (install-machine-sweep.sh), a line in ~/.cache/aquatome/machine-metrics.jsonl.
The measures: how long the same small job takes at normal priority (1.9 s with no copies of a simulator up, 20.6 s at its
worst on 2026-11-08), how many jobs wait for a lock, and how long. Load is kept as background only: a booted simulator
alone reads about 65, and past about 1,000 the counter wraps to near 0."""
import json
import os
import re
import subprocess
import time

HOME = os.path.expanduser("~")
CHECKS = f"{HOME}/.cache/aquatome/checks.lock"
SIM = f"{HOME}/.cache/aquatome/sim.lock"
OUT = f"{HOME}/.cache/aquatome/machine-metrics.jsonl"


def small_job():
    started = time.time()
    n = 0
    while n < 30_000_000:
        n += 1
    return round(time.time() - started, 1)


def minutes(etime):
    days, _, rest = etime.rpartition("-")
    parts = [int(p) for p in rest.split(":")]
    while len(parts) < 3:
        parts.insert(0, 0)
    return int(days or 0) * 1440 + parts[0] * 60 + parts[1] + parts[2] / 60


def run(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=60).stdout


def waiting():
    """The jobs in each queue that haven't got their turn: lockf holds checks.lock open only once it has it; sim-run.py
    writes its pid in sim.lock."""
    ps = [re.match(r"\s*(\d+)\s+(\S+)\s+(.*)", line) for line in run("/bin/ps", "-axo", "pid=,etime=,command=").splitlines()]
    ps = [m.groups() for m in ps if m]
    holder = {line.split()[1] for line in run("/usr/sbin/lsof", CHECKS).splitlines()[1:]}
    checks = [e for p, e, c in ps if re.match(r"(\S*/)?lockf -k \S*checks\.lock", c) and p not in holder]
    try:
        with open(SIM) as f:
            turn = re.match(r"pid (\d+)", f.read())
    except OSError:
        turn = None
    sim = [e for p, e, c in ps if "sim-run.py" in c and "python" in c and not (turn and p == turn.group(1))]
    sims = sum(1 for _, _, c in ps if c.startswith("launchd_sim "))
    return len(checks), len(sim), round(max([minutes(e) for e in checks + sim], default=0)), sims


def main():
    job = small_job()
    checks, sim, longest, sims = waiting()
    swap = re.search(r"used = ([\d.]+)M", run("/usr/sbin/sysctl", "-n", "vm.swapusage"))
    load = run("/usr/sbin/sysctl", "-n", "vm.loadavg").split()[1]
    line = {"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "small_job_s": job, "waiting_checks": checks, "waiting_sim": sim, "longest_wait_min": longest,
            "simulators": sims, "swap_gb": round(float(swap.group(1)) / 1024, 1) if swap else None, "load1": float(load)}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "a") as f:
        f.write(json.dumps(line) + "\n")


if __name__ == "__main__":
    main()
