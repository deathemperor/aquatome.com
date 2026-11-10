#!/usr/bin/env bash
# One content-engine cycle: sync → engine steps → build + test → commit + push → deploy.
# The steps come in four parts that run side by side, each publishing its own work, so one failing part loses only its
# own: pages (new pages from every source but Seriously Fish, with their photos screened and
# stored), sf (the same for Seriously Fish, whose ~1,800-page backlog would otherwise take most of the pages job),
# photos (upkeep of the photos on every page), rewrite (older Vietnamese, and pages in the other languages). No argument: all four, one after another.
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
# calm, checks and verify: the build and tests before publishing, on a Mac other jobs share.
source "$REPO/scripts/cycle-checks.sh"
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
      local clash; clash=$(git diff --name-only --diff-filter=U | tr '\n' ' ')
      log "another part changed the same files: $clash"
      git rebase --abort 2>/dev/null || true
      # Its clashing lines give way to this part's (photo verdicts are re-applied every cycle); then checked again
      # (verify_cycle: the tests).
      if git pull -q --rebase -X theirs; then
        replan_merged "$clash"
        sweep_merged
        verify_cycle || { keep_unpublished "$PART"; log "build/tests failed after that merge, not publishing"; return 1; }
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
# Not this run's own number: from_main starts it again as the same process.
if [ -f "$PIDFILE" ] && [ "$(cat "$PIDFILE")" != $$ ] && ps -p "$(cat "$PIDFILE")" -o command= 2>/dev/null | grep -q 'cycle\.sh'; then log "previous cycle (pid $(cat "$PIDFILE")) still running"; exit 0; fi
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
# A line a model call: its cost, tokens and the account it went to (claude.ts), so a week's use can be split by job. On
# GitHub the run keeps it as an artifact (engine.yml).
if [ -n "${GITHUB_ACTIONS:-}" ]; then COST_DIR=/tmp; else COST_DIR="$HOME/Library/Logs"; fi
export ENGINE_COST_LOG="${ENGINE_COST_LOG:-$COST_DIR/aquatome-cost-$PART.jsonl}"

# shellcheck disable=SC1091
[ -n "${CI:-}" ] || { . "$HOME/.nvm/nvm.sh" && nvm use --silent "$(cat .nvmrc)"; } # CI: setup-node
log "cycle start ($PART)"
if [ -n "${GITHUB_ACTIONS:-}" ] || [[ "$REPO" == "$HOME/.local/share/aquatome/"* ]]; then
  # A runner or one of the Mac's engine clones: start from GitHub's main, as a fresh runner does. What an earlier failed
  # cycle left here (content that failed its tests, a commit whose push failed) is dropped, and that work redone, but
  # for the work of a cycle whose tests ran out of time, kept on a branch and published first (publish_kept).
  [ -z "$(git status --porcelain -- content sources)" ] || log "dropping uncommitted content from an earlier failed cycle"
  from_main "$@"
  git clean -fdq -- content sources engine-state docs/review apps/site/src/i18n
else
  # Any other checkout: nothing in it is dropped.
  if [ -n "$(git status --porcelain -- content sources)" ]; then log "uncommitted content in this checkout: commit or drop it first"; exit 1; fi
  git checkout -q main && git pull -q --ff-only
