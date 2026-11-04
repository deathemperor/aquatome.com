#!/usr/bin/env bash
# One content-engine cycle: sync → engine steps → build + test → commit + push → deploy.
# The steps come in four parts that run side by side, each publishing its own work, so one failing part loses only its
# own: pages (new pages from every source but Seriously Fish, with their photos screened and
# stored), sf (the same for Seriously Fish, whose ~1,800-page backlog would otherwise take most of the pages job),
# photos (upkeep of the photos on every page), rewrite (older Vietnamese, and Indonesian and Thai species pages). No argument: all four, one after another.
# rewrite runs on GitHub (engine.yml). pages, sf and photos need macOS and run on the owner's Mac, each from its own clone
# (install-engine-schedule.sh), so they never touch a development checkout and GitHub's few macOS runners stay the iOS app's.
set -euo pipefail
# The job's PATH first (GitHub Actions: setup-node's Node), then the owner's Mac tool dirs (launchd).
export PATH="${PATH:+$PATH:}$HOME/.local/bin:$HOME/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
LAST=; FAILED=
log() { LAST="$*"; echo "$(date -u +%FT%TZ) $*"; }
PART="${1:-all}"
case "$PART" in all|pages|sf|photos|rewrite) ;; *) echo "usage: $0 [pages|sf|photos|rewrite]" >&2; exit 2 ;; esac
# One a part: the Mac runs three parts at once.
TEST_LOG="/tmp/aquatome-engine-test-$PART.log"
# The Mac's engine parts and video job share one machine, so their builds and test runs take turns: two suites at once
# slowed a 0.6 s test past vitest's 5 s and failed a cycle. GitHub runs one part a runner.
checks() { if [ -n "${GITHUB_ACTIONS:-}" ]; then bash -c "$1"; else lockf -k "$HOME/.cache/aquatome/checks.lock" bash -c "$1"; fi; }
part() { [ "$PART" = all ] || [[ " $* " == *" $PART "* ]]; }
# A targeted run (ENGINE_ARGS, e.g. --sources seriouslyfish --limit 2) is the pages job's alone.
if [ "$PART" = sf ] && [ -n "${ENGINE_ARGS:-}" ]; then log "targeted run: the pages job does it"; exit 0; fi
# A push deploys by itself: GitHub's over the engine's deploy key (engine.yml), the Mac's as the owner, each starting
# deploy.yml. deploy() is for the hidden-pages redeploy, when nothing was pushed: deploy.yml again, which builds main as
# it is then (this clone's tree can be hours behind the other parts' pushes).
deploy() { gh workflow run deploy.yml -R "${GITHUB_REPOSITORY:-deathemperor/aquatome.com}" --ref main; }
# Push this part's commit on top of whatever landed during the run (code, the other parts' content).
push() {
  for _ in 1 2 3; do
    if ! git pull -q --rebase; then
      log "another part changed the same files: $(git diff --name-only --diff-filter=U | tr '\n' ' ')"
      git rebase --abort 2>/dev/null || true
      # Its clashing lines give way to this part's (photo verdicts are re-applied every cycle); then build + test again.
      if git pull -q --rebase -X theirs; then
        checks 'pnpm build && pnpm test' >"$TEST_LOG" 2>&1 || { log "build/tests failed after that merge, not publishing"; return 1; }
      else
        git rebase --abort 2>/dev/null || true
      fi
    fi
    git push -q && return 0
    sleep 30
  done
  log "push failed three times"; return 1
}

# One job at a time in a clone (video-cycle.sh shares engine-repo's): a PID file, so a crashed or killed cycle doesn't
# block the schedule forever.
# Its process must still be a cycle script: the file outlives a restart, and its number can go to another process.
PIDFILE="$(git rev-parse --absolute-git-dir)/aquatome-engine.pid"
if [ -f "$PIDFILE" ] && ps -p "$(cat "$PIDFILE")" -o command= 2>/dev/null | grep -q 'cycle\.sh'; then log "previous cycle (pid $(cat "$PIDFILE")) still running"; exit 0; fi
echo $$ > "$PIDFILE"
# On the Mac, a failed cycle is reported on GitHub: engine-mac.yml fails, naming the step or the log line it stopped at.
trap 'FAILED="$BASH_COMMAND"' ERR
finish() {
  local status=$?
  rm -f "$PIDFILE"
  [ "$status" = 0 ] || [ -n "${GITHUB_ACTIONS:-}" ] || gh workflow run engine-mac.yml -R deathemperor/aquatome.com -f part="$PART" -f why="exit $status: ${FAILED:-$LAST}" || true
}
trap finish EXIT

