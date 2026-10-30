#!/usr/bin/env bash
# One content-engine cycle: sync → engine steps → build + test → commit + push → deploy.
# The steps come in three parts that GitHub runs as parallel jobs (engine.yml), each publishing its own work, so one
# failing part loses only its own: pages (new pages, with their photos screened and stored), photos (upkeep of the
# photos on every page), rewrite (older Vietnamese). No argument: all three, one after another.
# Runs from a dedicated clone (see install-engine-schedule.sh) so it never touches a development checkout.
set -euo pipefail
# The job's PATH first (GitHub Actions: setup-node's Node), then the owner's Mac tool dirs (launchd).
export PATH="${PATH:+$PATH:}$HOME/.local/bin:$HOME/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
log() { echo "$(date -u +%FT%TZ) $*"; }
PART="${1:-all}"
case "$PART" in all|pages|photos|rewrite) ;; *) echo "usage: $0 [pages|photos|rewrite]" >&2; exit 2 ;; esac
part() { [ "$PART" = all ] || [[ " $* " == *" $PART "* ]]; }
# GitHub: a push made with GITHUB_TOKEN starts no workflow, so start deploy.yml for it (one deploy at a time, the newest waiting).
deploy() { if [ -n "${GITHUB_ACTIONS:-}" ]; then gh workflow run deploy -R "$GITHUB_REPOSITORY" --ref main; else CLOUDFLARE_API_TOKEN="$(cat "$TOKEN_FILE")" scripts/deploy.sh; fi; }
# Push this part's commit on top of whatever landed during the run (code, the other parts' content).
push() {
  for _ in 1 2 3; do
    if ! git pull -q --rebase; then
      log "another part changed the same files: $(git diff --name-only --diff-filter=U | tr '\n' ' ')"
      git rebase --abort 2>/dev/null || true
      # Its clashing lines give way to this part's (photo verdicts are re-applied every cycle); then build + test again.
      if git pull -q --rebase -X theirs; then
        { pnpm build && pnpm test; } >/tmp/thuysinh-engine-test.log 2>&1 || { log "build/tests failed after that merge, not publishing"; return 1; }
      else
        git rebase --abort 2>/dev/null || true
      fi
    fi
    git push -q && return 0
    sleep 30
  done
  log "push failed three times"; return 1
}

# Single instance: a PID file, so a crashed or killed cycle doesn't block the schedule forever.
PIDFILE="${TMPDIR:-/tmp}/thuysinh-engine.pid"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then log "previous cycle (pid $(cat "$PIDFILE")) still running"; exit 0; fi
echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT

TOKEN_FILE="$HOME/.config/thuysinh/cf-token"
[ -s "$TOKEN_FILE" ] || { log "missing $TOKEN_FILE — not running"; exit 1; }

# shellcheck disable=SC1091
[ -n "${CI:-}" ] || { . "$HOME/.nvm/nvm.sh" && nvm use --silent "$(cat .nvmrc)"; } # CI: setup-node
log "cycle start ($PART)"
if [ -n "$(git status --porcelain -- content sources)" ]; then
  log "uncommitted content from an earlier failed cycle — fix it (see /tmp/thuysinh-engine-test.log) before new runs"; exit 1
fi
git checkout -q main && git pull -q --ff-only
# content/changelog.json gets entries from here and from the Mac's video job (video-cycle.sh): merge, don't conflict.
git config merge.changelog.driver 'node scripts/merge-changelog.mjs %O %A %B'
# The pages and photos parts both add to the photo caches in engine-state.
git config merge.jsonmap.driver 'node scripts/merge-json-map.mjs %O %A %B'
pnpm install --frozen-lockfile --silent
if part pages; then
  pnpm engine run --max-minutes "${ENGINE_MAX_MINUTES:-300}" ${ENGINE_ARGS:-}
  # SKIP_VIDEOS (GitHub Actions): the three YouTube steps run in video-cycle.sh on the owner's Mac instead.
  # Original Vietnamese guides from the YouTube playlists in engine-state/youtube-playlists.json (captions and metadata only).
  # Before discovery: a burst of searches makes YouTube throttle the caption fetches that follow.
  [ -n "${ENGINE_ARGS:-}${SKIP_VIDEOS:-}" ] || pnpm engine videos --max-minutes "${VIDEO_MAX_MINUTES:-90}" || log "videos: failed"
  # Species and kit in guides written before that step existed (one transcript fetch each, stops when YouTube throttles).
  [ -n "${ENGINE_ARGS:-}${SKIP_VIDEOS:-}" ] || pnpm engine video-items --limit 20 || log "video-items: failed"
  # YouTube (skipped on targeted ENGINE_ARGS runs): new teaching playlists (searches + known channels, vetted by the model; skipped while ≥ 150 videos are queued).
  [ -n "${ENGINE_ARGS:-}${SKIP_VIDEOS:-}" ] || pnpm engine discover-videos || log "discover-videos: failed"
  # Temperament / fin-nipping / school size for new or changed species (tank-mates checker).
  pnpm engine traits --limit 200 || log "traits: failed (checker shows missing data)"
