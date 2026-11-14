#!/usr/bin/env bash
# The video guides checked again by the stricter reviewer (2026-11-07: nothing the video doesn't say, one creator's habit
# stays one person's, no overstating), on the owner's Mac, hourly, in its own clone: it never waits for the video job
# (video-cycle.sh, every 3 h), which no longer checks guides again, so the two never check one guide at once. The
# riskiest guides first (medicine and treatments, then water), then the most read (packages/engine/src/video-order.ts).
# Commits + pushes as the video job does; the push deploys. Installed by install-video-recheck-schedule.sh.
set -euo pipefail
export PATH="${PATH:+$PATH:}$HOME/.local/bin:$HOME/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")/.."
log() { echo "$(date -u +%FT%TZ) $*"; }
# Each run starts from GitHub's main and drops what the clone holds, so only in an engine clone, never a working checkout.
case "$PWD/" in "$HOME/.local/share/aquatome/"*) ;; *) log "not an engine clone (~/.local/share/aquatome/): not running"; exit 1 ;; esac
# The checks as the video job runs them (cycle-checks.sh): in turn with the other jobs' builds and tests, once the Mac's
# load has fallen, and once more when tests ran out of time.
TEST_LOG=/tmp/aquatome-video-recheck-test.log
# shellcheck disable=SC1091
source scripts/cycle-checks.sh
# A run that outlasts the hour is left to finish: the next start finds it and goes.
PIDFILE="$(git rev-parse --absolute-git-dir)/aquatome-engine.pid"
# Not this run's own number: from_main starts it again as the same process.
if [ -f "$PIDFILE" ] && [ "$(cat "$PIDFILE")" != $$ ] && ps -p "$(cat "$PIDFILE")" -o command= 2>/dev/null | grep -q 'video-recheck\.sh'; then log "the last run (pid $(cat "$PIDFILE")) is still going"; exit 0; fi
echo $$ > "$PIDFILE"
trap 'status=$?; rm -f "$PIDFILE"; fault_exit "$status" video-recheck' EXIT
# shellcheck disable=SC1091
. "$HOME/.nvm/nvm.sh" && nvm use --silent "$(cat .nvmrc)"
# Transcripts come from the Mac's cache (473 of the 496 guides'); the rest ask YouTube, one at a time.
COOKIES="$HOME/.config/aquatome/yt-cookies-from"
[ -s "$COOKIES" ] && { YT_COOKIES_FROM="$(cat "$COOKIES")"; export YT_COOKIES_FROM; }
# Claude: the engine's accounts, one token a line, each used up before the next (as engine-cycle.sh), not the owner's own
# login. With every account at its usage limit, both steps stop and what they did is published.
# Token 2 first here, then token 1: token 1 also carries the Mac's other jobs, and on 2026-11-08 it ran behind its week's
# pace with this re-check ($6-8 an hour) most of what it spent, while token 2 had room. awk, so a file whose last line has
# no newline still gives one token a line.
CLAUDE_TOKENS="$HOME/.config/aquatome/claude-oauth-tokens"
if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}${CLAUDE_CODE_OAUTH_TOKENS:-}" ] && [ -s "$CLAUDE_TOKENS" ]; then
  CLAUDE_CODE_OAUTH_TOKENS="$(awk 'NR == 1 { first = $0; next } { print } END { print first }' "$CLAUDE_TOKENS")"; export CLAUDE_CODE_OAUTH_TOKENS
fi
# A line a model call: its cost, tokens and the account it went to (claude.ts), so a week's use can be split by job.
export ENGINE_COST_LOG="${ENGINE_COST_LOG:-$HOME/Library/Logs/aquatome-cost-video-recheck.jsonl}"

