#!/usr/bin/env bash
# The YouTube work, on the owner's Mac: YouTube throttles datacenter IPs, so this is the one engine job not on GitHub
# Actions. Videos → guides, their species and kit, playlist discovery. Commits + pushes; the push deploys (deploy.yml).
# Installed by install-video-schedule.sh. Optional: ~/.config/thuysinh/yt-cookies-from (e.g. "chrome:Profile 2") signs
# yt-dlp in as that Chrome profile's YouTube account.
set -euo pipefail
export PATH="${PATH:+$PATH:}$HOME/.local/bin:$HOME/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")/.."
log() { echo "$(date -u +%FT%TZ) $*"; }
# Backstop for the GitHub engine: its cron dropped every slot on 2026-10-30, so start it when nothing ran for 3 hours.
last="$(gh run list -R deathemperor/aquatome.com -w engine -L 1 --json createdAt -q '.[0].createdAt' 2>/dev/null || true)"
if [ -n "$last" ] && [ $(( $(date -u +%s) - $(date -ju -f %Y-%m-%dT%H:%M:%SZ "$last" +%s) )) -gt 10800 ]; then
  gh workflow run engine -R deathemperor/aquatome.com && log "engine: started on GitHub (last run $last)" || log "engine: could not start it"
fi
# Shared with manual engine runs in this clone, so the two never touch the tree at once.
PIDFILE="${TMPDIR:-/tmp}/thuysinh-engine.pid"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then log "another engine job (pid $(cat "$PIDFILE")) is running"; exit 0; fi
echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT
# shellcheck disable=SC1091
. "$HOME/.nvm/nvm.sh" && nvm use --silent "$(cat .nvmrc)"
COOKIES="$HOME/.config/thuysinh/yt-cookies-from"
[ -s "$COOKIES" ] && export YT_COOKIES_FROM="$(cat "$COOKIES")"

# Start from GitHub's main: anything this clone held unpushed was a run whose push failed, and is redone.
git fetch -q origin && git checkout -q main && git reset -q --hard origin/main
git config merge.changelog.driver 'node scripts/merge-changelog.mjs %O %A %B'
pnpm install --frozen-lockfile --silent
log "videos start"
pnpm engine videos --max-minutes "${VIDEO_MAX_MINUTES:-90}" || log "videos: failed"
pnpm engine video-items --limit 20 || log "video-items: failed"
pnpm engine discover-videos || log "discover-videos: failed"
# New guides' video stills and photos: none with a watermark (macOS Vision reads the text, the model judges it).
pnpm engine watermarks --limit 20 || log "watermarks: failed"
# The content rules' safe fixes, as in the GitHub cycle (a new guide whose title promises a count it lacks: the tests fail on it).
pnpm engine sweep || log "sweep: failed"
if [ -z "$(git status --porcelain -- content engine-state)" ]; then log "no changes"; exit 0; fi
if ! pnpm test >/tmp/thuysinh-videos-test.log 2>&1; then log "tests failed, not publishing (see /tmp/thuysinh-videos-test.log)"; exit 1; fi
git add content engine-state
git commit -q -m "content: videos $(date -u +%F)"
# The GitHub engine pushes too; content/changelog.json merges through the driver above.
for _ in 1 2 3; do
  if git pull -q --rebase && git push -q; then log "pushed (GitHub deploys it)"; exit 0; fi
  git rebase --abort 2>/dev/null || true
  sleep 30
done
log "push failed three times"; exit 1
