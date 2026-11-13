#!/usr/bin/env bash
# Seconds since the last content cycle (engine.yml) started: the newest run whose cycle job ran, from when that job
# started. Prints nothing when none of the last 30 runs had one, which is overdue. engine.yml's due check and the Mac's
# starter (engine-due.sh) both go by it, so they agree.
# A run counts only if its cycle job ran, never by how long the run took (the chief of staff, 13 Nov 2026). The hourly
# check at 03:52 that day found the 01:56 cycle running and skipped, but waited 55 min behind it in the queue
# (concurrency group `engine`), so "a run over 10 minutes" counted it as a cycle and put the next one off from 07:46 to
# 09:42. A cycle job that ran has steps; one skipped, or never started from the queue, has none.
# `engine-last-cycle.sh [<owner/repo>]`; in a run of engine.yml, that run itself is left out.
set -euo pipefail
REPO="${1:-${GITHUB_REPOSITORY:-deathemperor/aquatome.com}}"
for id in $(gh run list -R "$REPO" -w engine.yml -L 30 --json databaseId -q '.[].databaseId'); do
  [ "$id" != "${GITHUB_RUN_ID:-}" ] || continue
  started=$(gh api "repos/$REPO/actions/runs/$id/jobs" -q '.jobs[] | select(.name == "Content cycle: rewrite" and .conclusion != "skipped" and ((.steps // []) | length) > 0) | .started_at')
  [ -n "$started" ] || continue
  at=$(date -u -d "$started" +%s 2>/dev/null || date -j -u -f %Y-%m-%dT%H:%M:%SZ "$started" +%s)
  echo $(( $(date -u +%s) - at ))
  exit 0
done
