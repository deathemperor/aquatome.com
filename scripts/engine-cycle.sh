#!/usr/bin/env bash
# One content-engine cycle on the home machine: sync → run engine → build + test → commit + push → deploy.
# Runs from a dedicated clone (see install-engine-schedule.sh) so it never touches a development checkout.
set -euo pipefail
# The job's PATH first (GitHub Actions: setup-node's Node), then the owner's Mac tool dirs (launchd).
export PATH="${PATH:+$PATH:}$HOME/.local/bin:$HOME/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
log() { echo "$(date -u +%FT%TZ) $*"; }

# Single instance: a PID file, so a crashed or killed cycle doesn't block the schedule forever.
PIDFILE="${TMPDIR:-/tmp}/thuysinh-engine.pid"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then log "previous cycle (pid $(cat "$PIDFILE")) still running"; exit 0; fi
echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT

TOKEN_FILE="$HOME/.config/thuysinh/cf-token"
[ -s "$TOKEN_FILE" ] || { log "missing $TOKEN_FILE — not running"; exit 1; }

# shellcheck disable=SC1091
[ -n "${CI:-}" ] || { . "$HOME/.nvm/nvm.sh" && nvm use --silent "$(cat .nvmrc)"; } # CI: setup-node
log "cycle start"
if [ -n "$(git status --porcelain -- content sources)" ]; then
  log "uncommitted content from an earlier failed cycle — fix it (see /tmp/thuysinh-engine-test.log) before new runs"; exit 1
fi
git checkout -q main && git pull -q --ff-only
# content/changelog.json gets entries from here and from the Mac's video job (video-cycle.sh): merge, don't conflict.
git config merge.changelog.driver 'node scripts/merge-changelog.mjs %O %A %B'
pnpm install --frozen-lockfile --silent
pnpm engine run --max-minutes "${ENGINE_MAX_MINUTES:-300}" ${ENGINE_ARGS:-}
# SKIP_VIDEOS (GitHub Actions): the three YouTube steps run in video-cycle.sh on the owner's Mac instead.
# Original Vietnamese guides from the YouTube playlists in engine-state/youtube-playlists.json (captions and metadata only).
# Before discovery: a burst of searches makes YouTube throttle the caption fetches that follow.
[ -n "${ENGINE_ARGS:-}${SKIP_VIDEOS:-}" ] || pnpm engine videos --max-minutes "${VIDEO_MAX_MINUTES:-90}" || log "videos: failed"
# Species and kit in guides written before that step existed (one transcript fetch each, stops when YouTube throttles).
[ -n "${ENGINE_ARGS:-}${SKIP_VIDEOS:-}" ] || pnpm engine video-items --limit 20 || log "video-items: failed"
# YouTube (skipped on targeted ENGINE_ARGS runs): new teaching playlists (searches + known channels, vetted by the model; skipped while ≥ 150 videos are queued).
[ -n "${ENGINE_ARGS:-}${SKIP_VIDEOS:-}" ] || pnpm engine discover-videos || log "discover-videos: failed"
# Photos the picker used to miss on pages with fewer than 3 (each source page re-read at most monthly).
pnpm engine photos --limit 60 || log "photos: backfill failed"
# No people in photos: drop any with a human face (before thumbs, so none are made for dropped photos).
pnpm engine faces || log "faces: failed (unscreened photos may publish)"
# Every page photo must show its species (a tankmate or a whole tank gets rejected); a typical photo leads the page.
pnpm engine check-photos --limit "${PHOTO_CHECK_LIMIT:-40}" || log "check-photos: failed"
# Photo galleries, a few species a cycle, popular species first (Commons + iNaturalist, open licences, screened, no faces).
pnpm engine gallery --limit "${GALLERY_LIMIT:-8}" || log "gallery: failed"
# Commons and iNaturalist photos (new galleries, new pages) copied to our bucket: their hosts set third-party cookies.
pnpm engine mirror-photos --limit "${MIRROR_LIMIT:-200}" || log "mirror-photos: failed"
# Card thumbs for photos stored before thumbs existed; a failure only means full-size photos on cards.
pnpm engine thumbs || log "thumbs: some failed (cards fall back to full photos)"
# Pictures report (docs/review/content-audit.md): pages without a photo, a card thumb, or pictures inside the text.
pnpm engine audit || log "audit: failed"
# Temperament / fin-nipping / school size for new or changed species (tank-mates checker).
pnpm engine traits --limit 200 || log "traits: failed (checker shows missing data)"
# Older Vietnamese rewritten in the site's style, a few pages a cycle, each kept only if the reviewer passes it.
pnpm engine rewrite-vi --limit "${VI_REWRITE_LIMIT:-12}" || log "rewrite-vi: failed"

if [ -z "$(git status --porcelain -- content sources)" ]; then
  # Pages hidden or unhidden on the dashboard since the last deploy still need a build to leave (or rejoin) the lists.
  HIDDEN_JSON="$(curl -sf -H "authorization: Bearer $(cat "$HOME/.config/thuysinh/ab-dash-token")" https://aquatome.com/_ab/hidden.json || true)"
  HIDDEN_NOW="$(printf '%s' "$HIDDEN_JSON" | shasum | cut -c1-40)"
  if [ -n "$HIDDEN_JSON" ] && [ "$HIDDEN_NOW" != "$(cat "$HOME/.config/thuysinh/hidden-deployed" 2>/dev/null)" ]; then
    log "hidden pages changed — redeploying"; CLOUDFLARE_API_TOKEN="$(cat "$TOKEN_FILE")" scripts/deploy.sh; exit 0
  fi
  log "no content changes"; exit 0
fi
# Real content must build (the test suite builds fixtures), then the suite must pass.
if ! { pnpm build && pnpm test; } >/tmp/thuysinh-engine-test.log 2>&1; then
  log "build/tests failed, not publishing (see /tmp/thuysinh-engine-test.log)"; exit 1
fi
git add content sources engine-state docs/review
git commit -q -m "content: engine run $(date -u +%F)"
# Code may have merged during the run (it can take hours): replay the content commit on top, then publish.
git pull -q --rebase
git push -q
CLOUDFLARE_API_TOKEN="$(cat "$TOKEN_FILE")" scripts/deploy.sh
log "cycle done"
