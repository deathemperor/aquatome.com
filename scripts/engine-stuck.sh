#!/usr/bin/env bash
# A Mac part's cycle (pages, sf, photos) still running past ENGINE_STUCK_HOURS (6), said loudly, every hour from
# engine-due.sh. launchd starts no run of a part while the last one lives, and that one is the only thing that would say
# "previous cycle still running" (engine-cycle.sh), so a hung cycle stops its part with no line anywhere: on 13 Nov 2026
# the 23:10 photos cycle hung in its opening fetch and no photos run started behind it. The longest that finished from 4
# to 12 November ran 5 h 40 min, waits for the Mac's heat included.
# Its part's log gets a line each hour it goes on, and GitHub a failed run once a day (engine-mac.yml), which the daily
# report lists. Nothing here stops it: which process to stop is a person's call.
# The line names the step it's in, and says "stuck" only when the cycle hasn't moved since the last hour's check: the
# same processes under it, using no more CPU, and none of them waiting its turn in the checks queue. Past its hours but
# moving (on 14 Nov at 00:40 a pages run in its 150 minutes of writing, its model calls live), it says so. Each check
# notes what it saw, the hours before too, so the first check past them can tell.
set -uo pipefail
log() { echo "$(date -u +%FT%TZ) $*"; }
BASE="${ENGINE_CLONES:-$HOME/.local/share/aquatome}"
HOURS="${ENGINE_STUCK_HOURS:-6}"
# Seconds from ps's elapsed time, [[dd-]hh:]mm:ss.
seconds() { awk '{ d = 0; t = $1; if (index(t, "-")) { split(t, a, "-"); d = a[1]; t = a[2] }; n = split(t, b, ":"); s = 0; for (i = 1; i <= n; i++) s = s * 60 + b[i]; print int(d * 86400 + s) }'; }
# The cycle and every process under it, "pid cpu-time" a line (hundredths of a second), by pid.
under() { ps -A -o pid=,ppid=,time= | awk -v p="$1" 'function s(t,  d, a, b, n, i, x) { d = 0; if (index(t, "-")) { split(t, a, "-"); d = a[1]; t = a[2] }; n = split(t, b, ":"); x = 0; for (i = 1; i <= n; i++) x = x * 60 + b[i]; return int((d * 86400 + x) * 100) }
  { par[$1] = $2; tm[$1] = s($3) } END { for (q in par) { r = q; while ((r in par) && r != p && r > 1) r = par[r]; if (r == p) print q, tm[q] } }' | sort -n; }
# Its line of children, the cycle's first child down to what it's in now ("git fetch -q origin"), "pid command" a line.
line() { ps -A -o pid=,ppid=,command= | awk -v p="$1" '{ pid = $1; ppid = $2; $1 = $2 = ""; sub(/^ +/, ""); child[ppid] = pid; cmd[pid] = $0 } END { while (p in child) { p = child[p]; print p " " cmd[p] } }'; }
# The step, in words, from that line: a wait when the bottom is one, or the deepest step it knows.
step() {
  awk '{ sub(/^[0-9]+ /, ""); c = $0 }
    /vitest|pnpm( -r)? test|engine gate/ { s = "its checks" }
    /astro build|pnpm build/ { s = "its build" }
    /engine run|(^|[ \/])claude / { s = "writing" }
    /git (fetch|push|pull)|(^|[ \/])gh / { s = "talking to GitHub" }
    END { if (c ~ /^lockf /) s = "waiting its turn in the checks queue"; else if (c ~ /^sleep /) s = "waiting"
      print (s ? s : "a step of its own") }'
}
for part in pages sf photos; do
  gitdir="$BASE/engine-$part/.git"
  pid=$(cat "$gitdir/aquatome-engine.pid" 2>/dev/null) || continue
  # Still a cycle: the file outlives a restart, and its number can go to another process (engine-cycle.sh).
  ps -p "$pid" -o command= 2>/dev/null | grep -q 'cycle\.sh' || continue
  secs=$(ps -p "$pid" -o etime= | seconds)
  chain=$(line "$pid")
  [ -n "$chain" ] || chain="$pid $(ps -p "$pid" -o command=)"
  bottom=${chain##*$'\n'}
  procs=$(under "$pid")
  pids=$(awk '{ printf "%s%s", (NR > 1 ? "," : ""), $1 }' <<<"$procs")
  cpu=$(awk '{ s += $2 } END { print int(s) }' <<<"$procs")
  # What the last check saw: "cycle cpu when pids".
  was_pid= was_cpu= was_at= was_pids=
  read -r was_pid was_cpu was_at was_pids 2>/dev/null < "$gitdir/aquatome-engine.moving"
  echo "$pid $cpu $(date +%H:%M) $pids" > "$gitdir/aquatome-engine.moving"
  [ "$secs" -ge $((HOURS * 3600)) ] || continue
  ran="has run $((secs / 3600)) h $((secs % 3600 / 60)) min"
  if [ "$was_pid" = "$pid" ] && [ "$was_pids" = "$pids" ] && [ "$cpu" -le "${was_cpu:-0}" ] && ! [[ "${bottom#* }" == lockf\ * ]]; then
    state=stuck; why="the $part cycle (pid $pid) $ran and hasn't moved since the check at $was_at: $(step <<<"$chain"), in $(echo "${bottom#* }" | cut -c1-120)"
  elif [ "$was_pid" = "$pid" ]; then
    state='past its hours'; why="the $part cycle (pid $pid) $ran, still moving: $(step <<<"$chain"), now in $(echo "${bottom#* }" | cut -c1-120)"
  else
    state='past its hours'; why="the $part cycle (pid $pid) $ran: $(step <<<"$chain"), now in $(echo "${bottom#* }" | cut -c1-120); the next check says whether it moves"
  fi
  why="$why. launchd starts no $part run until it ends, and nothing stops it by itself"
  log "$state: $why" | tee -a "$HOME/Library/Logs/aquatome-engine-$part.log"
  # On GitHub once a cycle, again when it stops moving, and again each day it goes on: the daily report reads a day's
  # failures (daily-report.mjs).
  [ "$(cat "$gitdir/aquatome-engine.stuck" 2>/dev/null)" != "$pid $state" ] || [ -n "$(find "$gitdir/aquatome-engine.stuck" -mmin +1380 2>/dev/null)" ] || continue
  gh workflow run engine-mac.yml -R deathemperor/aquatome.com -f part="$part" -f why="$state: $why" && echo "$pid $state" > "$gitdir/aquatome-engine.stuck"
done
exit 0
