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
  - A comment's photo (`docs/contracts/comment-photo.md`): the comment and its photo stored together or not at all, a
    refused file or a photo past readers' photos' day leaving no comment, the photo under its comment only once both
    are public and never among a page's readers' photos, removed with its comment, never moved, and deleted by its link,
    the reader's own list and the account (`apps/site/worker/test/comment-photos.test.ts`); judged without the species
    check (`packages/engine/test/reader-photos.test.ts`); shown and sent on a fish's page (`e2e/comment-photos.spec.ts`).
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
  - The chat's contract (`protocols/chat.openapi.json`), before its Worker: the recorded answers a fake server replays
    (`protocols/chat-stream-*.sse`, `chat-rate.json`) of its shape, with each section's blocks of the page schema's, the
    steps, then the text, then the blocks, and `done` holding the same text, blocks and steps (the contract's `x-order`
    and `x-whole`, which the shared helper checks on every stream), and the contract naming each; a stream with an event
    after its end or out of order, a block or tool it doesn't know, a card with a figure the app index doesn't have or a
    plant's on the fishes' scale, a section with no blocks or with a heading, or a tool's link without its own inputs
    refused (`apps/site/worker/test/chat-stream.test.ts`); the helper holding the page and tank schemas' own rules
    (`not`, exclusive bounds, a schema for other keys and for key names); every heading in the app's copy of a page on
    the built web page with the same id, its section there not running into the next one, where the site's chat draws a
    section from (`apps/site/test/chat-sections.test.ts`). The app reads the same recorded answers: every event of
    them, `done` holding what streamed; an event, block or figure it doesn't know left out, not the turn; its question
    of the contract's names, fish ID's guesses within its limits; the event stream's own rules (line ends, comments, an
    event cut off at the end), through the app's session too; the answer as the screen draws it (each page read once a
    turn, no step after the text, a turn that comes whole drawn at once, nothing after its end), the steps' fold row
    (the pages read, else the search, else the last step), numbered lines as a list, the reader's day starting again at
    midnight UTC, and a question that got no answer asked again as another (`AquaTomeKit/Tests/HandbookTests/ChatTests.swift`).
    The chat's agent, before its handler: the handbook searched by names as readers type them (Thai by its words), a
    guide found past its title by a section heading or FAQ question with the section to open it at (the build's
    `/app/chat/<lang>.json`, each guide's own; a query's words weighed by how rare they are, so its subject counts),
    a page's outline and one section read by heading id, the reader's tanks read, every tool's input and the answer's
    schema what structured outputs take; each block filled from the app index and the app's page copies and of the
    contract's shape (a breed's card with its own figures, a plant's with its own, a section whole to the next heading, a
    breed in a tank-mates link as its species), a tank-mates block of two fish or more only with the check Claude ran on
    the same fish, counts and tank (`check_tank_mates`: the tool's own code, in the reader's language; an id that isn't a
    fish refused by name; in the reader's saved tank by its id, its fish and size added as the app's tank page adds them)
    and carrying it whole, a tank's block naming it and linking every kind up to the six the tool's page reads, a card or
    section shown earlier in the conversation (or twice in one answer) not shown again, a pick
    the handbook doesn't have dropped with its reason while the rest go
    out, an answer with no text none, the run within 27 s, the forced last call told to answer from what it read (the
    loop's `lastWord`, which fish ID doesn't use), and a turn's steps, request and filled blocks on a fake
    Claude (`apps/site/worker/test/chat-agent.test.ts`).
    Its handler (`CHAT`, off unless `1`), every answer held to the contract: off without the flag or what it needs; an
    app session as a bearer or a site session from the site's own pages and nothing else, and a fish ID guess closed and
    within 100 characters; a question answered, its blocks filled, the conversation keeping the turn under the account's
    HMAC and chat's own day counting it under the shared dollar cap; the next question reading the turns before it;
    another account's conversation 404, one past a day or its turns 410; the stream's order, `done` sent once the turn is
    saved; a retry by `Idempotency-Key` answered from the kept turn for the conversation's 24 hours (a 503 for 15
    minutes) and refused after, the retry itself never counted, or, while its run answers, waiting for that run even past
    the conversation's end, counted once, and another question meanwhile 409; the kept answer written before the
    conversation loses its mark;
    two first questions at once in a new conversation, one run (a create-only write); a reader who leaves mid-answer or
    while the handbook loads, the run going on to its end; an R2 error marking the question 503; the account's day and
    the spend; Claude unreachable giving the count back and an unreadable answer keeping it; the account's synced tanks
    read; each question's transcript (a failed one's too) kept under the account and conversation with what was asked,
    read and answered and nothing of who asked; deleting the account deleting its conversations, transcripts and
    retries' answers, a run still answering deleting what it wrote after (`chat-api.test.ts`, `fishid-ledger.test.ts`).
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
    bad zone cookie). The nightly totals' charts (`dashboard.test.ts`) run from the day after the first save to the day
    the next save closes, that day so far from the running build, so only a save really missed reads as not recorded.
  - The scoreboard (`/_ab/thanh-cong/`, `docs/metrics.md`, `apps/site/worker/test/admin-scoreboard.test.ts`,
    `e2e/dashboard-charts.spec.ts`): weeks from Monday in Vietnam's time, each metric's rule at its edge, this week against
    last at the same point, a week before the count unmeasured and not zero, a part that fails saying so in its place, the
    token reading its JSON and no page, and the page first in the section list the iOS app reads (the app's contract,
    `protocols/owner-dashboard.openapi.json`), its blocks saying what the page shows.
  - The owner's dashboard on its own host, dashboard.aquatome.com (`apps/site/worker/dashboard-host.ts`, `access.ts`,
    `worker/test/dashboard-host.test.ts`):
    - Cloudflare Access's token on every request (RS256 by the team's certs, audience, issuer, expiry); missing or wrong
      in any way, 403, with nothing read. The host refuses everything while `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` is empty.
    - Until both are set, `/_ab/` on the site is the dashboard as it was. Then a browser's GET of a page there is a 301 to
      the host, and everything else stays on the site: the machine endpoints, the owner bar's `POST /_ab/hidden`, the iOS
      owner API. They aren't on the host, where Access would stop them.
    - Each page's links reach what the host answers (a public page's goes back to the site), its forms post only from
      the page, and every answer is noindex and never stored. A page added to the dashboard's rail (`WEB_PAGES`: NAV's,
      the scoreboard, the daily report's log and each report, the change log) is on the host with its line in `run_worker_first`
      (`/<key>/*`, and a `.json` form's own): without it the 404 page answers and the Worker is never asked, and a test
      names the line. No negative pattern there: one wins over every positive rule, and `!/id/*` would take the hidden app
      page in Indonesian and Thai from the Worker; a test holds each app page and its files to it. Files that skip the Worker carry noindex from `public/_headers`. A dashboard address
      printed outside it is the site's (`dashboardUrl`, `worker/paths.ts`), which opens before and after the move.
  - The owner's dashboard as JSON for the iOS app (`apps/site/worker/owner-api.ts`), against
    `protocols/owner-dashboard.openapi.json`: only the owner's app session, as a bearer, opens it (without a live app
    session, 401; another account's, 404; nothing changes for either); each section's blocks say what its page shows
    from the same data, in each of the page's states (headings, figures, tables, charts, photos and hidden pages, word
    for word), and the overview's to-dos, areas and last days what the overview shows; the overview's version 2 adds up
    (its tiles to their parts, found an answer to the scoreboard's star and never above the day's readers, every page
    once in its group, every place it opens a section); each chart bar carries its words; a folded table comes without
    its rows and a long one 50 rows a page (`/tables/{id}`); a section's periods; each button makes the request its
    page's form makes; a part that throws is 503; the times follow the zone the app sends; and
    `protocols/owner-dashboard-vectors.json`, the replies the app's fake server serves, are the Worker's own
    (`UPDATE_VECTORS=1` rewrites them) (`apps/site/worker/test/owner-api.test.ts`). The daily report's section: every
    block it sends, in each of its states, one the contract describes; its buttons set the delivery as the page's form
    does; and the phones the report notifies (`POST`/`DELETE /api/owner/push-token`: kept once with the time, a bad token
    refused), the same session only.
  - The owner's reports (`apps/site/worker/feedback.ts`, `src/owner/`, `scripts/owner-feedback-deliver.mjs`), against
    `protocols/owner-feedback.openapi.json`. They feed the thread that runs the project, so: only the owner's signed-in
    account sends one (no session, an ended one, the owner bar's flag, the dashboard token or another account stores
    nothing), the owner's cookie only from the site's own pages, 30 an hour, and only the words are free text: each other
    field passes its own check or is left out, an address only on this site, as a plain path and a query of short words at most. The queue opens to the
    dashboard token alone, and a delivered report and its image are deleted (`worker/test/feedback.test.ts`). The Mac's job:
    an empty queue is one request, a failed send keeps the report, a run that died after sending doesn't send twice, the
    owner's words quoted apart from everything recorded with them, no report's words in its log
    (`test/owner-feedback-deliver.test.ts`). In the browser (`e2e/owner-report.spec.ts`): a reader loads none of it, the
    report's journey with the send a stand-in, a failed send keeping the words. The script in every page only loads the
    bar and may not grow (`worker/test/owner.test.ts`). The picture, in iPhone WebKit (`e2e/owner-capture.spec.ts`): a
    drawing has to show what's on the screen or say it doesn't, so a large photo is in it, a soft shadow paints no block, a label stays on the lines the page gave it, what
    can't be drawn is marked and counted, and the message says whether it's a drawing or the screenshot the owner picked.
    In the app (`AquaTomeUITests/OwnerFlowTests.swift`, `AccountSyncTests/OwnerReportTests.swift`): the button and a
    screenshot's offer for the owner's account alone, none for another and gone at signing out, and the report's form with
    the session as a bearer and no cookie, saying whether its picture is the app's screen or one the owner picked. In v2
    it names v2's tab and each screen standing on it (a chat with its conversation and the answers on the screen, a fish page with its slug, the dashboard inside the Tài khoản sheet), not a page left on another tab, and its picture is the screen.
  - The owner's daily report (`daily-report.yml`, `scripts/daily-report.mjs`, `apps/site/worker/daily/`), mailed at 07:00
    and pushed to the owner's phones as the owner set it, and logged on `/_ab/bao-cao/`, a section of the app's too. The
    collector on GitHub's JSON: a cycle told from the engine's hourly check, a workflow failing with no later success,
    what GitHub won't give named rather than counted as none, the retries, a merged PR's product changes and no number,
    title or link of its own, the app's next 7 days from the editorial calendar (`content/curation.json`), and a body the
    Worker reads (`apps/site/test/daily-report.test.ts`). This Mac starts it at 06:58
    (`scripts/install-daily-report-schedule.sh`, `packages/engine/test/machine-load.test.ts`), and GitHub's schedule, the
    backstop, makes none once a started run has succeeded that day. Each push to main sends what merged to the change log
    as well (`changelog.yml`, `POST /_ab/changelog`), so the dashboard's count never waits for the report, each line kept
    once with the report's (`worker/test/daily-report.test.ts`). A PR's changes are
    its body's `## Changelog` lines (several, `none`, odd spacing, an example in a code block not one), else its title
    for a `feat` or `fix` outside the ci, test, docs and chore scopes and not the engine's content, labelled by its files:
    any in `apps/ios/` App, else any in `packages/engine/` Engine, else Site (`changelog.test.ts`). The composer: the
    week's success numbers first, in English, or why they're missing, what needs care, the highlights, what changed by
    area (each line once, newest first, the change log's link; "No product changes." only when GitHub gave everything),
    the app with no data yet, and no address, picture or link to another site in a report (`daily-compose.test.ts`).
    `POST /_ab/report`: the dashboard token only, the send, 90 days in KV, one send for a run
    id even at the same moment, and the recipient in nothing but the send; email off, push on (with no key, no phone, a
    refusal alone or beside a mail sent), neither sent twice; a phone whose session ended (signed out, expired, the
    account deleted or no longer the owner's) dropped unsent, one registered again in a new session kept; the log page, each row saying what went out; the page's
    form, the owner's alone; the day's changes written to the change log (one KV key, `changelog`) before anything is
    sent, so a failed write sends nothing and the next try writes it, each change kept once across retries and runs by
    hand, a year kept, what the mail would cut cut there too; and its page, `/_ab/thay-doi/`, by the day each merged in
    the viewer's zone, the owner's alone, on the web only (`daily-report.test.ts`), on the dashboard's host too, behind Access and from the page only
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
      (`pnpm engine plant-synonyms`, each cycle). A trade or cultivar name a page has in quotes is that page's however
      the text quotes it, or with none (`@aq/schema` linkTerms): "Pogostemon stellatus Octopus" is the easy
      *P. quadrifolius*, not *P. stellatus*, which wants strong light and CO₂ (a design lab, 2026-11-07)
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
- The upload is a step of its own with its own time limit, so a long build can't use up its time. Changes that wait over 3
  hours for a deploy open an issue (`deploy-late.yml`, hourly), which the daily report lists and which closes itself once a
  deploy catches up. GitHub shows a run cut off at its job's limit as cancelled, so each long step carries its own limit.
- A pull request that changes only the iOS app (`apps/ios/`, `ios.yml`, `testflight.yml`) skips the site's checks;
  `protocols/` is the site's too.
- Every pull request's body says what it changes for the owner, in a `## Changelog` section (AGENTS.md): `ci.yml`'s
  `changelog` job reads the body as it is now (`gh pr view`, so running the job again after fixing the body passes) and
  `test` needs it. fix.yml's PRs and the engine's content (a `content` title, or only `content/`, `sources/` and
  `engine-state/`) pass without one; the engine's own pushes go straight to main and are no PR.
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
  - **Every review leaves its trace** (`packages/engine/src/review-log.ts`): its kind, the page, its language, the date,
    the reviewer's model, the score, the notes, which attempt (the first version, the rewrite, or a recheck of the page
    as it is) and whether that version is the one on the page, in `engine-state/reviews/<kind>.json`. A page's newest
    6 are kept, newest first. One key a page (and source, for a species' text from each), and each kind is one step's,
    so the engine's parts and the video job never change one key and the files merge through the jsonmap driver.
    Wired into every reviewer: video guides, source translations, the style rewrite, the reader's rewrites, title
    rewrites, breed pages, AquaTome's guides, product pages and their review summaries, quick summaries, and the
    Indonesian and Thai species, plant, glossary, place and equipment pages. The photo checks keep their own verdicts.
  - **A video guide under the bar is edited, not written again** (`fixDraft`, `prompts/video-fix.md`): the editor gets
    the transcript, the draft and the notes, fixes the passages they name and adds nothing. A broken edit leaves the
    first draft. Its writer keeps to what the video says (no added steps or tips, the creator's opinions as opinions,
    no closing recap, FAQ only on what the video answers), and the reviewer's notes are faults only, never a request to
    add something. `packages/engine/scripts/eval-fidelity.ts` measures it on the guides under the bar. Found by the
    owner (2026-11-06): a fresh draft fixed the old notes and invented new details, and every guide reviewed scored
    0.50–0.70.
  - **A translation whose English grew keeps what passed** (`localizeSpecies`, `localize.ts`): the Indonesian, Thai and
    Malay species and plant pages record each part's English (a hash) as it was translated. When the English changes,
    a part whose English is the same keeps its text, and only new and changed parts are translated and reviewed, with the
    kept ones shown beside them for names and words. Each source keeps its own score. New parts under the bar stay off the
    page, which keeps its text and score, and are tried again after a week or when their English changes. A page made
    before the parts were recorded is translated whole as before, but a passing translation is never replaced by one under
    the bar. Found 2026-11-11: 18 pages had lost a passing translation that way, though no section they were made from had
    changed, and in 110 of the reviewers' 158 notes on those redos the fault was in a part whose English was the same.
  - **A rewrite starts from them.** `videos --redo`, `breed --redo`, `topic --redo`, `product --redo`, the localizers'
    `--redo` and `rewrite-vi` give the writer the last kept review's notes, under the same rule as the rewrite within a
    run (under the bar, or any note for the pages checked against their research).
  - **The style rewrite takes the pages out of search for their score first** (`rewriteExisting`, `vi-backfill.ts`),
    then the rest in its kinds' order: a kept rewrite is what brings such a page back, and in folder order the last of
    them waited five weeks (2026-11-10: 238 fish and plant pages; 28 of the 31 it had reached were back in search).
  - **What recurs, per kind:** `docs/review/reviews.md` (`pnpm engine reviews`, each cycle's photos part): how many pages
    each kind last left under the bar and the faults their notes name most, grouped, with notes quoted and their pages.
    What prompt fixes start from.
  - **On the owner's dashboard:** the content page's "Còn thiếu" lists the pages out of search for their score,
    counted by kind and language, the most read first (else the lowest score), 30 of them, each with its score and its
    last review's notes (one of the version the page has, under the bar if a part is, the newest). The build writes
    them to `dist/_ab/reviews.json` (`apps/site/scripts/content-stats.ts` `lowScores`), a file only the Worker reads,
    judging a page as `@aq/schema`'s loader does: the test holds the list to the loader's judgement and to each page's
    noindex, each of the engine's review kinds to scoring a page or not, and the page and its app blocks to each other
    (`apps/site/test/content-stats.test.ts`, `worker/test/dashboard.test.ts`, `owner-api.test.ts`).
  - **Pages reviewed before traces were kept** get theirs from `pnpm engine review-backfill`: a recheck of the page as
    it is, nothing rewritten, `REVIEW_BACKFILL_LIMIT` model calls a kind a cycle (Vietnamese translations per source,
    Indonesian and Thai pages and place names in the rewrite part). A guide translated from a source keeps no English
    to check against: it gets its notes when it is next translated. Found by the owner (2026-11-06): their video guide
    scored 0.60 and nobody could say why; 175 of 471 video guides were in the same state.
  - **Video guides scored before the stricter reviewer** (2026-11-07: nothing the video doesn't say, one creator's
    habit kept one person's, no overstating) are checked again by their own hourly job on the Mac,
    `scripts/video-recheck.sh` (its own clone, `install-video-recheck-schedule.sh`; the video job checks none again, so
    the two never check one guide at once). From `VIDEO_RECHECK_SINCE`: `review-backfill --kind video-guide
    --reviewed-before` rechecks every guide with no review from that time on, whatever its score (and the ones never
    reviewed), `VIDEO_REREVIEW_LIMIT` a run (30); then `videos --redo --rechecked-since` writes again, from the
    recheck's notes, the guides it left under the bar, `VIDEO_REDO_LIMIT` a run (0: paused 2026-11-10 until the writer's fix is measured on 30 guides; it was 8). Paced on 2026-11-08 from 60 and
    30, when the engine's first account would have run out days before its weekly reset. Both `VIDEO_PARALLEL` (4) at
    once, on the engine's Claude accounts, stopping when every account is at its limit. The riskiest guides first:
    `RECHECK_FIRST` (a guide the chat quotes), then medicine, doses, chemicals and treatments, then water, then the rest,
    each the most read first (the guide's most popular species; `packages/engine/src/video-order.ts`). Each guide once:
    after its redo its own review counts, under the bar or not; a guide the redo skips is left as it is, and one it
    fails on goes to the video job's retries, which write from the transcript alone. A recheck changes only the review,
    not the page's score: a guide keeps its old score, and its place in search, until its redo.
  - **Held out of the chat meanwhile:** `quality.chat: false` in each of a video guide's language files keeps it out of
    the chat's search and read_page (the site reads it); absent, the guide is fine. `pnpm engine video-hold --class
    risk1|risk2|risk3|all [--clear]` sets it on a risk group (`video-order.ts`); the medicine group got it on
    2026-11-07. It goes when the version on the site gets a review at or above the bar: its recheck, or the review of a
    version the video writer wrote (the redo, or the video job's retry of a failed one). A new version still under the
    bar keeps it, as does every other writer of these files (`video-hold.test.ts` and the writers' tests hold that).
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
- **Daily ceiling.** Each step may spend only so many dollars on the model in a day, counted from the cost log before
  every call (`ceiling.ts`). The amounts are in `packages/engine/src/ceilings.json`, a table a period, with the clock
  a day runs on. A step the file doesn't name has the small ceiling, never none. The gate and moderation have none, and
  log what they spend. A backstop over everything stops every step with a ceiling once the day's logged total reaches
  it. Each machine counts its own logs, so a table gives the Mac and GitHub each a share. A step at its ceiling fails
  its call as it does for Claude's usage limit and leaves the same: nothing written, no mark, no review logged
  (`ceiling.test.ts`, and the limit tests of `water`, `range` and `sweep`, run with the ceiling's own message). A
  cost log that can't be written stops a step that has a ceiling. Found with: on 11 Nov 2026 the engine's sign-ins
  ran out of their week four days early, at $542 a day where one sign-in's week allows $140.
  - It covers every call the engine makes to Claude (`claude.ts`), whatever started it: a call with no log named is
    written to the hand runs' log and counted from there. Not covered: picture generation, which goes to Codex on
    its own sign-in and quota (`codex-images.ts`).
  - A measurement yields to the engine: the chat's board spends only what leaves every other step its whole line and
    some room for the gate (`leftYielding`), so the backstop never stops a step on its account (the chief of staff,
    13 Nov 2026).
  - The AI page review on pull requests, the nightly AI review and the auto-fix call Claude on the same accounts by
    another road, and each has a line on GitHub's side (`page-review`, `nightly-review`, `autofix`). A call writes a
    cost line: the time, the step, the account's hash, the model, dollars and tokens, and nothing of a page, a prompt
    or an answer, since a run's artifact is public. A run keeps its lines as an artifact named by its attempt, and
    the next run counts the day from those before it starts (`scripts/claude-spend.mjs`; only this repository's own
    runs' artifacts count). A review stops calling once its run has spent what was left, a call late for each of its
    workers at most, and the pull request's comment says the pages were not reviewed and that this is not a pass
    (`claude-accounts.ts`, `site-watch.mjs`). The auto-fix is one session of up to 50 minutes, so it runs under the
    CLI's own cap (`--max-budget-usd`, what is left of its day): the CLI ends the session once its estimate of the
    spend reaches it, a response late at most. That response is cents as a rule, and on paper as much as $10.56 (the
    model's 1M context new to the cache and a 128K answer, at Opus 5.5's list price): the session keeps the model's
    whole context, and stopped by money, a response late, is the bound (the chief of staff, 11 Nov). The CLI keeps
    its sign-in out of what it hands the commands the agent runs. Its agent has Bash and works from an issue's text,
    so its line is made and kept by a job the agent never ran in (`cost`, in `fix.yml`): one plain number of dollars
    crosses from the agent's job, kept to the cent. It crosses as a file in the artifact that job hands on anyway,
    read and never printed, and not as one of the `cost` job's inputs: a step's inputs are printed in its public log
    before it runs. A session that left no such number is counted at the whole of what it was allowed, a lost
    runner's too. Only a job that said its runner was there and never said a session was about to start writes no
    line (`claude-spend.test.ts` runs the workflow's own script). A day that can't be counted stops all three. The
    rewrite's cycle brings their lines beside its own log, so GitHub's day total has them. What it doesn't hold:
    runs that start together each count the same day, so together they can pass a line by a run each; a job run
    again by itself runs on the allowance its first attempt was given; the dollars are the agent's job's own word,
    so an agent set on it could report fewer than it spent (its own run is still held to the cap); and keeping the
    sign-in out of the agent's commands is not a wall, since they run as the same user as the CLI that holds it.
- **On topic.** A guide covers what its title promises. The guide writer and its reviewer are told to leave out a
  video's detours (`prompts/video-guide.md`, `video-review.md`). `pnpm engine topic-check` reads every new or changed
  guide and drops sections about another subject, with their FAQ and summary lines. It never drops more than half a
  guide: such a guide is reported instead. Found by the owner: a lighting-hours guide ended on pre-filters.
- **Checked summaries.** A species page's "Tóm tắt nhanh" is drafted from the page's text and data card, then checked
  before it shows: every temperature, pH, hardness, size, tank and difficulty figure must be the card's and every other
  number written on the page (a rule, `checkNumbers`), and a second model call checks every claim against the text. A
  draft with problems is rewritten once with them; still failing, it stays hidden and is listed in
  `docs/review/summaries.md`.
- **A species no licensed source covers** (`pnpm engine species "<Genus species>" [--video id]`,
  `packages/engine/src/species-research.ts`). Its taxon is GBIF's backbone match, an exact name only; a species too new
  for the backbone is taken from GBIF's checklists when exactly one ACCEPTED SPECIES there has that name and a record (or
  its genus's) gives its family (`gbif.ts` gbifSearchTaxon, never kept with the backbone's answers). Research cites
  every fact, the videos asked for as primary sources (their description and what is said). The text is AquaTome's own
  (source `aquatome`), each part citing the pages its facts come from (the species' `refs`), reviewed against the
  research (kind `species`), one rewrite with the notes; a part never names a video or its channel. A data card figure
  must come from a cited web page, in its words, inside the card's bounds, or it is left out, and the writer is told
  which figures no page gives, so the page says they aren't published rather than guessing (`citeResearch`; the schema
  refuses an AquaTome figure that names no page). A Vietnamese name only from a Vietnamese page. A video joins the page's
  videos only when YouTube lets it be embedded; otherwise it is cited alone. Never over a page from a licensed source.
  A new species is usually thin, so out of search until it isn't.
- **Species-profile videos** (`pnpm engine species-videos`, each video cycle, `SPECIES_VIDEOS_LIMIT` a run,
  `packages/engine/src/species-videos.ts`). Channels with a regular series of species profiles (`PROFILE_CHANNELS`,
  chosen by the owner, apart from the guides' teaching channels) feed species and plant pages, never guides. Their new
  uploads are vetted by title once (tank tours, builds, vlogs, expeditions, fairs and shop visits are left); a profile's
  species is the scientific name its title or description gives, matched to a page or to GBIF, else it is skipped. A
  species without a page gets one through the research above, the video a source; a page that has one gets only what the
  video says and the page doesn't (its text and card), AquaTome's own words under the page's headings, citing the video,
  reviewed against the video and the page, kept only at the bar. A plant without a page is left: its figures come from
  licensed sources. Each video is tried once (`engine-state/_species-videos.json`). Asked by the owner (2026-11-06).
- **A bred fish's difficulty and lifespan.** A breed's card gives how hard it is to keep (1–8) and how long it lives as
  a species' does, from pages about that line or hybrid (its care sheets, breeders' pages), each figure cited, never
  from a page about its species or a parent (`packages/engine/src/breeds.ts`). Its research asks for both, in the
  species prompt's words, with one table from a source's words (easy 2, moderate 4…) or a rating out of 10 or 5 to the
  1–8 scale; `pnpm engine breed-care` (each cycle, `BREED_CARE_LIMIT`) gives a breed whose card lacks either one
  research call for just those, once: the figures join its card and the research kept for `--redo`, its new sources its
  sources, nothing else on the page changes, and `engine-state/_breed-care.json` keeps what each call found, with the
  words it quoted from the source, or why it found none. Found by the owner (2026-11-06): no breed page had a
  difficulty.
- **Product reviews.** A product page's "Các bài review nói gì" (`pnpm engine product-reviews`, one product a cycle, `packages/engine/src/product-reviews.ts`) summarizes a few YouTube reviews: a title check, one cheap model call on the shortlist, one extraction call a review, one writing call. Code holds the result to what the reviews said, because the writer has no second reader:
  - each finding quotes the transcript: words not there are dropped, and a link's second comes from where the quote is, not from the model. A figure must be said near that moment
  - a point cites findings by id, and a figure must be in the findings it cites; "agree" needs two reviews, "differ" two reviews on its sides; a point that fails is left out, after one rewrite with the reasons
  - the writer never sees a channel, a title or an address. A channel's name, talk of the video or a reviewer (`names-source`, also listed for every page written from videos), a score or rating, or saying AquaTome controls a product it doesn't (`control-claim`) keeps a point off the page
  - a product or brand name in a point must match a spelling from the title or description of a review it cites, or our catalog: product pages, what the app controls, brands two guides give (`packages/engine/src/review-names.ts`), because captions mangle names. A near-miss takes that spelling: the same letters without their marks, or one letter off in a name of 4 or 5 letters and two in a longer one, starting with the same letter, never in a name of 3 letters or fewer, never where a number differs, and never when two spellings are as near. A name that matches nothing gets the one rewrite, then the point is left out. Fish and plants aren't checked (by our pages' genera and the word before them), so "Anubias Nana" stays beside a "Nala" light
  - the measured table's values are the extraction's, never the writer's
  - research running again keeps the reviews' sources and text, cited by address and not by place
  - "Điều khiển bằng AquaTome" comes from the code (`@aq/schema` devices: the light tool's model table, and the plug makers with a `PlugSource` in the app, a test holding the two together), never from the text, so a page stays true when support changes. AquaTome's own test notes (docs/research/aquarium-device-control.md) are curated facts naming the light tested, for lights it controls; Week Aqua's aren't used
  - no thumbnail becomes a page photo: the top review plays from the same player as a species page's videos
- **Photos.** No people, and hands count (PRODUCT.md: faces dropped by Apple Vision, and the model asks about any person
  or part of one wherever it looks), no watermarks (credits, dealer logos, site names or species names added on the
  photo: `pnpm engine watermarks`, macOS Vision reads the text and the model judges it; a marked photo is blocked for
  good; a photo that screen still owes a look waits, and no public build shows it on a page, in an album, a guide or a
  card until it is judged, and the calendar, which names a picture by address, asks the screen's record about each one whatever that language's build loaded; an equipment guide whose pictures all wait is left out, and a kind of kit is linked only where the language builds its page; the homepage's cover (a site picture chosen by hand) and a video's own thumbnail (YouTube's, never in our store) are no fetched photos and are not asked: on 2026-11-11 the model ran out of quota and 36 photos reached main with no look), no shop's or dealer's brand in a guide's photo (on its own-brand products too; a maker's brand on its own product is
  fine), no dead fish or fish as food (markets, plates, catches landed or held,
  preserved, mounted or museum specimens), each photo must show its species (a landscape where it can't be picked out
  doesn't), open licences or permission only.
  Pages show photos from our own media host: a Commons or iNaturalist photo waits for `pnpm engine mirror-photos` (every
  cycle), and a public build leaves it out until then (`setsCookies`), since those hosts set third-party cookies.
  Every request the engine sends to Wikimedia (Commons' API, its pictures, their thumbnails) asks under the engine's own
  name, and a refusal puts every one to rest, as the Internet Archive's does: for the time the refusal names, else 12
  hours, doubling to a day if the first request after it is refused too (`packages/engine/src/wikimedia-rest.ts`, the
  rest kept in `~/.cache/aquatome/wikimedia-rest.json`). On 12 Nov 2026 Commons refused this Mac and the steps asked
  again page after page and photo after photo. A rest is no verdict on a photo: a screening that meets it stops, and its
  candidates stay queued and unjudged, as does a breed's month, until the rest ends.
  - **Galleries and their targets.** Every species, plant and breed has a gallery, topped up each cycle to a target set
    by how much readers want it (`packages/engine/src/gallery-plan.ts`, the reason beside each number): the 12 staples
    100, what shops in Vietnam, Indonesia and Thailand sell 60 (fish lists and plant lists, `engine-state/shop-lists/`)
    and so do the bred fish they keep most (`POPULAR_BREEDS`: balloon molly, koi, the goldfish, betta and guppy forms…),
    the most-kept fish 40, pages two or more sources write about 30 (a breed: two or more sites), every other page 20.
    The most popular pages go first, `GALLERY_SHEETS` model calls a cycle (`scripts/engine-cycle.sh`). A gallery is
    never padded: a page whose sources run dry stays short and is listed in `docs/review/galleries.md`, then read again
    a month later. Candidates a person found (`pnpm engine gallery-seed --from <file>`, by pull request) go to the front
    of the page's queue and are screened like the step's own. A page whose sources ran dry is tried again, and a full
    album is read for those candidates alone, never its sources' finds, growing at most 3 past its target (the chief of
    staff, 2026-11-12: the weather loach's album was full and its head can't reach the card's size, so a card-size
    photo found by hand had no way in). It screens no more of them than it has spaces: the rest wait in the queue for a
    photo the check takes off.
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
    Each fish's older scientific names from GBIF are kept as well (`pnpm engine fish-synonyms`, 300 fish a cycle, each
    asked once, in `engine-state/_gbif-synonyms.json` beside the plants'). `fishOlderNames` (`fish-synonyms.ts`) leaves
    out a name any page has as its own (a fish's or a plant's, or a plant's synonym) and one GBIF gives two of our fish:
    such a name can't point at one fish. Commons files some fish under an older name (Acheilognathus macropterus), and
    search and the name checks could use them too (the chief of staff, 2026-11-12). Nothing searches or shows them yet.
  - **Checks every photo passes,** through one shared step (`screenTagged` in `gallery.ts`): at least 800 px; not a photo
    the owner rejected (`engine-state/_photo-rejected.json`); not a near-copy of a photo already shown (an image hash,
    as when Commons holds a copy of an iNaturalist or Flickr photo); no human face (Apple Vision); then Claude, on contact
    sheets of 20, keeps only a clear living example of the species, with no person or body part, no drawing, text overlay
    or banner, and no near-copy, and writes its caption. After the photos move to our bucket, `pnpm engine watermarks`
    reads the text on every photo shown, gallery photos included, and the model blocks a marked one for good. A gallery
    leads with Claude's best picks, mixed by what they show (male, female, colour form, young, the wild; for a plant
    under water, emersed, in flower).
  - **What a picture says it is.** Before any look, a species', plant's or breed's picture is left out when its own
    words say it is no photo of it alive (`unfitCommons` and `ARTWORK` in `packages/engine/src/photos.ts`): a Commons
    file's title and categories naming art (a drawing, illustration, engraving, plate, print, stamp, "1865 in art", a
    book scan), a map or X-ray, a preserved or taxidermied specimen, food or a fish market, or its description saying it
    is misidentified; a source article's caption naming a drawing, plate or stamp ("Liobagrus kingi: line drawing"). A
    paper's plate is none either (`paperPlate`): a file named as a microscope's picture, or a description that lists
    its panels by letter or number ("(a–c) …", "(A) … (B) … (C) …", "(73) … (74) … (75) …"): three panels, or two in a
    file named as a figure, since "male (a) and female (b)" is one photo of a pair. The owner found one on 2026-11-11
    as the only photo of Hemichromis elongatus, a parasite paper's plate: the search for a fish's name finds the papers
    on its parasites, bones and eggs. 25 such plates were on 16 pages; the photo check had looked at one of them and
    could not tell. The Commons fallback for a
    page with no photo (`findPhotos`) also skips rejected photos, and any file named as a paper's figure
    (`paperFigure`): its photo goes on a page with no look at it, and some figures are one plain photo of the fish, which
    the words can't tell from a plate, so a figure reaches a page only through a gallery, where the screen and the photo
    check look first. Each word counts only where it
    means that: "specimens" in a category is a botanical garden's live plants, "Fishing in India" files a gourami in a
    tank, "museum" a public aquarium, and a description's "illustration for a quiz", "30 mm SL" or "sold in markets"
    are about live fish (the first sweep's false hits, looked at by eye). A guide's pictures aren't screened this way:
    one may show lettuce for the fish. Found by a design review of the home page (2026-11-07): the Java barb's page
    photos, the Commons search's first four, were Bleeker's drawing (a white box in dark mode), a fried fish, a fish
    out of water and one in a hand, picked with no look at all; the dead-fish screen had noted the drawing and left it.
    `packages/engine/scripts/unfit-photos.ts` applied the rule to the pictures already shown, with the dead-fish
    screen's notes for main photos from any source: 190 rejected, 36 pages left with no photo of their own (34 with
    none in their gallery either).
  - **One picture, once a page.** Every picture's image hash is in `content/picture-hashes.json` (`pnpm engine
    picture-hashes`, each cycle): a page decides its pictures in page order and never shows one twice, even as two files
    (two articles of one source each had a copy), and a card or tile takes its next photo, or none. A guide keeps every
    photo of its source, each with the heading it sat under, mapped to the guide's own (`guide-sections.ts`); in a list
    of fish each fish's section shows that fish, the guide's own photo first.
  - **The right subject.** `pnpm engine check-photos` (each photos cycle, and the Mac's video job) shows the model every
    photo on a species, plant or breed page and its gallery, 6 to a sheet, with the scientific name, the page's names
    and, for a breed, what sets it apart. Verdicts: shows it (in the wild too, where it is clearly seen), something else
    (it says what), not a photo of it (a map, chart, hands, a tank, a packshot, a landscape or stream where it can't be
    picked out), or can't tell. "Something else" and "not a photo of it" leave the page; a photo no page keeps joins
    `_photo-rejected.json`. Can't tell stays and is listed in
    `docs/review/photo-subjects.md`, with the removals and the pages left with no photo (they show none; the check
    puts nothing in its place, and the photo steps fill it from their sources as for any page short of photos). A
    "can't tell" photo keeps showing, behind the others (the owner, 2026-11-11): it never leads a page, a breed's
    too, that has a photo of its own the check passed, and in an album it comes after every photo the check passed
    or has not reached. The check orders every album so each run, and the album step's ranking does the same
    (`rankGallery`), since that step re-ranks only an album it adds to. Where nothing on the page passed it still
    leads: it may be the page's only photo. A passed photo that is only in the album does not take the lead from
    it: that is the head-photo step's move, with its side-by-side look. A
    guide photo whose caption names one fish is judged against what the caption says, and only "something else"
    leaves a guide; a guide photo that is a page's photo goes with that page's "something else". Verdicts are cached per
    photo and page (`_photo-subjects.json`). A photo a step adds to a gallery waits (`unchecked` in the gallery file),
    and no page shows it until this check has judged it and left it on: of 2,611 gallery photos judged by 2026-11-10 the
    check had taken off 272, most as another fish, and each had been on a page meanwhile. The order (`turn` in
    `photo-check.ts`): the photos readers see now, Flickr's and Commons' first (17 and 12 in 100 taken off, against
    iNaturalist's 7), then the waiting photos of a page with no photo of its own, then the other waiting photos, the
    most-read pages first within each. A page's lead is judged in the first sheet its page gets, whatever its turn, so
    no photo judged before it goes ahead of it. Before all of them, `PHOTO_CHECK_FILL` of a cycle's sheets go to a
    permitted source's photos that fill a page with none. And before the turns, since 2026-11-11: a page's lead that
    neither check has a verdict on that counts (a first check's "can't tell" does not), Flickr's and Commons' first and then the other sources', each on a sheet filled from
    its page; then the gallery of a page with no photo of its own. The owner had found a parasite paper's plate as a
    page's only photo, three days on the page and not yet judged, behind every more-read page's gallery (the chief of
    staff). A lead the check passes as typical stays the lead. One that passes but isn't typical gives way to a
    typical photo in the run that judges that photo, as before this order: no pair is compared and no call added
    (the chief of staff, 2026-11-11). What follows a move is as it was: a head a person picked comes back first in
    the sweep, which has the last word each cycle (`_photo-head-picks.json`), and the check itself keeps it first in
    the run, so a "can't tell" head a person picked still leads: the one stated exception to the owner's rule, for a
    person's yes (below). Any other head can move, a card's
    fish too: the cycle's planner then points the day's card at the new head, and no cycle runs `curate --check`,
    which would name a card and a head that differ. A
    lead's sheet is filled with its page's own photos before its gallery's, so a photo that takes a removed lead's
    place has been judged beside it. Found by
    the owner: a neon tetra on the green neon page, the tiger barb under the cherry barb, a range map on the angelfish
    page; the first check (2026-10) had reached under half the page photos, in alphabetical order, and no gallery.
    Until 2026-11-07 a fourth verdict, "its wild habitat, with or without it", stayed on the page and only went last:
    the firemouth's and the flame tetra's only photos, a lake and a stream with no fish, led their pages, their index
    cards and the tank-mates blocks (a design review's find). Such a verdict is asked again (below).
    Before everything else, since 2026-11-12: a fish's or a breed's head the box step found no animal in
    (`_photo-boxes.json`: null), on a sheet filled from its page. On 12 Nov 34 heads were a river, a lake or open water,
    and none had been judged (the chief of staff). Such a head is "not a photo of it", as above: it leaves the page, and
    a page with nothing else shows no photo, its tile "Chưa có ảnh" (no photo yet), until a photo of the fish arrives. A
    run that would leave more than `EMPTY_CAP` (10) pages with no photo of their own takes none of their photos off, and
    none onto `_photo-rejected.json`: it lists them (`held:`) and holds, so a check gone wrong can't blank pages;
    `--empty-cap <n>` releases them once a person has looked. Each run's line counts the heads moved (another photo
    took the lead) and removed (the page left with no photo). The sweep lists every such head the check hasn't passed
    as the fish, from the day it first leads (`_photo-no-animal-heads.json`), in the cycle's log and the owner's daily
    report, so a person sees one the day it appears. A head a person picked (`_photo-head-picks.json`, by pull request
    with both names and where in the photo the fish is) that the check calls "not a photo of it" stays first on its page
    and off `_photo-rejected.json`, and each run lists it (`picked head:`): two people read it as the fish plainly seen,
    and the lasting fix is the check's question, not the verdict (the chief of staff, 2026-11-12).
    - **Dead fish, people and logos.** The check also answers "dead" (a dead fish or fish as food: a market, ice, a
      plate, a catch landed or held, a fish on a tray or the floor, a preserved, mounted, museum or lab specimen, a
      museum shell; when it can't tell, dead), whether a person or any part of one is in the photo (a hand holding the
      fish, fingers, a diver, blurred or behind the glass), and whether a logo, stamp or mark was added on the photo, in
      any script, which the watermark step's text reader can miss. Each is about the photo: one such verdict takes it
      off every page, guide and gallery and onto `_photo-rejected.json` ("dead: …", "people: …", "watermark: …"). A logo
      found, the same photographer's older-judged photos are asked too. Until 2026-11-07 the check called a fish held in
      a hand "yes" (97 photos still shown had a note saying a hand or a person), and a verdict of the first check, which
      never asked about marks, stood for good: a photo signed faintly in Thai, which Vision didn't read, led the
      Boraras urophthalmoides page. So every verdict without the people answer is asked again, in the check's own order
      and within its limit (on 2026-11-07: about 1,000 sheets on top of the 1,400 not judged yet, some 5 days at 60 a
      run every 3 hours). `pnpm engine recheck-photos` (each photos cycle, before `check-photos`) takes first, once,
      those whose notes from earlier looks (the checks', the watermark step's, the gallery's captions) say dead, market,
      preserved, a hand, a person and the like, or whose verdict was the old habitat; then it finds none and calls no
      model. Found by the owner (2026-11-05): dead peacock bass piled at a market, with a round logo, leading their
      page; its note said so and the verdict was "yes".
  - **A fish's head photo.** A card shows its page's head photo or none, never another (`curation.ts`). A person picks a page's head in `engine-state/_photo-head-picks.json`, and the sweep puts it first on its page every cycle. `pnpm engine lead-photos` gives way a head under the card's 1,140 px to a photo that passes the checks, once the model, shown the two side by side, says it shows the fish as well and that the second photo, as the card crops it, holds the fish's whole head, snout tip to gill cover with a little room (an eye inside isn't enough); no answer is no change, and each pair is asked once (`engine-state/_photo-leads.json`). Neither the site's cards nor the app's place a crop, so a photo whose crop leaves the head out doesn't lead and the old head stays (the chief of staff, 2026-11-10: five of 43 replacements looked at had it out). A change of head goes back with no model call when the old head now fills the card or a look has since said no. Where a head is under the card's size and its source holds a larger original (Commons, iNaturalist, Unsplash), `pnpm engine large-photos --heads` (each photos cycle, before `lead-photos`) keeps a copy large enough: the same picture larger, so it needs no look, and only the head, since another photo growing large enough could change what leads. A fish whose head doesn't pass stays off the calendar, and `pnpm engine curate --check` fails on a card whose photo isn't the head. Found by the owner (2026-11-10): the Altum on Hôm nay was a different photo from its page's, which flashed as one replaced the other. A page with no photo takes the best that passes, whatever its size, plants too, so no page shows nothing while a passed photo of it exists; a photo carrying a mark its source may keep leads only where nothing else passes, and is never a card.
  - **A person's yes for a card.** A photo the check can't tell is never a card on the model's word alone, and two people may say it is the right fish (the chief of staff, 2026-11-12, for the spotted snakehead, whose best photo the check can't tell from the northern snakehead). The record is `engine-state/_photo-person-yes.json` (`person-yes.ts`), photo → page → the lead who proposed it, the two who said yes, the day, the look-alike the check named and the mark on the fish's body that rules it out. The engine only reads it: a pull request changes it, with the sheet the two looked at. Two of the chief of staff, Curation and the owner say yes, never the one who proposed the photo; the owner's yes counts alone ("the owner may always", the approved rule). Names compare trimmed and in any case. They look at the photo at full size, the page's own description of how to tell the fish, a photo the check passed of each of the two species, and the photo beside the page's current head as the page and the card draw it (Curation, 2026-11-12: that look is their side-by-side guard, for a yes only). The mark names the fish's body only: no lettering read off a photo goes into the record or its pull request, and an entry whose mark speaks of lettering, a word or a sign doesn't count. Nor does one missing a field or of another shape, on a day the calendar doesn't have (2026-02-30), with one yes other than the owner's, the same person twice or the proposer among the two, or past five yeses in a week. A malformed entry stops no reader, and a pick on a photo with any entry for its page lapses unless that entry counts. A yes counts as the check's "the right fish" for a card (`cardWorthy`) and for the large copy of a head, only over the check's "can't tell" on that page: another fish, no fish, dead, a person or a mark stand, and so do "typical" and a caption's flaw. The head pick that goes with it lapses with it: once the yes doesn't count, or the check says anything but "can't tell" for that photo on that page, the sweep and the check stop putting it first in the same pass, so a pick never outlives its yes. `pnpm engine curate` lists every card from today that rests on a yes.
  - **A fish its source calls unwell.** No model reads a caption, so the sweep does (`captionFlaw`, `content-rules.ts`), on fish and breed pages and their galleries, in the source's own English captions only: not plants, not guides (a guide on a disease shows a sick fish), and not a caption we wrote. Dead, thin, wounded, sick or deformed, or damaged in a fight: the photo comes off a page that has another photo of its own and onto `_photo-rejected.json`, and the content rule `unwell` holds that at zero. Where it is the page's only photo it stays, never on a card, and the sweep lists it. A split or damaged fin said in passing of an ordinary specimen is a blemish: the photo stays, counts as not typical in the photo check's order, so a typical photo leads, and is never on a card (`cardWorthy`). Found by the owner (2026-11-11): a sick betta on its page, then three fish whose captions said so. A first, wider word list hit 21 of 14,615 captions, 7 of them wrongly (a shipwreck ornament, "dead corals", "physical damage is rare", breeding tubercules twice, an owner's story of a fish that died years later, a caption of ours); the list kept finds the other 14 and none of those. "Unwell" takes a photo off for good with nobody looking, so the lists lean to missing one (two readers' probes, 2026-11-11): damage or injuries said to be rare are none, and nothing a sentence denies; damage is weighed in its own sentence, so a later one about how the fish behaves doesn't make it a fight's, a fight or a degree counts only where it is said of the damage, so a fighting fish's name or a heavily planted tank is none, and only another fish causes a fight's damage, not transport; a place named before the damage is what was damaged; an infection, fin rot or a fungus counts only where the caption says the fish has it; and on a breed's page a deformity or a growth is not asked, since it can be the breed's own shape. A fish "feeding on a dead fish" is kept on the list on purpose: a dead fish is in the picture. A photo that is a page's own and in its gallery too (a head picked from the gallery keeps its copy there) is one photo, kept or taken off as one. A photo left as some page's only one, or picked as its head there, is not taken off every page on this rule's word: it leaves the page whose caption calls it unwell and stays on the other, whatever that page's own caption says of it. Another rule's word (a map, a plate) still takes it off every page, and a pick another rule takes off shields nothing. What the lists still miss or misread is for the photo check's own question, where a model reads the caption beside the picture. A head a person picked is put first before these rules read the pages, so an unwell photo beside a head picked from the gallery goes in the same sweep and the rule is at zero when the cycle tests. The head-photo step asks the caption too, of its one photo with a source's own mark as well, and never of a plant. A head a person picked (`_photo-head-picks.json`) is not taken off by a caption's words (the chief of staff, 2026-11-11: a pick is a person's look at the photo, a caption word a guess): it stays the head, off every card, off the never-again list, and the sweep lists it with its caption each run until a person says it goes.
  - **A source's "read next" cards.** The picker leaves out an image wrapped in a link to another page of the same site (`pickSourcePhotos`): that's the card of another article, not a picture of this one. The sweep takes any already stored off (the unplaced photos at exactly the source's `cardWidth`, `sources.ts`, that end a guide's list, never its lead) and onto `_photo-rejected.json`, so a re-read can't bring it back. Found by the owner (2026-11-10): arowanas and a corydoras on the platy guide; 23 card images sat in 107 places on 25 of The Spruce Pets' 26 guides.
  - **Guides' photos.** `pnpm engine guide-photos` (each photos cycle and the Mac's video job, 20 model calls each, 6
    photos a call, leads first) looks at what the subject check doesn't: every guide's photos (its lead and those under
    its headings), its video sections' photos, and the equipment guides' photos. It asks whether a person or any part
    of one is in it, whether a mark was added on it, and whether a shop's or dealer's brand shows in it (a maker's
    brand on its own product doesn't count). A
    person or a mark is the photo's: off every page and onto `_photo-rejected.json` ("people: …", "watermark: …"). A
    brand leaves the guides ("logo: …"), and stays on an equipment guide, whose subject is the product. On a guide
    about one kind of fish or plant (`guideSubject`: not a how-to, a tank-mates list or a guide naming several), the
    same call asks, with the guide's title, whether a photo plainly shows another kind, fish with fish and plant with plant: it leaves that guide alone, joins no blocklist as it may
    be right elsewhere, and each run takes it off again. A video's stills aren't asked: a frame is the guide's own
    video. Found by the owner (2026-11-10): arowanas and a corydoras on the platy guide. Each photo is
    judged once (`engine-state/_photo-guides.json`): 2,560 on 2026-11-07, about 430 calls, a day and a half. Found by a
    design review (2026-11-07): hands planting a sword plant and a person siphoning a tank leading two guides, and an
    Aquarium Co-op test-strip bottle in the betta setup guide, where only the face detector (no face in either) and the
    watermark step (which calls a product's own label part of the scene) had looked; 5,960 of 6,428 guide pictures had
    never had a model look for a mark.
    - It asks the same of a video guide's stills, ahead of the guides' other photos, since a still shows only with a verdict
      (`stillShown`, `person`): teaching videos show hands planting and siphoning. `video-stills` asks it of each frame
      before upload; `guide-photos` asks it of the rest. A person or a mark takes the still off
      its guide and onto `_photo-rejected.json`; a figure left with no still and no photo goes. Any other still gets
      `person: false` in its guide. A brand in a still's
      scene is recorded, not acted on. The picker chose a guide's stills once, when it was written, so nothing takes a
      removed one's place. A still is judged once `video-stills` won't change it again (the video's own frame, or a
      tile it keeps for good): a tile waits for its frame, so it isn't judged twice, and `video-stills` never touches
      a still that was taken off. 3,868 stills on 2026-11-07, 240 of them frames: about 645 calls, done in about 5
      days, as `video-stills` makes the rest frames.
  - **Video stills.** A video guide's "Trong video" pictures are the video's own frames. The model picks moments on
    YouTube's storyboard tiles (scrub previews of 320 or 160 px), then ffmpeg takes the frame at the second the tile
    shows from a stream of up to 1280 px (one yt-dlp call a video). The frame is checked against its tile and stored as
    `at<sec>-hd.webp` with its 480 px copy. A tile's second is its number × YouTube's interval (2, 5 or 10 s), not its
    number ÷ yt-dlp's tiles-per-second, which runs up to 16 s early on a long video, often another scene.
    - A still's `t`, the "▶ mm:ss" under it and the second the video plays from (on the page and in the app), is that
      second (`video-images.test.ts`). Stills stored before carry the early one and their address keeps it (`t<t>.webp`,
      `t<t>-hd.webp`): `pnpm engine video-stills` sets each guide's from those addresses, once (`timed` in
      `engine-state/_video-stills.json`; twice would change nothing), guides with nothing else to do first. Found
      2026-11-06: the labels and the play buttons were up to 16 s early.
    - A frame that can't be had leaves the tile, and `pnpm engine video-stills` (the Mac's video job, 12 guides a run)
      tries it again, as it does for the guides written before (2026-11-06: 3,682 stills, half of them 160 px).
    - It screens a frame as a new guide's, before uploading it: a face takes the still off the page; text keeps the
      old still's watermark verdict or goes to the model, and a watermark takes the still off and onto
      `_photo-rejected.json`. A frame of another moment leaves the tile for good (`engine-state/_video-stills.json`).
      Hands and a person seen from behind are `guide-photos`' to find (Guides' photos, above).
    - Found by the owner (2026-11-06): the stills looked blurry and low-res, most of all on a computer.
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
  (`packages/schema/src/langs.ts`; Malay now) before the site serves it, right after the served languages in each rewrite
  cycle. Its files reach
  `content/` and `apps/site/src/i18n/`, and nothing reads them: `apps/site/test/unserved-langs.test.ts` builds the site
  with one of each and holds its pages, lists, app files and counts to none, and `worker/test/unserved-langs.test.ts`
  holds the root, the cookie and the chooser.
  - Each of its steps starts only while the cycle has run under `AHEAD_BEFORE_MINUTES` (135). Since 12 Nov 2026 the
    rewrite cycle runs the Vietnamese rewrite and every translation before any other step spends (the chief of staff,
    11 Nov). Malay's ten species run right after Indonesian and Thai's, outside the gate, and its other steps right
    after them, still gated; the steps after the translations give instead when a cycle runs long, and what they change
    is translated at the next cycle (about six hours on, at the owner's 350 minutes). The buying guides go two a cycle and the UI
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
  Species, plants and places merge that way, and a fixed name (`nameFixed`) stays whichever job has it: a job that
  started before the place-names step once wrote "Lam" over "sông Lam".
- **Sane numbers.** Figures outside plausible bounds (°F given as °C) are dropped, and so is a minimum tank length that
  its source gives only as a volume (its "75 gallons (about 284 litres)" once made Cá đĩa's card say 284 cm; The Spruce
  Pets' "10 gallons (about 38 litres)" became 40 cm on 19 cards), when the engine reads a page and again at every build
  (`tankIsVolume`). Where sources disagree, every page shows the range they all accept; a lifespan, no care target,
  the widest (Seriously Fish's when it gives one).
- **A guide's title says what it is about, and no two share one.** The owner's "Duplicated" (2026-11-11): the app's
  list of guides showed four rows reading "Dou Mok". 2Hr Aquarist's tank pages were titled with the aquascaper's name
  alone (27 pages), and two videos from one channel had one title. The `guide-title` content rule finds a guide whose
  title another guide in its language has, or whose title has no word of its language (`guide-titles.ts onlyAName`), in
  every language. The real-content test fails on any page beyond those of 11 Nov. The sweep has each one written again
  by the model, `GUIDE_RETITLES` a run, reviewer-gated: what the page is about, from its own text. A finished tank is
  titled by its style and what stands out, with the aquascaper as the credit after a dash ("… – Dou Mok"). A title a
  person chose (`nameFixed`) stays. The writer of new guides is told the same (`prompts/process.md`).
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
- **A card's school size: Seriously Fish first, never below the page's own text.** The traits step's model read the
  smallest group from the Vietnamese profile, so the cardinal tetra's card said 6 (The Spruce Pets) where Seriously Fish
  says 8 to 10. After each traits run, `schoolFromSeriouslyFish` (`traits.ts`, no model) sets each card whose Seriously
  Fish profile gives a group ("a group of at least 8-10 specimens": 8) to that figure. It never sets it below the
  minimum another source on the page tells the reader ("groups of 10 specimens or more": 10). Only sources a public
  build shows count. A pair, a harem, fish in the wild and breeding groups are not a school. A card with no Seriously
  Fish figure keeps the model's reading (the chief of staff, 2026-11-11).
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
- **Letters whole.** Until 2026-11-10 the model's answer was read chunk by chunk, and a character the pipe cut in two
  came out as "��" in the middle of a word (40 pages, 38 of them Thai). The runner reads the answer whole now
  (`claude.ts`), and each cycle puts back what is still lost (`pnpm engine ungarble`, `ungarble.ts`): two model readers
  see the words around a mark and name the one character that was there. It goes in only when both name the same one and
  it can be what a cut loses; the mark alone goes when both say nothing belongs there. Every other byte of the file stays
  as it was. A page they don't agree on stays as it is, for the next run.
- **Metric only.** Fish, plant, breed and guide pages give °C, cm and litres in every language. Each writer of those
  pages passes its text through `toMetric` (`@aq/schema`): an imperial figure beside its metric one goes ("20–30°C
  (68–86°F)"), one before its metric one gives way to it ("2 inch (khoảng 5 cm)"), one alone is converted ("bể 10 gallon"
  → "bể 38 lít"). A US tank model reads as its volume and size ("bể 20 gallon long" → "bể khoảng 75 lít (76 × 30 × 30
  cm)"), a pipe as the size shops here sell ("ống PVC ¾ inch" → "ống PVC phi 27"), a change of temperature as its own
  size ("giảm 15 °F" → "giảm 8 °C"), a weight in grams ("1 lb" → "450 g"). `pnpm engine metric` runs before each
  cycle's build for anything a writer missed, and a test fails on any °F, inch, foot, gallon or pound figure left in
  `content/`. The video writer rounds a converted figure as it writes (`roundPage`): its jobs go from writing to the
  reader-fit gate with no `metric` step between, and the gate put 26 guides back for such a figure (8 to 10 Nov 2026).
  Reference lists, titles, quoted labels and a bottle's size in ounces stay as published. Found on 263 fish,
  plant and breed pages, then on 136 guide pages and 9 more fish pages whose sizes were written in inch marks (48" x
  15") (2026-11-01). A metric figure a fish or plant page's English gives itself stays as given, and the reader-fit check
  doesn't count it ("tanks as small as 11 litres", "120 × 45 × 37,5 cm – 212 lít"; `sourceGives`, round.ts): numbers
  stay as the source gives them (the chief of staff, 2026-11-11). It let 19 held pages out and 75 live ones pass, in
  three languages of four. A section AquaTome wrote from many sources' facts, and a guide, have no English beside them:
  their figures still count. The rounding reads the English the same way, with the same `sourceGives`, so the two never
  disagree: a figure a part's English gives in metric itself, a source's own conversion too (Seriously Fish's "60 × 38 ×
  30 cm (24 × 15 × 12 in)"), stays, sides, lengths, litres and °C; it rounds a figure our own conversion made and text
  with no English beside it (`roundPage` given `englishOf`, metric.ts). Until 12 Nov 2026 it rounded both, which left
  299 parts on 159 fish pages with a tank the source didn't give: 79 whose litres no longer fit their sides, minimum tanks
  made smaller, a line with two lengths (the chief of staff, 2026-11-12). `pnpm engine source-figures` puts them back
  from the English by code, no model, and litres, lengths and °C the same way: 371 language pages on 223 fish and plant
  pages, a page whole in one pass, those with a tank's sides first, a held page left as it is, and so are litres in a part that gives a dose and a length that isn't plainly a tank's. It goes at the pace the
  chief sets (`SOURCE_FIGURES_PACE`, source-figures.ts), in the Mac's photos part alone: the first 30 language pages;
  once a cycle has published them (30 marks on GitHub's main), 60 a cycle, without asking, marks not yet published
  counting against the run; and it stops by itself, and says so in its log, when in any batch more than one page in ten
  is held or given its old text back for something other than its figures (the chief of staff, 2026-11-12). The gate
  reads each as any changed page, and what it made of each is recorded once, right after it (`engine-state/_source-figures-batches.json`),
  or before the next run mends if that didn't run, so a later hold for something else doesn't count; the stop stays
  there until the chief's word takes it out, and a limit by hand doesn't pass it. A page
  the gate gives its old text back isn't mended again: it is listed with the checks it failed and waits for the chief's
  word; one the gate couldn't read is tried again, in its own batch, and isn't counted, even when the gate holds it then
  (for its old text's own fault, or harm found in another language). A cycle whose gate can't read mends nothing: the
  run asks the gate's model one short question first, and mends nothing without an answer (the chief of staff,
  2026-11-12: an unread page is not a held page).
- **One size for a US tank.** A tank a source gives in US gallons is named by the size keepers here say, one table for
  every writer, reviewer and the rounding (`US_TANKS`, round.ts: 10 gallons 40 litres, 20 gallons 80, 30 gallons 120):
  the video writer had no rule and the others rounded to the nearest 5 litres, which gave 75, 115 and 210 litres, and
  from 9 to 11 Nov 2026 every new guide with gallons arrived held. The table agrees with the site's ready-made tank
  table (the same tank for a size as for its exact volume) but for 25 gallons, where 100 litres stands as the roomier
  tank. A page held for units alone has such a figure mended by code (`pnpm engine units-mend`, units-mend.ts, from 13
  Nov 2026 08:00, six a run, before the gate): only a volume that maps back to the table exactly, every place the page
  gives it, each part changed in its figures alone and within a tenth; a range, a size in between, inches or degrees
  stay held and are listed (the chief of staff, 2026-11-11).
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
    Two Vietnamese words written as one ("que thử đa chỉtiêu": a word that reads as two syllables, loanwords such as
    "nitơ" aside) are listed; once a person confirms one, the sweep's wording fixes write it apart on every page. Found
    in a design lab (2026-11-07): that word in the tank-cycling guide, a translation's typo, and the least killifish's
    list of traits run together ("Sống bầy đàn: cóMức độ hoạt động…"), the only section in the content stored with no
    tags.
    Words the language's hobbyists rarely write are counted (`phrases.ts`: per phrase, never held, since only a model can
    mend one in its sentence; how the list is found: docs/review/phrases.md).
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
      page's ("in a batch of", "here with", "known as"), or that is a map, or a Wikimedia Commons photo whose file name
      or description says it is no photo of the living fish (a paper's plate, a microscope picture, a drawing, a dish:
      the screen a new photo passes, `unfitCommons`, run again on every page): off its page. A map or a plate leaves
      every page (`engine-state/_photo-rejected.json`), at most 10 a run (`PHOTO_CAP`): nobody looks first, so a run
      that finds more takes none off and lists them, this check keeps failing, and a person looks before running
      `pnpm engine sweep --photo-cap <N>` (the chief of staff, 2026-11-11). A photo of another fish leaves only that page, so it may still join its own fish's
      (taken off again if a later run brings it back). A Latin name no page has is listed for a person ("may name
      another fish"), not removed.
    - a photo on the never-again list (`engine-state/_photo-rejected.json`): off every fish's, plant's, breed's and
      guide's page and every album, by the photo check's own rule (an Aquarium Glaser photo with the shop's own mark
      kept stays). The check takes them off only in the tree its run started from, and the cycle's push keeps its own
      lines where they clash with main's: on 2026-11-11 three photos a person took off came back in their albums that
      way. The cycle sweeps after it catches up with main, after a clash at its push, and after a clean pull at its push
      that brought main's commits in, so one that comes back then leaves before the push. The calendar's pictures go
      too: a day's, a language's own day's, a guide's, a story's or a week's hero's that is a listed photo or its large
      copy is dropped, and the app shows the page's own; a loop whose poster is listed goes whole
    - a card figure out of bounds, upside down, or a minimum tank shorter than twice the fish: hidden from the card
      (`hidden` with why, kept in the file; worked out again each run), and the species' approved summary sent back to be
      written again against the new card
    - a fish's approved summary that states a card figure (temperature, pH, hardness, size, minimum tank, difficulty)
      the card, as the build shows it, doesn't: back to pending, hidden until the summaries step writes it again. Its
      own check runs once, when it is written, and a card changes without its page changing. Found in a design lab
      (2026-11-07): Cá neon vua's summary said 23–27 °C beside a card of 23–29 °C, as the card had taken Seriously
      Fish's range that day; 54 of 505 approved summaries were off their card. A real-content test holds them at zero
    - a Vietnamese place name with River, Island, Lake, Basin, Province, Mountains, Peninsula or a leading Rio or Río left
      in another language: `pnpm engine name-places-vi` gives rivers and regions the names readers use ("sông Hồng"),
      reviewed, and the sweep puts the generic word in Vietnamese until it has. Found by a reader's page, held over all.
    - a guide's title promising a count its text lacks (a breed's or product's title is its name: listed): rewritten by
      the model, kept when its reviewer passes it, else the number dropped from the title; the address stays
    - imperial figures: `pnpm engine metric`, as before; the audit uses the metric test's own detector
    - a species', plant's or breed's Vietnamese name and other names as hobbyists write them (`alt-names.ts`
      tidyName), on write (the merge) and each sweep: a place keeps its capital ("Rêu java" → "Rêu Java", beside
      "Dương xỉ Java"; a short list, `NAME_PLACES`, since "anh đào", "trang trí", "cá úc" and Latin epithets are words),
      and a plant's name loses "Cây thủy sinh" before it, which a list of plants says already ("Cây thủy sinh
      Vallisneria (cỏ lươn)" wrapped on the home page). A name a person fixed (`nameFixed`) stays, and the address stays.
      Found in a design review of the home page (2026-11-07), which also found the Java barb under "Cá hường Java", a
      calque of "Java barb" on another fish's name (cá hường is the kissing gourami): it is "Cá mè vinh", fixed by
      hand, and the translator's list of names that belong to one fish has both. A rule preferring a Vietnamese other
      name to a translated one was weighed and left: most other names are the model's translations too
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
      page's own name again, 203 its scientific name again. The betta keeps 6. A name with a note on the name in
      brackets ("Cá tai tượng châu Phi (tên quen gọi, dù cá gốc Nam Mỹ)") stays, and the same name without the note
      leaves. Found in a design lab (2026-11-07): the Oscar, a South American fish, was named "Cá Oscar (cá tai tượng
      châu Phi)". Shops and hobby sites do sell it by that name, so it stays a name readers search for, noted, and the
      page's own name (`nameFixed`) is "Cá Oscar"
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

- **A note for local readers.** A guide from a foreign source can recommend what readers here can't easily buy, or what costs far more than a local option. A labelled note
  ("Ở Việt Nam…") goes beside the source's advice, never inside it: its own field, `localNote`, with its citations. The
  build puts it first in the guide's text. Every writer keeps it (a source read again, a video checked again, a rewrite),
  and no reviewer scores it, so the re-check's rule that a guide says only what its video says doesn't fight it. A note
  gives a dose only from a source it cites. A body fixed by hand is marked `bodyFixed`, and no writer replaces it
  or trims it (a source read again, a video or topic rewritten, a rewrite or reader pass, the off-topic check); the sweep's
  fixed tidying rules still apply. A video guide's questions fixed by hand with it are marked `faqFixed`, and a video
  written again keeps them (`packages/engine/test/video-fixes.test.ts` holds each such fix to its lines). Found
  by the owner on the blue-green algae guide, which sent readers to a foreign product when a pharmacy's 3% hydrogen
  peroxide does the job (`merge.test.ts`, `real-content.test.ts`).
  A source is never credited with words it did not say (the chief of staff, 2026-11-12). A ruling of the owner's or the
  chief of staff's that changes what a sourced page says goes in the same way, in our own voice: a guide's `localNote`,
  or on a species or plant page a part of its own (source `aquatome`, labelled "Ghi chú của AquaTome", marked `fixed`,
  citing the pages it rests on), in every language the page has. The source's part keeps what the source says, and the
  note doesn't repeat it. A part's marks name the pages its facts come from, as on a page AquaTome researched: each fact
  is in at least one page it cites, and no page it cites says otherwise; what the ruling makes of them (whom the
  advice is for) is ours, by the label. First done on the lucky bamboo page's water.

- **Written for the reader** (`packages/engine/src/fit.ts`, `gate.ts`). One fixed checklist (`prompts/fit.md`) reads
  every served guide, species, plant and breed page for what shows it was written for a reader somewhere else: the
  source's own talk, imperial or converted units, a foreign shop, price or product (the market table, `market.ts`, says
  what's sold here, never the model), a dose tied to a product, a dose that doesn't say what it's for or lacks its
  source's caution for shrimp and others, a shop abroad's kit, which no rewording fixes, and advice that, followed as
  written, would hurt the fish, other animals, plants or the keeper (a video guide's catching fish by raising CO₂ and
  switching the filter off). Rules run on every page;
  Opus reads for the rest, and a finding counts only with a quote on the page. Reads are kept by page and text hash
  (`engine-state/_fit.json`), so a page is read again only when its text changes (`pnpm engine fit`, in batches).
  - Doses on different pages for the same treatment, strength, use and method at rates that can't both be right are
    flagged, never averaged (`docs/review/fit.md`); a person settles which holds.
  - The owner's number, pages wrong for the reader per language against the 8 Nov 2026 baseline, with the held pages
    and three random pages a day, is `engine-state/fit-summary.json`, which the daily report shows.
  - The gate (`pnpm engine gate`, last in a cycle) reads the pages the cycle changed: a new page that fails is held
    (`held` in its language file, which the build leaves out), a live page whose new text fails a check its old text
    passed gets its committed text back, a page built on a shop abroad's kit or giving advice that would hurt is held
    (changed or not; a live page whose new text brought it gets its old text back; harm found in one language holds the
    page in every language, written as they are from the same facts), and a held page that changes and
    passes is let out. A page it can't read (the accounts out, over its limit) stays as readers have it: a live page keeps
    its committed text, the text the cycle wrote is kept with the others (`engine-state/put-back/`), and the writer's record
    of that page goes back to what is committed, so the writer does the page again; a new one waits, held. The run still
    publishes; only a crash in the gate stops it (`gate.test.ts`).
  - A text that goes back isn't thrown away. When all that is worse is a sentence that can go or be reworded (a shop,
    a price or a product from abroad, talk about the source, something only true elsewhere: `MENDABLE`), the gate sends
    the quotes to a mender and reads the page again, and puts it back only if it is still worse; harm, a dose and what a
    dose lacks are never reworded this way. A video guide's mender is its own editor, with the transcript, and the video
    reviewer reads the result (`video-mend.ts`; 6 pages a run, `--mends`). A price in a foreign currency isn't deleted:
    it becomes the comparison it was there to make ("far cheaper than a ready-made one"), with no number and no
    currency unless the video gives one in dong, and the mend's reviewer is told that is a fact kept, not lost (the
    Writing Lead, 2026-11-11, after a guide on a cheap build lost its review with its five dollar prices). What does go back is kept as it was before
    any mend, with the checks and their quotes, one file a page (`engine-state/put-back/`). The video writer rounds a
    converted volume where it writes (`round.ts`), since the video jobs have no rounding step before their gate. Found
    on 2026-11-10: of 94 new texts the recheck job's gate put back in two days, 43 had passed the video reviewer, most
    were worse on one check, none was kept, and each guide had had its one go.
  - The rewrite (`pnpm engine fit-rewrite`, in small batches, the most-read pages first) writes a failing Vietnamese
    page again: a guide whole, from its source's facts and the market table; a fish, plant or breed page part by part,
    each part a finding quotes, kept only when its reviewer passes it and it says nothing more surely than what it was
    written from (`hedges.ts`, which holds the guide writer too). It mends units where the part's English gives a US
    figure, and on a breed page, which has no English to keep a figure from, from the source's own US figure in its
    facts (`breed-units.ts`; the chief of staff, 2026-11-12): a US tank in the table its size, another the round figure
    keepers here say, a minimum never more than a twentieth under it (35 gallons 130 lít, 1,000 gallons 4.000, 3
    gallons a fish 12, 10 gallons an inch 15 lít mỗi cm), in its FAQ answers too, and after any other mend of the same
    part in the same try. Its reviewer is told the same. A figure is read whole in its quote's paragraph ("38 lít" there
    followed by "mỗi 2,5 cm", "trên mỗi 2,5 cm", "mỗi 2,54 cm", "mỗi inch" or "cho 2,5 cm chiều dài cá" is per inch;
    a tank "đặt trên 2,5 cm xốp" is not; any other length after a volume in its clause, "mỗi 2,5 cm mực nước", "cho
    2,5 cm" alone, "ứng với 2,5 cm", a range of lengths or the fish's own length ("chiều dài 2,5 cm của cá"), is for a person, but for
    the tank's own size, "dài 60 cm" or "dài khoảng 90 cm"), and a rewrite is kept only with
    each paragraph's litres as they were, in their order, each figure as keepers say it in place of its old one and no
    other moved (15 lít mỗi cm, not mỗi 2,5 cm; not the same litres left in another paragraph; not two figures trading
    places; with two figures or more in a paragraph, each mended one stays with the same words around it as before, its sentence back to a label before a colon, or a
    tank's number, and a figure per cm with the words before it, so one of two like figures may be mended alone), and with its paragraphs as many as before. A figure with a dose near it (in its paragraph, the one before
    or after, or the rest of its section between the headings either side, where a reading of the water such as koi's
    dissolved oxygen in mg/l (the substance, then only the words a reading is said with) isn't a dose but a treatment's
    rate in mg/l, a substance beside its treatment ("khử nitrit bằng muối 1 g/l") or after a dose's word anywhere before it in
    its sentence ("liều CO2", "Liều dùng: ammonia", "Cho ammonia", "Cho vào bể…", "phân nitrat", but not "cho koi:" or waste's "phân
    hủy"), is; in an FAQ answer, its question too), whose
    water stays exact, a figure per another length ("mỗi 5 cm"), or a litre figure with no US figure in the
    facts to work from, is left to a person, and so is a finding code works out no figure for (gallons or a length in
    it, or a figure already the size keepers say) and a quote another mend reworded past telling which figure it was. Other units,
    words and a kit are left to the rounding, the phrase list and the gate, and harm on a fish, plant or breed page to the gate and a person. `engine-state/rewritten.json` has each page it rewrote, by its new text's hash; a page
    tried and not kept waits until its text changes (`engine-state/_fit-rewrite.json`), and a title the owner fixed stays
    (`fit-rewrite.test.ts`). It runs in GitHub's rewrite cycle before the gate, from 13 Nov 2026 08:00: the front list
    first (`packages/engine/src/fit-front.json`: pages kept off Khám phá's cards and the Hôm nay card, then the
    staples, then the four breed pages Hôm nay's Tết cards lead with), then the most read, after a fresh read of the
    front list's pages whose read is of older text. After its
    first run (`engine-state/_fit-front.json` has what it did) it waits until the chief of staff has looked at that
    run's pages and `cleared` is set in the list's file (`fit-front.test.ts`).
  - The app's short cards (`content/cards`, the Curation Lead's) pass the same gate, read with lines of their own: a
    dated source is expected on a card; a new species is "described", with its paper's date, never "discovered" unless
    the source says so; a trend names its figures and where they come from. A held card stays out of the app, and the
    gate sees it again each run. The job that writes cards runs `pnpm engine gate` before it commits one. Cards don't
    count in the owner's number. Indonesian, Thai and Malay cards are translated from the Vietnamese one each cycle
    (`pnpm engine localize-cards`, `cards-intl.ts`), kept only when a reviewer holding them to it passes them and they
    fit the card. Each is made again when its Vietnamese card changes (`engine-state/_cards-intl.json` has the text it
    came from), and taken down if the new one isn't kept or the Vietnamese card is held back (`cards-intl.test.ts`).
    An event in one of the readers' countries shows only in that country's language, and is translated only into it: a
    betta show in Hà Nội is Vietnamese only, and a fair in Bangkok Thai only, its Vietnamese card the translators'
    source (`cardShownIn`, `packages/schema/src/cards.ts`; the build, the calendar check and the translator read it).
  - Found by the owner on a guide that sent Vietnamese readers to an American product: "If the vast contents of the
    product works like that nobody is able to check."

## Rules for every change (people and agents)

1. **A page bug comes with a check that fails without the fix**, in the same PR: a journey, a page check or a vitest
   test. Run the check against the unfixed code once to see it fail.
2. **A new kind of page needs nothing**: the page checks pick it up. **A new interactive feature gets a journey** in
   `apps/site/e2e/`.
3. **Never weaken a check to get a green run.** Fix the page. A real exception is written into the check with its
   reason (as `VIETNAMESE_ALLOWED` does for decree numbers).
4. Before merging, the gate must pass. When it can't (a check is wrong), fix the check in the same PR and say why.
5. **An owner's complaint about one page becomes a check over every page**, in the PR that answers it: a rule when words
   can show it (`fitRules`, `content-rules.ts`), else a line in the reader-fit checklist (`prompts/fit.md`, with its
   `FIT_TITLE`). The engine then mends every page the check finds, the one complained about among them.
6. **A Lighthouse budget only tightens.** A fix that lifts a page past its `KNOWN` entry removes the entry in the same
   PR. Loosening one needs the reason written next to it.
7. **A change to how a page looks shows it before and after.** On a PR that changes `apps/site/src`, ci.yml's job
   `shots` screenshots the same pages of the base's fixture build and the change's, at a phone's size (Pixel 7, 412 px)
   and a computer's (1280 px). It keeps the pairs that differ, side by side, as the `site-page-shots` artifact, and lists
   them in its run's summary. The PR links that artifact and names the pair that shows each improvement it claims. Its
   author checks their work against those pairs before asking for review, and a reviewer checks each claim. Run it
   before pushing with `apps/site/e2e/page-shots.mjs` (apps/site/e2e/README.md). A page that changed but isn't in the
   sample is named: `node e2e/page-shots.mjs <before> <after> <out> /x/,/y/`.

**The Anthropic key pool looks after itself (the owner's rule, 2026-11-07).** A key stays out of credit until credit is
added, and nobody asks the owner to top one up. A key that answers out of credit or refused is turned off for 24 hours and
the next key takes over by itself, for fish ID, the chat and the evals alike: they all go through `fishid/keys.ts`
(`classify`, `rotate`, `healthyKeys`; `key-pool.test.ts`, and a key emptying in the middle of a run in
`fishid-agent.test.ts`). It is tried again after the 24 hours, so added credit needs no step from anyone. One key out, or
some, is not a problem to raise: only the fish ID page shows it. **Every key out stops fish ID and the chat: that alone is
a blocker**, on the dashboard's to-dos and in the daily report.

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
it when the iOS jobs pass. A push that only merges main into a ready PR runs none of them when its run before passed
(a conflict it resolved in `apps/ios/**`, `protocols/**` or `ios.yml` runs them): merge main in only to resolve a conflict. A PR runs the UI flows in part: the smoke set, the classes of the flow files it edits, and
the page shots of the screens its change reaches (all of them when it can reach every flow, or edits the shots); every flow when it changes `ios.yml`, the scripts that pick and run
the flows (not the lists they read, `apps/ios/scripts/flow_lists.py`, which their `--test` checks on every run), or the
flows' shared code (the owner's call of 2026-11-05, as a PR's run of every flow its change could
reach held GitHub's Macs for one to two and a half hours). Main runs every flow after merges (batched: of the runs
waiting, only the newest is kept) and each night, and a PR labelled `ios-full` runs them all too
(`apps/ios/README.md`): ask for it on a change to a model many flows share (LightsModel, HandbookModel's fixture,
AccountModel). A failed run on main opens an issue labelled `ios-main-red`; a break that only main's run catches is
fixed forward first, in a PR of its own. Android
(`apps/android`) will follow the same pattern.

| Check | Catches | Where |
| --- | --- | --- |
| **Shared vectors**: device frames and replies, saved-tank records and merges, a tank's fish checked as the tank-mates tool checks them (the site's own code, bundled; a breed as the species it's a form of), a tank's litres, water line, refusals, glass and ready-made table as the volume tool works them out (its formulas ported; the site's test writes the vectors from its own code and built table, `UPDATE_VECTORS=1`), fish and plants filtered as the site's lists filter them, searches listing first the pages named what was searched for, as the site's search does, and pages read as the site writes them (each block this app can't read one "open on the web"), the owner's dashboard's replies, buttons and errors (every block read, none dropped; a kind or field it doesn't know skipped), against `protocols/*-vectors.json`, which the site's tests read too | the app and the site sending different bytes, a reply misread, tanks checked or merged differently, a tank-mates answer that differs from the site's tool, a volume, glass or refusal that differs from the site's tool, a filter that keeps or drops a page the site's list wouldn't, a breed found ahead of the species named what was searched for, a page misread or failed for one block | `swift test` in `apps/ios/AquaTomeKit` (job `perf`, first, on every ready PR that changes what it builds or checks, and main's pushes; job `kit` nightly) |
| **Session tests** against `FakeLight`, a light that answers the way the real one did in hands-on tests | wrong order or pace of commands, overlapping commands, lost read-backs | same |
| **Account client** (`AccountSync`) against `FakeAccounts`, the accounts server in process, and the contracts `protocols/accounts.openapi.json`, `protocols/talk.openapi.json` (a reader's comment and photo posted as the account, another's reported) and `protocols/fishid.openapi.json` (a photo identified as the account; the stand-in's every answer held to the contract's shape, as the site's tests hold the Worker's) | a fish-ID photo sent without the bearer, with an Origin or a Turnstile token, larger than the site's (1024 px, JPEG 0.85) or with its location or camera data, a box cut from the shrunk photo or from the photo as stored rather than as shown, an answer or refusal misread (the account's day, the site's day), our own copies not marked, a post without the fields its contract takes or with a Turnstile token, a report not sent as the account (or, signed out, as the site's page), an answer to it misread (a 404 that isn't the report's own taken as received), a block that stops holding once the site says who posted, a photo's consent sent when the reader gave none, a file part without its filename and type, a name or comment the Worker refuses unread let through (its lengths in UTF-16 units), a photo sent with its location or camera data or larger than the site's, an answer its contract gives a post misread, requests the server would refuse (a path or method not in the contract, a cookie or Origin, no JSON body, no `client: "app"`), a merge that lets a fast clock win or loses a change made during a sync, a Google sign-in Google would refuse (another client or redirect, no PKCE, a code exchanged without its verifier) or one that takes another sign-in's answer (its `state`), a refused record lost, an old session left open, busy not retried, a passkey answer the server's WebAuthn check would refuse (id and rawId differ, padded base64, another origin, a user handle that isn't the account's, a challenge used twice), a new passkey it would refuse (another origin, another account's challenge, one used twice, a passkey an account has) or take more than 10 minutes after a sign-in | same |
| **Plugs** (`Plugs`): `TuyaPlugs` against `FakeTuya`, Tuya's cloud as its docs describe it (signatures checked, Tuya's two worked examples), and `PlugBoard` over it | a request Tuya would refuse, a token not kept or not replaced, a page of devices missed, the indicator light taken for an outlet, a switch that toggles, is sent twice, retried or queued, or goes to a plug listed offline, a state shown as asked instead of as the plug reported, an unconfirmed or lost switch not read again or read more than once, an older list answer putting an old state back, an expired trial or wrong keys not told apart, a plug record that keeps state or loses a newer client's keys, a strip's timers misread (a disabled one, one that switches on, or one that ran once on a day gone, taken for one that cuts the power; a zone told apart by its name rather than its time), read more than once while a light's card is open, a failed read not said, an outlet assumed for a light rather than picked, another maker's plug offered for one | same |
| **Telemetry** (`Telemetry`) against `FakeCollector`, the Worker's endpoints in process, and the contract `protocols/app-telemetry.openapi.json` (sample batches and reports checked against its schema, and the app's own rules for what it sends against what the schema takes) | an event, batch or report the Worker would drop or refuse (a field it doesn't list, a mark, path, code or link out of its patterns, an envelope out of range), the app and the contract disagreeing on what may be sent, a field the privacy policy doesn't list (the field audit), a message or name sent where a code goes (a kind outside the app's fixed list, a refusal code outside the site's), a search's words in a path, an iOS report carrying more than the policy names (the region, low power mode, free text such as an exception's message, network, location, display, GPU or disk measures, other diagnostics, a field MetricKit doesn't write at any depth, a field of another shape) or sent with nothing in it, anything sent or written before the site's flag or with the reader's switch off, a request sent after a switch went off (on then off at once, or off while the queue is being sent), a queue that outlives the switch going off, batches over 100 or a queue over 500 (the oldest not dropped first), a retry before its wait, a refused batch retried, a batch sent under another session's id | same |
| **Pages on the phone** (`PageCache`, `KeptPictures`, `HandbookPaths`), with the site stood in for | a guide read once not opening offline, a kept copy shown without the newer one read for next time (or read more than once a run), a page newer than its kept shard opened on the web, a kept shard of another shard count or one this app can't read used, a shelf's guide listed as kept before it and its pictures are whole, a stop that lets a guide on the list or reads further shards, a removal that deletes a shard or picture a kept guide still needs, kept pictures that don't outlast the run, a page kept, saved or read under "/vi/" lost or not opening offline once the index has the Vietnamese pages at the root (or back), a move of the kept shards cut short losing a page or not tried again, a link in either form not opening the app's screen for it | same |
| **UI flows** (XCUITest) on the simulator, which gets the fake light | journeys that stop working, by flow class: "UI flows, by class" under this table | `xcodebuild test` (jobs `app`, `handbook` for the handbook's flows, the tank volume and tank-mates tools and a tank's fish, plants, guides and tank-mates check, and `lights` for the light flows, each in two halves, on runners side by side, one job at a time on the repository's own Mac, where `app` and `handbook` run three classes at once on copies of its simulator (apps/ios/README.md); a test that hangs is stopped after ten minutes; on a pull request, the smoke set (ten flows across the main journeys), the classes of the flow files it edits and the page shots of the screens its change reaches, as `apps/ios/scripts/flows-to-run.py` decides, packed into as few jobs as hold them in 25 minutes of tests each (the page shots in `handbook (1)`, which uploads them; the light flows in their halves), each job skipped when it has none, and the run's notice naming what each job ran; every flow on main after merges (a run that started is never cancelled; of those waiting, only the newest is kept, and it covers every merge since), every night on main, by hand, on a pull request labelled `ios-full`, and on one that changes `ios.yml`, the scripts that pick and run the flows or the flows' shared code); a failed test runs once more, as the site's journeys do, and one that passed only on its retry is a warning on the run |
| **v2's flows on the iOS the owner's phone has** (27.2, built with TestFlight's SDK), against main, once a day | what only that iOS draws or does, which pull requests' flows on iOS 26.5 can't see: on 2026-11-10 a frosted band, and search giving no field | `scripts/ios-27-daily.sh`, on the Mac at 04:00, a normal turn of both queues. Flows that fail go to the Design Lead and the v2 Lab, never the owner |
| **Translations**: every string in the code and Info.plist has Indonesian, Malay and Thai, with the same placeholders | untranslated or broken strings | `apps/ios/scripts/check-strings.py` (job `perf`, on every ready PR that changes what it builds or checks) |
| **Performance budgets** (`apps/ios/perf-budgets.json`): launch to the first responsive screen, the CPU time and peak memory of flinging through 800 fish, the archived app's size; each test's median against its budget | the app getting slower, heavier or bigger without anyone deciding it should | `PerformanceTests` and `apps/ios/scripts/check-perf.py` (job `perf`, always on GitHub's Macs, on every ready PR that changes what it builds or checks and every push to main; not nightly, as each change was measured by its PR's run); on a PR, `--tightens-only` against main's budgets |
| **Signing**: the app archived, signed and exported as for the App Store | signing that stopped working (certificates, profiles, entitlements); App Store Connect's own checks run at the upload on main | `testflight.yml`, on a PR that changes the project, `Config/` or the workflow; on main it uploads |

UI flows, by class (a line each, with a blank line between, so pull requests that change different flows don't conflict):

- `AccountFlowTests`: signing in to an account on a stand-in server, in the Tài khoản sheet (opened by the profile button on each tab and by the hint on an empty "Bể của tôi", none of the account in the tanks tab, never blank, with no network the account signed in on the phone shown as last seen, with "Thử lại" and no dot, a sheet closed before the server answers still waiting for it when opened again, and a new phone told the server can't be reached rather than that accounts are off, a sync the server fails putting a dot on the profile button and "Thử lại" taking it away, a session ended elsewhere naming the way the account signed in and offering it first, the others under "Cách khác", its dot gone once the sheet is seen, a list signed out linking to the sheet): a new phone gets the tanks made before and after signing in, Google signs in (on stand-ins for its page and token endpoint) and closing its page leaves the reader signed out with nothing said, a code sent by email signs in (a wrong one refused) and the same address on a new phone opens the same account, a passkey added on the website opens its account (one no account has is refused with what to do), a passkey added in the app opens its account (the sheet then saying the account has one, and still offering one for this phone), and long after signing in, adding one asks to sign in again first (with Apple, the add then finding this phone has it already, or by email, with what the add says kept), signing out keeps the tanks, deleting the account empties it, no sign-in with accounts off or for a store from a newer app, and no sync of one signed in (the sheet saying so); the appearance chosen in the sheet (light or dark against the phone's) drawing the sheet and the tabs under it at once, kept after a relaunch, and the phone's again on "Theo máy"; the language chosen in the sheet (Thai) opening the app in it the next time, without a launch argument, with a line in that language until then and none for the language it's in, and "Theo máy" giving it back to the phone's.

- `AppIconFlowTests`: the app's icon chosen from its picker (every icon listed in the app with a preview to draw, none unlisted) and the default again.

- `AppLinkFlowTests`: the app opened from a web page as the site's "Mở trong ứng dụng" opens it (`aquatome://open?url=<a page>`, Vietnamese at the site's root): opening the app, a page it draws once its index is read; while it runs, a tool's tab, a page it has no screen for as its web page on the Tìm tab, a bare `aquatome://` back at the home, and another site's address changing nothing.

- `ChatFlowTests`: the chat screen on a stand-in chat that streams the contract's recorded answers (from a fish's page, signed in on the screen, a starter asked: the wait, its steps, then the steps folded into the pages read, the text and the next questions, the fold listing the pages again; no entry while chat is off; from fish ID's result, its guesses as fish ID words them and a starter telling them apart; the day used leaving the question in the box, unsent, with Tìm searching it; a failed answer and Claude unreachable each said, asked again under the same bubble, never a second; left mid-answer, the answer back on return, once; an answer lost past its 24 hours asked again; a conversation past its questions going on in a new one after a divider; starting over; offline a starter going into the box with send off; past 500 characters send off).

- `FactsCardFlowTests`: a fish's facts under its name as the site's data card writes them (its lifespan after its size, one figure when the sources give one, none when they give none; three to a row, the last never alone; the difficulty read as its badge, "Độ khó 2/8: dễ"), the sources behind them and the page's credit under them, as a row with the same badge over a web page, a breed's own figures on its and a plant's care on its.

- `FishIdFlowTests`: the fish-ID tool opening the app's own screen (a photo picked and sent as the reader's account, a fish boxed and only that part sent, cut from the photo at full size, the guesses as the site shows them, a guess's page and its genus's pages opening in the app and back from one the guesses and the box as they were, signed out the sign-in first and then the tool with the photo kept, the account's day used up, the site's day used up, accounts off and no network each said in the site's words, a long wait said as it goes with the photo kept as it was, no answer in the request's time not taken for no network, a session refused while still signed in said).

- `GuideTopFlowTests`: a guide's top in v2, as a fish page's: from Khám phá, signed out, iOS's back, no bookmark in the bar, one ⋯ ("Thêm") holding save, share and the browser in that order, the page's photo under the bar, no Mục lục, the guide's name in the bar only once it has gone under it; saved from the ⋯, listed among Tìm's saved pages and "Bỏ lưu" after; the owner's Mục lục on a long guide (none for a reader), beside the back button with the ⋯ still the bar's, its list the guide's parts from "Tóm tắt nhanh", then the pages it names, its sources and its discussion with their counts, a part chosen landing under the bar and named in the title; from Hôm nay, back and Mục lục; iOS's edge swipe back, slow and quick, at rest and scrolled.

- `HandbookFlowTests`: search the handbook (no accents, other names, one kind, a tool by its page's own words, a page opens (drawn by the app when the site writes it as blocks; else the web page, a stand-in for the site's naming its path), the Chihiros tool, the "Bể của tôi" tool), browse it from its home (a fish group, every fish, the plants by where they go, the glossary by letter, the video series and the video guides on a shelf of their own with their length, not among the written guides, more series than the shelf shows a tap away, no shelf with none; at the largest text a shelf's chips one row that lists them, its picks rows and the kit a list, each row with no line saying what it is (a fish with its scientific name, a series with how many videos, not its channel)), the fish filtered to one of the reader's tanks as the site's list filters them (those missing a figure listed after) and the plants to the tank's light; what's new as the site lists it (newest first, a page added then updated there twice, a row opening its page, a link to the whole list), and no row for it from a site whose index names none; a kind of kit drawn by the app, from the home, with its types' shop links, its long list of fish a tap away and what follows it in reach; Tìm's tools first under search, fish ID's card leading (opening its screen, its words reading at 4.5:1 or more on its fill in light and dark), then the index's other tools as tiles by their short names, two to a row and one at the largest text (a tool the app draws opening its screen, another its page), the lights' and the tanks' tools not repeated and none left at the bottom of the shelves.

- `LightFlowTests`: the lights screen as the site's Chihiros page (a new light connected with its setup steps; the light's own schedule never shown as running or put in the form; a clock seven hours slow and one lost in a power cut set right; a preset written, then another without asking, then undone back to the first; the write bar in view at the top and the end of the screen, saying what will be written; a schedule written before used again, also while a colour is tried on the light, with the last six listed, and none for a light that dropped; the light kept on a tank with the schedule written to it; a saved light listed after a relaunch and connected with what was written to it; the plan kept without a light; presets by tank type, the chosen one marked, keeping the colour mix; the day's on, off and ramp handles dragged (off held two ramps after on), the ramp menu, the hours advice, and the schedule they write; colour looks, one brightness and each colour; a colour tried on the light, then its schedule again; the day previewed on the light, stopped at once or played whole to full and off, then its schedule again; leaving the app mid-test or mid-preview sending one frame only, last, after levels already on their way, and leaving "Tắt đèn" as it is; disconnecting mid-test or mid-preview sending the scene mode before the link drops, and a light that drops mid-test kept as set by hand until "Theo lịch"; Tắt đèn and Sáng hết, then back to the schedule; a dropped light, also one dropped while being read, connected again without a scan; the frames "Theo lịch" sends (the written schedule again, or only the scene mode); a light renamed and forgotten; no Bluetooth, with planning still open; a write ending manual levels; old firmware refused; disconnect, also mid-connect; Week Aqua lights found beside them, one of another code listed and sent nothing, three connected as one group and written frame by frame in the order the lights take, a colour by hand and its brightness, their clock set with what was last sent, kept on a tank and connected from there, one lost mid-write leaving the others written whole, the record true and the next write asking first); the outlet a light is plugged into picked on its card (the one named for a light offered first) and its timer that cuts the power warned of beside a clock lost in the cut (in the plug's zone, said so, on a phone in another), and none once Smart Life turns the timer off, the pick taken back (asked again, after a launch too), a light said not to be on a smart plug not asked again on this phone and picked after all.

- `NativePageFlowTests`: a fish drawn by the app with each of its parts, in the order the site's page has them on a phone (where it's from, other names, the sources behind its figures with the dot only where their gap could change how the fish is kept, the summary and keepers' mistakes, "Thông tin nhanh" folded, the Vietnamese climate at the end of the water section, tank-mates with its temperament and smallest school and why to keep one away where "Nuôi chung" is or would be, its gallery after the care text with every photo credited and its words read once, the sources' terms, breeds, videos; none left to the web) and saying what each part is to VoiceOver, a tank-mate opening its page, a group named in its text opening the app's shelf of that group, a taxon named in it opening the app's shelf of its fish as the site's taxon page lists them (its line, the rank below with each one's count, a genus opening its own, the way up to its order and the taxonomy's first page listing the orders), the country under a fish's name and a continent in the text opening the app's shelves of the fish from there (a country's rivers named, three lines of them until more is asked for, a continent's countries a tap away, the way up to the first page listing the continents), a breed the index lacks opening as a web page in the app, a fish's readers' photos and comments as the site has them (each comment's day as the site writes it, the site's mark on a good answer) and a plant with none showing neither, an Unsplash photo's credit naming its photographer and Unsplash, each a link and not the whole line (in a card's credits the photo's own page a number), a plant (its other names under its name) and a glossary term drawn by the app, a video series drawn by the app (its counts, the playlist and channel it follows, its guides as cards, each picture credited) and a card opening its guide, a guide drawn by the app from the site's blocks (no web page; a table as a grid while its columns fit, else each cell under its column's name, none without it), a page it names and a link in its text opening in the app on the same tab, a word's tip, a source's mark small and raised after the words it backs and naming its source, the credit's link scrolling to the sources, the bar naming a page once its name has scrolled away, sharing and the browser in one menu, a part it can't draw opening the web page and two in a row offering one, a guide opened before the app draws its kind staying on the web page, every part saying what it is to VoiceOver, a link from the tanks tab opening on the tanks tab, a tool it names opening its tab.

- `OfflineFlowTests`: a shelf of guides kept for reading offline, at once on Wi-Fi, counted in the Tài khoản sheet, whose row closes it and opens their shelf on Tìm, let go of there (then no row), asked first on mobile data, stopped with nothing half-kept, also from the shelf left and come back to, stopped by removing the kept pages, no longer listed once the site splits its pages anew, not started with too little room.

- `OwnerFlowTests`: the owner's dashboard (the stand-in server serving `protocols/owner-dashboard-vectors.json`) shown only to the owner's account, its "Mấy ngày qua", a to-do opening its section at the heading it names, a section's chart and table, a reader's photo approved and the section read again, one removed only once the owner says yes, a page hidden by the section's form and brought back, a refusal showing the server's message, the daily report's email turned off then on again, a session ending while it's open (sign in again, the row kept), the server's storage down (its message, then tried again), a long cell (a page's review notes) showing two lines until tapped open, then shut again, and the daily report's notifications turned on here once iOS allows them, kept on, then off.

- `PageShotsFlowTests`: a fish, a plant, a guide, a kind of kit, the fish-ID screen, the lights tab and the Week Aqua screen screenshotted top to bottom for a change's before and after, Tìm's tools and its whole home (light, dark, the largest text, and a new phone with nothing read), the Tài khoản sheet signed out and signed in as the owner (light, dark and the largest text), the owner's dashboard (its overview, a section with charts and tables, and the daily report's settings), and v2's Hôm nay, a fish's page and Khám phá, light, dark and at the largest text.

- `PhotoViewerFlowTests`: its photo viewer (opened where tapped, the row's thumbnail at once while the full photo comes, only the two photos either side fetched, swiped, tapped bare, zoomed without swiping, pulled down to close).

- `PhotoGridFlowTests`: a gallery's photo grid (`docs/design/photo-grid.md`): opened from the page's "Xem tất cả" and its lead photo and only on a page with a gallery, its count first, rows edge to edge that keep each photo's shape with or without their pictures and at the largest text, a failed thumbnail a plain cell, a tap opening the viewer there and closing it scrolling back to the photo it closed on, what the top bar says, the readers' own part (outside the count, their own counter and report menu, a reported photo gone, posting only with accounts on), and only the screens near fetched, a cell scrolled away stopped. The rows themselves are worked out in the kit and checked there (`AquaTomeKit/Tests/HandbookTests/PhotoRowsTests.swift`). `PerformanceTests/testFlingingThroughThePhotoGrid` measures flinging through 300 photos.

- `PlugFlowTests`: smart plugs on a tank, on the stand-in Tuya cloud and with no account: the project's keys set up, wrong ones said so and not kept, the right ones checked by reading the list and kept, then removed, a plug added and its outlets named (labels from Smart Life, kept across a launch, not offered for a second tank), an outlet switched and confirmed, a heater, a CO2 or an outlet with no role asks first, a plug that doesn't confirm shown as it reports, a plug gone offline refused and shown offline, a plug taken off the tank.

- `ReaderPostFlowTests`: a comment posted as the reader's account (signing in first) and shown on the page at once, still there when the page reads its comments again, a reader's photo not sent without a name, the reader's consent or one picked (the site's words for each), a photo sent with consent showing the photo and the link that takes it back once, to keep (a tap doesn't open it), no posting with accounts off, another reader's comment reported signed out (asked why, thanked, and kept off the phone past a relaunch) and their photo reported from its viewer, a poster blocked (their comments and photos hidden, the others kept) and let back from the page and from the Tài khoản sheet (a row counting them, opening their page, which says when nobody is left; not listed in the tanks tab), AquaTome's contact page in the Tài khoản sheet's "Về AquaTome" with accounts off.

- `ReadingFlowTests`: a guide saved to read later and kept after a relaunch then taken off, the pages read last newest first under Tìm's "Đọc tiếp", each saying what it is, and none after a test's reset.

- `TankCheckFlowTests`: a tank whose fish don't go together and are too many and too long for it warned as the site's tank-mates tool warns, the check following a fish taken off, a species and a breed of it checked as one fish, a tank with no size given the tank its fish need, a fish the handbook doesn't have checked with nothing known rather than left out.

- `TankLifeFlowTests`: a fish put on a tank from under its name on its page, not from the bar (starting at its school size; one already there gets the new number), a plant put on a new tank, a fish added from the tank in the handbook's list, its number changed and a plant taken off, kept after a relaunch, the guides naming a tank's fish listed on it and opening, the video guides apart.

- `TankMatesFlowTests`: the tank-mates tool drawn by the app, not the web page (set to a fish by its page's link, on the tab in front; empty from search; a second fish giving the site's verdict, warnings and the tank they need, one already chosen marked, a fish taken off; tried with one of the reader's tanks, the tank's own fish counted with them and a number typed followed, then saved onto it; saved onto a new tank).

- `TankVolumeFlowTests`: the tank volume tool drawn by the app, not the web page (opened from search, and from a page's link on the tab in front, the tanks tab too; the site's litres, gallons, water and glass for a box, also in inches, a hexagon and a cylinder to a water line; a ready-made tank from its table; a pane longer than its side and a water line above the rim refused as the site refuses them, with nothing to save; saved onto a new tank by its sides, then a cylinder onto that tank by its litres; the heater link opening the site's calculators for that box).

- `TanksFlowTests`: add a tank with its size and litres (shown as typed, halves rounded up), a partial size refused, a name kept to 80 characters, edit a tank keeping its other fields and find it after a relaunch, a new size dropping litres given for the old one, delete a tank, a tank's fish and plants opening their pages, a store from a newer app or one it can't read left alone, adding again after a failed save.

- `TelemetryFlowTests`: anonymous telemetry on a stand-in Worker: nothing sent until the site's index says it takes it, nor on the flag of the index kept from an earlier launch while the site's doesn't come, then a page the app draws and the tab sent, a light connected sent without its name or the account's id, the reader's switch off sending nothing and emptying the queue's file at once, from the Tài khoản sheet, with no tanks and signed out too.

- `V2FlowTests`: the app's v2 behind the Tài khoản sheet's switch (debug and TestFlight builds): off by default, v1's three tabs; turned on, v2's tabs, and off again, v1's, with the same tanks (UIKit's animations on), and Tìm with the page Khám phá or Hôm nay had open; a tank card on Hôm nay opening the tank on Bể của tôi; the app's home from outside opening Hôm nay's top; a link from outside opening its fish's page; a page read on one shelf of Khám phá; the tab bar whole while Hôm nay and a fish's page scroll; nothing showing under the tab bar, and a tap there opening nothing; the owner's way round a long fish page (none for a reader: no title in the bar, no list), its title's list going to a part, open and under the bar, and its photos' row opening their grid; a page's photos all from its banner and from its carousel's last tile.

- `ViAtRootFlowTests`: with the Vietnamese pages at the root (`-vi-at-root`), a fish from search, a link in a page, a card still linking under "/vi/", a group, both tools, and a guide saved under "/vi/" still saved and opening.

- `VideoFlowTests`: a guide's video played in the page in YouTube's own player and not the YouTube app (nothing of the player before play is pressed; YouTube's script stood in for, saying what it was asked), a chapter seeking it or starting it at its time, two tapped as it loads ending on the second, a link out of YouTube's player not taking its place and one to a new window opening outside the app, its own captions in the page's language or else the original ones untranslated, full screen with the same player playing on and swiped down back to the page, another tab pausing it, the page left with it playing or loading taking its player with it, one left before its player is ready not starting unseen, one whose player never comes up giving its thumbnail back to try again, one YouTube refuses opening on YouTube, a fish's second video stopping its first, each video's controls named for it.

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
   old reason, or removed. The app's size is the one not to lower: 20 MB is the owner's room (2026-11-08), not a reading,
   so it stays until the owner changes it. The job still reports each measured size.
6. **A change to how a screen looks shows it before and after**, so its author critiques their own work against them
   before asking for review, and a reviewer can check what it claims. `PageShotsFlowTests` screenshots the handbook's
   pages top to bottom (a fish, a plant, a guide and a kind of kit, in light and dark, the fish's top in large text, and a
   guide's video playing in its page), the fish-ID screen with its guesses, light and dark, Tìm's tools (light, dark and the largest text), the home's section for kit and
   a long list's whole list, with stand-in photos (`-fixed-pictures`), the app's icon picker in light and dark, the Tài khoản sheet
   signed out and signed in as the owner, light, dark and the largest text (the stand-in server), the lights tab's card with its outlet's warning (the fake light and the stand-in Tuya cloud), the lights tab and the Week Aqua screen, and the owner's dashboard on
   the stand-in server (its overview, a section with charts and tables, and the daily report's settings), and v2's Hôm nay,
   its suggested fish's page and Khám phá, light, dark and at the largest text. Job
   `handbook (1)` puts them in its `ios-page-shots`
   artifact whenever it runs
   them (`apps/ios/scripts/shots.py`): on every run on main, and on a PR whose change can reach the pages, or one
   labelled `ios-full`. The PR links main's last run (the before) and its own (the after), and names the pair behind each
   improvement. A PR stacked on another takes its before from the one below, whose run has the shots only if its change
   reached the pages: if it didn't, label the one below `ios-full` first. A screen the shots don't reach gets one added there in the same PR.

Next: layer 3 reviews simulator screenshots against the site's rubric.