fi
cool
# content/changelog.json gets entries from here and from the Mac's video job (video-cycle.sh): merge, don't conflict.
git config merge.changelog.driver 'node scripts/merge-changelog.mjs %O %A %B'
# The parts all add to the photo caches and the run records in engine-state.
git config merge.jsonmap.driver 'node scripts/merge-json-map.mjs %O %A %B'
# Two parts can make the same new page (from Glaser and from Seriously Fish): merge it by source, not by whole file.
git config merge.entity.driver 'node scripts/merge-entity.mjs %O %A %B'
pnpm install --frozen-lockfile --silent
publish_kept "$PART"
if part pages; then
  pnpm engine run --max-minutes "${ENGINE_MAX_MINUTES:-300}" ${ENGINE_ARGS:---except seriouslyfish}
  # Plants' other scientific names (sources' "previously named …", GBIF, a few hobby names): linked, checked, searched.
  pnpm engine plant-synonyms || log "plant-synonyms: failed"
  # What YouTube reviews found, on PRODUCT_REVIEW_LIMIT product pages a cycle (candidates: product-reviews.ts): a vet, an
  # extraction a review and a writing call, on top of a research call and a page for a product with none. So only with time
  # left for that. Not behind SKIP_VIDEOS, which the Mac's parts set for video-cycle.sh's bursts: this is a few requests and
  # would never run; it stops when YouTube throttles, marking nothing failed.
  if [ -z "${ENGINE_ARGS:-}" ]; then
    NEW_PAGES=; [ "$SECONDS" -lt $(( ${PRODUCT_PAGES_BEFORE_MINUTES:-170} * 60 )) ] || NEW_PAGES=--no-new-pages
    YT_COOKIES_FROM="$(cat "$HOME/.config/aquatome/yt-cookies-from" 2>/dev/null || true)" pnpm engine product-reviews --limit "${PRODUCT_REVIEW_LIMIT:-1}" $NEW_PAGES || log "product-reviews: failed"
  fi
  # SKIP_VIDEOS (GitHub Actions): the three YouTube steps run in video-cycle.sh on the owner's Mac instead.
  # Original Vietnamese guides from the YouTube playlists in engine-state/youtube-playlists.json (captions and metadata only).
  # Before discovery: a burst of searches makes YouTube throttle the caption fetches that follow.
  [ -n "${ENGINE_ARGS:-}${SKIP_VIDEOS:-}" ] || pnpm engine videos --max-minutes "${VIDEO_MAX_MINUTES:-90}" || log "videos: failed"
  # Species and kit in guides written before that step existed (one transcript fetch each, stops when YouTube throttles).
  [ -n "${ENGINE_ARGS:-}${SKIP_VIDEOS:-}" ] || pnpm engine video-items --limit 20 || log "video-items: failed"
  # YouTube (skipped on targeted ENGINE_ARGS runs): new teaching playlists (searches + known channels, vetted by the model; skipped while ≥ 150 videos are queued).
  [ -n "${ENGINE_ARGS:-}${SKIP_VIDEOS:-}" ] || pnpm engine discover-videos || log "discover-videos: failed"
  # Temperament / fin-nipping / school size for new or changed species (tank-mates checker), then a field read with an
  # older rule in the prompt (traits.ts dueFields): the school rule of 2026-11-07 re-reads ~470 school sizes, 200 a cycle.
  pnpm engine traits --limit 200 || log "traits: failed (checker shows missing data)"
  # "Tóm tắt nhanh" for new or changed species, most-read first: each checked against its page (numbers against the
  # data card, claims against the text) and shown if it passes, else listed in docs/review/summaries.md. 150 a cycle (was
  # 40) while the ~690 summaries sent back by Seriously Fish's difficulty fix (2026-11-07) are written again: a ceiling,
  # so once they're done a cycle writes only the pages that changed. Back to 40 if the cycles run too long.
  pnpm engine summaries --top "${SUMMARY_LIMIT:-150}" --jobs 4 || log "summaries: failed (those pages show no summary yet)"
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
  # Tropica's own photos of its plants (used with permission), never its drawings, on plant pages that have none of its
  # yet: 60 pages a cycle at five seconds a request, so its 152 pages take three cycles.
  pnpm engine tropica-photos --limit 60 || log "tropica-photos: failed"
fi
if part pages sf photos; then
  # No people in photos: drop any with a human face (before thumbs, so none are made for dropped photos).
  pnpm engine faces || log "faces: failed (unscreened photos may publish)"
