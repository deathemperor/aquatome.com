#!/usr/bin/env bash
# The YouTube work, on the owner's Mac: YouTube throttles datacenter IPs, so this is the one engine job not on GitHub
# Actions. Videos → guides, their species and kit, playlist discovery. Commits + pushes; the push deploys (deploy.yml).
# Installed by install-video-schedule.sh. Optional: ~/.config/aquatome/yt-cookies-from (e.g. "chrome:Profile 2") signs
# yt-dlp in as that Chrome profile's YouTube account.
set -euo pipefail
export PATH="${PATH:+$PATH:}$HOME/.local/bin:$HOME/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")/.."
log() { echo "$(date -u +%FT%TZ) $*"; }
# Test runs take turns with the engine parts' builds and tests on this machine (engine-cycle.sh).
checks() { lockf -k "$HOME/.cache/aquatome/checks.lock" bash -c "$1"; }
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
pnpm engine video-items --limit 20 || log "video-items: failed"
pnpm engine discover-videos || log "discover-videos: failed"
# Photos that show their page's fish, plant or breed (the GitHub engine's account runs out of model calls mid-week):
# 20 calls a run, most-read pages first, verdicts cached.
pnpm engine check-photos --limit 20 || log "check-photos: failed"
# New guides' video stills and photos: none with a watermark (macOS Vision reads the text, the model judges it).
pnpm engine watermarks --limit 20 || log "watermarks: failed"
# The content rules' safe fixes, as in the GitHub cycle (a new guide whose title promises a count it lacks: the tests fail on it).
pnpm engine sweep || log "sweep: failed"
if [ -z "$(git status --porcelain -- content engine-state docs/review)" ]; then log "no changes"; exit 0; fi
if ! checks 'pnpm test' >/tmp/aquatome-videos-test.log 2>&1; then log "tests failed, not publishing (see /tmp/aquatome-videos-test.log)"; exit 1; fi
git add content engine-state docs/review
git commit -q -m "content: videos $(date -u +%F)"
# The GitHub engine pushes too; the files above merge through their drivers. Lines both changed (the photo verdicts
# review page) give way to this run's, as engine-cycle.sh does; then the tests run again on the merge.
for _ in 1 2 3; do
  if ! git pull -q --rebase; then
    log "the GitHub engine changed the same files: $(git diff --name-only --diff-filter=U | tr '\n' ' ')"
    git rebase --abort 2>/dev/null || true
    if git pull -q --rebase -X theirs; then
      checks 'pnpm test' >/tmp/aquatome-videos-test.log 2>&1 || { log "tests failed after that merge, not publishing"; exit 1; }
    else
      git rebase --abort 2>/dev/null || true
    fi
  fi
  if git push -q; then log "pushed (GitHub deploys it)"; exit 0; fi
  sleep 30
done
log "push failed three times"; exit 1
