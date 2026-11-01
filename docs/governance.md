# Site governance: catch breakage before readers do

The site changes many times a day: the content engine every 3 hours, and code through pull requests. These checks keep
those changes from breaking pages. Each problem goes through one loop: **detect → record → fix → prevent** (a check
that would have caught it).

## Layers

| # | Layer | Catches | Runs | Status |
| --- | --- | --- | --- | --- |
| 1 | **Gate**: build tests + browser checks | broken pages, journeys that stop working, layout and translation slips, pages that get slower, heavier or less accessible | every PR (`ci.yml`), every deploy (`deploy.yml`, engine content too) | live |
| 2 | **Production watch**: the same checks against aquatome.com | page-specific content problems, deploy surprises | after each deploy and nightly (`watch.yml`); a failure opens or updates an issue | live |
| 3 | **AI page review**: Claude looks at phone and computer screenshots against a rubric | problems no rule describes ("the results are five screens down") | nightly on key pages + 6 a day (`watch.yml`); on PRs that change site code, as a comment | live |
| 4 | **Fix loop**: an agent turns a recorded problem into a failing check, then a fix, as a draft PR | what layers 2 and 3 record | each new `site-check` issue; any issue labelled `autofix` (`fix.yml`) | live |

### 1. Gate (live)

- `pnpm test`: the site built from `apps/site/test/fixture-content`, checked as HTML (vitest).
  - The app's copy of each page (`/app/pages/`, `protocols/page.schema.json`) against `protocols/page-vectors.json`,
    which the app's tests read too; every text in the real `content/` converts with nothing the app would have to send
    to the web.
- `pnpm --filter site e2e`: Playwright on that build, as a phone (Pixel 7) and a computer (`apps/site/e2e/README.md`):
  - **Journeys**: the things readers do (search the fish list, glossary cards, the tank-volume, tank-mates and Chihiros
    tools).
  - **Page checks** on one or two pages of every kind, found from the build (a new kind of page is covered from its first
    build):
    - status 200 and a title
    - one `h1`, on the first screen
    - no sideways scroll
    - every picture has width, height and alt
    - links to this site's pages lead to pages that exist
    - no Vietnamese on Indonesian or Thai pages
    - no script errors
  - **Built-page checks** (`apps/site/scripts/page-check.ts`), on the HTML alone: in `pnpm test` on every fixture page,
    in the browser checks (`@page-checks`) on the same sample, live in `watch.yml`:
    - no picture twice on a page, cards and tiles too, compared as pictures (the image hash in
      `content/picture-hashes.json`, `pnpm engine picture-hashes`; a YouTube thumbnail by its video), not by address
    - no figure of another fish under a heading about one fish (it names the fish, or its scientific name in brackets)
    - no "Name (Scientific name)" linked to a page with another scientific name; a plant's former names are its own
      ("Rêu java (Vesicularia dubyana)"): `synonyms` on its page, from its sources, GBIF and a few hobby names
      (`pnpm engine plant-synonyms`, each cycle)
    - in a list of fish, no fish's section without a photo while the fish has one the page doesn't show yet
    - the contents match the headings, in order, each numbered heading under its own number; numbered headings count up
    - no heading with nothing under it: nothing before the next heading of its level or higher, or the end. A heading
      straight over its sub-sections is a group, shown an h2 over their h3s (`@aq/schema` headingRoles, `lib/toc.ts`),
      the engine's sweep reading the same rule; a numbered run under it nests under it in the contents
    - `pnpm exec tsx scripts/page-check.ts <dist> <content>` (in `apps/site`) counts any build's problems, per check
  - **Lighthouse** (`lighthouse.spec.ts`, what PageSpeed Insights runs) on one page of each kind readers open most, as
    PageSpeed's mobile and desktop tests, run alone (`E2E_LIGHTHOUSE=1 … --workers=1`). Each page has a budget:
    - accessibility, best practices and SEO at 100
    - layout shift, the site's own script weight (KB) and page elements: where they are now
    - performance, largest paint and blocking time: with room for run-to-run noise; a miss is measured again twice
      before it fails
    - pages that start below the budget are listed in `KNOWN` with the reason, held where they are until fixed
    - locally nothing from other sites loads (ads, analytics, photos); live, the page as readers get it
- Deploys from GitHub Actions (`deploy.yml`, which engine runs start too) run the page checks and Lighthouse on the
  **real** build before uploading (`deploy.sh` with `E2E_GATE=1`).
- Not gated yet: `deploy.sh` run on the owner's Mac (the video cycle). Layer 2 watches production for what slips through.

### 2. Production watch (live)

- `watch.yml` runs the same browser checks against aquatome.com after every finished deploy and at 05:00 (Vietnam),
  then Lighthouse on the live pages, ads and all: a page that drops below its budget becomes an issue like any other.
  (PageSpeed Insights' own API needs a key from the owner's Google Cloud project for its quota; Lighthouse here is the
  same test.)