fi
if part photos; then
  # Every photo on a species, plant or breed page and its gallery must show that subject (another fish, a map, a tank or a
  # landscape with no fish gets removed; can't-tell is listed in docs/review/photo-subjects.md); a typical photo leads the
  # page. Most-read pages first, PHOTO_CHECK_LIMIT model calls a cycle; verdicts are cached per photo and page.
  # Dead fish, fish as food (a market, a catch, a preserved specimen), a person or a hand, and a logo take a photo off every
  # page. Verdicts from before the check asked about people (2026-11-07) are asked again in the same queue (about 1,000
  # sheets on top of the 1,400 not judged yet: some 5 days with the video job's 20). recheck-photos takes first, once, those
  # whose notes say a dead fish, a hand or a person, or whose verdict was the old "habitat"; then it finds none.
  pnpm engine recheck-photos --limit "${PHOTO_RECHECK_LIMIT:-40}" || log "recheck-photos: failed"
  # The check's order since 2026-11-11 (photo-check.ts `turn`): the photos readers see now first, Flickr's and Commons'
  # before the rest, then the photos that wait. PHOTO_CHECK_FILL of the cycle's sheets go before all of them to a permitted
  # source's photos that fill a page with none: 35 this once, for Tropica's on the 51 plant pages with no photo (a sheet a
  # page, so two cycles; the chief of staff, 2026-11-10). The standing share replaces it with the sized plan of 11 Nov.
  pnpm engine check-photos --limit "${PHOTO_CHECK_LIMIT:-40}" --fill "${PHOTO_CHECK_FILL:-35}" || log "check-photos: failed"
  # No people or logos in guides' and equipment guides' photos, which the check above doesn't see, and no people or marks
  # on video guides' stills (guide-photos.ts): GUIDE_PHOTOS_LIMIT model calls of 6 photos a cycle, leads first, then
  # stills, which show only once judged, each judged once. On 2026-11-07: 2,560 photos, about 430 calls, a day and a half with the video job's 20; then
  # 3,868 stills, about 645 calls, each judged once video-stills has made it the video's own frame (about 140 calls a day
  # as it goes, so all judged in about 5 days).
  pnpm engine guide-photos --limit "${GUIDE_PHOTOS_LIMIT:-20}" || log "guide-photos: failed"
  # A head too small for the card whose source holds a larger original gets a copy large enough (large-photos.ts): the
  # same picture larger, so what leads doesn't change. Before lead-photos, so a head it lifts isn't replaced.
  pnpm engine large-photos --heads --limit "${LARGE_HEADS_LIMIT:-20}" || log "large-photos: failed"
  # The head photo of the fish on the coming days, which their cards show (lead-photo.ts), before curate reads it.
  pnpm engine lead-photos --calendar --limit "${LEAD_PHOTOS_LIMIT:-10}" || log "lead-photos: failed"
  # Photo galleries topped up to each page's target (more for popular species: gallery-plan.ts), most popular first, fish
  # and plants: iNaturalist, then Commons, GBIF, Openverse; bred fish by their English names on Commons and Openverse;
  # open licences, screened (right species or line, no faces). GALLERY_SHEETS model calls a cycle (about 480 a day on
  # the subscription); each page continues next cycle where this one stopped.
  pnpm engine gallery --sheets "${GALLERY_SHEETS:-60}" || log "gallery: failed"
  # Breed pages with no photo: a looser Commons search than the page step's (Unsplash below tries them too).
  pnpm engine breed-photos --limit 10 || log "breed-photos: failed"
  # Unsplash photos added to the galleries of the most-read fish (hot-linked and credited, per Unsplash's API terms). First
  # it links each stored photo's credit to its photographer's page, a request a photo, as many as the hour allows.
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
  # Where each species lives in the wild (range.ts): the countries and regions its sources name, each country with the
  # source's sentence (engine-state/range/), RANGE_LIMIT model calls a cycle for species whose sources' text is new or
  # changed; then its wild records on GBIF (open licences only), RANGE_RECORDS species a cycle, each again monthly.
  # 60 a cycle (a Sonnet call each, about 12 GBIF requests each): the 1,458 species' maps in about 3 days, not 9
  # (owner, 2026-11-06: the maps weren't showing on the web yet; 60 had them).
  pnpm engine range --limit "${RANGE_LIMIT:-60}" --records "${RANGE_RECORDS:-60}" || log "range: failed"
  # Whether each species is kept in brackish or sea water (water.ts), from a quoted sentence of its sources: WATER_LIMIT
  # model calls a cycle, only for species whose sources' text is new or changed and mentions salt or the sea.
  pnpm engine water --limit "${WATER_LIMIT:-60}" || log "water: failed"
  # A bred fish's difficulty and lifespan from its own sources (breeds.ts breedCare): a breed whose card lacks either
  # (one written by older code, or whose research found neither) gets one research call, once. No call once all are tried.
  pnpm engine breed-care --limit "${BREED_CARE_LIMIT:-2}" || log "breed-care: failed"
  # Plant pages that say nothing on where the plant goes or how to plant it get a short part on it, written from the page
  # and the video guides that cover it, kept only when its reviewer passes it; PLANTING_LIMIT plants a cycle, each once.
  # Before localizing, so the plant's Indonesian and Thai pages follow.
  pnpm engine planting --limit "${PLANTING_LIMIT:-4}" || log "planting: failed"
  # Pages under the bar whose review left no notes (written before reviews were kept, engine-state/reviews/), reviewed
  # again as they are, nothing rewritten: REVIEW_BACKFILL_LIMIT model calls a kind (video guides: video-cycle.sh). Before
  # rewrite-vi, which starts a page from its last review's notes.
  pnpm engine review-backfill --kind translation,localize,places --limit "${REVIEW_BACKFILL_LIMIT:-10}" || log "review-backfill: failed"
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
  # Rivers and regions under the names Vietnamese readers use, before the other languages name them.
  pnpm engine name-places-vi || log "name-places-vi: failed"
  # Plants, glossary terms, place names, AquaTome's own guides, breed pages, photo captions, buying guides and the app's
  # short cards in both: only what is new or whose source changed.
  for lang in id th; do
    pnpm engine localize --lang "$lang" --kind plants --limit "${LOCALIZE_PLANTS_LIMIT:-4}" || log "localize plants $lang: failed"
    pnpm engine localize-glossary --lang "$lang" || log "localize-glossary $lang: failed"
    pnpm engine localize-places --lang "$lang" || log "localize-places $lang: failed"
    pnpm engine localize-guides --lang "$lang" --limit "${LOCALIZE_GUIDES_LIMIT:-2}" || log "localize-guides $lang: failed"
    pnpm engine localize-breeds --lang "$lang" --limit "${LOCALIZE_BREEDS_LIMIT:-2}" || log "localize-breeds $lang: failed"
    pnpm engine localize-captions --lang "$lang" --limit "${LOCALIZE_CAPTIONS_LIMIT:-10}" || log "localize-captions $lang: failed"
    pnpm engine localize-equipment --lang "$lang" || log "localize-equipment $lang: failed"
    pnpm engine localize-cards --lang "$lang" || log "localize-cards $lang: failed"
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
  # Languages the site doesn't serve yet (the language table's `served: false`): their pages, written ahead of going live;
  # and Malay, served since its UI text was complete, still at a new language's pace (10 species a cycle) here, its new UI
  # strings now asked for by the build above.
  # After everything readers see, and each step starts only while the cycle has run under AHEAD_BEFORE_MINUTES: they give
  # first when a cycle runs long. A cycle starts every 3 hours and took 91-135 min in November 2026, so 135 leaves the
  # longest step here (10 species, about 20 min) and the build, tests and push (about 6) inside the 170 min the next cycle
  # waits for. They add about 40 min a cycle.
  ahead() {
    if [ "$SECONDS" -lt $(( ${AHEAD_BEFORE_MINUTES:-135} * 60 )) ]; then "$@" || log "$*: failed"
    else log "$*: skipped, the cycle has run $(( SECONDS / 60 )) min"; fi
  }
  # Their UI text first: a language goes live only once it has every string (the build fails on a missing key), and no
  # build asks for it, so the strings the served languages have, 500 a cycle (60 a model call, a few minutes). Last in
  # this block, cycles past AHEAD_BEFORE_MINUTES skipped it from 2026-11-06 23:19 on, with Malay at 360 of 1,298.
  ahead pnpm --filter @aq/engine exec tsx scripts/translate-ui.ts --unserved --limit "${UI_AHEAD_LIMIT:-500}"
  for lang in ms; do
    # Most-read first. The rest at the others' pace; the first run's glossary (59 terms) and places (757, in 8 batches) are
    # once only and short enough to go whole, but the buying guides take minutes each.
    ahead pnpm engine localize --lang "$lang" --limit "${LOCALIZE_AHEAD_LIMIT:-10}"
    ahead pnpm engine wikidata-names --lang "$lang"
    ahead pnpm engine shop-names --lang "$lang"
    ahead pnpm engine localize --lang "$lang" --kind plants --limit "${LOCALIZE_PLANTS_LIMIT:-4}"
    ahead pnpm engine localize-glossary --lang "$lang"
    ahead pnpm engine localize-places --lang "$lang"
    ahead pnpm engine localize-guides --lang "$lang" --limit "${LOCALIZE_GUIDES_LIMIT:-2}"
    ahead pnpm engine localize-breeds --lang "$lang" --limit "${LOCALIZE_BREEDS_LIMIT:-2}"
    ahead pnpm engine localize-captions --lang "$lang" --limit "${LOCALIZE_CAPTIONS_LIMIT:-10}"
    ahead pnpm engine localize-equipment --lang "$lang" --limit "${LOCALIZE_EQUIPMENT_AHEAD_LIMIT:-2}"
    ahead pnpm engine localize-cards --lang "$lang"
  done