TOKEN_FILE="$HOME/.config/aquatome/cf-token"
[ -s "$TOKEN_FILE" ] || { log "missing $TOKEN_FILE — not running"; exit 1; }
# Claude: the engine's accounts, one token a line as in GitHub's CLAUDE_CODE_OAUTH_TOKENS, not the owner's own login.
CLAUDE_TOKENS="$HOME/.config/aquatome/claude-oauth-tokens"
if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}${CLAUDE_CODE_OAUTH_TOKENS:-}" ] && [ -s "$CLAUDE_TOKENS" ]; then
  CLAUDE_CODE_OAUTH_TOKENS="$(cat "$CLAUDE_TOKENS")"; export CLAUDE_CODE_OAUTH_TOKENS
fi

# shellcheck disable=SC1091
[ -n "${CI:-}" ] || { . "$HOME/.nvm/nvm.sh" && nvm use --silent "$(cat .nvmrc)"; } # CI: setup-node
log "cycle start ($PART)"
if [ -n "${GITHUB_ACTIONS:-}" ] || [[ "$REPO" == "$HOME/.local/share/aquatome/"* ]]; then
  # A runner or one of the Mac's engine clones: start from GitHub's main, as a fresh runner does. What an earlier failed
  # cycle left here (content that failed its tests, a commit whose push failed) is dropped, and that work redone.
  [ -z "$(git status --porcelain -- content sources)" ] || log "dropping uncommitted content from an earlier failed cycle"
  git fetch -q origin && git checkout -q main && git reset -q --hard origin/main
  git clean -fdq -- content sources engine-state docs/review apps/site/src/i18n
else
  # Any other checkout: nothing in it is dropped.
  if [ -n "$(git status --porcelain -- content sources)" ]; then log "uncommitted content in this checkout: commit or drop it first"; exit 1; fi
  git checkout -q main && git pull -q --ff-only
fi
# content/changelog.json gets entries from here and from the Mac's video job (video-cycle.sh): merge, don't conflict.
git config merge.changelog.driver 'node scripts/merge-changelog.mjs %O %A %B'
# The parts all add to the photo caches and the run records in engine-state.
git config merge.jsonmap.driver 'node scripts/merge-json-map.mjs %O %A %B'
# Two parts can make the same new page (from Glaser and from Seriously Fish): merge it by source, not by whole file.
git config merge.entity.driver 'node scripts/merge-entity.mjs %O %A %B'
pnpm install --frozen-lockfile --silent
if part pages; then
  pnpm engine run --max-minutes "${ENGINE_MAX_MINUTES:-300}" ${ENGINE_ARGS:---except seriouslyfish}
  # Plants' other scientific names (sources' "previously named …", GBIF, a few hobby names): linked, checked, searched.
  pnpm engine plant-synonyms || log "plant-synonyms: failed"
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
  # "Tóm tắt nhanh" for new or changed species, most-read first: each checked against its page (numbers against the
  # data card, claims against the text) and shown if it passes, else listed in docs/review/summaries.md.
  pnpm engine summaries --top "${SUMMARY_LIMIT:-40}" --jobs 4 || log "summaries: failed (those pages show no summary yet)"
fi
if part sf && [ -z "${ENGINE_ARGS:-}" ]; then
  # Species pages whose data card lacks a figure (minimum tank, temperature, pH, hardness, size, difficulty), most-read
  # first: their Seriously Fish profiles, which give each figure and a tank as its base, read ahead of the backlog.
  # CARD_FILL_LIMIT pages a cycle. A figure no published source states stays empty (card-fill.ts).
  pnpm engine card-fill --sources seriouslyfish --limit "${CARD_FILL_LIMIT:-10}" || log "card-fill: failed"
  pnpm engine run --sources seriouslyfish --max-minutes "${ENGINE_MAX_MINUTES:-300}"
