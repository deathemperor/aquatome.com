#!/usr/bin/env python3
"""One reading of this Mac, every 10 minutes (install-machine-sweep.sh), a line in ~/.cache/aquatome/machine-metrics.jsonl.
The measures: how long the same small job takes at normal priority (1.9 s with no copies of a simulator up, 20.6 s at its
worst on 2026-11-08), how many jobs wait for a lock, and how long. Load is kept as background only: a booted simulator
alone reads about 65, and past about 1,000 the counter wraps to near 0. Heat too: under thermal pressure macOS runs work on
fewer cores (6 of 16 at "heavy" after the restart of 2026-11-08, when the job took 7-54 s with the CPU half idle)."""
import json
import os
import re
import subprocess
import sys
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


def chrome_on_screen():
    """The engine's Chrome windows on the owner's screen (chrome-windows.py); a run that keeps showing one has stopped minimizing."""
    try:
        return int(run(sys.executable, "-I", os.path.join(os.path.dirname(os.path.realpath(__file__)), "chrome-windows.py"), "--count").strip())
    except (ValueError, OSError, subprocess.TimeoutExpired):
        return None


def free_gb():
    """Free space on the disk the home folder is on, in GB (10^9 bytes), read as mac-status.py reads it. None where df can't
    say."""
    try:
        return round(int(run("/bin/df", "-Pk", HOME).strip().splitlines()[-1].split()[3]) * 1024 / 1e9, 1)
    except (OSError, ValueError, IndexError, subprocess.TimeoutExpired):
        return None


def project_of(folder):
    """The project a process works in, from its working folder: <name> for ~/.infinitus/projects/<name> and
    ~/.infinitus/worktrees/<name>/…, "aquatome.com" for the engine's own folders (~/.local/share/aquatome, ~/.cache/aquatome,
    /Users/Shared/aquatome), None for any other."""
    for root in (f"{HOME}/.infinitus/projects/", f"{HOME}/.infinitus/worktrees/"):
        if folder and folder.startswith(root):
            return folder[len(root):].split("/")[0] or None
    if folder and any(folder == r or folder.startswith(r + "/") for r in (f"{HOME}/.local/share/aquatome", f"{HOME}/.cache/aquatome", "/Users/Shared/aquatome")):
        return "aquatome.com"
    return None


def top_cpu(n=5):
    """The n processes using the most CPU (ps's share, 100 = one core, a decaying average over the last minute), this
    reading's own aside: each one's share, its program's name and the project it works in (project_of). On 18 Nov from 19:42
    to 20:15 a small job took 11-39 s beside engine parts that reported almost no work, while the owner's other project's
    sessions were at work, and nothing said whose processes had the CPU (the chief of staff, 19 Nov)."""
    rows = []
    for line in run("/bin/ps", "-Aro", "pcpu=,pid=,comm=").splitlines():
        m = re.match(r"\s*([\d.]+)\s+(\d+)\s+(.+)", line)
        if m and int(m.group(2)) != os.getpid():
            rows.append((float(m.group(1)), m.group(2), os.path.basename(m.group(3).strip())))
        if len(rows) == n:
            break
    folders, pid = {}, None
    if rows:
        for line in run("/usr/sbin/lsof", "-a", "-d", "cwd", "-Fn", "-p", ",".join(p for _, p, _ in rows)).splitlines():
            if line.startswith("p"):
                pid = line[1:]
            elif line.startswith("n") and pid:
                folders[pid] = line[1:]
    return [{"cpu": cpu, "name": name, "project": project_of(folders.get(pid))} for cpu, pid, name in rows]


def main():
    job = small_job()
    checks, sim, longest, sims = waiting()
    swap = re.search(r"used = ([\d.]+)M", run("/usr/sbin/sysctl", "-n", "vm.swapusage"))
    load = run("/usr/sbin/sysctl", "-n", "vm.loadavg").split()[1]
    # 0 nominal, 1 moderate, 2 heavy, 3 trapping, 4 sleeping; and the cores the scheduler may use, a mask.
    thermal = re.search(r"(\d+)\s*$", run("/usr/bin/notifyutil", "-g", "com.apple.system.thermalpressurelevel"))
    cores = run("/usr/sbin/sysctl", "-n", "kern.sched_recommended_cores").strip()
    line = {"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "small_job_s": job, "waiting_checks": checks, "waiting_sim": sim, "longest_wait_min": longest,
            "simulators": sims, "swap_gb": round(float(swap.group(1)) / 1024, 1) if swap else None, "load1": float(load),
            "thermal": int(thermal.group(1)) if thermal else None, "cores": bin(int(cores)).count("1") if cores.isdigit() else None,
            "chrome_on_screen": chrome_on_screen(), "free_gb": free_gb(), "top_cpu": top_cpu()}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "a") as f:
        f.write(json.dumps(line) + "\n")


if __name__ == "__main__":
    main()
