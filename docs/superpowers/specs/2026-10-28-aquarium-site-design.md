# Vietnamese Aquarium Knowledge Site — Design

Date: 2026-10-28 · Status: approved for local development (2026-10-28) · Brand/domain: **TBD** (placeholder `thủy·sinh` used below)

## 1. Intent

A Vietnamese-first knowledge site for the aquarium hobby (freshwater fish, shrimp, planted tanks). Content comes from licensed English sources, translated by Claude, kept in sync automatically, and enriched with photos, videos, structured data and local (Vietnamese) shopping links. More languages follow later, "as many as possible".

Visitors come to:
1. look up a species,
2. follow a care / breeding guide,
3. plan equipment or a tank setup,
4. browse and discover.

Success, in order: **traffic → ad revenue → affiliate revenue → community**.

## 2. Goals, non-goals, anti-goals

**Goals**
- Every source live together at launch (no phased rollout by source).
- One combined page per species, as deep as Seriously Fish / PlanetCatfish (incl. care + breeding).
- Fully automatic pipeline: detect source changes → fetch → translate → enrich → publish.
- Working affiliate system that checks and updates links automatically.
- Four switchable visual skins, A/B tested on real traffic.
- Comments on species/plant/guide pages, moderated automatically.
- Architecture ready for additional languages without data-model changes.

**Non-goals (for now)**
- Languages other than Vietnamese at launch.
- User accounts / logins.
- Original editorial writing (beyond auto-generated hub/list pages).
- Marine/reef content.