fi
if part photos; then
  # Photos the picker used to miss on pages with fewer than 3 (each source page re-read at most monthly).
  pnpm engine photos --limit 60 || log "photos: backfill failed"
  # Nonn Panitvong's FishBase and iNaturalist photos (used with permission) on species pages made since the last cycle.
  pnpm engine fishbase-photos || log "fishbase-photos: failed"
  # Jan D. Bastmeijer's own photos (used with permission) on Cryptocoryne pages that have none of his yet.
  pnpm engine crypts-photos || log "crypts-photos: failed"
fi
if part pages sf photos; then
  # No people in photos: drop any with a human face (before thumbs, so none are made for dropped photos).
  pnpm engine faces || log "faces: failed (unscreened photos may publish)"
fi
if part photos; then
  # Every photo on a species, plant or breed page and its gallery must show that subject (another fish, a map or a tank
  # gets removed; can't-tell is listed in docs/review/photo-subjects.md); a typical photo leads the page. Most-read pages
  # first, PHOTO_CHECK_LIMIT model calls a cycle; verdicts are cached per photo and page.
  pnpm engine check-photos --limit "${PHOTO_CHECK_LIMIT:-40}" || log "check-photos: failed"
  # Photo galleries topped up to each page's target (more for popular species: gallery-plan.ts), most popular first, fish
  # and plants: iNaturalist, then Commons, GBIF, Openverse; open licences, screened (right species, no faces). GALLERY_SHEETS
  # model calls a cycle (about 480 a day on the subscription); each page continues next cycle where this one stopped.
  pnpm engine gallery --sheets "${GALLERY_SHEETS:-60}" || log "gallery: failed"
  # Breed pages with no photo: a looser Commons search than the page step's (Unsplash below tries them too).
  pnpm engine breed-photos --limit 10 || log "breed-photos: failed"
  # Unsplash photos added to the galleries of the most-read fish (hot-linked and credited, per Unsplash's API terms).
  pnpm engine unsplash --limit "${UNSPLASH_LIMIT:-6}" || log "unsplash: failed"
fi
if part pages sf photos; then
  # Commons, iNaturalist, Flickr and GBIF photos (new gallery photos, new pages) copied to our bucket: their hosts set third-party cookies.
  pnpm engine mirror-photos --limit "${MIRROR_LIMIT:-200}" || log "mirror-photos: failed"
  # No watermarks (credits, dealer logos, site names): text on a photo is judged once by the model, a marked photo leaves
  # every page and stays blocked. After mirroring, so a gallery's Commons photo is screened under the URL pages use.
  pnpm engine watermarks --limit "${WATERMARK_LIMIT:-40}" || log "watermarks: failed (unscreened photos may publish)"
  # Card thumbs for photos stored before thumbs existed; a failure only means full-size photos on cards.
  pnpm engine thumbs || log "thumbs: some failed (cards fall back to full photos)"
  # Wikimedia photos credited before Commons' placeholder authors were tidied on import: "RuthJM", not its sentence.
  pnpm engine credits || log "credits: failed (some photos keep Commons' placeholder author)"
  # Lifespans the sources already state as a labelled line, on the data card ("Tuổi thọ"); never read from prose.
  pnpm engine lifespans || log "lifespans: failed"
  # The image hash of every new picture, so no page shows one picture twice from two files (a failure: compared by address).
  pnpm engine picture-hashes || log "picture-hashes: failed (new pictures compared by address only)"