from_main "$@"
cool
git config merge.changelog.driver 'node scripts/merge-changelog.mjs %O %A %B'
git config merge.jsonmap.driver 'node scripts/merge-json-map.mjs %O %A %B'
# Each run rewrites the fit reports, so keep the current side when they clash.
git config merge.regenerated.driver true
git config merge.entity.driver 'node scripts/merge-entity.mjs %O %A %B'
pnpm install --frozen-lockfile --silent
publish_kept video-recheck
log "video recheck start"
# Records left saying pages were done on 11 Nov 2026, when the usage limit stopped the gate, put back before a writer runs.
pnpm engine redo-unread || log "redo-unread: failed"
# When the stricter reviewer went live. Every guide on the site then (496) was scored before it.
VIDEO_RECHECK_SINCE=2026-11-07T12:00:00Z
# The guides in search whose newest second read failed at 0.55 or under: two more reads each, the middle one counts,
# before any closes (the chief of staff, 2026-11-11). Its own command, so its own line in the daily ceilings ($10 a day);
# once each is read three times it finds none and calls nothing.
pnpm engine review-backfill-97 --limit "${VIDEO_LOW_LIMIT:-20}" --parallel "${VIDEO_PARALLEL:-4}" || log "review-backfill-97: failed"
# Every guide with no review from then on, whatever its score, reviewed again against its transcript, nothing rewritten:
# one model call each, VIDEO_PARALLEL at once, VIDEO_REREVIEW_LIMIT a run (engine-state/reviews/video-guide.json). 30 a
# run, paced on 2026-11-08 from 60 (the engine's first account would have run out days before its weekly reset): the
# rest in about 13 runs. Then each has a review from after it, and the step finds none and calls nothing.
pnpm engine review-backfill --kind video-guide --reviewed-before "$VIDEO_RECHECK_SINCE" --limit "${VIDEO_REREVIEW_LIMIT:-30}" --parallel "${VIDEO_PARALLEL:-4}" || log "review-backfill: failed"
# The guides those rechecks left under the bar, written again from the transcript with the notes (videos --redo: 3 to 6
# model calls each, Opus writing; then their section pictures again), VIDEO_PARALLEL at once, VIDEO_REDO_LIMIT a run.
# Each once: after that its own review counts, under the bar or not; a skip leaves it as it is, and a failure goes to the
# video job's retries. Once the rechecks have left none, it fetches nothing and calls nothing. 8 a run, paced on
# 2026-11-08 from 30: nearly every guide rechecked falls under the bar, and 30 an hour (about 470 calls) was the account's
# whole week in days. The riskiest still go first. Paused 2026-11-10 (0: the step picks no guide and calls nothing): six
# in ten came out under the bar again, and a guide gets one go, so the rest wait for the writer's fix, measured on 30.
pnpm engine videos --redo --rechecked-since "$VIDEO_RECHECK_SINCE" --limit "${VIDEO_REDO_LIMIT:-0}" --parallel "${VIDEO_PARALLEL:-4}" || log "videos redo: failed"
# The content rules' safe fixes, as in the video job: on 2026-11-08 a run's tests failed on a defect the sweep fixes.
pnpm engine sweep || log "sweep: failed"
# Last of the steps that write pages: what this run changed is read against the reader-fit checklist (gate.ts). A new page
# that fails is held, a live page that got worse keeps its committed text, a page built on a foreign shop's kit is held,
# and a held page that now passes is let out. A page it can't read stays as readers have it; only a crash stops the run,
# and keeps its work on a branch (gate_or_keep).
gate_or_keep "content: video guides checked again" content engine-state docs/review || exit 1
if [ -z "$(git status --porcelain -- content engine-state docs/review)" ]; then log "no changes"; exit 0; fi
# Committed before the tests, as video-cycle.sh does: the next run's reset drops uncommitted work for good, and a commit
# stays in the reflog to publish by hand.
git add content engine-state docs/review
git commit -q -m "content: video guides checked again $(date -u +%F)"
if ! verify 'pnpm test'; then keep_unpublished video-recheck; log "tests failed, not publishing (see $TEST_LOG)"; exit 1; fi
# The video job and the GitHub engine push too; the files merge through their drivers. Lines both changed give way to
# this run's, as video-cycle.sh does; then the tests run again on the merge.
for _ in 1 2 3; do
  main=$(git rev-parse '@{u}' 2>/dev/null || true)
  if ! git pull -q --rebase; then
    log "another job changed the same files: $(git diff --name-only --diff-filter=U | tr '\n' ' ')"
    git rebase --abort 2>/dev/null || true
    if git pull -q --rebase -X theirs; then
      sweep_merged
      verify 'pnpm test' || { keep_unpublished video-recheck; log "tests failed after that merge, not publishing"; exit 1; }
    else
      git rebase --abort 2>/dev/null || true
    fi
  elif ! swept_pull "$main"; then
    verify 'pnpm test' || { keep_unpublished video-recheck; log "tests failed after the sweep on main's changes, not publishing"; exit 1; }
  fi
  if git push -q; then log "pushed (GitHub deploys it)"; exit 0; fi
  sleep 30
done
log "push failed three times"; keep_lost_push video-recheck; exit 1
