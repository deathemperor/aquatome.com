#!/usr/bin/env bash
# A Mac part's cycle (pages, sf, photos) still running past ENGINE_STUCK_HOURS (6), said loudly, every hour from
# engine-due.sh. launchd starts no run of a part while the last one lives, and that one is the only thing that would say
# "previous cycle still running" (engine-cycle.sh), so a hung cycle stops its part with no line anywhere: on 13 Nov 2026
# the 23:10 photos cycle hung in its opening fetch and no photos run started behind it. The longest that finished from 4
# to 12 November ran 5 h 40 min, waits for the Mac's heat included.
# Its part's log gets a line each hour it goes on, and GitHub a failed run once (engine-mac.yml), which the daily report
# lists until that part publishes again. Nothing here stops it: which process to stop is a person's call.
set -uo pipefail
log() { echo "$(date -u +%FT%TZ) $*"; }
BASE="${ENGINE_CLONES:-$HOME/.local/share/aquatome}"
HOURS="${ENGINE_STUCK_HOURS:-6}"
# Seconds from ps's elapsed time, [[dd-]hh:]mm:ss.
seconds() { awk '{ d = 0; t = $1; if (index(t, "-")) { split(t, a, "-"); d = a[1]; t = a[2] }; n = split(t, b, ":"); s = 0; for (i = 1; i <= n; i++) s = s * 60 + b[i]; print d * 86400 + s }'; }
# What it's in now: the last of its line of children ("git fetch -q origin").
inside() { ps -A -o pid=,ppid=,command= | awk -v p="$1" '{ pid = $1; ppid = $2; $1 = $2 = ""; sub(/^ +/, ""); child[ppid] = pid; cmd[pid] = $0 } END { while (p in child) p = child[p]; print cmd[p] }'; }
for part in pages sf photos; do
  gitdir="$BASE/engine-$part/.git"
  pid=$(cat "$gitdir/aquatome-engine.pid" 2>/dev/null) || continue
  # Still a cycle: the file outlives a restart, and its number can go to another process (engine-cycle.sh).
  ps -p "$pid" -o command= 2>/dev/null | grep -q 'cycle\.sh' || continue
  secs=$(ps -p "$pid" -o etime= | seconds)
  [ "$secs" -ge $((HOURS * 3600)) ] || continue
  why="the $part cycle (pid $pid) has run $((secs / 3600)) h $((secs % 3600 / 60)) min, now in: $(inside "$pid" | cut -c1-120). launchd starts no $part run until it ends, and nothing stops it by itself"
  log "stuck: $why" | tee -a "$HOME/Library/Logs/aquatome-engine-$part.log"
  # Once a cycle on GitHub.
  [ "$(cat "$gitdir/aquatome-engine.stuck" 2>/dev/null)" != "$pid" ] || continue
  gh workflow run engine-mac.yml -R deathemperor/aquatome.com -f part="$part" -f why="stuck: $why" && echo "$pid" > "$gitdir/aquatome-engine.stuck"
done
exit 0