fi
if part photos; then
  # Photos the picker used to miss on pages with fewer than 3 (each source page re-read at most monthly).
  pnpm engine photos --limit 60 || log "photos: backfill failed"
fi
if part pages photos; then
  # No people in photos: drop any with a human face (before thumbs, so none are made for dropped photos).
  pnpm engine faces || log "faces: failed (unscreened photos may publish)"
fi
if part photos; then
  # Every page photo must show its species (a tankmate or a whole tank gets rejected); a typical photo leads the page.
  pnpm engine check-photos --limit "${PHOTO_CHECK_LIMIT:-40}" || log "check-photos: failed"
  # Photo galleries, a few species a cycle, popular species first (Commons + iNaturalist, open licences, screened, no faces).
  pnpm engine gallery --limit "${GALLERY_LIMIT:-8}" || log "gallery: failed"
fi
if part pages photos; then
  # Commons and iNaturalist photos (new galleries, new pages) copied to our bucket: their hosts set third-party cookies.
  pnpm engine mirror-photos --limit "${MIRROR_LIMIT:-200}" || log "mirror-photos: failed"
  # Card thumbs for photos stored before thumbs existed; a failure only means full-size photos on cards.
  pnpm engine thumbs || log "thumbs: some failed (cards fall back to full photos)"
fi
if part photos; then
  # Pictures report (docs/review/content-audit.md): pages without a photo, a card thumb, or pictures inside the text.
  pnpm engine audit || log "audit: failed"
fi
if part rewrite; then
  # Older Vietnamese rewritten in the site's style, a few pages a cycle, each kept only if the reviewer passes it.
  pnpm engine rewrite-vi --limit "${VI_REWRITE_LIMIT:-12}" || log "rewrite-vi: failed"
fi
if [ -z "$(git status --porcelain -- content sources)" ]; then
  # Only the engine's own records changed (pages tried, photo verdicts, pages kept as they were): keep them, or the next
  # cycle redoes that work. The site doesn't read them, so no build and no deploy.
  if [ -n "$(git status --porcelain -- engine-state docs/review)" ]; then
    git add engine-state docs/review && git commit -q -m "engine: $PART records $(date -u +%F)" && push || exit 1
  fi
  # Pages hidden or unhidden on the dashboard since the last deploy still need a build to leave (or rejoin) the lists.
  HIDDEN_JSON="$(curl -sf -H "authorization: Bearer $(cat "$HOME/.config/thuysinh/ab-dash-token")" https://aquatome.com/_ab/hidden.json || true)"
  HIDDEN_NOW="$(printf '%s' "$HIDDEN_JSON" | shasum | cut -c1-40)"
  if part pages && [ -n "$HIDDEN_JSON" ] && [ "$HIDDEN_NOW" != "$(cat "$HOME/.config/thuysinh/hidden-deployed" 2>/dev/null)" ]; then
    log "hidden pages changed — redeploying"; deploy; exit 0
  fi
  log "no content changes"; exit 0
fi
# Real content must build (the test suite builds fixtures), then the suite must pass.
if ! { pnpm build && pnpm test; } >/tmp/thuysinh-engine-test.log 2>&1; then
  log "build/tests failed, not publishing (see /tmp/thuysinh-engine-test.log)"; exit 1
fi
git add content sources engine-state docs/review
git commit -q -m "content: engine $PART $(date -u +%F)"
push || exit 1
deploy || log "deploy: could not start it (the next push or merge deploys this content too)"
log "cycle done"
