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
    which the app's tests read too (its fish, breed, plant and video series pages are the fixture build's, and the test
    fails when they drift: `UPDATE_VECTORS=1` rewrites them); every text in the real `content/` converts with nothing the
    app would have to send to the web. Each guide's, fish's, breed's, plant's, glossary term's, video series' and equipment
    category's copy is held to its built page: its header, every photo's credit (the footer's "Nguồn ảnh" included), its
    numbered sources, for a fish the data card's sources, tank mates, climate, gallery and breeds, for a breed what it is
    a form of, a hybrid's parents, the card's sources, its gallery, summary, text, lines, questions, guides and sources,
    for a series its whole line (counts, playlist and channel) as its credit and its guides in order, and for an
    equipment category every part in the page's order, its shop links as built (Shopee) and Vietnamese only, with the
    affiliate note beside them, and the fish that need it one list, however long. Every link a copy has to a fish or a
    breed the index lists opens that page's copy.
  - Which app draws which kind: the app index's `shards` gives each kind's shard count and **level**
    (`PAGE_LEVELS` in `apps/site/src/lib/app-page.ts`; the rule in `packages/schema/src/app-page.ts`, cases in
    `page-vectors.json` `levels`):
    - An app draws a kind itself only when the kind's level is at or below the level the app knows. It opens the other
      kinds' pages on the web.
    - A kind that needs a block no shipped app knows gets the next level.
    - Each level's blocks are `LEVEL_BLOCKS` (`packages/schema/src/app-page.ts`). Every copy the fixture builds uses only
      the blocks its kind's level reads, blocks inside lists too: a newer block fails the test until the kind's level
      goes up.
    - `pages` (guides only) stays as it is for the apps already installed: the first app draws every kind it lists.
    - Guides are level 1. Fish, plant, glossary, video series and equipment pages are level 2: the iOS app that reads
      `shards` knows level 2. Equipment adds no block, and an app that predates it leaves out the index's items of that
      kind, so it opens those pages on the web.
  - The app index (`/app/<lang>.json`, `apps/site/src/lib/app-index.ts`) against the built pages: its fish, plants,
    guides and glossary terms are the site's lists', a page out of search engines too, each with its page's copy in a
    shard, and so are its equipment categories, named as their pages name them; a species' `tax` and `from` lead to the taxon and origin pages that list it, `places` are the origin pages
    with what each lists, and `labels` say what those pages say. A breed's `card` is its page's data card; a breed that
    is a form of a listed species (its `basedOn`, through a parent breed) has that species' id as `of` and no tank-mates
    figures of its own, being checked as that species; a hybrid, or a breed linked to no listed species, has its figures
    and no behaviour, a fish of its own.
  - What's new for the app (`/app/latest/<lang>.json`, `apps/site/src/lib/app-latest.ts`) against the built
    `/vi/moi-cap-nhat/`: the same pages in the same order, with their dates, "Mới" or "Cập nhật" and sources, the
    first 200, each a page the app index lists; the index names the file (`latest`) only where the site has the page.
  - The app's invitations (`apps/site/src/lib/app.ts`; the switch, `apps/site/worker/app-switch.ts`: off, the owner's,
    on; `apps/site/test/app-invite.test.ts`), on a fixture build of each state (`pnpm test` builds `dist-app-off` and
    `dist-app-on` beside `dist`, `APP_INVITE_STATE`):
    - off: no `apple-itunes-app` meta, App Store link, invitation, badge file, app page or link to it, the sitemap and
      `llms.txt` included.
    - the owner's: the invitations hidden, each with "Mở trong ứng dụng" (the app's `aquatome://open?url=…`), shown only
      with the owner's flag cookie on an iPhone or iPad; the footer's and About's links in a `<template>` only the owner's
      script opens; no meta; the app page noindex, out of the sitemap, `llms.txt`, the site's search and the markdown
      copies, and answered 404 by the Worker without the flag (`worker/test/app-page.test.ts`).
    - on: every page's meta with its own address, each placement's campaign code and `hidden` until the check beside it,
      no link `rel=sponsored` (the readers' beacon would count it), and every string translated, as that build fails on
      one that isn't.
    - The checks that unhide them, run against each device and cookie; and in the browser (`e2e/app-invite.spec.ts`).
  - A fish's "Vì sao?" needs (`careNeeds`, `packages/schema/src/care-needs.ts`) against
    `protocols/care-needs-vectors.json`, which the app's own port of it will read: `careNeeds`' answer for each case,
    given the fish's app index entry as it is (every threshold, and just past it); each fixture fish page's panel as the
    file's lines and words; its Indonesian and Thai words as the site's translations (`UPDATE_VECTORS=1` rewrites the
    file but its notes and entries).
  - A fish's range (where it lives in the wild, `range` in its content and its app index entry, `lib/range.ts`) against
    `protocols/range-vectors.json`, which the app will read: each case's entry from its range (no range, regions only,
    records with no native countries, a cell on a border, more than five countries outside, no records, a record at
    sea); each fixture fish's range as the fixture content has it and its entry as the fixture build's index; the
    countries the index names; every fixture species valid against the schema (`UPDATE_VECTORS=1` rewrites the file but
    its notes and made-up ranges).
  - A fish page's "Phân bố tự nhiên" (`lib/range.ts` rangeParts, `lib/range-map.ts`, `test/range-block.test.ts`): no
    block without a range, words only without records, one kind of square without native countries; each line marked
    with its sentences' sources, a sentence shown only from a source the page cites; the records in words; the map's
    frame holding every cell inside the world, cells drawn together where one would be too small, inside, outside and
    both by shape. Its app copy is the page's (`app-page-kinds.test.ts`): the same lines, links, marks and sentences,
    and the map as a figure of the PNG the build made of it (`/app/range/<id>-<hash>.png`, its address changing with
    the map), at its size, with the page's words for it, its legend and its credit; the neon tetra's copy is in
    `page-vectors.json`, which the app's tests read with no new block.
  - The Worker's answers when the app posts readers' comments and photos (a bearer, no Turnstile) and reports them,
    against `protocols/talk.openapi.json`: a status the contract lists and a body of its shape, the account's daily
    limits on top of the address's, an account's posts and photo files deleted with it, every public post's `author`,
    and a report that takes a post down only from a signed-in reader and never once the moderation has kept it
    (`apps/site/worker/test/talk.test.ts`).
  - The fish identifier's answers, the page's and the app's (its session as a bearer, no Origin or Turnstile), against
    `protocols/fishid.openapi.json`: a status the contract lists and a body of its shape, the app counted per account
    and not per address, a bearer with no live app session refused rather than taken the page's way, and no wanted
    names from our own checks. A photo is kept only when the reader ticks `keep`: a JPEG with its Exif, XMP, IPTC and
    comments cut, under the account that sent it or no one's, listed and deleted by that account (never the image),
    deleted with the account and 6 months on, and seen only on the owner's dashboard
    (`apps/site/worker/test/fishid.test.ts`, `handler.test.ts`). The recorded answers the app's fake server replays
    (`protocols/fishid-stream-*.sse`, `fishid-rate.json`) against the same contract, and the contract naming each
    (`fishid-stream.test.ts`). Fish ID as an agent (`FISH_ID_AGENT`, off unless `1`): the loop's limits each forcing the
    last call with `tool_choice: none` (calls, tool calls, photos, input tokens, time on a fake clock), a tool that
    throws, an unknown tool, an append-only history, the next call's size guessed with the last answer and the new
    tool results, never more than 4 cache marks (`agent-loop.test.ts`); the agent off answering today's request and
    today's bytes, the progress stream only after admission, the fallback to today's call after a failed later call (on
    the same key after a 400, failed when there's no time for it), the day's dollar cap, retries by `Idempotency-Key`
    (a reader's own, a UUID or 400), a count given back only when our side failed (503) and photos Claude refuses
    reaching the reader's limit, parallel photos at the limit, a reader who drops mid-run (the run settles, its spend
    recorded), an unreadable facts shard, a model with no price (`fishid-agent.test.ts`); the ledger admitting in one
    step under parallel requests, its reservations, late spends, cut-off runs and refunds (`fishid-ledger.test.ts`);
    the search and the pages it opens (`fishid-agent-tools.test.ts`); every catalog page in exactly one facts shard of
    the build (`apps/site/test/fish-id.test.ts`).
  - The app's telemetry (its anonymous events and iOS's crash and performance reports) against
    `protocols/app-telemetry.openapi.json`: a status the contract lists and a body of its shape, every sample payload
    one the contract describes, an event that breaks it dropped alone and an envelope that does refused whole, nothing
    stored from a browser (an Origin), past the size caps or past the address's hour, our own copies stored marked as
    tests, a report kept as received in the private bucket only, and the dashboard's page with nothing yet and with data
    (`apps/site/worker/test/telemetry.test.ts`, `admin-app.test.ts`).
  - A shop click (`/go/`, `apps/site/worker/test/handler.test.ts`): every request goes on to the shop, and only a reader's
    click on one of our pages is counted, as the browser's own Sec-Fetch headers say; not a client calling itself a
    browser, not the owner. `e2e/shop-click.spec.ts` holds the rule to what a real browser sends. Found 2026-11-06: 65
    clicks counted since 10-29, almost every one the only click on its link, and no beacon `aff` event in that time, which
    a real click sends.
  - The owner's dashboard (`apps/site/worker/test/admin-*.test.ts`): each chart with no days, one day, only zeros, a
    negative day, a day not recorded and long labels; ranked bars with a negative value; and every time and day in
    the viewer's zone (a moment, a day's boundary in Analytics Engine, D1 and the clicks kept by Vietnam's day, a
    bad zone cookie).
  - The scoreboard (`/_ab/thanh-cong/`, `docs/metrics.md`, `apps/site/worker/test/admin-scoreboard.test.ts`,
    `e2e/dashboard-charts.spec.ts`): weeks from Monday in Vietnam's time, each metric's rule at its edge, this week against
    last at the same point, a week before the count unmeasured and not zero, a part that fails saying so in its place, the
    token reading its JSON and no page, and the page outside the section list the iOS app reads (web only, as that list is
    the app's contract).
  - The owner's dashboard on its own host, dashboard.aquatome.com (`apps/site/worker/dashboard-host.ts`, `access.ts`,
    `worker/test/dashboard-host.test.ts`):
    - Cloudflare Access's token on every request (RS256 by the team's certs, audience, issuer, expiry); missing or wrong
      in any way, 403, with nothing read. The host refuses everything while `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` is empty.
    - Until both are set, `/_ab/` on the site is the dashboard as it was. Then a browser's GET of a page there is a 301 to
      the host, and everything else stays on the site: the machine endpoints, the owner bar's `POST /_ab/hidden`, the iOS
      owner API. They aren't on the host, where Access would stop them.
    - Each page's links reach what the host answers (a public page's goes back to the site), its forms post only from
      the page, and every answer is noindex and never stored. A page added to the dashboard's rail (`WEB_PAGES`: NAV's,
      the scoreboard, the daily report's log and each report) is on the host with its line in `run_worker_first`
      (`/<key>/*`, and a `.json` form's own): without it the 404 page answers and the Worker is never asked, and a test
      names the line. No negative pattern there: one wins over every positive rule, and `!/id/*` would take the hidden app
      page in Indonesian and Thai from the Worker; a test holds each app page and its files to it. Files that skip the Worker carry noindex from `public/_headers`. A dashboard address
      printed outside it is the site's (`dashboardUrl`, `worker/paths.ts`), which opens before and after the move.
  - The owner's dashboard as JSON for the iOS app (`apps/site/worker/owner-api.ts`), against
    `protocols/owner-dashboard.openapi.json`: only the owner's app session, as a bearer, opens it (without a live app
    session, 401; another account's, 404; nothing changes for either); each section's blocks say what its page shows
    from the same data, in each of the page's states (headings, figures, tables, charts, photos and hidden pages, word
    for word), and the overview's to-dos, areas and last days what the overview shows; each button makes the request
    its page's form makes; a part that throws is 503; the times follow the zone the app sends; and
    `protocols/owner-dashboard-vectors.json`, the replies the app's fake server serves, are the Worker's own
    (`UPDATE_VECTORS=1` rewrites them) (`apps/site/worker/test/owner-api.test.ts`). The daily report's section: every
    block it sends, in each of its states, one the contract describes; its buttons set the delivery as the page's form
    does; and the phones the report notifies (`POST`/`DELETE /api/owner/push-token`: kept once with the time, a bad token
    refused), the same session only (`docs/contracts/owner-push.md` until the contract has the two paths).
  - The owner's daily report (`daily-report.yml`, `scripts/daily-report.mjs`, `apps/site/worker/daily/`), mailed at 07:00
    and pushed to the owner's phones as the owner set it, and logged on `/_ab/bao-cao/`, a section of the app's too. The
    collector on GitHub's JSON: a cycle told from the engine's hourly check, a workflow failing with no later success,
    what GitHub won't give named rather than counted as none, the retries, and a body the Worker reads
    (`apps/site/test/daily-report.test.ts`). The composer: what
    needs care, the highlights, the app with no data yet, and no address, picture or link to another site in a report
    (`daily-compose.test.ts`). `POST /_ab/report`: the dashboard token only, the send, 90 days in KV, one send for a run
    id even at the same moment, and the recipient in nothing but the send; email off, push on (with no key, no phone, a
    refusal alone or beside a mail sent), neither sent twice; a phone whose session ended (signed out, expired, the
    account deleted or no longer the owner's) dropped unsent, one registered again in a new session kept; the log page, each row saying what went out; the page's
    form, the owner's alone (`daily-report.test.ts`), on the dashboard's host too, behind Access and from the page only
    (`dashboard-host.test.ts`). The push: the settings, the phones kept and capped, the APNs token
    (ES256, the key's id, the team) checked against a generated key, the alert, each host, and APNs' answers (410 and
    BadDeviceToken drop a phone), with no token or key in a log (`daily-push.test.ts`).
- `pnpm --filter site e2e`: Playwright on that build, as a phone (Pixel 7) and a computer (`apps/site/e2e/README.md`):
  - **Journeys**: the things readers do (search the fish list, glossary cards, the tank-volume, tank-mates and Chihiros
    tools), and the owner's dashboard: a chart's day read by a tap, the pointer or the keys, and times following a
    device set to another zone (`dashboard-charts.spec.ts`, local only); moving around it on its own host, a form's real
    headers, the owner flag reaching the site (`dashboard-host.spec.ts`, local; live, that a stranger gets nothing); the
    daily report's email and push switched from its page (`dashboard-report.spec.ts`, local only).
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
    PageSpeed's mobile and desktop tests, run alone (`E2E_LIGHTHOUSE=1 … --workers=1`), in a job of its own beside the
    other checks. Each page has a budget:
    - accessibility, best practices and SEO at 100
    - layout shift, the site's own script weight (KB) and page elements: where they are now
    - performance, largest paint and blocking time: with room for run-to-run noise; a miss is measured again twice
      before it fails
    - pages that start below the budget are listed in `KNOWN` with the reason, held where they are until fixed
    - locally nothing from other sites loads (ads, analytics, photos); live, the page as readers get it
- Deploys from GitHub Actions (`deploy.yml`, which engine runs start too) run `pnpm test`, then the page checks and
  Lighthouse on the **real** build before uploading (`deploy.sh` with `E2E_GATE=1`). The fixture build's browser checks
  run in `ci.yml` only: the engine's pushes change `content/`, which the fixture build doesn't read.
- A pull request that changes only the iOS app (`apps/ios/`, `ios.yml`, `testflight.yml`) skips the site's checks;
  `protocols/` is the site's too.
- Not gated yet: `deploy.sh` run on the owner's Mac (the video cycle). Layer 2 watches production for what slips through.

### 2. Production watch (live)

- `watch.yml` runs the same browser checks against aquatome.com after every finished deploy and at 05:00 (Vietnam),
  and beside them, in a job of its own, Lighthouse on the live pages, ads and all: a page that drops below its budget
  becomes an issue like any other. (PageSpeed Insights' own API needs a key from the owner's Google Cloud project for
  its quota; Lighthouse here is the same test.)
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
  - Claude runs on the owner's subscription accounts in turn (`CLAUDE_CODE_OAUTH_TOKENS`, `e2e/claude-accounts.ts`): an
    account out of its usage limit, or whose token is rejected, is set aside and the review goes to the next.
  - A review that hits Claude's usage limit on every account (the engine's pattern, `e2e/claude-limit.ts`) did
    not run: it is skipped, so it opens, updates and closes no issue, and the PR comment counts only the pages reviewed
    and says how many did not run, and why. Found 2026-11-02: the weekly limit opened 17 issues, one per page, and two
    PR comments read "Nothing serious found" with no page reviewed.
- Calibrated on the real bug: with the old `/ca/?q=chach` code back, it reported "search results pushed below an
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
- Remaining risk: the agent job holds one Claude token (`CLAUDE_CODE_OAUTH_TOKEN`, never the account list, so it can
  reach only that account) and can run commands. Its input is the bot's own issues, or issues a collaborator labelled
  `autofix`. It doesn't rotate accounts: when that account is out of its limit, the fix waits for the next issue.
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
    the site's own search, the fish list and the app's index, which lists every fish and plant the site's lists show,
    a low-scored translation too.
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
- **Product reviews.** A product page's "Các bài review nói gì" (`pnpm engine product-reviews`, one product a cycle, `packages/engine/src/product-reviews.ts`) summarizes a few YouTube reviews: a title check, one cheap model call on the shortlist, one extraction call a review, one writing call. Code holds the result to what the reviews said, because the writer has no second reader:
  - each finding quotes the transcript: words not there are dropped, and a link's second comes from where the quote is, not from the model. A figure must be said near that moment
  - a point cites findings by id, and a figure must be in the findings it cites; "agree" needs two reviews, "differ" two reviews on its sides; a point that fails is left out, after one rewrite with the reasons
  - the writer never sees a channel, a title or an address. A channel's name, talk of the video or a reviewer (`names-source`, also listed for every page written from videos), a score or rating, or saying AquaTome controls a product it doesn't (`control-claim`) keeps a point off the page
  - a product or brand name in a point must match a spelling from the title or description of a review it cites, or our catalog: product pages, what the app controls, brands two guides give (`packages/engine/src/review-names.ts`), because captions mangle names. A near-miss takes that spelling: the same letters without their marks, or one letter off in a name of 4 or 5 letters and two in a longer one, starting with the same letter, never in a name of 3 letters or fewer, never where a number differs, and never when two spellings are as near. A name that matches nothing gets the one rewrite, then the point is left out. Fish and plants aren't checked (by our pages' genera and the word before them), so "Anubias Nana" stays beside a "Nala" light
  - the measured table's values are the extraction's, never the writer's
  - research running again keeps the reviews' sources and text, cited by address and not by place
  - "Điều khiển bằng AquaTome" comes from the code (`@aq/schema` devices: the light tool's model table, and the plug makers with a `PlugSource` in the app, a test holding the two together), never from the text, so a page stays true when support changes. AquaTome's own test notes (docs/research/aquarium-device-control.md) are curated facts naming the light tested, for lights it controls; Week Aqua's aren't used
  - no thumbnail becomes a page photo: the top review plays from the same player as a species page's videos
- **Photos.** No people (faces dropped), no watermarks (credits, dealer logos, site names or species names added on the
  photo: `pnpm engine watermarks`, macOS Vision reads the text and the model judges it; a marked photo is blocked for
  good), no dead fish or fish as food (markets, plates, catches landed or held, preserved, mounted or museum specimens),
  each photo must show its species, open licences or permission only.
  Pages show photos from our own media host: a Commons or iNaturalist photo waits for `pnpm engine mirror-photos` (every
  cycle), and a public build leaves it out until then (`setsCookies`), since those hosts set third-party cookies.
  - **Galleries and their targets.** Every species, plant and breed has a gallery, topped up each cycle to a target set
    by how much readers want it (`packages/engine/src/gallery-plan.ts`, the reason beside each number): the 12 staples
    100, what shops in Vietnam, Indonesia and Thailand sell 60 (fish lists and plant lists, `engine-state/shop-lists/`)
    and so do the bred fish they keep most (`POPULAR_BREEDS`: balloon molly, koi, the goldfish, betta and guppy forms…),
    the most-kept fish 40, pages two or more sources write about 30 (a breed: two or more sites), every other page 20.
    The most popular pages go first, `GALLERY_SHEETS` model calls a cycle (`scripts/engine-cycle.sh`). A gallery is
    never padded: a page whose sources run dry stays short and is listed in `docs/review/galleries.md`, then read again
    a month later.
  - **Sources.** iNaturalist first: every observation of the taxon (found by its name or a synonym) with a CC0, CC BY or
    CC BY-SA photo, research grade first, then those whose community ID agrees; aquarium and garden observations count.
    Then Wikimedia Commons, GBIF occurrence photos (observations and living collections, not preserved specimens, not
    iNaturalist's copy) and Openverse (Flickr). A breed has no scientific name: Commons (its category, then its English
    and trade names) and Openverse, never iNaturalist or GBIF, which give the wild fish; it is screened for that line
    alone, and a photo another breed's page shows stays there. Each photo's licence is read from the source's API for
    that photo, never assumed: CC BY-NC, the default on iNaturalist and Flickr, stays out, since the site carries ads
    and affiliate links. Photos a source gave permission for (`content/sources.json`) and Unsplash photos join through
    their own steps. Each source is read at the pace it asks for (iNaturalist about one request a second; Openverse 200
    a day without a key), and each page keeps its place in `engine-state/gallery/<id>.json`, so the next cycle continues
    there.
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
    - **Dead fish and logos.** The check also answers "dead" (a dead fish or fish as food: a market, ice, a plate, a
      catch landed or held, a fish on a tray or the floor, a preserved, mounted, museum or lab specimen, a museum shell;
      when it can't tell, dead) and whether a logo, stamp or mark was added on the photo, which the watermark step's
      text reader can miss. Either is about the photo: one such verdict takes it off every page, guide and gallery and
      onto `_photo-rejected.json` ("dead: …", "watermark: …"). A logo found, the same photographer's older-judged photos
      are asked too. `pnpm engine recheck-photos` (each photos cycle, before `check-photos`) asks again, once, the photos
      judged before the check asked whose notes from earlier looks (the checks', the watermark step's, the gallery's
      captions) say dead, market, preserved, museum, cooked and the like; then it finds none and calls no model. Found
      by the owner (2026-11-05): dead peacock bass piled at a market, with a round logo, leading their page; its note
      said so and the verdict was "yes".
  - **Credits.** Every photo names its author and links its own page on the source (the gallery's viewer and the
    page's credits), with its open licence by name; a photo a source let us use names no licence, and nothing on a page
    or in the app's copy says "with permission" (owner, 2026-11-05; `apps/site/test/photo-permission.test.ts`). The
    gallery page names the sites its photos come from. Commons, iNaturalist, Flickr and GBIF photos are copied to our
    media bucket with the credit kept. An Unsplash photo, wherever it shows, reads "Ảnh:
    <name> trên Unsplash" (in view, not behind a ©), the name linking the photographer's Unsplash page and "Unsplash"
    its home, both with AquaTome's UTM, as Unsplash's API guidelines ask (`apps/site/src/lib/unsplash.ts`); in the
    credits list and the gallery's viewer each photo's own page is linked too. `pnpm engine unsplash` first fills the
    photographer's page (`authorUrl`) of photos stored without one, a request a photo, as many as the hour allows
    (`unsplashCredits`); until then the name links the photo's page. Found when Unsplash refused the site's API key for
    production (2026-11-05): its reviewer saw neither the photographer's name nor Unsplash. The app links the line the
    same way, from its copy of the page (`author`, the name as the line writes it, and `authorUrl`;
    `PageDoc.Image.Credit` in AquaTomeKit); in its card lists' credits, once the name links the photographer's page,
    each photo's own page is a number, as in the site's credits list, and a line's links are underlined, as the
    site's are. Its photo viewer doesn't yet link an Unsplash photo's own page once the name links the photographer's.
  - **Removal.** A reader or a photographer writes to the address on the contact page (`/lien-he/`, "Bản quyền và
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
- **Shops' blogs: ideas only.** On 2026-11-03 the owner gave AquaZone, Aqua House and Cá Cảnh Tài Lộc's blogs as
  "sources for content ideas/writing", and Chợ Thủy Sinh's fish list. No permission for their text or photos was
  stated, so `content/sources.json` records them as `"publish": false`, scoped as the forum's text is.
  - The engine reads only their posts' titles (`pnpm engine ideas`, `packages/engine/src/ideas.ts`), a week apart: the
    blogs' sitemaps, and Aqua House's news category through WordPress's own API, 5 s between requests. The model turns
    the titles into topics the handbook has no guide on (no species profiles, products, ponds, koi, saltwater or feng
    shui), most asked first, in `engine-state/_ideas.json`.
  - `pnpm engine write-ideas` writes AquaTome's own guide on the most asked ones, `IDEAS_PER_DAY` a day (2), last in the
    rewrite job: the research of `pnpm engine topic`, with the shops' posts on the topic as leads it is told never to
    copy, to check elsewhere (shops sell what they write about), and to cite only for a Vietnamese name or what is sold
    in Vietnam. An idea written or found to have nothing reliable is not tried again.
  - Chợ Thủy Sinh's fish, shrimp and snails go into the private Vietnamese shop list (`engine-state/shop-lists/vi.json`:
    which species come first, and the names shops use) by a seeded run, `pnpm engine shop-list --lang vi --seed`. A
    shop's list seeded later adds only the species the list lacks, after it. Its robots.txt (Cloudflare's) says `search=yes, ai-train=no,
    use=reference`.
- **A language ahead of the site.** The engine writes a language with `served: false` in the language table
  (`packages/schema/src/langs.ts`; Malay now) before the site serves it, last in each rewrite cycle. Its files reach
  `content/` and `apps/site/src/i18n/`, and nothing reads them: `apps/site/test/unserved-langs.test.ts` builds the site
  with one of each and holds its pages, lists, app files and counts to none, and `worker/test/unserved-langs.test.ts`
  holds the root, the cookie and the chooser.
  - Each of its steps starts only while the cycle has run under `AHEAD_BEFORE_MINUTES` (135): it gives first, so a long
    cycle costs the unserved language its turn, not the served ones theirs. The buying guides go two a cycle and the UI
    text 120 strings a cycle, its first runs being the long ones. No build asks for its UI text, so the strings come from
    a served language's dictionary (`translate-ui.ts --unserved`).
  - Written like any page, and held like one: reviewed writing, `pnpm engine metric` and the real-content test on imperial
    figures, `pnpm engine sweep`'s text and name fixes, the test on two pages with one name, `topic-check`, Wikidata's
    names (a species cached before the language joined is asked once for it), a guide photo's section heading.
  - Left until it is served, as they read pages readers can reach: `pnpm engine reader` (a model call a page), `pnpm
    engine audit` and the real-content test on the rules (`loadPages`), and the orders that follow readers (gallery
    targets, which new pages to fetch first). A shop list can be made for it (`pnpm engine shop-list --lang ms`), and
    gives its pages names and its translation order; it joins the others' orders when served.
- **Merging parallel work.** The four engine jobs run at once. Pages two jobs both write are merged by source
  (`scripts/merge-entity.mjs`), not by whole file: whole-file merging once dropped Seriously Fish's data from 32 species.
- **Sane numbers.** Figures outside plausible bounds (°F given as °C) are dropped, and so is a minimum tank length that
  its source gives only as a volume (its "75 gallons (about 284 litres)" once made Cá đĩa's card say 284 cm; The Spruce
  Pets' "10 gallons (about 38 litres)" became 40 cm on 19 cards), when the engine reads a page and again at every build
  (`tankIsVolume`). Where sources disagree, every page shows the range they all accept; a lifespan, no care target,
  the widest (Seriously Fish's when it gives one).
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
- **Where a fish lives, from its sources only.** A species' `range` (`pnpm engine range`, `range.ts`, each rewrite cycle):
  - `native`: the model reads what its cited sources say (distribution, habitat, quick facts, notes; `RANGE_LIMIT`
    species a cycle whose text is new or changed) and gives each country with the source's sentence. The engine keeps
    a country only when that sentence is in that source's text word for word and names the country (its name, an old
    name or its adjective: `countryOf` in `@aq/schema`); a lake, basin or island goes in `regions`, never a country it
    lies in. Each source in the engine's registry has a tier (`sources.ts`): a species database or a scientific or
    aquarium-specialist site is `specialist`, a general pet-care site (The Spruce Pets) `general`. When a specialist
    says where the species lives, only specialists' countries count, and a country only a general site gives is dropped
    (`outranked`, with its sentence); general sites count for a species no specialist covers. A country a source that
    counts calls introduced or misidentified is left out. The sentences and the refusals are in
    `engine-state/range/<id>.json`, with the species' origin pages (`places`) beside them as a check, and in the
    content as `quotes`: the sentence each country and region rests on, for the page to cite. A source that says
    nothing gives no `native`; nothing comes from the model's own knowledge, FishBase or IUCN.
  - `records`: its wild records on GBIF, open licences only (CC0, CC BY 4.0; never NC), no living or fossil
    specimens, coordinates without issues, on GBIF's map squares (1.40625°), each with its records in a native country
    by GBIF's country field. About a dozen requests a species, paced and retried, `RANGE_RECORDS` species a cycle, each
    again after 30 days; squares that don't add up to the search's count fail the species.
  - A failed call or request leaves the species as it was, tried again a day later.
  - The page shows it under "Phân bố tự nhiên", before the sources' own text about the wild: the countries (linked to
    their origin pages) and regions, each line with its sources' marks and the sentences on request; the records in
    words; and a small map (inline SVG on Natural Earth's 1:110m outline, cropped to the records, no tiles or map
    library) with GBIF's credit, the licences and the day, linked to GBIF's own search for the same records.
  - Found on the sample (docs/research/species-range-sample.md): GBIF's records mix native and introduced
    populations, and its checklists call Betta splendens introduced in Thailand, so the native range comes from the
    sources.
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
    - a sentence that only says the text is translated, adapted or used with permission, the source's note under an
      article it reprints ("Được Loaches Online chuyển thể với sự cho phép.", "… dengan izin", "… โดยได้รับอนุญาต"):
      dropped, its paragraph too when it is all there is (owner, 2026-11-05). A sentence that only has the words ("Chỉ
      bắt cá với sự cho phép của cơ quan quản lý.") stays. No audit rule holds it at zero yet: the sweep alone
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
    - a species' other names ("Tên khác", its search names, the names other pages' text links it by), in each language:
      its own only (`packages/engine/src/alt-names.ts`). A breed page's own name leaves it, that page being found by it
      ("Bubble Eye Goldfish"; never a breed's other names: a name both list is the species'). A bred line's or colour form's (the species' name with a word such as Alien, hybrid, lai, albino, koi,
      Super, spade tail: "Alien Betta Green Hybrid") goes. A name written twice (case, accents, punctuation, "Cá" or
      ปลา before it, "X (Y)" of two it has, its own name or scientific name again) is kept once, best written; words
      joined or split ("Horse face", "Horseface") are two names, as search reads them. Each name off is in
      `engine-state/_names-off.json` with why. The merge, `shop-names` and `wikidata-names` add only names it keeps.
      Found by the owner: 25 of the betta's 32 other names were its Alien hybrids' and a Red Spade Tail's, from
      shop listings of one variety each that every merge had kept. A run on a copy (2026-11-04) took 769 names off 451 species
      (571 pages in three languages): 5 breed names (4 species), 52 variety names (15), 335 written twice (239), 174 the
      page's own name again, 203 its scientific name again. The betta keeps 6.
    - a breed's links to the species it is a form of (`basedOn`) and to its parents' pages (`parents[].species`),
      from its research (`engine-state/breeds/<id>.json`, `breeds.ts` linkBreed): set where it has none and exactly one
      species page is that species, by the page's scientific name or a synonym GBIF gave the engine
      (`engine-state/_gbif-names.json`, exact matches only). Never two species ("Poecilia sphenops / Poecilia
      latipinna"), a genus or a variety. A link it has stays, and when the engine writes the page again it keeps what
      the breed is a form of (and its parents' links on a `--redo`). Each link is in `engine-state/_breed-links.json`. A breed used to be linked only when written, so those written before their
      species had a page never were: a run on a copy (2026-11-05) made 13 links on 12 breeds (9 species a variety is a
      form of, 4 parents' pages).
    - a breed's other names, in each language, after its links: its own only (`alt-names.ts` cleanBreedAltNames). A name
      its species has, or a hybrid's parent (its name, other names or scientific name, compared as above), leaves it:
      other pages' text names the species by it, and the breed's page listed every guide naming the species. So do the
      names a note calls the species' ("Cá xiêm / cá chọi (tên chung của loài)", and "Cá chọi" with it). A breed whose
      own name is the species' (the koi, "Cá koi" on *Cyprinus rubrofuscus*) keeps the names they share. Another breed
      page's own name leaves it ("Cá vàng Lan Thọ" under the lionhead: the Ranchu's), and a name written twice is kept
      once, as on a species page; a breed has no colour-form rule (its lines' names are its own). Logged in
      `engine-state/_names-off.json` as `lang/breeds/id`. The engine's breed writer and its prompts keep to the same.
      Then a guide's breeds (`mentions`, which `topics.ts` breedsNamed set when it wrote the guide) that its text no
      longer names by their names leave it. Found by the owner: the halfmoon betta listed "Cá xiêm" and "Cá chọi", so
      its page listed the betta's guides and a pea puffer video. A run on a copy (2026-11-05) took 22 names off 10 breed
      pages: 7 the species' (halfmoon 3, plakat 4), 3 another breed's (koi 2, lionhead 1), 12 written twice; the koi
      kept the 7 it shares with its species; and the halfmoon and plakat off one guide.
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
6. **A change to how a page looks shows it before and after.** On a PR that changes `apps/site/src`, ci.yml's job
   `shots` screenshots the same pages of the base's fixture build and the change's, at a phone's size (Pixel 7, 412 px)
   and a computer's (1280 px). It keeps the pairs that differ, side by side, as the `site-page-shots` artifact, and lists
   them in its run's summary. The PR links that artifact and names the pair that shows each improvement it claims. Its
   author checks their work against those pairs before asking for review, and a reviewer checks each claim. Run it
   before pushing with `apps/site/e2e/page-shots.mjs` (apps/site/e2e/README.md). A page that changed but isn't in the
   sample is named: `node e2e/page-shots.mjs <before> <after> <out> /x/,/y/`.

### main's ruleset (GitHub)

- `main` can't be deleted or force-pushed. Changes arrive by pull request, squash-merged, after the `test` check
  (ci.yml's last job, green when every site check passed or an iOS-only change skipped them) passes. Merged branches
  are deleted.
- Let through: repository admins (the owner, and the owner's Mac pushing the engine's pages, photos and videos), and deploy keys. The engine
  pushes content over its deploy key (`ENGINE_DEPLOY_KEY`, engine.yml), since GitHub Actions' own token can't be let
  through on a personal repository. That push starts deploy.yml like a merge does.
- Secret scanning blocks pushes that contain a known kind of key. Dependabot opens PRs for vulnerable dependencies.

## Mobile apps

The iOS app (`apps/ios`, SwiftUI) is checked by `ios.yml` on every PR and push that touches `apps/ios/**` or
`protocols/**`, and every night on main. On a draft PR, `ios.yml` runs none of its macOS jobs: they run once it's marked ready, then on each push, so the
site's engine isn't queued behind every push to a draft. Mark a PR ready when it's done and checked locally, and merge
it when the iOS jobs pass. A PR runs the UI flows in part: the smoke set, the classes of the flow files it edits, and
the page shots when its change can reach the pages; every flow when it changes `ios.yml`, the scripts that pick and run
the flows, or the flows' shared code (the owner's call of 2026-11-05, as a PR's run of every flow its change could
reach held GitHub's Macs for one to two and a half hours). Main runs every flow after merges (batched: of the runs
waiting, only the newest is kept) and each night, and a PR labelled `ios-full` runs them all too
(`apps/ios/README.md`): ask for it on a change to a model many flows share (LightsModel, HandbookModel's fixture,
AccountModel). A failed run on main opens an issue labelled `ios-main-red`; a break that only main's run catches is
fixed forward first, in a PR of its own. Android
(`apps/android`) will follow the same pattern.

| Check | Catches | Where |
| --- | --- | --- |
| **Shared vectors**: device frames and replies, saved-tank records and merges, a tank's fish checked as the tank-mates tool checks them (the site's own code, bundled; a breed as the species it's a form of), fish and plants filtered as the site's lists filter them, searches listing first the pages named what was searched for, as the site's search does, and pages read as the site writes them (each block this app can't read one "open on the web"), the owner's dashboard's replies, buttons and errors (every block read, none dropped; a kind or field it doesn't know skipped), against `protocols/*-vectors.json`, which the site's tests read too | the app and the site sending different bytes, a reply misread, tanks checked or merged differently, a tank-mates answer that differs from the site's tool, a filter that keeps or drops a page the site's list wouldn't, a breed found ahead of the species named what was searched for, a page misread or failed for one block | `swift test` in `apps/ios/AquaTomeKit` (job `kit`) |
| **Session tests** against `FakeLight`, a light that answers the way the real one did in hands-on tests | wrong order or pace of commands, overlapping commands, lost read-backs | same |
| **Account client** (`AccountSync`) against `FakeAccounts`, the accounts server in process, and the contracts `protocols/accounts.openapi.json`, `protocols/talk.openapi.json` (a reader's comment and photo posted as the account, another's reported) and `protocols/fishid.openapi.json` (a photo identified as the account; the stand-in's every answer held to the contract's shape, as the site's tests hold the Worker's) | a fish-ID photo sent without the bearer, with an Origin or a Turnstile token, larger than the site's (1024 px, JPEG 0.85) or with its location or camera data, a box cut from the shrunk photo or from the photo as stored rather than as shown, an answer or refusal misread (the account's day, the site's day), our own copies not marked, a post without the fields its contract takes or with a Turnstile token, a report not sent as the account (or, signed out, as the site's page), an answer to it misread (a 404 that isn't the report's own taken as received), a block that stops holding once the site says who posted, a photo's consent sent when the reader gave none, a file part without its filename and type, a name or comment the Worker refuses unread let through (its lengths in UTF-16 units), a photo sent with its location or camera data or larger than the site's, an answer its contract gives a post misread, requests the server would refuse (a path or method not in the contract, a cookie or Origin, no JSON body, no `client: "app"`), a merge that lets a fast clock win or loses a change made during a sync, a Google sign-in Google would refuse (another client or redirect, no PKCE, a code exchanged without its verifier) or one that takes another sign-in's answer (its `state`), a refused record lost, an old session left open, busy not retried, a passkey answer the server's WebAuthn check would refuse (id and rawId differ, padded base64, another origin, a user handle that isn't the account's, a challenge used twice), a new passkey it would refuse (another origin, another account's challenge, one used twice, a passkey an account has) or take more than 10 minutes after a sign-in | same |
| **Plugs** (`Plugs`): `TuyaPlugs` against `FakeTuya`, Tuya's cloud as its docs describe it (signatures checked, Tuya's two worked examples), and `PlugBoard` over it | a request Tuya would refuse, a token not kept or not replaced, a page of devices missed, the indicator light taken for an outlet, a switch that toggles, is sent twice, retried or queued, or goes to a plug listed offline, a state shown as asked instead of as the plug reported, an unconfirmed or lost switch not read again or read more than once, an older list answer putting an old state back, an expired trial or wrong keys not told apart, a plug record that keeps state or loses a newer client's keys, a strip's timers misread (a disabled one, one that switches on, or one that ran once on a day gone, taken for one that cuts the power; a zone told apart by its name rather than its time), read more than once while a light's card is open, a failed read not said, an outlet assumed for a light rather than picked, another maker's plug offered for one | same |
| **Pages on the phone** (`PageCache`, `KeptPictures`), with the site stood in for | a guide read once not opening offline, a kept copy shown without the newer one read for next time (or read more than once a run), a page newer than its kept shard opened on the web, a kept shard of another shard count or one this app can't read used, a shelf's guide listed as kept before it and its pictures are whole, a stop that lets a guide on the list or reads further shards, a removal that deletes a shard or picture a kept guide still needs, kept pictures that don't outlast the run | same |
| **UI flows** (XCUITest) on the simulator, which gets the fake light | journeys that stop working, by flow class: "UI flows, by class" under this table | `xcodebuild test` (jobs `app`, `handbook` for the handbook's flows and a tank's fish, plants, guides and tank-mates check, and `lights` for the light flows, `handbook` and `lights` each in two halves, on runners side by side, two at a time on the repository's own Mac (apps/ios/README.md); a test that hangs is stopped after ten minutes; on a pull request, the smoke set (ten flows across the main journeys), the classes of the flow files it edits and the page shots when its change can reach the pages, as `apps/ios/scripts/flows-to-run.py` decides, each job skipped when it has none; every flow on main after merges (a run that started is never cancelled; of those waiting, only the newest is kept, and it covers every merge since), every night on main, by hand, on a pull request labelled `ios-full`, and on one that changes the app's start, `ios.yml` or the scripts that pick and run the flows); a failed test runs once more, as the site's journeys do, and one that passed only on its retry is a warning on the run |
| **Translations**: every string in the code and Info.plist has Indonesian and Thai, with the same placeholders | untranslated or broken strings | `apps/ios/scripts/check-strings.py` (job `perf`, on every ready PR) |
| **Performance budgets** (`apps/ios/perf-budgets.json`): launch to the first responsive screen, the CPU time and peak memory of flinging through 800 fish, the archived app's size; each test's median against its budget | the app getting slower, heavier or bigger without anyone deciding it should | `PerformanceTests` and `apps/ios/scripts/check-perf.py` (job `perf`, always on GitHub's Macs, on every ready PR and every push to main; not nightly, as each change was measured by its PR's run); on a PR, `--tightens-only` against main's budgets |
| **Signing**: the app archived, signed and exported as for the App Store | signing that stopped working (certificates, profiles, entitlements); App Store Connect's own checks run at the upload on main | `testflight.yml`, on a PR that changes the project, `Config/` or the workflow; on main it uploads |

UI flows, by class (a line each, with a blank line between, so pull requests that change different flows don't conflict):

- `AccountFlowTests`: signing in to an account on a stand-in server: a new phone gets the tanks made before and after signing in, Google signs in (on stand-ins for its page and token endpoint) and closing its page leaves the reader signed out with nothing said, a code sent by email signs in (a wrong one refused) and the same address on a new phone opens the same account, a passkey added on the website opens its account (one no account has is refused with what to do), a passkey added in the app opens its account and, long after signing in, signing in again comes first (by email too, with what the add says kept), signing out keeps the tanks, deleting the account empties it, no sign-in with accounts off or for a store from a newer app.

- `AppIconFlowTests`: the app's icon chosen from its picker (every icon listed in the app with a preview to draw, none unlisted) and the default again.

- `AppLinkFlowTests`: the app opened from a web page as the site's "Mở trong ứng dụng" opens it (`aquatome://open?url=<a page>`, Vietnamese at the site's root): opening the app, a page it draws once its index is read; while it runs, a tool's tab, a page it has no screen for as its web page on the Tìm tab, a bare `aquatome://` back at the home, and another site's address changing nothing.

- `FactsCardFlowTests`: a fish's facts under its name as the site's data card writes them (its lifespan after its size, one figure when the sources give one, none when they give none; three to a row, the last never alone; the difficulty read as its badge, "Độ khó 2/8: dễ"), the sources behind them and the page's credit under them, as a row with the same badge over a web page, a breed's own figures on its and a plant's care on its.

- `FishIdFlowTests`: the fish-ID tool opening the app's own screen (a photo picked and sent as the reader's account, a fish boxed and only that part sent, cut from the photo at full size, the guesses as the site shows them, a guess's page and its genus's pages opening in the app and back from one the guesses and the box as they were, signed out the sign-in first and then the tool with the photo kept, the account's day used up, the site's day used up, accounts off and no network each said in the site's words, a long wait said as it goes with the photo kept as it was, no answer in the request's time not taken for no network, a session refused while still signed in said).

- `HandbookFlowTests`: search the handbook (no accents, other names, one kind, a tool by its page's own words, a page opens (drawn by the app when the site writes it as blocks; else the web page, a stand-in for the site's naming its path), the Chihiros tool, the "Bể của tôi" tool), browse it from its home (a fish group, every fish, the plants by where they go, the glossary by letter, the video series and the video guides on a shelf of their own with their length, not among the written guides), the fish filtered to one of the reader's tanks as the site's list filters them (those missing a figure listed after) and the plants to the tank's light; what's new as the site lists it (newest first, a page added then updated there twice, a row opening its page, a link to the whole list), and no row for it from a site whose index names none.

- `LightFlowTests`: the lights screen as the site's Chihiros page (a new light connected with its setup steps; the light's own schedule never shown as running or put in the form; a clock seven hours slow and one lost in a power cut set right; a preset written, then another without asking, then undone back to the first; the write bar in view at the top and the end of the screen, saying what will be written; a schedule written before used again, also while a colour is tried on the light, with the last six listed, and none for a light that dropped; the light kept on a tank with the schedule written to it; a saved light listed after a relaunch and connected with what was written to it; the plan kept without a light; presets by tank type, the chosen one marked, keeping the colour mix; the day's on, off and ramp handles dragged (off held two ramps after on), the ramp menu, the hours advice, and the schedule they write; colour looks, one brightness and each colour; a colour tried on the light, then its schedule again; the day previewed on the light, stopped at once or played whole to full and off, then its schedule again; leaving the app mid-test or mid-preview sending one frame only, last, after levels already on their way, and leaving "Tắt đèn" as it is; disconnecting mid-test or mid-preview sending the scene mode before the link drops, and a light that drops mid-test kept as set by hand until "Theo lịch"; Tắt đèn and Sáng hết, then back to the schedule; a dropped light, also one dropped while being read, connected again without a scan; the frames "Theo lịch" sends (the written schedule again, or only the scene mode); a light renamed and forgotten; no Bluetooth, with planning still open; a write ending manual levels; old firmware refused; disconnect, also mid-connect); the outlet a light is plugged into picked on its card (the one named for a light offered first) and its timer that cuts the power warned of beside a clock lost in the cut (in the plug's zone, said so, on a phone in another), and none once Smart Life turns the timer off, the pick taken back (asked again, after a launch too), a light said not to be on a smart plug not asked again on this phone and picked after all.

- `NativePageFlowTests`: a fish drawn by the app with each of its parts (where it's from, other names, the summary and keepers' mistakes, the sources behind its figures, tank-mates with its temperament and smallest school and why to keep one away, the Vietnamese climate, its gallery with every photo credited and its words read once, the sources' terms, breeds, videos; none left to the web) and saying what each part is to VoiceOver, a tank-mate opening its page, a group named in its text opening the app's shelf of that group, the tank-mates tool opening set to the fish and a breed the index lacks opening as web pages in the app, a fish's readers' photos and comments as the site has them (each comment's day as the site writes it, the site's mark on a good answer) and a plant with none showing neither, an Unsplash photo's credit naming its photographer and Unsplash, each a link and not the whole line (in a card's credits the photo's own page a number), a plant and a glossary term drawn by the app, a video series drawn by the app (its counts, the playlist and channel it follows, its guides as cards, each picture credited) and a card opening its guide, a guide drawn by the app from the site's blocks (no web page; a table as a grid while its columns fit, else each cell under its column's name, none without it), a page it names and a link in its text opening in the app on the same tab, a word's tip, a source's mark small and raised after the words it backs and naming its source, the credit's link scrolling to the sources, the bar naming a page once its name has scrolled away, sharing and the browser in one menu, a part it can't draw opening the web page and two in a row offering one, a guide opened before the app draws its kind staying on the web page, every part saying what it is to VoiceOver, a link from the tanks tab opening on the tanks tab, a tool it names opening its tab.

- `OfflineFlowTests`: a shelf of guides kept for reading offline, at once on Wi-Fi, listed in one place on the home and let go of there, asked first on mobile data, stopped with nothing half-kept, also from the shelf left and come back to, stopped by removing the kept pages, no longer listed once the site splits its pages anew, not started with too little room.

- `OwnerFlowTests`: the owner's dashboard (the stand-in server serving `protocols/owner-dashboard-vectors.json`) shown only to the owner's account, its "Mấy ngày qua", a to-do opening its section at the heading it names, a section's chart and table, a reader's photo approved and the section read again, one removed only once the owner says yes, a page hidden by the section's form and brought back, a refusal showing the server's message, the daily report's email turned off then on again, a session ending while it's open (sign in again, the row kept), and the server's storage down (its message, then tried again).

- `PageShotsFlowTests`: a fish, a plant, a guide and the fish-ID screen screenshotted top to bottom for a change's before and after, and the owner's dashboard (its overview, a section with charts and tables, and the daily report's settings).

- `PhotoViewerFlowTests`: its photo viewer (opened where tapped, the row's thumbnail at once while the full photo comes, only the two photos either side fetched, swiped, tapped bare, zoomed without swiping, pulled down to close).

- `PlugFlowTests`: smart plugs on a tank, on the stand-in Tuya cloud and with no account: the project's keys set up, wrong ones said so and not kept, the right ones checked by reading the list and kept, then removed, a plug added and its outlets named (labels from Smart Life, kept across a launch, not offered for a second tank), an outlet switched and confirmed, a heater, a CO2 or an outlet with no role asks first, a plug that doesn't confirm shown as it reports, a plug gone offline refused and shown offline, a plug taken off the tank.

- `ReaderPostFlowTests`: a comment posted as the reader's account (signing in first) and shown on the page at once, still there when the page reads its comments again, a reader's photo not sent without a name, the reader's consent or one picked (the site's words for each), a photo sent with consent showing the photo and the link that takes it back once, to keep (a tap doesn't open it), no posting with accounts off, another reader's comment reported signed out (asked why, thanked, and kept off the phone past a relaunch) and their photo reported from its viewer, a poster blocked (their comments and photos hidden, the others kept) and let back from the page and from the tanks tab, AquaTome's contact page on the home with accounts off.

- `ReadingFlowTests`: a guide saved to read later and kept after a relaunch then taken off, the pages read last newest first.

- `TankCheckFlowTests`: a tank whose fish don't go together and are too many and too long for it warned as the site's tank-mates tool warns, the check following a fish taken off, a species and a breed of it checked as one fish, a tank with no size given the tank its fish need, a fish the handbook doesn't have checked with nothing known rather than left out.

- `TankLifeFlowTests`: a fish put on a tank from under its name on its page, not from the bar (starting at its school size; one already there gets the new number), a plant put on a new tank, a fish added from the tank in the handbook's list, its number changed and a plant taken off, kept after a relaunch, the guides naming a tank's fish listed on it and opening, the video guides apart.

- `TanksFlowTests`: add a tank with its size and litres (shown as typed, halves rounded up), a partial size refused, a name kept to 80 characters, edit a tank keeping its other fields and find it after a relaunch, a new size dropping litres given for the old one, delete a tank, a tank's fish and plants opening their pages, a store from a newer app or one it can't read left alone, adding again after a failed save.

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
6. **A change to how a screen looks shows it before and after**, so its author critiques their own work against them
   before asking for review, and a reviewer can check what it claims. `PageShotsFlowTests` screenshots the handbook's
   pages top to bottom (a fish, a plant and a guide, in light and dark, and the fish's top in large text) and the
   fish-ID screen with its guesses, light and dark, with
   stand-in photos (`-fixed-pictures`), the app's icon picker in light and dark, the lights tab's card with its
   outlet's warning (the fake light and the stand-in Tuya cloud), and the owner's dashboard on the stand-in server (its
   overview, a section with charts and tables, and the daily report's settings). Job `handbook (1)` puts them in its `ios-page-shots`
   artifact whenever it runs
   them (`apps/ios/scripts/shots.py`): on every run on main, and on a PR whose change can reach the pages, or one
   labelled `ios-full`. The PR links main's last run (the before) and its own (the after), and names the pair behind each
   improvement. A PR stacked on another takes its before from the one below, whose run has the shots only if its change
   reached the pages: if it didn't, label the one below `ios-full` first. A screen the shots don't reach gets one added there in the same PR.

Next: layer 3 reviews simulator screenshots against the site's rubric.
