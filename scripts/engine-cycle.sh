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
  local main
  for _ in 1 2 3; do
    main=$(git rev-parse '@{u}' 2>/dev/null || true)
    if ! net git pull -q --rebase; then
      local clash; clash=$(git diff --name-only --diff-filter=U | tr '\n' ' ')
      log "another part changed the same files: $clash"
      git rebase --abort 2>/dev/null || true
      # Its clashing lines give way to this part's (photo verdicts are re-applied every cycle); then checked again
      # (verify_cycle: the tests).
      if net git pull -q --rebase -X theirs; then
        replan_merged "$clash"
        sweep_merged
        verify_cycle || { keep_unpublished "$PART"; log "build/tests failed after that merge, not publishing"; return 1; }
      else
        git rebase --abort 2>/dev/null || true
      fi
    elif ! swept_pull "$main"; then
      verify_cycle || { keep_unpublished "$PART"; log "build/tests failed after the sweep on main's changes, not publishing"; return 1; }
    fi
    net git push -q && return 0
    sleep 30
  done
  log "push failed three times"; keep_lost_push "$PART"; return 1
}

# One job at a time in a clone (video-cycle.sh shares engine-repo's): a PID file, so a crashed or killed cycle doesn't
# block the schedule forever.
# Its process must still be a cycle script: the file outlives a restart, and its number can go to another process.
PIDFILE="$(git rev-parse --absolute-git-dir)/aquatome-engine.pid"
# Not this run's own number: from_main starts it again as the same process.
# How long ago the part's cycle last wrote a line of its own to its log (not these notices). Hours means it's hung, not
# working: on 12 Nov 2026 a fetch begun as the Mac fell asleep never ended.
quiet_for() {
  local line at
  line=$(grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z ' "$HOME/Library/Logs/aquatome-engine-$PART.log" 2>/dev/null | grep -v -E '^[^ ]+ (stuck:|past its hours:|previous cycle)' | tail -1)
  [ -n "$line" ] || return 0
  at=$(date -j -u -f %Y-%m-%dT%H:%M:%SZ "${line%% *}" +%s 2>/dev/null || date -u -d "${line%% *}" +%s 2>/dev/null) || return 0
  echo $(( $(date +%s) - at ))
}
if [ -f "$PIDFILE" ] && [ "$(cat "$PIDFILE")" != $$ ] && ps -p "$(cat "$PIDFILE")" -o command= 2>/dev/null | grep -q 'cycle\.sh'; then
  quiet=$(quiet_for)
  if [ "${quiet:-0}" -ge 7200 ]; then log "previous cycle (pid $(cat "$PIDFILE")) still running, its last line $((quiet / 3600)) h $((quiet % 3600 / 60)) min ago: likely hung, and nothing here stops it"
  else log "previous cycle (pid $(cat "$PIDFILE")) still running"; fi
  exit 0
fi
echo $$ > "$PIDFILE"
# How long the Mac had slept when the cycle began, kept across from_main's start again.
[ -n "${AQ_ASLEEP0:-}" ] || { read -r _ AQ_ASLEEP0 < <(clock); export AQ_ASLEEP0; }
# On the Mac, a failed cycle is reported on GitHub: engine-mac.yml fails, naming the step or the log line it stopped at.
trap 'FAILED="$BASH_COMMAND"' ERR
finish() {
  local status=$? now
  rm -f "$PIDFILE"
  # A fault the run went on past (FAULT, cycle-checks.sh: kept work its photo records held back) fails the run when it
  # ends, so it's reported as any failed run is: engine-mac.yml on the Mac, the run itself on GitHub.
  [ "$status" != 0 ] || [ -z "${FAULT:-}" ] || { status=1; FAILED="$FAULT"; }
  [ "$status" = 0 ] || [ -n "${GITHUB_ACTIONS:-}" ] || gh workflow run engine-mac.yml -R deathemperor/aquatome.com -f part="$PART" -f why="exit $status: ${FAILED:-$LAST}" || true
  # A night the lid was shut shows in the cycle's last line (12 to 13 Nov 2026: asleep from 22:36, waking 45 s every 15 min).
  read -r _ now < <(clock)
  [ $((now - ${AQ_ASLEEP0:-$now})) -lt 60 ] || log "the Mac slept $(((now - AQ_ASLEEP0) / 60)) min during this cycle"
  exit "$status"
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
  # cycle left here (content that failed its tests) is dropped, and that work redone, but for the work of a cycle whose
  # tests ran out of time or whose push lost three times, kept on a branch and published first (publish_kept).
  [ -z "$(git status --porcelain -- content sources)" ] || log "dropping uncommitted content from an earlier failed cycle"
  from_main "$@"
  git clean -fdq -- content sources engine-state docs/review apps/site/src/i18n
else
  # Any other checkout: nothing in it is dropped.
  if [ -n "$(git status --porcelain -- content sources)" ]; then log "uncommitted content in this checkout: commit or drop it first"; exit 1; fi
  git checkout -q main && net git pull -q --ff-only
fi
# content/changelog.json gets entries from here and from the Mac's video job (video-cycle.sh): merge, don't conflict.
git config merge.changelog.driver 'node scripts/merge-changelog.mjs %O %A %B'
# The parts all add to the photo caches and the run records in engine-state.
git config merge.jsonmap.driver 'node scripts/merge-json-map.mjs %O %A %B'
# Each run rewrites the fit reports, so keep the current side when they clash.
git config merge.regenerated.driver true
# Two parts can make the same new page (from Glaser and from Seriously Fish): merge it by source, not by whole file.
git config merge.entity.driver 'node scripts/merge-entity.mjs %O %A %B'
pnpm install --frozen-lockfile --silent
publish_kept "$PART"
# 11 Nov 2026: the accounts' usage limit stopped the gate reading pages two cycles had changed, so it put the readers'
# text back, and the writers' records still say those pages were done. Put the records back before a step writes a page.
pnpm engine redo-unread || log "redo-unread: failed"
if part pages; then
  pnpm engine run --max-minutes "${ENGINE_MAX_MINUTES:-300}" ${ENGINE_ARGS:---except seriouslyfish}
  # Plants' other scientific names (sources' "previously named …", GBIF, a few hobby names): linked, checked, searched.
  pnpm engine plant-synonyms || log "plant-synonyms: failed"
  # Fish's older scientific names from GBIF (fish-synonyms.ts), 300 a cycle, each asked once: Commons files some fish under them.
  pnpm engine fish-synonyms --limit "${FISH_SYNONYMS_LIMIT:-300}" || log "fish-synonyms: failed"
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
# The wait for a cooler Mac (cool) comes here, after the writing, not at the start (the chief of staff, 14 Nov). Before it:
# kept and held work published (a build, the tests and a push, no writing) and the steps that write, whose model calls and
# fetches are the network's, not this Mac's. After it: the Mac's own work on photos, the gate and the checks. On 13 Nov
# the 18:10 run sat in the wait until 20:16 before it did anything.
cool
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
  # The check's order since 2026-11-10 (photo-check.ts `turn`): the photos readers see now first, Flickr's and Commons'
  # before the rest, then the photos that wait. PHOTO_CHECK_FILL of the cycle's sheets go before all of them to a permitted
  # source's photos that fill a page with none: 35, for Tropica's on the 51 plant pages with no photo (a sheet a page, so
  # two cycles; the chief of staff, 2026-11-10: this once). With none left to fill, those sheets go in the usual order. A
  # standing share is to replace the 35.
  pnpm engine check-photos --limit "${PHOTO_CHECK_LIMIT:-40}" --fill "${PHOTO_CHECK_FILL:-35}" || log "check-photos: failed"
  # Independent switches in schema/image-policy.ts are all off until the owner's activation. This step first recovers
  # eligible real photos, then re-reads empty pages before any generation. Originals and quota ledger stay private.
  pnpm engine images --limit 1 || log "images: candidates remain private"
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
  # Each album photo asked once: a photo tank or a ruler, the whole fish in the frame, the fish filling a small part of it
  # (album-ask.ts), which the album order reads. ALBUM_ASK_SHEETS model calls a cycle, under its own $2 a day: 513 sheets
  # on 14 Nov, about five days.
  pnpm engine album-ask --sheets "${ALBUM_ASK_SHEETS:-20}" || log "album-ask: failed"
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
  pnpm engine watermarks --limit "${WATERMARK_LIMIT:-40}" || log "watermarks: failed (the photos it has not judged wait, unshown: packages/schema/src/photo-screen.ts)"
  # Where the fish is in each fish and breed photo (photo-boxes.ts: macOS Vision, no model call), heads first, each photo
  # once: what keeps a tile, a banner or a card from cutting the fish. After mirroring, so it reads the addresses pages use.
  # The photos part alone, or each part would box the same photos: the others' new photos wait for its next run, as
  # nothing waits on a box. 400 a run: the albums were boxed by 12 Nov (2,000 a run until then, the chief of staff,
  # 2026-11-12), and a run now boxes only the photos new since the last.
  if part photos; then pnpm engine photo-boxes --limit "${PHOTO_BOXES_LIMIT:-400}" || log "photo-boxes: failed (new photos carry no box: drawn as today)"; fi
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
  # First in this part, then every translation, then the rest (chief of staff, 2026-11-11: the rewrites and translations
  # go before any other step spends, so a sign-in that runs out part way, or a ceiling, takes the steps after them).
  # Older Vietnamese rewritten in the site's style, a few pages a cycle, each kept only if the reviewer passes it.
  # --first: the seven rewrites 11 Nov's outage lost, which redo-unread makes due again (the chief of staff, 11 Nov: they
  # go first). A page done is passed over, so the list does nothing once they are; it can go then.
  pnpm engine rewrite-vi --limit "${VI_REWRITE_LIMIT:-12}" --first species/biotodoma-cupido,species/dicrossus-filamentosus,species/distichodus-affinis,species/exostoma-labiatum,species/farlowella-oxyrryncha,species/fossorochromis-rostratus,species/garra-rufa || log "rewrite-vi: failed"
  # Species pages in Indonesian and Thai, most-read first, from their English sources (and again when that English changes).
  for lang in id th; do pnpm engine localize --lang "$lang" --limit "${LOCALIZE_LIMIT:-20}" || log "localize $lang: failed"; done
  # Malay's ten species right after them, outside the time gate below (the chief of staff, 2026-11-11: Malay's ten are
  # not skipped). Indonesian and Thai species take about an hour, so a gated block after them started at 94-123 minutes
  # on 10-11 Nov and skipped most of its steps.
  pnpm engine localize --lang ms --limit "${LOCALIZE_AHEAD_LIMIT:-10}" || log "localize ms: failed"
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
  # UI text those pages need that src/i18n lacks (a label no page used before): translated now, committed with the content.
  if I18N_MISSING_OUT=/tmp/aq-i18n-missing.json PUBLIC_BUILD=1 pnpm --filter site build >/dev/null 2>&1 \
    && node -e 'process.exit(Object.values(require("/tmp/aq-i18n-missing.json")).some(s => s.length) ? 0 : 1)'; then
    pnpm --filter @aq/engine exec tsx scripts/translate-ui.ts /tmp/aq-i18n-missing.json || log "translate-ui: failed"
  fi
  # Languages the site doesn't serve yet (the language table's `served: false`): their pages, written ahead of going live;
  # and Malay, served since its UI text was complete, still at a new language's pace (10 species a cycle) here, its new UI
  # strings now asked for by the build above.
  # Each step starts only while the cycle has run under AHEAD_BEFORE_MINUTES. From 2026-11-06 the block came last and gave
  # first when a cycle ran long (cycles took 91-135 min in November 2026, and 135 left the longest step, 10 species at
  # about 20 min, and the build, tests and push, about 6, inside the 170 min the next cycle waited for). Since 2026-11-12
  # it comes right after the other translations, and its ten species run before it, ungated (above); its other steps
  # still give when the cycle has run long. They add about 20 min a cycle.
  ahead() {
    if [ "$SECONDS" -lt $(( ${AHEAD_BEFORE_MINUTES:-135} * 60 )) ]; then "$@" || log "$*: failed"
    else log "$*: skipped, the cycle has run $(( SECONDS / 60 )) min"; fi
  }
  # Their UI text first: a language goes live only once it has every string (the build fails on a missing key), and no
  # build asks for it, so the strings the served languages have, 500 a cycle (60 a model call, a few minutes). Last in
  # this block, cycles past AHEAD_BEFORE_MINUTES skipped it from 2026-11-06 23:19 on, with Malay at 360 of 1,298.
  ahead pnpm --filter @aq/engine exec tsx scripts/translate-ui.ts --unserved --limit "${UI_AHEAD_LIMIT:-500}"
  for lang in ms; do
    # Its species run above. The rest at the others' pace; the first run's glossary (59 terms) and places (757, in 8
    # batches) are once only and short enough to go whole, but the buying guides take minutes each.
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
  # After translation, so the plant's Indonesian, Thai and Malay pages follow at the next cycle.
  pnpm engine planting --limit "${PLANTING_LIMIT:-4}" || log "planting: failed"
  # Pages under the bar whose review left no notes (written before reviews were kept, engine-state/reviews/), reviewed
  # again as they are, nothing rewritten: REVIEW_BACKFILL_LIMIT model calls a kind (video guides: video-cycle.sh).
  # rewrite-vi starts a page from its last review's notes: those written here, it reads at the next cycle.
  pnpm engine review-backfill --kind translation,localize,places --limit "${REVIEW_BACKFILL_LIMIT:-10}" || log "review-backfill: failed"
  # Guides keep to their title's subject: off-topic sections dropped (the copies follow at the next cycle).
  pnpm engine topic-check --limit "${TOPIC_CHECK_LIMIT:-40}" || log "topic-check: failed"
  # A reader's eye: the model reads READER_LIMIT pages as a reader would (not read yet first, then changed ones), against
  # a rubric; Vietnamese wording it flags is rewritten, reviewer-gated, READER_REWRITES parts at most; the rest goes to
  # docs/review/reader.md.
  pnpm engine reader --limit "${READER_LIMIT:-20}" --rewrites "${READER_REWRITES:-3}" || log "reader: failed"
  # Reader fit, from the front list's start (fit-front.json, first) and, like the guides below, only with time left of
  # the job's 355 minutes: a rewrite is a writer's and a reviewer's call for each part it mends.
  if [ "$SECONDS" -lt $(( ${FIT_BEFORE_MINUTES:-260} * 60 )) ]; then
    # The front list's pages whose saved reader-fit read is of older text are read again first, so the rewrite can
    # take them.
    pnpm engine fit --front --limit "${FIT_FRONT_LIMIT:-6}" || log "fit: failed"
    # The reader-fit rewrite (fit-rewrite.ts): pages on the site that fail reader fit, the front list first, then the
    # most read; pages the gate held new before them (fit-front.json, lane). A run's front-list pages hold the next run's
    # until the chief of staff has read them (fit-front.json, cleared, one run at a time).
    pnpm engine fit-rewrite --front --limit "${FIT_REWRITE_LIMIT:-12}" || log "fit-rewrite: failed"
  else
    log "fit-rewrite: skipped, the cycle has run $(( SECONDS / 60 )) min"
  fi
  # AquaTome's own guides on the most asked ideas, IDEAS_PER_DAY a day, last: each is a full research run (up to ~25
  # min), so only with an hour and a half left of the job's 355 minutes (a rewrite job has taken 266).
  if [ "$SECONDS" -lt $(( ${IDEAS_BEFORE_MINUTES:-260} * 60 )) ]; then
    pnpm engine write-ideas --limit "${IDEAS_PER_DAY:-2}" || log "write-ideas: failed"
  else
    log "write-ideas: skipped, the cycle has run $(( SECONDS / 60 )) min"
  fi
fi
# Letters lost in transit put back, one by one ("ที่��พาะ" for "ที่เพาะ": claude.ts decoded the model's answer chunk by chunk
# until 2026-11-10, and 40 pages had one). No page with one, no call (ungarble.ts).
pnpm engine ungarble || log "ungarble: failed"
# Fish, plant, breed and guide pages in metric only (°C, cm, litres): a °F, inch or gallon figure a writer left (the tests fail on one).
pnpm engine metric || log "metric: failed"
# A figure a fish or plant page's English gives in metric itself, which the rounding rounded until 12 Nov 2026 ("60 × 40 ×
# 30 cm" for Seriously Fish's "60 × 38 × 30 cm"), goes back to the English's: code, no model, at the pace the chief of
# staff sets (source-figures.ts), the porthole catfish, Ophthalmotilapia and Cichla monoculus first; the gate reads each.
# In the Mac's photos part alone (the chief of staff, 2026-11-12: the Mac only): the Mac's parts overlap, and each would
# mend the same pages from its own clone and its gate read them again. So a cycle is one batch, and one record of it.
if part photos; then
  pnpm engine source-figures --first vi/species/dianema-longibarbis,vi/species/ophthalmotilapia-ventralis,vi/species/cichla-monoculus,id/species/cichla-monoculus || log "source-figures: failed"
fi
# The content rules' safe fixes on every page (sweep.ts; the tests fail on a page left with one): the source site's
# comments and related posts cut, empty headings, repeated paragraphs and labels out of order fixed, photos of another
# fish or a map taken off their page, card figures out of bounds hidden, titles promising a count their text lacks
# rewritten (reviewer-gated) or their number dropped.
pnpm engine sweep || log "sweep: failed"
# A page held for units alone: a tank converted from US gallons some other way ("115 lít") becomes the size a keeper here
# names ("120 lít"), by code with no model, six pages a run; the gate reads each next and lets it out if it passes. It
# starts on 13 Nov 2026 08:00, the easy-fish guide first (the chief of staff, 2026-11-11; units-mend.ts). In the Mac's
# photos part alone (the chief of staff, 2026-11-12: the Mac only): a cloud cycle, or another of the Mac's parts, running
# beside it would mend the same pages from its own clone, and its gate read them again, at twice the cost and with
# verdicts that can differ.
if part photos; then
  pnpm engine units-mend --first vi/guides/youtube-mGmIvhtIM9k || log "units-mend: failed"
fi
# Last of the steps that write pages: what this run changed is read against the reader-fit checklist (gate.ts). A new page
# that fails is held, a live page that got worse keeps its committed text, a page built on a foreign shop's kit is held,
# and a held page that now passes is let out. A page it can't read stays as readers have it; only a crash stops the run,
# and keeps its work on a branch (gate_or_keep).
gate_or_keep "content: engine $PART" content sources engine-state docs/review apps/site/src/i18n || exit 1
if part photos; then
  # What the gate made of each page the source figures mended, recorded once, and the stop when a batch went wrong.
  pnpm engine source-figures --record || log "source-figures --record: failed"
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