fi
if part rewrite; then
  # Diễn Đàn Cá Cảnh's guide sections, read for orientation (notes on each thread, never its text), 5 s between requests:
  # leads for breed and guide research (forum.ts).
  pnpm engine forum --limit "${FORUM_LIMIT:-10}" --pages 3 || log "forum: failed"
  # Vietnamese shops' blogs, read for ideas a week apart (their posts' titles, never their text): the topics the
  # handbook has no guide on, most asked first (ideas.ts).
  pnpm engine ideas || log "ideas: failed"
  # Older Vietnamese rewritten in the site's style, a few pages a cycle, each kept only if the reviewer passes it.
  pnpm engine rewrite-vi --limit "${VI_REWRITE_LIMIT:-12}" || log "rewrite-vi: failed"
  # Guides keep to their title's subject (before localizing, so the copies follow): off-topic sections dropped.
  pnpm engine topic-check --limit "${TOPIC_CHECK_LIMIT:-40}" || log "topic-check: failed"
  # A reader's eye: the model reads READER_LIMIT pages as a reader would (not read yet first, then changed ones), against
  # a rubric; Vietnamese wording it flags is rewritten, reviewer-gated, READER_REWRITES parts at most; the rest goes to
  # docs/review/reader.md.
  pnpm engine reader --limit "${READER_LIMIT:-20}" --rewrites "${READER_REWRITES:-3}" || log "reader: failed"
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
  # AquaTome's own guides on the most asked ideas, IDEAS_PER_DAY a day, last: each is a full research run (up to ~25
  # min), so only with an hour and a half left of the job's 355 minutes (a rewrite job has taken 266).
  if [ "$SECONDS" -lt $(( ${IDEAS_BEFORE_MINUTES:-260} * 60 )) ]; then
    pnpm engine write-ideas --limit "${IDEAS_PER_DAY:-2}" || log "write-ideas: failed"
  else
    log "write-ideas: skipped, the cycle has run $(( SECONDS / 60 )) min"
  fi
  # UI text those pages need that src/i18n lacks (a label no page used before): translated now, committed with the content.
  if I18N_MISSING_OUT=/tmp/aq-i18n-missing.json PUBLIC_BUILD=1 pnpm --filter site build >/dev/null 2>&1 \
    && node -e 'process.exit(Object.values(require("/tmp/aq-i18n-missing.json")).some(s => s.length) ? 0 : 1)'; then
    pnpm --filter @aq/engine exec tsx scripts/translate-ui.ts /tmp/aq-i18n-missing.json || log "translate-ui: failed"
  fi
fi
# Fish, plant, breed and guide pages in metric only (°C, cm, litres): a °F, inch or gallon figure a writer left (the tests fail on one).
pnpm engine metric || log "metric: failed"
# The content rules' safe fixes on every page (sweep.ts; the tests fail on a page left with one): the source site's
# comments and related posts cut, empty headings, repeated paragraphs and labels out of order fixed, photos of another
# fish or a map taken off their page, card figures out of bounds hidden, titles promising a count their text lacks
# rewritten (reviewer-gated) or their number dropped.
pnpm engine sweep || log "sweep: failed"
if part photos; then
  # Reports, nothing hidden: pictures (docs/review/content-audit.md: pages without a photo, a card thumb, or pictures
  # inside the text) and every published page, in each language, against the content rules (docs/review/content-rules.md).
  pnpm engine audit || log "audit: failed"
fi
if [ -z "$(git status --porcelain -- content sources)" ]; then
  # Only the engine's own records changed (pages tried, photo verdicts, pages kept as they were): keep them, or the next
  # cycle redoes that work. The site doesn't read them, so no build and no deploy.
  if [ -n "$(git status --porcelain -- engine-state docs/review)" ]; then
    git add engine-state docs/review && git commit -q -m "engine: $PART records $(date -u +%F)" && push || exit 1
  fi
  # Pages hidden or unhidden on the dashboard since the last deploy still need a build to leave (or rejoin) the lists.
  HIDDEN_JSON="$(curl -sf -H "authorization: Bearer $(cat "$HOME/.config/aquatome/ab-dash-token")" https://aquatome.com/_ab/hidden.json || true)"
  HIDDEN_NOW="$(printf '%s' "$HIDDEN_JSON" | shasum | cut -c1-40)"
  if part pages && [ -n "$HIDDEN_JSON" ] && [ "$HIDDEN_NOW" != "$(cat "$HOME/.config/aquatome/hidden-deployed" 2>/dev/null)" ]; then
    # Recorded here, as deploy.yml's runner keeps its own record.
    log "hidden pages changed — redeploying"; deploy; printf '%s\n' "$HIDDEN_NOW" > "$HOME/.config/aquatome/hidden-deployed"; exit 0
  fi
  log "no content changes"; exit 0
fi
# Real content must build (the test suite builds fixtures), then the suite must pass. I18N_LENIENT: a UI string a new
# Indonesian or Thai page needs and src/i18n lacks shows in Vietnamese (and is logged) instead of holding back the content.
if ! checks 'I18N_LENIENT=1 pnpm build && pnpm test' >"$TEST_LOG" 2>&1; then
  log "build/tests failed, not publishing (see $TEST_LOG)"; exit 1
fi
git add content sources engine-state docs/review apps/site/src/i18n
git commit -q -m "content: engine $PART $(date -u +%F)"
push || exit 1
log "cycle done"