fi
# Fish, plant, breed and guide pages in metric only (°C, cm, litres): a °F, inch or gallon figure a writer left (the tests fail on one).
pnpm engine metric || log "metric: failed"
# The content rules' safe fixes on every page (sweep.ts; the tests fail on a page left with one): the source site's
# comments and related posts cut, empty headings, repeated paragraphs and labels out of order fixed, photos of another
# fish or a map taken off their page, card figures out of bounds hidden, titles promising a count their text lacks
# rewritten (reviewer-gated) or their number dropped.
pnpm engine sweep || log "sweep: failed"
# Last of the steps that write pages: what this run changed is read against the reader-fit checklist (gate.ts). A new page
# that fails is held, a live page that got worse keeps its committed text, a page built on a foreign shop's kit is held,
# and a held page that now passes is let out. A page it can't read stays as readers have it; only a crash stops the run,
# and keeps its work on a branch (gate_or_keep).
gate_or_keep "content: engine $PART" content sources engine-state docs/review apps/site/src/i18n || exit 1
if part photos; then
  # Reports, nothing hidden: pictures (docs/review/content-audit.md: pages without a photo, a card thumb, or pictures
  # inside the text) and every published page, in each language, against the content rules (docs/review/content-rules.md).
  pnpm engine audit || log "audit: failed"
  # What the quality reviews found (engine-state/reviews/): pages under the bar and their most common faults, per kind
  # (docs/review/reviews.md), what prompt fixes start from.
  pnpm engine reviews || log "reviews: failed"
  # The app's Hôm nay and Khám phá calendar (content/curation.json, docs/curation.md), from this cycle's photo verdicts:
  # the next 21 days filled and any pick that stopped passing replaced. No model calls; a run changes the file only when
  # a new Vietnamese day comes in or a pick fails, so about once a day.
  pnpm engine curate || log "curate: failed"
fi
if [ -z "$(git status --porcelain -- content sources apps/site/src/i18n)" ]; then
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
git add content sources engine-state docs/review apps/site/src/i18n
git commit -q -m "content: engine $PART $(date -u +%F)"
# Checked on top of main as it is now (catch_up), not as it was when the cycle started hours ago: the suite must pass
# (verify_cycle; deploy.yml builds the real site before it goes live). A commit that fails twice is held, unpublished,
# unless its tests only ran out of time: then it's kept, and the next cycle publishes it first (keep_unpublished).
catch_up
sweep_merged
if ! verify_cycle; then
  keep_unpublished "$PART"
  log "build/tests failed, not publishing (see $TEST_LOG)"; exit 1
fi
push || exit 1
log "cycle done"
