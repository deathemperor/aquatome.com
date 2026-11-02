#!/usr/bin/env bash
# The engine's clock, on the owner's Mac, every hour (install-video-schedule.sh): GitHub started no scheduled engine run
# from 06:27 to past 19:30 UTC on 2 November, engine.yml's own hourly cron included. So a cycle (engine.yml) starts from
# here when none started in the last 2 h 50 min, the rule engine.yml's job `due` uses. A cycle is a run over 10 minutes
# long or still going: engine.yml's hourly checks that found none due end in seconds.
set -euo pipefail
export PATH="${PATH:+$PATH:}$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
log() { echo "$(date -u +%FT%TZ) $*"; }
last="$(gh run list -R deathemperor/aquatome.com -w engine.yml -L 30 --json createdAt,updatedAt,status -q '[.[] | select(.status != "completed" or ((.updatedAt | fromdateiso8601) - (.createdAt | fromdateiso8601)) > 600) | .createdAt] | max // empty')"
# None in the last 30 runs (30 hours of quick checks) is overdue too. A gh error stops the script before this (set -e).
if [ -z "$last" ] || [ $(( $(date -u +%s) - $(date -ju -f %Y-%m-%dT%H:%M:%SZ "$last" +%s) )) -ge $((170 * 60)) ]; then
  gh workflow run engine.yml -R deathemperor/aquatome.com && log "engine: started on GitHub (last cycle $last)" || log "engine: could not start it"
fi
