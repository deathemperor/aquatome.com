# What success means, and how we measure it

PRODUCT.md says it in one line: readers find the answer from search and act on it, tool users come back and manage their
tanks over time, and the business runs on traffic, ads, affiliate links and community. These are the numbers that follow
that line.

Read them on the scoreboard, `/_ab/thanh-cong/`, or as JSON at `/_ab/thanh-cong.json` with the dashboard token as a bearer.
The key names below are the JSON's. Code: `apps/site/worker/admin/scoreboard.ts`.

A week runs Monday to Sunday in Vietnam's time, whoever is looking. Each metric gives this week so far, last week at this
same point of the week, the whole of last week, and 12 weeks. A Tuesday compared with a whole week would always look like
a collapse, so the comparison uses the same point.

Baselines are from 2026-11-06, a Friday. The readers' count began the day before, 2026-11-05 at 10:10 in Vietnam, so they
cover about a day and a half. Treat them as a starting line and nothing more.

## The north star: readers who found their answer

`answered`, per week. A session whose first page view came from a search engine, and which then stayed 30 seconds or
scrolled half way on that same page.

It matters because it's the first half of the product's definition of success, and it needs search to send people and the
page to hold them. A page nobody finds scores nothing. Neither does a page people leave at once.

- **Source.** The readers' beacon (Analytics Engine, `aquatome_events`): `view` with its referrer, `time`, `scroll`.
- **Thresholds.** 30 s and 50% are the rule the dashboard already uses for a reader (`readers.ts` `isReader`). The data
  can't choose better ones yet. The dataset holds 12 sessions, the 6 counted here and 6 from the day before the reset. Of
  those 12, 6 reached 30 s, 5 reached 50%, 7 reached one or the other and 5 neither. The beacon only reports 30, 60 and
  180 s and 50 and 90%. Look again at 500 sessions from search.
  A reader who gets the answer in the first screen and leaves in 20 seconds doesn't count, so this number runs low.
- **Search engines.** Google (and its Android app), Bing, DuckDuckGo, Yahoo, Cốc Cốc, Yandex, Baidu, Ecosia, Brave, Naver.
  Chat assistants aren't in the list. The referrer is all we have, so a search app that sends none reads as a direct visit.
- **Baseline.** 2.

## Reach

| Key | What it counts | Baseline |
| --- | --- | --- |
| `readers` | Sessions that stayed 30 s or scrolled half way on any page | 3 |
| `sessions` | Sessions with a page view | 6 |
| `searchShare` | Share of readers whose first view came from a search engine | 2 of 3 |
| `readers.vi`, `.id`, `.th` | Readers by the language of the page they landed on | 1, 0, 2 |
| `countries` | Readers by country, this week and last | TH 2, VN 1 |

It tells us whether the handbook is reaching people, and whether Indonesian and Thai pages are earning their cost.

A session is one browser tab (`sessionStorage`), so a reader with two tabs counts twice. The count leaves out known bots,
clients with no `Accept-Language`, our own checks and the owner. It needs the page's script to run, and a reader whose
blocker stops `/_e` isn't counted. On 4-5 November every Google visit Cloudflare Web Analytics saw was in the beacon too, 10
of 10, so that loss looks small. Analytics Engine keeps about 3 months, enough for the 12 weeks.

## Act

| Key | What it counts | Baseline |
| --- | --- | --- |
| `stepShare` | Share of sessions that took a next step: any of the three below | 33.3% |
| `shopShare` | Sessions that clicked through to a shop | 0% |
| `toolShare` | Sessions that opened a tool page, as the first page or later. The list of tools doesn't count | 33.3% |
| `pageShare` | Sessions that viewed a second page | 0% |
| `shopClicks` | Clicks through to a shop, the beacon's `aff` event | 0 |
| `shopPer1000` | Those clicks per 1,000 readers | 0 |
| `redirects` | What `/go/` counted on the server (`clicks_daily`) | 24 |