**Anti-goals (failure even if it "works")**
- Google treating the site as scaled machine-translated spam (kills goal #1).
- Takedowns because content/photos were used outside what a licence allows.
- Spam visibly sitting in comments.
- Skins that change content or URLs (would hurt SEO and corrupt the A/B test).
- Evading bot protection (proxy networks, fingerprint spoofing, CAPTCHA solvers).

## 3. Constraints

- **Hosting:** Cloudflare (Pages/Workers, D1, R2, Cron Triggers, Analytics Engine, Turnstile).
- **Translation / AI work:** Claude Code headless (`claude -p`) on the owner's Claude **subscription**, not per-token API. Throughput is bounded by the subscription's rolling usage limits and is **not yet measured** — see §11.
- **Fetching:** the owner's **always-on home machine** runs a real Chrome browser at a polite rate. Sources will not whitelist us. Cloud IPs are blocked by several sources.
- **Owner prerequisite:** Node.js on the home machine is 25.2.1 (EOL, CVE-2026-111497 RCE). Upgrade to a supported line (26.12.1 / 24.22.1 / 22.23.4) before installing the content engine.
- **Affiliate accounts:** none yet; provided later.
- **Domain:** undecided; prefer `.com`. Shortlist in Appendix B.

## 4. Sources

### 4.1 Licensed content sources (all live at launch)

| Source | Content used | Change detection (tested 2026-10-28) | Page fetch |
|---|---|---|---|
| Seriously Fish | species profiles, classification, glossary, distribution, articles | RSS feed open | open from cloud; home fetch anyway for consistency |
| PlanetCatfish | catfish species (incl. L-/C-numbers), care, breeding | unknown (403 to bots) | home fetch |
| Loaches Online | loach species, care | sitemap (TBD) | home fetch |
| Aquarium Glaser | new-import species write-ups, photos | TBD | home fetch |
| BW Aquatics | species detail + photos | sitemap open | home fetch (rate-limited) |
| 2HR Aquarist | planted-tank guides, plant notes | blocked | home fetch |
| Aquarium Co-op blog | guides, equipment | sitemap open | home fetch (rate-limited) |
| The Spruce Pets (freshwater) | species + care guides | sitemap open | home fetch (blocked from cloud) |
| Aquarium Breeder | breeding guides | TBD | home fetch |
| Tropica | plant database | TBD | home fetch |

**Permission status per source must be recorded before launch** (see §12, open question). For each source the record holds: written permission (y/n, date, file), scope — text · structured facts restated in our format · translation · automated copying · commercial use with ads + affiliate · photos — and attribution terms. A source without a complete record is not published.

Known licence detail: Seriously Fish's reuse policy says **photos belong to individual photographers** and SF cannot license them; commercial reuse of facts needs SF's written permission/data licence. Assume the same photo rule for every source unless their permission says otherwise.

### 4.2 Open media (no permission needed, attribution required)
- **Photos:** Wikimedia Commons, iNaturalist, Flickr, Openverse. Accept only **CC0, CC BY, CC BY-SA**. Reject any NC/ND licence (site is commercial).
- **Videos:** YouTube embeds via YouTube Data API.
- **Taxonomy:** GBIF Backbone Taxonomy (CC BY) for canonical names + synonyms.
- **Not usable:** FishBase (CC BY-NC).

## 5. Content model & site structure

All content is language-keyed from day one: source (EN) → translations (`vi`, later others). URLs: `/{lang}/…`.

### 5.1 Entities
- **Species** (fish, shrimp, snails). Key = accepted scientific name resolved via GBIF; source names and synonyms map to it. Fields: VN common name(s), EN common names, taxonomy (order → family → genus), group, L-/C-number, distribution (continent → country → region/river), data card, sections, photos, videos, related species, equipment/food/plant products, comments.
- **Plant.** Tropica's structure: difficulty, light, CO₂, growth rate, placement, propagation. Products (Shopee/Lazada) attached.
- **Equipment category** (filters, lights, CO₂, substrate, tanks, fertiliser, food…) holding affiliate products.
- **Glossary term:** VN term + EN + Latin, definition; auto-linked in body text.
- **Place:** continent / country / region / river.

### 5.2 Articles
- **Guides:** setup, care, breeding, disease, aquascaping, plant care (2HR, Co-op, Spruce, Aquarium Breeder, SF articles).
- **Discovery:** Glaser new imports, featured tanks, generated lists ("10 nano fish").
Articles link to entities they mention (auto-detected species/plant/term names).

### 5.3 Species page sections (combined page)
Order follows Seriously Fish: Quick facts + difficulty (8 levels) · Before you buy · Distribution (+ map) · Habitat · Aquarium size · Maintenance · Water conditions · Recommended equipment *(affiliate)* · Diet + recommended foods *(affiliate)* · Behaviour & compatibility · Sexual dimorphism · **Reproduction / breeding** · Notes · References · Photos · Videos · Comments.

Merging rule:
- Primary text per section from the richest source for that species (SF by default; PlanetCatfish for catfish; Loaches Online for loaches). Other sources' material for the same section is appended as a credited sub-block ("Theo PlanetCatfish…").
- **Data card** values: per field, keep every source's value with attribution; display SF's value when present, else the union of ranges, with a "sources differ" marker when they disagree.
- Every section shows its source credit + link to the original; page footer shows "original last edited / last synced".

### 5.4 Navigation & sub-pages (mirrors Seriously Fish, plus ours)
- All species (filters: difficulty, size, temperature, pH, group, origin)
- By classification: order → family → genus
- By group: tetras, cichlids, Corydoras, loaches, labyrinth fish, etc.
- By origin: continent → country → region/river, with distribution map; **"Fish of Vietnam"** hub
- Glossary
- Fish finder ("help me find a fish") merged with **"which fish fits my tank?"** tool
- What's new (sync change log)
- Plants (Tropica structure), Guides, Equipment, Discovery
- Hubs: beginner fish, nano tanks, no-CO₂ plants, by tank size
- Units toggle cm/°C ⇄ in/°F (default cm/°C for `vi`)

### 5.5 URL scheme (vi)
`/vi/ca/{slug}` · `/vi/cay/{slug}` · `/vi/huong-dan/{slug}` · `/vi/thiet-bi/{category}` · `/vi/kham-pha/{slug}` · `/vi/phan-loai/{order}/{family}/{genus}` · `/vi/nhom/{group}` · `/vi/nguon-goc/{continent}/{country}` · `/vi/thuat-ngu/{term}`
Slugs from VN common name; scientific-name URLs 301 to them. `hreflang` + canonical on every page.

## 6. Content engine (pipeline)

```
[Cloudflare cron] detect ──queue──▶ [home machine] fetch ─▶ translate ─▶ enrich ─▶ quality gate ─▶ commit ─▶ [Cloudflare] build + deploy
```

1. **Detect (cloud, every few hours):** read each source's RSS/sitemap; enqueue URLs that are new or have a newer `lastmod`. Where no feed/sitemap is reachable from the cloud, the home machine does detection too.
2. **Fetch (home):** real Chrome (automation library of builder's choice), one page every few seconds per source, normal headers, no stealth tooling. Store raw HTML + extracted clean content + images + metadata in the repo (`sources/{source}/…`) so each source edit is a git diff. If a source blocks even this, mark it failing and alert — do not escalate evasion.
3. **Translate (home, Claude Code):** paragraph-level diff → translate only changed paragraphs. Glossary enforced (VN common names, Latin names kept, metric units). Extract structured facts (temp, pH, GH, size, tank size, difficulty) into the data card.
4. **Enrich (home):** resolve species via GBIF; attach licensed photos (§4.2) with per-image credit; find YouTube videos by scientific + common name, Claude vets that the video actually shows the species and is decent, keep top 2–4, prefer Vietnamese-language; auto-link glossary terms and entity mentions.
5. **Quality gate (home, Claude Code):** second pass reviews each translated page against source + glossary and scores it. Below threshold → automatic re-translation with the reviewer's notes (up to 2 retries); still failing → published `noindex` and listed in the dashboard. Human review is **optional**: a weekly ~2% sample + persistent failures, reviewed by the owner (or a hired VN reviewer) when convenient. A page is indexable once it passes the automatic gate.
6. **Publish:** commit → Cloudflare build/deploy. Daily summary: new/updated pages, failed sources, quality flags.

**Backfill:** all sources together. Fetch + translate may start **before** a source's permission is recorded; nothing from that source is published until it is. Queue is **resumable and idempotent** (safe to stop/restart, never double-translates). Launch when backfill + quality gate complete. Real duration is measured, not promised.

**When the home machine is offline:** site, comments intake, affiliate checks and A/B test keep running. Paused: fetching, translation, video vetting, comment moderation.

## 7. Affiliate system

- Network-agnostic product catalog in D1: product, category/species/plant links, `network` adapter (Shopee Affiliate, Lazada, Tiki, AccessTrade, Involve Asia — added when accounts exist).
- **Daily checker (cloud):** via the networks' **official APIs** (not scraping — Shopee/Lazada are bot-protected too): live? in stock? price? Dead/out-of-stock → swap to the closest matching active product. (Pre-account behaviour below.)
- **Before accounts exist:** catalog is hand-seeded by Claude (product type + search keywords per species/plant/category). Blocks render as Shopee/Lazada **search-result links** for those keywords (never go dead, no liveness scraping needed). When an account is added, the network API fills concrete products and the daily checker takes over.
- Placement: species pages (equipment, food, plants), plant pages, equipment guides, setup guides. Show price + "checked today".
- Click tracking feeds the A/B dashboard.

## 8. Community (comments)

- Name-only comments on species, plant and guide pages.
- **Submit:** Cloudflare Turnstile + instant rules (link count, repeats, per-IP rate). Suspicious → held, not shown.
- **Daily Claude pass (home):** remove spam/abuse, approve held-but-fine posts, mark helpful answers ("Trả lời hay").

## 9. Design & skins

Four skins built on one site (same pages, data, components, URLs):
- **A "Đáy sâu"** — dark, cinematic, full-bleed imagery.
- **B "Sổ tay tự nhiên"** — warm paper field-guide, specimen plates, serif.
- **C "Khám phá"** — bright bento, mobile-first, playful.
- **Mix (default)** — A's hero + C's tank-match tool and colour filters + B's specimen cards and species profile; dark video band.

Reference mockups (real Commons photos, VN copy): `docs/superpowers/specs/mockups/` — `skin-a-day-sau.html`, `skin-b-so-tay.html`, `skin-c-kham-pha.html`, `mix-home.html`, `mix-species-profile.html`. They define look and feel, not exact layout. Typography must support Vietnamese diacritics (mockups used Fraunces / Newsreader / Bricolage Grotesque + Be Vietnam Pro).

Rule: **skins change presentation only**. Googlebot always gets the default skin.

**A/B test:** a Worker assigns a skin per visitor (cookie, sticky); events (pages/visit, time, scroll depth, affiliate clicks, ad RPM) go to Workers Analytics Engine; dashboard shows per-skin results; **winning metric = estimated revenue per 1,000 visits** (ad RPM + affiliate clicks × est. value), guard-railed by pages/visit not dropping. Allocation is automatic (multi-armed bandit, min. 10% per skin until significance). When a skin wins, it also becomes the default/Googlebot skin. Note: skins mainly move engagement/affiliate/ad metrics, not inbound search traffic.

Ads: Google AdSense, placed per skin without breaking layout.

## 10. Architecture (decided by Claude — owner may override)

- **Astro** static site → Cloudflare Pages. Content (sources + translations + entity data) as files in git.
- **D1:** comments, affiliate catalog + check results, sync queue/state, A/B events summary.
- **R2:** images (resized/responsive variants).
- **Workers:** comments API, A/B assignment, affiliate redirect/click tracking, detection cron.
- **Search:** static index (e.g. Pagefind; must handle Vietnamese).
- **Home machine:** content engine (fetch, Claude Code jobs) on a scheduler; pushes commits.
- Performance target: fast on mid-range mobile (most VN traffic); responsive images; lazy video embeds (click-to-load).

## 11. Left to the builder

- Exact change-detection cadence and paragraph-diff method.
- Browser-automation library and scheduler on the home machine.
- Static-site framework details (Astro assumed), search engine choice, image pipeline.
- Dashboard shape (A/B, pipeline health, quality flags, affiliate status).
- Quality-gate scoring threshold.
- Measuring subscription throughput during backfill; if insufficient, propose an API budget as fallback (owner approves spend).
- Vietnamese common-name sourcing for species lacking one (glossary + Claude proposal, flagged as "tên đề xuất").

## 12. Open questions for the owner

1. **Permissions** — owner (2026-10-28): "start development for local". Development + local backfill proceed now. **Public deploy is gated** on a complete permission record per source (§4.1); the build must make an un-cleared source impossible to publish (per-source `publish: false` default).
2. **Operator** — an individual (in Vietnam, assumed). Vietnam's Decree 147/2024 may require phone-number verification for commenters if comments count as a social platform; unconfirmed. Build comments with name-only now, behind a pluggable verification step that can be switched on later.
3. Brand + domain (deferred by owner).

## Appendix A — Calls made by Claude (flag if wrong)
- One combined page per species with SF-preferred data card values.
- Quality gate with `noindex` until passed + 2% human sample.
- Turnstile + instant rules on comments in addition to daily moderation.
- GBIF as taxonomic backbone.
- Only CC0/BY/BY-SA open photos; source photos only with visible open licence or explicit photographer permission.
- Affiliate checks via official network APIs only.
- Default skin = Mix; Googlebot sees default.
- Astro + D1 + R2 + Workers stack.

## Appendix B — Domain shortlist (.com, unregistered per RDAP 2026-10-28; recheck before buying, via Cloudflare Registrar)
Global: mossandfin · driftandfin · frondandfin · fishcyclopedia · aquacyclopedia · plantedatlas · scapelore
Vietnamese: bachkhoathuysinh · sotaythuysinh · camnangthuysinh · nhathuysinh · hocnuoica · cacanhviet
Recommendation: global brand as main domain + one VN domain redirecting to `/vi/`.