- It checks a **different sample each day** (`E2E_SEED` = day of the year, from the sitemap), so in time it covers every
  page, not one or two per kind.
- Every page with an **open problem is checked again each run**, until it passes.
- `scripts/site-watch.mjs` turns results into issues labelled `site-check`, one per problem (a page, or a journey):
  - a new failure opens an issue
  - a repeat failure updates its "Last failed" line (no mail every night)
  - a pass closes the issue with a note
- A **failed deploy** opens a "Deploy failed" issue. Engine runs start deploys with the workflow token, so nobody would
  hear about it otherwise. The next deploy that finishes closes it.
- The watch blocks the site's own visit beacon, so its page loads don't count as readers.
- It runs the checks of the version that is live (the deploy's commit, else the last deploy that succeeded), not main's
  newest: a check merged before its fix is deployed would otherwise fail on the old site (it happened once, #183).

### 3. AI page review (live)

- `apps/site/e2e/review.spec.ts`, only with `E2E_REVIEW=1`, does what a careful reader does:
  - opens a page on a phone (first three screens) and on a computer (first screen)
  - hands the screenshots, the address and the visible headings to Claude (`REVIEW_MODEL`, default opus), which can
    read only those files
  - Claude checks a rubric: does the page do what its address promises, is the layout broken, is anything empty, is any
    text in the wrong language, is anything plainly wrong
- Which pages: the most-read pages and the ones that broke before (the search), plus 6 more each day on aquatome.com.
- What happens to findings:
  - **High** fails the check: a `site-check` issue, closed when a later review passes.
  - **Medium** findings are notes, kept in one `page-review` issue per page and refreshed each review. Close it by hand
    once fixed.
  - On a PR that changes `apps/site/src/`, the same review runs on the fixture build and posts its findings as one PR
    comment (advisory).
- Calibrated on the real bug: with the old `/vi/ca/?q=chach` code back, it reported "search results pushed below an
  unrelated section" as high, with the fix that shipped. On the fixed site, the 11 key pages had no high findings.
- Its first run found 2 small problems on the Chihiros page (fixed with it) and 3 content notes.
- In the screenshots, pictures from other websites (blocked in every check) are grey boxes, as the prompt expects; on a
  PR, the prompt also says the test build has little content.

### 4. Fix loop (live)

- Started by:
  - `site-watch.mjs`, when it opens a `site-check` issue (up to 3 a run)
  - the `autofix` label on any issue, a review note for example
  - running `fix.yml` by hand with an issue number
- `fix.yml` has three jobs, so that the agent's work never runs where a write token is:
  1. **agent** (read-only token, used only to read the issue) builds the fixture site, then gives Claude (`FIX_MODEL`,
     default opus) the issue and `scripts/site-fix-prompt.md`. Claude must reproduce the problem with a check that
     fails, fix the cause (the engine rule too, for content problems), never weaken a check, and run the gate. The issue
     text is a report to verify, not instructions. The job hands over only a patch.
  2. **verify** (no secrets) applies the patch to a fresh checkout and runs `pnpm test`, `pnpm typecheck` and
     `pnpm --filter site e2e`.
  3. **publish** (write token) runs no repository code: `scripts/site-fix-publish.mjs` as it is on main applies the
     patch and acts on the result:
     - verified: a **draft PR** that fixes the issue, with CI started on it
     - otherwise: a comment on the issue saying why, plus the `needs-person` label
     - it refuses patches to `.github/` or to the fix and watch scripts
     - it needs the repository setting "Allow GitHub Actions to create and approve pull requests" (on since
       2026-10-31); if opening the PR fails anyway, the issue gets a link to the pushed branch
- Remaining risk: the agent job holds the Claude token and can run commands. Its input is the bot's own issues, or
  issues a collaborator labelled `autofix`.
- **Merging is a review**, by the owner or an agent working for them, after CI. When the fix is live, the next watch
  run closes the issue.

## Content guards (the engine)

The engine writes and changes pages without a PR, so its own steps guard what it publishes (`scripts/engine-cycle.sh`).
The layers above still check the result.

- **Reviewed writing.** Each translation or guide is scored by a second model call against its source. A low score gets
  one rewrite with the notes; still low, the page is published but kept out of search (`quality.indexable`).
- **Page depth.** A species page made only from a shop listing, a dealer's note or a stub is thin. It is published but
  kept out of search (`quality.indexable` false, `quality.reason: "thin"`) until it is deep (`packages/schema/src/depth.ts`):
  - **deep** means it has an in-depth source, or it reaches the bar on its own:
    - in-depth sources write species profiles: Seriously Fish, Loaches Online, ScotCat, Aquarium Breeder, The Spruce
      Pets, Aquarium Co-op, 2Hr Aquarist. PlanetCatfish counts only for a full profile (its own sections cover 3 care
      topics), not a stub.
    - the bar: 1,500 characters of text (references aside) covering 3 of the 5 care topics (tank, water, food,
      behaviour, breeding).
    - it is measured on the source text, so a page gets the same verdict in every language. A section of 5 words or
      fewer covers no topic.
  - The build judges every species page (`loadAll`), so a page that gains an in-depth source, by an engine run or two
    jobs' work merged, goes back in search by itself. The engine records the verdict when it merges a source into a page.
  - Out of search means out of the sitemap, the home page's lists and other languages' alternates. A thin page stays in
    the site's own search, the fish list and the app's index: its translation passed, it is only short.
  - A heading with 5 words or fewer under it ("Mouthbrooder.") is shown as a line of the quick facts, or left out when
    they already say it or all it says is "Unknown.".
  - Thin species' profiles on in-depth sources are fetched before new species, most popular first. They are found by the
    name in the address (Seriously Fish, Loaches Online, ScotCat), same genus. Failing that, Seriously Fish's own search
    is used: a newer genus hides the page (Corydoras panda is Hoplisoma panda there). Searches are cached for a month in
    `engine-state/_depth-search.json`, 20 a run. PlanetCatfish addresses are numbers, so its pages match only once read.
  - `pnpm engine status` and each run's report (`engine-state/last-run.json`) count thin pages by the sources they're
    made from and list the most popular ones.
  - Found by the owner: Betta macrostoma's page was one shop listing whose whole breeding section was "Mouthbrooder.",
    while Seriously Fish had a full profile the engine had failed to fetch.
- **Retries.** A page that failed through no fault of its own (the browser closed, the network, Claude's usage limit)
  runs first in its source's next run, with no backoff. A usage limit uses none of its 3 attempts, and 3 pages in a
  row failing on the network stop the source, so an outage doesn't use up every page's attempts. Found with the
  above: after one browser crash (2026-10-29), 115 Seriously Fish pages waited behind hundreds of new ones.
- **On topic.** A guide covers what its title promises. The guide writer and its reviewer are told to leave out a
  video's detours (`prompts/video-guide.md`, `video-review.md`). `pnpm engine topic-check` reads every new or changed
  guide and drops sections about another subject, with their FAQ and summary lines. It never drops more than half a
  guide: such a guide is reported instead. Found by the owner: a lighting-hours guide ended on pre-filters.
- **Checked summaries.** A species page's "Tóm tắt nhanh" is drafted from the page's text and data card, then checked
  before it shows: every temperature, pH, hardness, size, tank and difficulty figure must be the card's and every other
  number written on the page (a rule, `checkNumbers`), and a second model call checks every claim against the text. A
  draft with problems is rewritten once with them; still failing, it stays hidden and is listed in
  `docs/review/summaries.md`.
- **Photos.** No people (faces dropped), no watermarks (credits, dealer logos, site names or species names added on the
  photo: `pnpm engine watermarks`, macOS Vision reads the text and the model judges it; a marked photo is blocked for
  good), each photo must show its species, open licences or permission only.
  Pages show photos from our own media host: a Commons or iNaturalist photo waits for `pnpm engine mirror-photos` (every
  cycle), and a public build leaves it out until then (`setsCookies`), since those hosts set third-party cookies.
  - **Galleries and their targets.** Every species and plant has a gallery, topped up each cycle to a target set by how
    much readers want it (`packages/engine/src/gallery-plan.ts`, the reason beside each number): the 12 staples 100,
    what shops in Vietnam, Indonesia and Thailand sell 60 (fish lists and plant lists, `engine-state/shop-lists/`), the
    most-kept fish 40, pages two or more sources write about 30, every other page 20. The most popular pages go first,
    `GALLERY_SHEETS` model calls a cycle (`scripts/engine-cycle.sh`). A gallery is never padded: a page whose sources run
    dry stays short and is listed in `docs/review/galleries.md`, then read again a month later.
  - **Sources.** iNaturalist first: every observation of the taxon (found by its name or a synonym) with a CC0, CC BY or
    CC BY-SA photo, research grade first, then those whose community ID agrees; aquarium and garden observations count.
    Then Wikimedia Commons, GBIF occurrence photos (observations and living collections, not preserved specimens, not
    iNaturalist's copy) and Openverse (Flickr). Each photo's licence is read from the source's API for that photo, never
    assumed: CC BY-NC, the default on iNaturalist and Flickr, stays out, since the site carries ads and affiliate links.
    Photos a source gave permission for (`content/sources.json`) and Unsplash photos join through their own steps. Each
    source is read at the pace it asks for (iNaturalist about one request a second; Openverse 200 a day without a key),
    and each page keeps its place in `engine-state/gallery/<id>.json`, so the next cycle continues there.
  - **Checks every photo passes,** through one shared step (`screenTagged` in `gallery.ts`): at least 800 px; not a photo
    the owner rejected (`engine-state/_photo-rejected.json`); not a near-copy of a photo already shown (an image hash,
    as when Commons holds a copy of an iNaturalist or Flickr photo); no human face (Apple Vision); then Claude, on contact
    sheets of 20, keeps only a clear living example of the species, with no person or body part, no drawing, text overlay
    or banner, and no near-copy, and writes its caption. After the photos move to our bucket, `pnpm engine watermarks`
    reads the text on every photo shown, gallery photos included, and the model blocks a marked one for good. A gallery
    leads with Claude's best picks, mixed by what they show (male, female, colour form, young, the wild; for a plant
    under water, emersed, in flower).
  - **One picture, once a page.** Every picture's image hash is in `content/picture-hashes.json` (`pnpm engine
    picture-hashes`, each cycle): a page decides its pictures in page order and never shows one twice, even as two files
    (two articles of one source each had a copy), and a card or tile takes its next photo, or none. A guide keeps every
    photo of its source, each with the heading it sat under, mapped to the guide's own (`guide-sections.ts`); in a list
    of fish each fish's section shows that fish, the guide's own photo first.
  - **The right subject.** `pnpm engine check-photos` (each photos cycle, and the Mac's video job) shows the model every
    photo on a species, plant or breed page and its gallery, 6 to a sheet, with the scientific name, the page's names
    and, for a breed, what sets it apart. Verdicts: shows it, its wild habitat, something else (it says what), not a
    photo of it (a map, chart, hands, a tank, a packshot), or can't tell. "Something else" and "not a photo of it" leave
    the page; a photo no page keeps joins `_photo-rejected.json`. Can't tell stays and is listed in
    `docs/review/photo-subjects.md`, with the removals and the pages left with no photo (they show none; the check
    puts nothing in its place, and the photo steps fill it from their sources as for any page short of photos). A
    guide photo whose caption names one fish is judged against what the caption says, and only "something else"
    leaves a guide; a guide photo that is a page's photo goes with that page's "something else". Most-read pages first, verdicts cached per photo and page (`_photo-subjects.json`). Found by
    the owner: a neon tetra on the green neon page, the tiger barb under the cherry barb, a range map on the angelfish
    page; the first check (2026-10) had reached under half the page photos, in alphabetical order, and no gallery.
  - **Credits.** Every photo names its author and licence and links its own page on the source (the gallery's viewer
    and the page's credits); the gallery page names the sites its photos come from. Commons, iNaturalist, Flickr and
    GBIF photos are copied to our media bucket with the credit kept.
  - **Removal.** A reader or a photographer writes to the address on the contact page (`/vi/lien-he/`, "Bản quyền và
    ghi nguồn" or "ảnh nhầm loài"). The owner adds the photo's address to `engine-state/_photo-rejected.json` with the
    reason: the next cycle drops it from every page and gallery, and it is never picked again. A source that withdraws
    permission is set to `"publish": false` in `content/sources.json`, which takes its photos off public builds.
- **Diễn Đàn Cá Cảnh: orientation, and some photos.** On 2026-11-01 the owner approved the forum's images, not its text.
  `content/sources.json` records it as `"publish": "photos"`: a public build shows its photos and nothing written from it
  (sections, guides, card values).
  - Photos: the diagrams of the discus classification thread, and images the poster made or took in the forum's own
    original guide posts. A translated post's images belong to the original's authors and stay out. The watermark,
    people and hands screens apply as to any photo.
  - Text: orientation only (structure, Vietnamese trade names and terms, what local keepers care about). It is never
    copied or translated, into `content/` or `engine-state/`. Pages are written in our own words, and a post that is a
    translation leads to its original, which is the source cited.
  - The engine reads its guide sections (`pnpm engine forum`, `packages/engine/src/forum.ts`): each section's thread list,
    5 s between requests, then each new thread's opening posts by its author. The model notes, in
    `engine-state/forum/diendancacanh.json`, whether a post is translated or original and why, the original it names,
    the Vietnamese terms it uses, and its pictures (own only in an original post, on the forum's host). Breed research
    gets the Vietnamese names as leads to check and cite; guide research gets the threads on its topic, and is told to
    find and cite a translation's original. Each cycle's rewrite job reads 10 threads (`FORUM_LIMIT`).
- **Merging parallel work.** The four engine jobs run at once. Pages two jobs both write are merged by source
  (`scripts/merge-entity.mjs`), not by whole file: whole-file merging once dropped Seriously Fish's data from 32 species.
- **Sane numbers.** Figures outside plausible bounds (°F given as °C) are dropped, and so is a minimum tank length that
  its source gives only as a volume (its "75 gallons (about 284 litres)" once made Cá đĩa's card say 284 cm; The Spruce
  Pets' "10 gallons (about 38 litres)" became 40 cm on 19 cards), when the engine reads a page and again at every build
  (`tankIsVolume`). Where sources disagree, every page shows the range they all accept.
- **Card figures from sources that state them.** A data card lacks a figure when no source read for the page states
  it. On 2026-11-01, 445 of 1,016 species pages showed no minimum tank, among them the betta, neon tetra and cherry
  barb, whose sources (The Spruce Pets, Aquarium Co-op, BW Aquatics, Glaser) give a tank as a volume or not at all.
  Seriously Fish gives each figure, and a tank as its base, and the engine hadn't read its profiles of 107 of those
  pages yet: they were neither thin nor wanted, so they waited in its backlog.
  - `pnpm engine card-fill` (each cycle's Seriously Fish job, `CARD_FILL_LIMIT` pages, most-read first) reads the
    profile of each page whose card lacks a figure as a public build shows it, on a source that has given the page no
    text yet, found by the name in the address.
  - The profile is read like any page: translated, reviewed, and its figures go through the same prompt rules and
    guards (a volume gives no length). A figure no published source states stays empty.
- **Metric only.** Fish, plant, breed and guide pages give °C, cm and litres in every language. Each writer of those
  pages passes its text through `toMetric` (`@aq/schema`): an imperial figure beside its metric one goes ("20–30°C
  (68–86°F)"), one before its metric one gives way to it ("2 inch (khoảng 5 cm)"), one alone is converted ("bể 10 gallon"
  → "bể 38 lít"). A US tank model reads as its volume and size ("bể 20 gallon long" → "bể khoảng 75 lít (76 × 30 × 30
  cm)"), a pipe as the size shops here sell ("ống PVC ¾ inch" → "ống PVC phi 27"), a change of temperature as its own
  size ("giảm 15 °F" → "giảm 8 °C"), a weight in grams ("1 lb" → "450 g"). `pnpm engine metric` runs before each
  cycle's build for anything a writer missed, and a test fails on any °F, inch, foot, gallon or pound figure left in
  `content/`. Reference lists, titles, quoted labels and a bottle's size in ounces stay as published. Found on 263 fish,
  plant and breed pages, then on 136 guide pages and 9 more fish pages whose sizes were written in inch marks (48" x
  15") (2026-11-01).
- **One copy of each figure.** The data card holds a species' figures. Quick facts drop the items the card already has
  for that source, and the family (merge, and the page for older content); a block that states a figure the card shows
  otherwise says above itself which source it follows (`@aq/schema` card-facts). Found in a review: Cá neon vua's text
  said 5 cm and pH 3,5–7,5 where its card said 3,5 cm and pH 4,6–6,2.
- **Content rules.** Every published page, in each language, is checked against rules every cycle (`pnpm engine audit`,
  `packages/engine/src/content-rules.ts`, one small tested function each). A mistake found by hand once becomes a rule,
  so it is caught on every page from then on.
  - The rules: a numbered run of headings broken by one without a number; a title promising a count ("10 loại…") the
    text doesn't have; a heading twice or with nothing under it; the source site's comments or related posts; markdown,
    HTML or entities left in the text; a paragraph repeated; sentences left in English; Vietnamese on Indonesian and
    Thai pages outside the names the site marks; imperial units with no metric figure beside them; a photo caption
    naming another fish; data card figures out of bounds, or a minimum tank shorter than twice the adult fish.
  - A rule never holds a page back. The safe fixes are made whenever the engine writes a page (`tidyHtml`,
    `unescapePlain` in sanitize.ts; `--fix` makes them on what is already stored): a heading inside a numbered run
    becomes its item's lead line, an entity escaped twice is escaped once, empty blocks go, plain text loses its
    entities. The rest is listed in `docs/review/content-rules.md`, each page once per rule with its link.
  - **The sweep.** A page the engine never writes again would keep its defect, so `pnpm engine sweep` (`sweep.ts`)
    makes the fixes on every page each cycle, after `metric` and before the build, and a real-content test fails on any
    page still having one (`RATCHETED`: each rule with the kinds of page its fix covers). A check there finds only what
    its fix can change, or one page the fix can't mend would stop every cycle. The text fixes run again until nothing
    changes (one can make room for another). Each file keeps its indentation and date. It hides the element, never the
    page:
    - the source site's comments, comment form and related posts, in the shape the comment plugins write ("7 ý kiến về
      “…”", "Bình luận của độc giả", "Để lại bình luận" alone, "Bài liên quan:", "Nội dung liên quan"): cut, related
      posts with their lists, comments with everything up to the next heading. More than half a text is left and
      listed for a person; a heading of the text's own ("Bình luận của Ken Childs" in a text of letters) stays
    - a heading with nothing under it, at the end of a text or over one that isn't its sub-section (an empty one, a
      group, or its peer: "Ngày 16 tháng 11" over "Ngày 26 tháng 11"): dropped. A heading straight over its
      sub-sections is a group, and stays: every heading is an h3, so the site shows it a level above them, as the
      built-page check reads it (`@aq/schema` headingRoles). A repeated paragraph: the later copy dropped (in two texts
      of a page, as a run of copies, or 120 characters or more: a short line a list repeats under each item is the
      text's own); labels out of order ("Sai lầm 1, 9, 2…"): numbered again as they appear
    - a photo whose caption names another species the site has a page for, with nothing saying the fish is still the
      page's ("in a batch of", "here with", "known as"), or that is a map: off its page. A map leaves every page
      (`engine-state/_photo-rejected.json`); a photo of another fish only that page, so it may still join its own fish's
      (taken off again if a later run brings it back). A Latin name no page has is listed for a person ("may name
      another fish"), not removed.
    - a card figure out of bounds, upside down, or a minimum tank shorter than twice the fish: hidden from the card
      (`hidden` with why, kept in the file; worked out again each run), and the species' approved summary sent back to be
      written again against the new card
    - a guide's title promising a count its text lacks (a breed's or product's title is its name: listed): rewritten by
      the model, kept when its reviewer passes it, else the number dropped from the title; the address stays
    - imperial figures: `pnpm engine metric`, as before; the audit uses the metric test's own detector
  - Text that reports what "the page" says ("Trang lưu ý…", "Trang cũng nêu…") has no safe fix: the reader's writer
    rewrites it on Vietnamese pages, reviewer-gated.
  - First run (2026-11-02, 2,599 pages): the source site's comments or related posts cut on 22 guides, a heading left at
    the end on 2, a repeated paragraph on 12 pages, labels renumbered on 1, 29 photos of another fish or a map off 25
    pages (9 maps off every page), 12 cards' tanks hidden (8 summaries to write again), 4 titles rewritten. Three titles
    the rule had listed held their count after all, as numbered labels ("Mẹo 1"…"Mẹo 13") or bold leads. Its first
    version also dropped 7 group headings ("Lựa chọn loài", "Sản phẩm"), cut a text's own "Bình luận của Ken Childs"
    and kept 11 photos of another fish off every page; a review caught them, and they were put back.
  - Found by the owner: the betta foods guide's contents read "3. #3 Cám viên…, 4. Xtreme Betta Pellets, 5. #4…". The
    first run fixed an Indonesian guide whose title read `Cacing Jangkar &amp; Kutu Ikan` on the page, and listed 6
    guides carrying another site's reader comments (with the readers' names), 36 species and plant pages with a photo
    whose caption names another fish, and 7 guides whose titles promise more items than they have.
- **A reader's eye.** Each cycle the model reads 20 pages (`READER_LIMIT`) as a careful reader would, against a rubric
  (`pnpm engine reader` in the rewrite part, `packages/engine/src/reader.ts`, `prompts/reader.md`): structure that
  misleads, a page contradicting itself, wrong or mismatched numbers and units, garbled or unnatural Vietnamese,
  Indonesian or Thai, captions that don't fit, claims the page's own sources don't support.
  - It reads the page's text (headings, paragraphs, lists, card values, captions), and the sources it was written from
    where the engine keeps them: a species or plant's English sections, a guide's source page in `sources/`.
  - Pages not read yet go first (Vietnamese, then guides), then pages whose text changed; an unchanged page is not read
    again (`engine-state/_reader.json`, by page and a hash of its text). A finding must quote words that are on the page.
  - Vietnamese wording it flags, and a figure or claim in a section with its English source, go through the rewrite
    step's writer with the findings as notes (`READER_REWRITES`, 3 parts a cycle) and are kept only when the reviewer
    passes them: against the English, or, in a guide, against the old wording, with only the quoted paragraphs rewritten.
    The rest (Indonesian and Thai, structure, captions, the card) is listed in `docs/review/reader.md`.
  - A finding a text check could catch says which check; the report lists those under "Could become a rule". The first
    one became the caption rule's map check ("Pterophyllum scalare map"); the next six (2026-11-02) became the rules for
    comment headings, comment forms, "Bài viết liên quan:" lists, labels out of order and "Trang lưu ý…".
  - A backfill reads the most-read pages first, at a higher limit (`pnpm engine reader --popular --limit 300
    --rewrites 30`).
  - Tried on 9 pages in three languages: it found "trùn chỉ" (tubifex) written for bloodworms, "cá rô phi" (tilapia)
    for African cichlids, "cá mè vinh" (silver barb) for the tinfoil barb, a temperature range given twice as the same
    figure, a guide's mistakes numbered 1, 9, 2…, and photos of another variety, a map and a person planting with
    tweezers. Three Vietnamese parts were rewritten and passed the reviewer; a tank-size rewrite that added its own
    commentary was refused twice. On the same pages Sonnet reported findings it then called fine and took the local
    name "cá heo" (Botia loaches) for "dolphin", so the reader reads with Opus (`READER_MODEL`).

## Rules for every change (people and agents)

1. **A page bug comes with a check that fails without the fix**, in the same PR: a journey, a page check or a vitest
   test. Run the check against the unfixed code once to see it fail.
2. **A new kind of page needs nothing**: the page checks pick it up. **A new interactive feature gets a journey** in
   `apps/site/e2e/`.
3. **Never weaken a check to get a green run.** Fix the page. A real exception is written into the check with its
   reason (as `VIETNAMESE_ALLOWED` does for decree numbers).
4. Before merging, the gate must pass. When it can't (a check is wrong), fix the check in the same PR and say why.
5. **A Lighthouse budget only tightens.** A fix that lifts a page past its `KNOWN` entry removes the entry in the same
   PR. Loosening one needs the reason written next to it.

### main's ruleset (GitHub)

- `main` can't be deleted or force-pushed. Changes arrive by pull request, squash-merged, after the `test` check
  (ci.yml) passes. Merged branches are deleted.
- Let through: repository admins (the owner, and the owner's Mac pushing video content), and deploy keys. The engine
  pushes content over its deploy key (`ENGINE_DEPLOY_KEY`, engine.yml), since GitHub Actions' own token can't be let
  through on a personal repository. That push starts deploy.yml like a merge does.
- Secret scanning blocks pushes that contain a known kind of key. Dependabot opens PRs for vulnerable dependencies.

## Mobile apps

The iOS app (`apps/ios`, SwiftUI) is checked by `ios.yml` on every PR and push that touches `apps/ios/**` or
`protocols/**`. Android (`apps/android`) will follow the same pattern.

| Check | Catches | Where |
| --- | --- | --- |
| **Shared vectors**: device frames and replies, saved-tank records and merges, a tank's fish checked as the tank-mates tool checks them (the site's own code, bundled), fish and plants filtered as the site's lists filter them, and pages read as the site writes them (each block this app can't read one "open on the web"), against `protocols/*-vectors.json`, which the site's tests read too | the app and the site sending different bytes, a reply misread, tanks checked or merged differently, a tank-mates answer that differs from the site's tool, a filter that keeps or drops a page the site's list wouldn't, a page misread or failed for one block | `swift test` in `apps/ios/AquaTomeKit` (job `kit`) |
| **Session tests** against `FakeLight`, a light that answers the way the real one did in hands-on tests | wrong order or pace of commands, overlapping commands, lost read-backs | same |
| **Account client** (`AccountSync`) against `FakeAccounts`, the accounts server in process, and the contract `protocols/accounts.openapi.json` | requests the server would refuse (a path or method not in the contract, a cookie or Origin, no JSON body, no `client: "app"`), a merge that lets a fast clock win or loses a change made during a sync, a refused record lost, an old session left open, busy not retried, a passkey answer the server's WebAuthn check would refuse (id and rawId differ, padded base64, another origin, a user handle that isn't the account's, a challenge used twice) | same |
| **Plugs** (`Plugs`): `TuyaPlugs` against `FakeTuya`, Tuya's cloud as its docs describe it (signatures checked, Tuya's two worked examples), and `PlugBoard` over it | a request Tuya would refuse, a token not kept or not replaced, a page of devices missed, the indicator light taken for an outlet, a switch that toggles, is sent twice, retried or queued, or goes to a plug listed offline, a state shown as asked instead of as the plug reported, an unconfirmed or lost switch not read again or read more than once, an older list answer putting an old state back, an expired trial or wrong keys not told apart, a plug record that keeps state or loses a newer client's keys | same |
| **UI flows** (XCUITest) on the simulator, which gets the fake light | journeys that stop working: search the handbook (no accents, other names, one kind, a page opens, a fish's facts above its page as the site writes them and none on a plant's, a guide saved to read later and kept after a relaunch then taken off, the pages read last newest first, a guide drawn by the app from the site's blocks (no web page), a page it names and a link in its text opening in the app on the same tab, a word's tip, the credit's link scrolling to the sources, a part it can't draw opening the web page, the Chihiros tool, the "Bể của tôi" tool), browse it from its home (a fish group, every fish, the plants by where they go, the glossary by letter), the fish filtered to one of the reader's tanks as the site's list filters them (those missing a figure listed after) and the plants to the tank's light, add a tank with its size and litres (shown as typed, halves rounded up), a partial size refused, a name kept to 80 characters, edit a tank keeping its other fields and find it after a relaunch, a new size dropping litres given for the old one, delete a tank, a tank's fish and plants opening their pages, a fish put on a tank from its page (starting at its school size; one already there gets the new number), a plant put on a new tank, a fish added from the tank in the handbook's list, its number changed and a plant taken off, kept after a relaunch, a tank whose fish don't go together and are too many and too long for it warned as the site's tank-mates tool warns, the check following a fish taken off, a tank with no size given the tank its fish need, the guides naming a tank's fish listed on it and opening, a fish the handbook doesn't have checked with nothing known rather than left out, a store from a newer app or one it can't read left alone, adding again after a failed save, the lights screen as the site's Chihiros page (a new light connected with its setup steps; the light's own schedule never shown as running or put in the form; a clock seven hours slow and one lost in a power cut set right; a preset written, then another without asking, then undone back to the first; the write bar in view at the top and the end of the screen, saying what will be written; a schedule written before used again, also while a colour is tried on the light, with the last six listed, and none for a light that dropped; the light kept on a tank with the schedule written to it; a saved light listed after a relaunch and connected with what was written to it; the plan kept without a light; presets by tank type, the chosen one marked, keeping the colour mix; the day's on, off and ramp handles dragged (off held two ramps after on), the ramp menu, the hours advice, and the schedule they write; colour looks, one brightness and each colour; a colour tried on the light, then its schedule again; the day previewed on the light, stopped at once or played whole to full and off, then its schedule again; leaving the app mid-test or mid-preview sending one frame only, last, after levels already on their way, and leaving "Tắt đèn" as it is; disconnecting mid-test or mid-preview sending the scene mode before the link drops, and a light that drops mid-test kept as set by hand until "Theo lịch"; Tắt đèn and Sáng hết, then back to the schedule; a dropped light, also one dropped while being read, connected again without a scan; the frames "Theo lịch" sends (the written schedule again, or only the scene mode); a light renamed and forgotten; no Bluetooth, with planning still open; a write ending manual levels; old firmware refused; disconnect, also mid-connect); signing in to an account on a stand-in server: a new phone gets the tanks made before and after signing in, a code sent by email signs in (a wrong one refused) and the same address on a new phone opens the same account, a passkey added on the website opens its account (one no account has is refused with what to do), signing out keeps the tanks, deleting the account empties it, no sign-in with accounts off or for a store from a newer app; smart plugs on a tank, on the stand-in Tuya cloud and with no account: the project's keys set up, wrong ones said so and not kept, the right ones checked by reading the list and kept, then removed, a plug added and its outlets named (labels from Smart Life, kept across a launch, not offered for a second tank), an outlet switched and confirmed, a heater, a CO2 or an outlet with no role asks first, a plug that doesn't confirm shown as it reports, a plug gone offline refused and shown offline, a plug taken off the tank | `xcodebuild test` (jobs `app`, `handbook` for the handbook's flows and a tank's fish, plants, guides and tank-mates check, and `lights` for the light flows, on runners side by side); a failed test runs once more, as the site's journeys do, and one that passed only on its retry is a warning on the run |
| **Translations**: every string in the code and Info.plist has Indonesian and Thai, with the same placeholders | untranslated or broken strings | `apps/ios/scripts/check-strings.py` (job `app`) |
| **Performance budgets** (`apps/ios/perf-budgets.json`): launch to the first responsive screen, the CPU time and peak memory of flinging through 800 fish, the archived app's size; each test's median against its budget | the app getting slower, heavier or bigger without anyone deciding it should | `PerformanceTests` and `apps/ios/scripts/check-perf.py` (job `app`); on a PR, `--tightens-only` against main's budgets |
| **Signing**: the app archived, signed and exported as for the App Store | signing that stopped working (certificates, profiles, entitlements); App Store Connect's own checks run at the upload on main | `testflight.yml`, on a PR that changes the project, `Config/` or the workflow; on main it uploads |

Hands-on, by hand: the Tuya route's list read against a real project (`liveListRead`, read-only, counts only;
`apps/ios/README.md`), never a switch from a test. The simulator has no Bluetooth, so a change to the Bluetooth code or to what the app sends is also run
against a real light from a Mac with `light-harness` (`apps/ios/README.md`), ending with `restore`. What the light
showed goes into the research doc, and into the vectors as captured bytes.

Rules (as for the site):
1. **A bug comes with a check that fails without the fix**: a vector, a session test or a UI flow. Run it against the
   unfixed code once to see it fail.
2. **A new device behaviour seen on hardware goes into `FakeLight` and the vectors**, so the tests know it too.
3. **Never weaken a check to get a green run.**
4. No real device names (they carry the device's address), addresses or IDs, and no signing team ID, in the repository.
5. **A performance budget only tightens.** A change that makes the app cheaper may lower its budget. Raising one needs a
   new `reason` in `perf-budgets.json` saying why the cost is worth it; the PR check fails on a budget raised with the
   old reason, or removed.

Next: layer 3 reviews simulator screenshots against the site's rubric.