This is the second half of the definition, and shop clicks are the only money signal we can see.

`shopClicks` is the number to trust. It has the same exclusions as the reader counts, so the rate compares like with like.
`redirects` sits beside it as a check, and the two should stay close. Before the fix of 2026-11-06 `redirects` took in
crawlers and the owner (see "How far to trust this"), and those rows stay in D1, so its history overstates. No beacon `aff`
event has ever been recorded, so as far as we can tell **no reader has clicked a shop link yet**.

Shop links show only on Vietnamese pages, so the share of readers on Indonesian and Thai pages holds `shopShare` down.
Clicks say nothing about purchases.

## Come back

`keepers`, per week: accounts other than the owner's with a saved tank or device changed that week (D1, `tank_records`).
Baseline 0. The only account so far is the owner's.

It's the closest thing we have to "tool users come back". Two caveats. A record keeps only its latest change, so a past
week reads lower than it was. A keeper who only looks at a tank and changes nothing doesn't count.

**Return visits**, once the visitor switch is on (`apps/site/worker/stats-switch.ts`, approved 2026-11-08), on the readers
page. Each browser keeps a random visitor code (`aq_vid`, `src/lib/beacon.ts`), and the app keeps an install code
(`install`, from the app build that sends it). Neither is ever joined with an account, an email or an IP address. Each
is replaced after 13 months, and events are kept for 3. A browser with Global Privacy Control or Do Not Track on gets no
code, and neither does one with storage blocked; those still count as tabs. «Không đếm tôi» on the privacy page deletes
the code and stops every statistic from that browser, Cloudflare Web Analytics included. A visitor is a browser, not a
person: a reader on a phone and a computer is two, and clearing storage starts again.

**No consent notice, for now (decided 2026-11-08).** A one-line notice for Vietnam and Thailand that doesn't block the
page, with the code set only after «Đồng ý», is to be built behind its own switch. It turns on without asking if there's
a complaint, a regulator's letter, or more than about 1,000 readers a day. The Chief of Staff is told when it does.

## Community

`comments` and `photos`, per week: comments and reader photos approved so far, by the week they were sent (D1). Baselines 0
and 1. All-time totals are 0 comments and 2 photos. A post waiting for moderation joins its week once approved, so the latest
day or so can rise later.

## The app, after launch

| Key | What it counts | Baseline |
| --- | --- | --- |
| `appSessions` | App launches, each with its own random id | 0 |
| `lightOk` | Share of `light.connect` and `light.write` actions that succeeded | no data |
| `plugOk` | Share of `plug.switch` actions that succeeded | no data |
| `crashFree` | 1 minus iOS crash reports over launches | no data |

Source: `aquatome_app`, the same data as `/_ab/ung-dung/`, without our test builds. It has no rows yet. The telemetry flag
went on 2026-11-06 and no store build exists.

**Weekly active users can't come from this telemetry.** Each launch gets a new id, on purpose, so `appSessions` counts
launches and not people. Readers who switch telemetry off aren't in any of these. `crashFree` is an estimate, because iOS
sends crash reports about a day late and they don't name the launch.

## Supply

| Key | What it counts | Baseline |
| --- | --- | --- |
| `pages.vi`, `.id`, `.th` | Pages the build wrote per language, the week's last reading | 3,845, 1,330, 1,312 |
| `fullCards` | Fish pages whose card has temperature, pH and size | 1,107 of 1,458 |

Source: each deploy's `content.json` and the nightly snapshots in KV. Pages are what readers can find, and the data card is
what makes a fish page an answer. `fullCards` has no history before 2026-11-07. A page count says nothing about quality, and
the card count ignores the other figures on a card, such as minimum tank.

## Guardrails

| Key | What it counts | Baseline |
| --- | --- | --- |
| `checksOpen` | Live-check problems open at the week's end (`site-check` issues) | 0 |
| `lighthouseOpen` | The same, for pages below their Lighthouse budget | 1 |
| `deployFails` | "Deploy failed" issues opened in the week | 1 (5 last week) |

