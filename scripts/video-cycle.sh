#!/usr/bin/env bash
# The YouTube work, on the owner's Mac: YouTube throttles datacenter IPs, so this is the one engine job not on GitHub
# Actions. Videos → guides, their species and kit, playlist discovery. Commits + pushes; the push deploys (deploy.yml).
# Installed by install-video-schedule.sh. Optional: ~/.config/aquatome/yt-cookies-from (e.g. "chrome:Profile 2") signs
# yt-dlp in as that Chrome profile's YouTube account.
set -euo pipefail
export PATH="${PATH:+$PATH:}$HOME/.local/bin:$HOME/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")/.."
log() { echo "$(date -u +%FT%TZ) $*"; }
# The checks as the engine parts run them (cycle-checks.sh): they take turns with the parts' builds and tests, wait for
# the Mac's load to fall, and run once more when tests ran out of time. Without the wait, the tests at a load of 667 on
# 16 cores (2026-11-07) ran out of their 30 s twice in a row and held back the videos.
TEST_LOG=/tmp/aquatome-videos-test.log
# shellcheck disable=SC1091
source scripts/cycle-checks.sh
# The GitHub engine's clock (it also runs hourly on its own, when installed): a cycle when none started for 2 h 50 min.
# Once a run: not again when from_main starts it again.
[ -n "${AQ_SCRIPT_HEAD:-}" ] || scripts/engine-due.sh || log "engine: the due check failed"
# Shared with manual engine runs in this clone, so the two never touch the tree at once.
# Its process must still be a cycle script: the file outlives a restart, and its number can go to another process.
PIDFILE="$(git rev-parse --absolute-git-dir)/aquatome-engine.pid"
# Not this run's own number: from_main starts it again as the same process.
if [ -f "$PIDFILE" ] && [ "$(cat "$PIDFILE")" != $$ ] && ps -p "$(cat "$PIDFILE")" -o command= 2>/dev/null | grep -q 'cycle\.sh'; then log "another engine job (pid $(cat "$PIDFILE")) is running"; exit 0; fi
echo $$ > "$PIDFILE"
trap 'status=$?; rm -f "$PIDFILE"; fault_exit "$status" videos' EXIT
# shellcheck disable=SC1091
. "$HOME/.nvm/nvm.sh" && nvm use --silent "$(cat .nvmrc)"
COOKIES="$HOME/.config/aquatome/yt-cookies-from"
[ -s "$COOKIES" ] && export YT_COOKIES_FROM="$(cat "$COOKIES")"
# Claude: the engine's accounts, one token a line as in GitHub's CLAUDE_CODE_OAUTH_TOKENS, not the owner's own login
# (as engine-cycle.sh). Until 11 Nov 2026 this job had no list and ran on the Mac's login, with no cost log: about 93
# new video guides a day that no ceiling could count.
CLAUDE_TOKENS="$HOME/.config/aquatome/claude-oauth-tokens"
if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}${CLAUDE_CODE_OAUTH_TOKENS:-}" ] && [ -s "$CLAUDE_TOKENS" ]; then
  CLAUDE_CODE_OAUTH_TOKENS="$(cat "$CLAUDE_TOKENS")"; export CLAUDE_CODE_OAUTH_TOKENS
fi
# A line a model call: its cost, tokens and the account it went to (claude.ts), so a week's use can be split by job.
export ENGINE_COST_LOG="${ENGINE_COST_LOG:-$HOME/Library/Logs/aquatome-cost-videos.jsonl}"

