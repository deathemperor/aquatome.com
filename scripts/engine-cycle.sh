#!/usr/bin/env bash
# One content-engine cycle: sync → engine steps → build + test → commit + push → deploy.
# The steps come in four parts that GitHub runs as parallel jobs (engine.yml), each publishing its own work, so one
# failing part loses only its own: pages (new pages from every source but Seriously Fish, with their photos screened and
# stored), sf (the same for Seriously Fish, whose ~1,800-page backlog would otherwise take most of the pages job),
# photos (upkeep of the photos on every page), rewrite (older Vietnamese, and Indonesian and Thai species pages). No argument: all four, one after another.
# Runs from a dedicated clone (see install-engine-schedule.sh) so it never touches a development checkout.
set -euo pipefail
# The job's PATH first (GitHub Actions: setup-node's Node), then the owner's Mac tool dirs (launchd).
export PATH="${PATH:+$PATH:}$HOME/.local/bin:$HOME/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
log() { echo "$(date -u +%FT%TZ) $*"; }
PART="${1:-all}"
case "$PART" in all|pages|sf|photos|rewrite) ;; *) echo "usage: $0 [pages|sf|photos|rewrite]" >&2; exit 2 ;; esac
part() { [ "$PART" = all ] || [[ " $* " == *" $PART "* ]]; }
# A targeted run (ENGINE_ARGS, e.g. --sources seriouslyfish --limit 2) is the pages job's alone.
if [ "$PART" = sf ] && [ -n "${ENGINE_ARGS:-}" ]; then log "targeted run: the pages job does it"; exit 0; fi
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
# The parts all add to the photo caches and the run records in engine-state.
git config merge.jsonmap.driver 'node scripts/merge-json-map.mjs %O %A %B'
pnpm install --frozen-lockfile --silent
if part pages; then
  pnpm engine run --max-minutes "${ENGINE_MAX_MINUTES:-300}" ${ENGINE_ARGS:---except seriouslyfish}
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
if part sf && [ -z "${ENGINE_ARGS:-}" ]; then
  pnpm engine run --sources seriouslyfish --max-minutes "${ENGINE_MAX_MINUTES:-300}"
fi
if part photos; then
  # Photos the picker used to miss on pages with fewer than 3 (each source page re-read at most monthly).
  pnpm engine photos --limit 60 || log "photos: backfill failed"
  # Nonn Panitvong's FishBase photos (used with permission) on species pages made since the last cycle.
  pnpm engine fishbase-photos || log "fishbase-photos: failed"
fi
if part pages sf photos; then
  # No people in photos: drop any with a human face (before thumbs, so none are made for dropped photos).
  pnpm engine faces || log "faces: failed (unscreened photos may publish)"
fi
if part photos; then
  # Every page photo must show its species (a tankmate or a whole tank gets rejected); a typical photo leads the page.
  pnpm engine check-photos --limit "${PHOTO_CHECK_LIMIT:-40}" || log "check-photos: failed"
  # Photo galleries, a few species a cycle, popular species first (Commons + iNaturalist, open licences, screened, no faces).
  pnpm engine gallery --limit "${GALLERY_LIMIT:-16}" || log "gallery: failed"
  # Breed pages with no photo: a looser Commons search than the page step's (Unsplash below tries them too).
  pnpm engine breed-photos --limit 10 || log "breed-photos: failed"
  # Unsplash photos added to the galleries of the most-read fish (hot-linked and credited, per Unsplash's API terms).
  pnpm engine unsplash --limit "${UNSPLASH_LIMIT:-6}" || log "unsplash: failed"
fi
if part pages sf photos; then
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
  # Species pages in Indonesian and Thai, most-read first, from their English sources (and again when that English changes).
  for lang in id th; do pnpm engine localize --lang "$lang" --limit "${LOCALIZE_LIMIT:-20}" || log "localize $lang: failed"; done
  # Their other names gain the ones Wikidata gives (CC0), where no other page uses the name: pages made or remade this cycle too.
  for lang in id th; do pnpm engine wikidata-names --lang "$lang" || log "wikidata-names $lang: failed"; done
  for lang in vi id th; do pnpm engine shop-names --lang "$lang" || log "shop-names $lang: failed"; done
  # Plants, glossary terms, place names, AquaTome's own guides, breed pages, photo captions and buying guides in both: only what is new or whose source changed.
  for lang in id th; do
    pnpm engine localize --lang "$lang" --kind plants --limit "${LOCALIZE_PLANTS_LIMIT:-4}" || log "localize plants $lang: failed"
    pnpm engine localize-glossary --lang "$lang" || log "localize-glossary $lang: failed"
    pnpm engine localize-places --lang "$lang" || log "localize-places $lang: failed"
    pnpm engine localize-guides --lang "$lang" --limit "${LOCALIZE_GUIDES_LIMIT:-2}" || log "localize-guides $lang: failed"
    pnpm engine localize-breeds --lang "$lang" --limit "${LOCALIZE_BREEDS_LIMIT:-2}" || log "localize-breeds $lang: failed"
    pnpm engine localize-captions --lang "$lang" --limit "${LOCALIZE_CAPTIONS_LIMIT:-10}" || log "localize-captions $lang: failed"
    pnpm engine localize-equipment --lang "$lang" || log "localize-equipment $lang: failed"
  done
  # UI text those pages need that src/i18n lacks (a label no page used before): translated now, committed with the content.
  if I18N_MISSING_OUT=/tmp/aq-i18n-missing.json PUBLIC_BUILD=1 pnpm --filter site build >/dev/null 2>&1 \
    && node -e 'process.exit(Object.values(require("/tmp/aq-i18n-missing.json")).some(s => s.length) ? 0 : 1)'; then
    pnpm --filter @aq/engine exec tsx scripts/translate-ui.ts /tmp/aq-i18n-missing.json || log "translate-ui: failed"
  fi
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
# Real content must build (the test suite builds fixtures), then the suite must pass. I18N_LENIENT: a UI string a new
# Indonesian or Thai page needs and src/i18n lacks shows in Vietnamese (and is logged) instead of holding back the content.
if ! { I18N_LENIENT=1 pnpm build && pnpm test; } >/tmp/thuysinh-engine-test.log 2>&1; then
  log "build/tests failed, not publishing (see /tmp/thuysinh-engine-test.log)"; exit 1
fi
git add content sources engine-state docs/review apps/site/src/i18n
git commit -q -m "content: engine $PART $(date -u +%F)"
push || exit 1
deploy || log "deploy: could not start it (the next push or merge deploys this content too)"
log "cycle done"