Growth that breaks pages isn't success. Source: this repository's public issues (docs/governance.md, layer 2), read through
GitHub's API. GitHub allows 60 unauthenticated requests an hour per address and the Worker shares its address, so the Worker
keeps the answer for 10 minutes. If the block says GitHub refused, a read-only token as a Worker secret is the fix. A deploy
that fails while one is already open updates that issue, so this counts incidents and not attempts.

## Content quality

Not on the scoreboard: per page, on the content page (`/_ab/noi-dung/`, `worker/admin/quality.ts`), which states its own
formula. Five lists come out of it: rewrite first, decaying, gaps, best and worst. Writing Lead's rewrite queue reads the
same lists from `/_ab/noi-dung/quality.json`, and the daily report says how many each holds.

- **Reading**, from the beacon's last 28 days, with our own tabs and likely automated ones left out, as on the readers page.
  It's the average of three shares of a page's tabs: those that scrolled half the page, stayed 30 s, or went on to another
  page. Until a page has data, it's pulled towards its section's average as if it had 20 more tabs.
- **Search**, from Google Search Console (`scripts/search-console.mjs`, daily in `search-console.yml`). It's the page's
  click rate against what its position usually gets, at most 1, pulled towards one half as if it had 100 more impressions.
  The job reads through a service account that's a restricted, read-only user of the domain property. Its key is in the
  `GSC_SERVICE_ACCOUNT` secret, and the site keeps only the latest figures, in KV.
- **Score** = 100 × (2 × reading + search) ÷ 3, or whichever part there is. A page is ranked once it has 20 tabs or 100
  impressions in 28 days.
- **What the engine knows** comes beside the score (`dist/_ab/page-signals.json`): the page's own quality score, the
  reader-fit checks it fails, the reader review's findings and its last review's score. A page fixed by hand, or one the
  writers rewrote in the last 28 days (`engine-state/rewritten.json`), is on no list to rewrite.

Search Console's figures run two days behind, and the 28 days before them say what's decaying. The gaps are searches Google
shows us for only past position 15, and names readers looked for. The click rates expected at each position are a common
industry curve, not ours. Recalibrate them against our own figures once a few months of data exist.

## Not measurable yet

Each of these needs the owner.

| What | Why it matters | What it needs |
| --- | --- | --- |
| AdSense earnings | The first half of the money | Read access to the AdSense Management API, or a weekly export |
| Affiliate commissions | Whether shop clicks become purchases | A network account and its order reports |
| App installs and active devices | The app's reach, which our telemetry can't count | Read access to App Store Connect analytics, after launch |
| The guardrails, reliably | GitHub refuses unauthenticated reads beyond 60 an hour from an address the Worker shares | A read-only GitHub token as a Worker secret |

## How far to trust this

Checked 2026-11-06, when the dashboard showed 7-17 shop clicks a day against 4-9 page views.

The views are right, and small. Every Google visit Web Analytics recorded on 4-5 November is in the beacon, same minute, page
and country. In the browser, a real click sends `view` and `aff` in Chromium and WebKit. The other thousands of loads Web
Analytics counts are mostly our own checks, so use it only with its country and referrer filtered.

The clicks were wrong. `/go/` had 65 clicks since 29 October, 63 of its 64 rows the only click on their link, often every
shop's link on one obscure page, against no `aff` event at all. No reader's page sent them. Each click left only a daily
count, so we can't say how much was crawlers and how much the owner. Clients that fake a browser's user agent and language do
reach the site. Since the fix, `/go/` counts only when the browser's Sec-Fetch headers say one of our pages opened the link,
and not for the owner. A browser older than Safari 16.4 goes uncounted there, and so does a store app's tap, which opens the
shop from outside our pages and reports its own `aff` event once telemetry is on.

Numbers this small move on one reader. Don't read a trend into them before a few hundred sessions a week.
