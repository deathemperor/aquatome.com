#!/usr/bin/env bash
# The engine's clock, on the owner's Mac, every hour (install-video-schedule.sh): GitHub started no scheduled engine run
# from 06:27 to past 19:30 UTC on 2 November, engine.yml's own hourly cron included. So a cycle (engine.yml) starts from
# here when none started in the last ENGINE_EVERY_MINUTES, the rule engine.yml's job `due` uses. A cycle is a run over
# 10 minutes long or still going: engine.yml's hourly checks that found none due end in seconds.
#
# The pace is read where that job reads it: the repository variable, and with none set, the default written in
# engine.yml. This script has no figure of its own. It had one, 170 minutes, and a run started from here is started by
# hand, which skips the job's check: from 7 to 11 November 2026 the variable said 350 and cycles went on starting every
# 180 minutes, 29 of the 43 from here.
set -euo pipefail
export PATH="${PATH:+$PATH:}$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
log() { echo "$(date -u +%FT%TZ) $*"; }
REPO=deathemperor/aquatome.com
# A gh error stops the script here (set -e): with no pace to go by, nothing starts.
every="$(gh variable list -R "$REPO" --json name,value -q '.[] | select(.name == "ENGINE_EVERY_MINUTES") | .value')"
[ -n "$every" ] || every="$(sed -nE 's/.*\$\{EVERY:-([0-9]+)\}.*/\1/p' "$(dirname "$0")/../.github/workflows/engine.yml" | head -1)"
case "$every" in '' | *[!0-9]*) log "engine: not started: no pace to go by (ENGINE_EVERY_MINUTES is '$every')"; exit 0 ;; esac
# Seconds since the last cycle started; empty when none did in the last 30 runs (30 hours of quick checks), which is
# overdue too.
age="$(gh run list -R "$REPO" -w engine.yml -L 30 --json createdAt,updatedAt,status -q '[.[] | select(.status != "completed" or ((.updatedAt | fromdateiso8601) - (.createdAt | fromdateiso8601)) > 600) | .createdAt | fromdateiso8601] | max | if . then (now - . | floor) else empty end')"
if [ -z "$age" ] || [ "$age" -ge $((every * 60)) ]; then
  last="none in 30 runs"
  [ -z "$age" ] || last="$((age / 60)) min ago"
  gh workflow run engine.yml -R "$REPO" && log "engine: started on GitHub (last cycle $last, every $every min)" || log "engine: could not start it"
fi
