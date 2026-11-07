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
scripts/engine-due.sh || log "engine: the due check failed"
# Shared with manual engine runs in this clone, so the two never touch the tree at once.
# Its process must still be a cycle script: the file outlives a restart, and its number can go to another process.
PIDFILE="$(git rev-parse --absolute-git-dir)/aquatome-engine.pid"
if [ -f "$PIDFILE" ] && ps -p "$(cat "$PIDFILE")" -o command= 2>/dev/null | grep -q 'cycle\.sh'; then log "another engine job (pid $(cat "$PIDFILE")) is running"; exit 0; fi
echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT
# shellcheck disable=SC1091
. "$HOME/.nvm/nvm.sh" && nvm use --silent "$(cat .nvmrc)"
COOKIES="$HOME/.config/aquatome/yt-cookies-from"
[ -s "$COOKIES" ] && export YT_COOKIES_FROM="$(cat "$COOKIES")"

# Start from GitHub's main: anything this clone held unpushed was a run whose push failed, and is redone.
git fetch -q origin && git checkout -q main && git reset -q --hard origin/main
git config merge.changelog.driver 'node scripts/merge-changelog.mjs %O %A %B'
# The photo caches and run records in engine-state, and new pages, merge as the GitHub cycle merges them (.gitattributes).
git config merge.jsonmap.driver 'node scripts/merge-json-map.mjs %O %A %B'
git config merge.entity.driver 'node scripts/merge-entity.mjs %O %A %B'
pnpm install --frozen-lockfile --silent
log "videos start"
pnpm engine videos --max-minutes "${VIDEO_MAX_MINUTES:-90}" || log "videos: failed"
# Guides under the bar whose review left no notes (written before reviews were kept), reviewed again against their
# transcript, nothing rewritten: the owner's videos first, REVIEW_BACKFILL_LIMIT a run (engine-state/reviews/video-guide.json).
pnpm engine review-backfill --kind video-guide --limit "${REVIEW_BACKFILL_LIMIT:-10}" || log "review-backfill: failed"
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
# New guides' photos and their video sections' photos: no people, no logos (guide-photos.ts), 20 calls a run, leads first.
pnpm engine guide-photos --limit 20 || log "guide-photos: failed"
# No dead fish on a page (dead-screen.ts): video thumbnails and main photos the photo check never asked about, 48 a run
# (4 model calls); a dead one leaves every page for good.
pnpm engine dead-screen --limit "${DEAD_SCREEN_LIMIT:-48}" || log "dead-screen: failed"
# New guides' video stills and photos: none with a watermark (macOS Vision reads the text, the model judges it).
pnpm engine watermarks --limit 20 || log "watermarks: failed"
# The content rules' safe fixes, as in the GitHub cycle (a new guide whose title promises a count it lacks: the tests fail on it).
pnpm engine sweep || log "sweep: failed"
if [ -z "$(git status --porcelain -- content engine-state docs/review)" ]; then log "no changes"; exit 0; fi
if ! verify 'pnpm test'; then log "tests failed, not publishing (see $TEST_LOG)"; exit 1; fi
git add content engine-state docs/review
git commit -q -m "content: videos $(date -u +%F)"
# The GitHub engine pushes too; the files above merge through their drivers. Lines both changed (the photo verdicts
# review page) give way to this run's, as engine-cycle.sh does; then the tests run again on the merge.
for _ in 1 2 3; do
  if ! git pull -q --rebase; then
    log "the GitHub engine changed the same files: $(git diff --name-only --diff-filter=U | tr '\n' ' ')"
    git rebase --abort 2>/dev/null || true
    if git pull -q --rebase -X theirs; then
      verify 'pnpm test' || { log "tests failed after that merge, not publishing"; exit 1; }
    else
      git rebase --abort 2>/dev/null || true
    fi
  fi
  if git push -q; then log "pushed (GitHub deploys it)"; exit 0; fi
  sleep 30
done
log "push failed three times"; exit 1