# Start from GitHub's main: anything this clone held unpushed was a run whose push failed, and is redone.
from_main "$@"
cool
git config merge.changelog.driver 'node scripts/merge-changelog.mjs %O %A %B'
# The photo caches and run records in engine-state, and new pages, merge as the GitHub cycle merges them (.gitattributes).
git config merge.jsonmap.driver 'node scripts/merge-json-map.mjs %O %A %B'
# Each run rewrites the fit reports, so keep the current side when they clash.
git config merge.regenerated.driver true
git config merge.entity.driver 'node scripts/merge-entity.mjs %O %A %B'
pnpm install --frozen-lockfile --silent
publish_kept videos
log "videos start"
# Records left saying pages were done on 11 Nov 2026, when the usage limit stopped the gate, put back before a writer runs.
pnpm engine redo-unread || log "redo-unread: failed"
pnpm engine videos --max-minutes "${VIDEO_MAX_MINUTES:-90}" || log "videos: failed"
# Guides are checked again (review-backfill) and redone from the notes by their own hourly job, video-recheck.sh, not
# here: the two jobs never check one guide at once.
pnpm engine video-items --limit 20 || log "video-items: failed"
# The species-profile channels (species-videos.ts PROFILE_CHANNELS): their new uploads vetted by title, then a few profile
# videos a run into species and plant pages (a new species page is a web research call), each tried once
# (engine-state/_species-videos.json).
pnpm engine species-videos --limit "${SPECIES_VIDEOS_LIMIT:-3}" || log "species-videos: failed"
pnpm engine discover-videos || log "discover-videos: failed"
# Older guides' stills (storyboard tiles, 320 or 160 px) become the video's own frames, screened before they publish,
# and their times the seconds they show (a guide that needs only that goes first: one yt-dlp call, no frames).
# About 80 s a guide (2026-11-06: 6 to 17 stills, 8–9 s each): 12 a run is about 15 minutes, and 8 runs a day finish
# the 472 guides in about 5 days. Then it finds none and calls nothing.
pnpm engine video-stills --limit "${VIDEO_STILLS_LIMIT:-12}" || log "video-stills: failed"
# Photos that show their page's fish, plant or breed, with no person or logo (the GitHub engine's account runs out of
# model calls mid-week): 20 calls a run, most-read pages first, verdicts cached.
pnpm engine check-photos --limit 20 || log "check-photos: failed"
# New guides' photos, their video sections' photos and their stills: no people, no logos (guide-photos.ts), 20 calls a
# run, leads first, stills last; after video-stills, so a frame it just made can be judged in the same run.
pnpm engine guide-photos --limit 20 || log "guide-photos: failed"
# No dead fish on a page (dead-screen.ts): videos (thumbnail and three frames) and main photos the photo check never asked about, 48 a run
# (4 model calls); a dead one leaves every page for good.
pnpm engine dead-screen --limit "${DEAD_SCREEN_LIMIT:-48}" || log "dead-screen: failed"
# New guides' video stills and photos: none with a watermark (macOS Vision reads the text, the model judges it).
pnpm engine watermarks --limit 20 || log "watermarks: failed"
# The content rules' safe fixes, as in the GitHub cycle (a new guide whose title promises a count it lacks: the tests fail on it).
pnpm engine sweep || log "sweep: failed"
# Last of the steps that write pages: what this run changed is read against the reader-fit checklist (gate.ts). A new page
# that fails is held, a live page that got worse keeps its committed text, a page built on a foreign shop's kit is held,
# and a held page that now passes is let out. A page it can't read stays as readers have it; only a crash stops the run,
# and keeps its work on a branch (gate_or_keep).
gate_or_keep "content: videos" content engine-state docs/review || exit 1
if [ -z "$(git status --porcelain -- content engine-state docs/review)" ]; then log "no changes"; exit 0; fi
# Committed before the tests, as engine-cycle.sh does: the next run's reset drops uncommitted work for good, and a commit
# stays in the reflog to publish by hand (the run of 2026-11-07 lost its work to timeouts).
git add content engine-state docs/review
git commit -q -m "content: videos $(date -u +%F)"
if ! verify 'pnpm test'; then keep_unpublished videos; log "tests failed, not publishing (see $TEST_LOG)"; exit 1; fi
# The GitHub engine pushes too; the files above merge through their drivers. Lines both changed (the photo verdicts
# review page) give way to this run's, as engine-cycle.sh does; then the tests run again on the merge.
for _ in 1 2 3; do
  main=$(git rev-parse '@{u}' 2>/dev/null || true)
  if ! git pull -q --rebase; then
    log "the GitHub engine changed the same files: $(git diff --name-only --diff-filter=U | tr '\n' ' ')"
    git rebase --abort 2>/dev/null || true
    if git pull -q --rebase -X theirs; then
      sweep_merged
      verify 'pnpm test' || { keep_unpublished videos; log "tests failed after that merge, not publishing"; exit 1; }
    else
      git rebase --abort 2>/dev/null || true
    fi
  elif ! swept_pull "$main"; then
    verify 'pnpm test' || { keep_unpublished videos; log "tests failed after the sweep on main's changes, not publishing"; exit 1; }
  fi
  if git push -q; then log "pushed (GitHub deploys it)"; exit 0; fi
  sleep 30
done
log "push failed three times"; keep_lost_push videos; exit 1
