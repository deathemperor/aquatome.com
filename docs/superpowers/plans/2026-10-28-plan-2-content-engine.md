# Plan 2 — Content Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A resumable pipeline on the home machine that detects new/changed pages on the 10 sources, fetches them in real Chrome, has Claude (headless, subscription) classify + structure + translate them into the Plan 1 content model, enriches with GBIF taxonomy and open-licence photos, gates quality, logs changes, and redeploys staging.

**Architecture:** New workspace package `packages/engine` (Node 24, TS run via `tsx`). Pure, unit-tested modules (sitemap parsing, outline extraction, merge, state, quality decision) plus thin adapters for side effects (Chrome via `playwright-core`, `claude -p`, GBIF/Commons HTTP). Adapters are injected so tests use recorded fixtures, never live services. Output goes to `content/` (git) via `@aq/schema` types; snapshots of source pages go to `sources/` (git) so every source edit is a diff.

**Tech Stack:** Node 24.22.1, TypeScript, tsx, playwright-core (channel `chrome`, headed, persistent profile), node-html-parser, zod, vitest; `claude -p --model sonnet --json-schema` with a lean system prompt; GBIF species API; Wikimedia Commons API.

**Spec:** `docs/superpowers/specs/2026-10-28-aquarium-site-design.md` (§4, §5, §6). Builds on Plan 1 (`@aq/schema`).

## Global Constraints

- Fetch only with real Chrome (`channel: 'chrome'`, `headless: false`, persistent profile `~/.cache/thuysinh/chrome-profile`), ≥4 s between requests to the same source, no stealth plugins, proxies or CAPTCHA solvers. A challenge page ("Just a moment…", "Robot Challenge") marks the URL `blocked` and the source `needs-human`; never retry around it.
- Claude calls: `claude -p --model sonnet --output-format json --tools "" --setting-sources "" --strict-mcp-config --system-prompt <ours> --json-schema <schema>`; parse `structured_output`; validate with zod; one retry on invalid output.
- Photos (owner decision 2026-10-28): the best source-page photos (≤4, ≥600px, no logos/banners, subject before scenery) are copied to R2 `thuysinh-media` (≤1200px WebP, served at `media.thuysinh.infinitus.run`), credited to the source + page URL, `Photo.source` set so the loader's publish gate covers them. Commons (`isAllowedLicence`) only when a page yields none.
- Every written section/guide keeps `source` + `sourceUrl`; every data-card value keeps its `source`.
- Translated HTML is sanitised to the tag allow-list `p, ul, ol, li, strong, em, h3, table, thead, tbody, tr, th, td, br` with no attributes before it is written (spec content-engine contract).
- Quality gate: score < 0.75 → one re-translation with reviewer notes; still < 0.75 → `quality.indexable = false`.
- Pipeline is idempotent: a URL whose snapshot hash equals `processedHash` is skipped.
- Staging content = local (ungated) build; `publish` flags stay `false`.

## Review Focus

1. Re-running the engine on unchanged pages must not call Claude or change any file. (Task 9 test.)
2. A species described by two sources keeps both sources' sections and data-card values; re-processing one source replaces only that source's parts. (Task 6 test.)
3. Claude output with a section key outside `SECTION_ORDER`, a missing scientific name for a species, or unsafe HTML (`<script>`, `onerror=`) must never reach `content/`. (Task 5 test.)
4. A challenge/blocked page is recorded as blocked and never processed as content. (Task 3 test.)
5. Two species whose Vietnamese names slugify identically get distinct slugs. (Task 6 test.)

---

### Task 1: Move sample content to site test fixtures

**Files:** Move `content/{species,plants,guides,glossary,places}` + `content/sources.json` copy → `apps/site/test/fixture-content/`; Modify `apps/site/package.json` test script, `packages/schema/test/content.test.ts`; Keep `content/sources.json`, `content/glossary`, `content/places` (original, ours).

- [ ] Step 1: Site `test` script → `CONTENT_ROOT=$PWD/test/fixture-content pnpm build && CONTENT_ROOT=… vitest run` (public-build test passes `CONTENT_ROOT` through). Schema `content.test.ts` points at `apps/site/test/fixture-content`.
- [ ] Step 2: Delete sample species/plants/guides from `content/`. Run `pnpm test` → all green. `pnpm build` (real `content/`) succeeds with empty species (home empty state).
- [ ] Step 3: Commit `chore: sample content becomes site test fixtures; content/ is engine output`.

### Task 2: Engine package, source registry, sitemap discovery

**Files:** Create `packages/engine/{package.json,tsconfig.json,vitest.config.ts}`, `src/sources.ts`, `src/discover.ts`, `test/discover.test.ts`, `test/fixtures/sitemaps/*.xml`.

**Interfaces — Produces:**
- `type SourceConfig = { id: SourceId; discover: { kind: 'sitemap'; urls: string[] } | { kind: 'crawl'; start: string[] }; include: RegExp; exclude?: RegExp; contentSelector?: string; delayMs: number }`; `SOURCES: SourceConfig[]` (all 10; PlanetCatfish included, expected to block).
- `parseSitemap(xml: string): { urls: { loc: string; lastmod?: string }[]; sitemaps: string[] }` (handles `<urlset>` and `<sitemapindex>`).
- `discover(src: SourceConfig, getText: (url: string) => Promise<string>, getLinks: (url: string) => Promise<string[]>): Promise<{ url: string; lastmod?: string }[]>` — recurses sitemap indexes (max depth 2), filters by include/exclude, dedupes, strips query/hash.

- [ ] Step 1: Failing tests: urlset with lastmod parsed; sitemapindex → child sitemaps followed via fake `getText`; include/exclude filter (`/species/` kept, `/species/` index page excluded); crawl mode uses `getLinks` and filters; duplicates and `?utm` variants collapse.
- [ ] Step 2: Run → FAIL. Step 3: implement (node-html-parser in XML mode or regex over `<loc>`/`<lastmod>`). Step 4: PASS. Step 5: commit `feat(engine): source registry and sitemap/crawl discovery`.

Registry values (decided from recon 2026-10-28): seriouslyfish sitemap `/sitemap.xml` include `/species/[a-z0-9-]+$`; glaser sitemap `/sitemap_index.xml` include `/en/` + news/species article paths; bwaquatics sitemap include `/products/`; 2hraquarist sitemap include `/blogs/articles/`; aquariumcoop sitemap include `/blogs/aquarium/`; sprucepets crawl start `/freshwater-fish-breeds-4162057` include `thesprucepets.com/[a-z0-9-]+-\d{7,}$`; aquariumbreeder sitemap `/sitemap_index.xml` include post URLs; tropica crawl start `/en/plants/` include `/en/plants/plantdetails/`; loachesonline crawl start `/` include species pages; planetcatfish crawl start `/` include `/species/`. Tune include patterns once against live sitemaps in Task 10 and record in ledger.

### Task 3: Chrome fetcher + outline extraction

**Files:** Create `src/fetch.ts`, `src/outline.ts`, `test/outline.test.ts`, `test/fixtures/pages/{seriouslyfish-cardinal.html,challenge.html}`.

**Interfaces — Produces:**
- `htmlToOutline(html: string, contentSelector?: string): { title: string; outline: string; images: { src: string; alt: string }[] }` — keeps headings as `#`/`##`/`###` lines, paragraphs, list items (`- `), table rows (`| a | b |`); drops nav/header/footer/aside/script/style/form; picks `contentSelector` → `main` → `article` → `body`.
- `isChallenge(title: string, text: string): boolean` — matches "Just a moment", "Robot Challenge", "Attention Required", "Verify you are human".
- `class ChromeFetcher { constructor(opts: { profileDir: string; headless?: boolean }); open(): Promise<void>; get(url: string): Promise<{ status: number; html: string; finalUrl: string }>; text(url: string): Promise<string>; links(url: string): Promise<string[]>; close(): Promise<void> }` (per-source politeness is the caller's job).

- [ ] Step 1: Failing tests on recorded fixtures: SF fixture outline contains `## Habitat`-style headings and the scientific name, no nav text; challenge fixture → `isChallenge` true; tables become `|` rows.
- [ ] Step 2–4: RED → implement → GREEN. Record the SF fixture with the fetcher (one live fetch) and commit the trimmed HTML.
- [ ] Step 5: commit `feat(engine): real-Chrome fetcher and outline extraction`.

### Task 4: Snapshot store + engine state

**Files:** Create `src/state.ts`, `src/snapshot.ts`, `test/state.test.ts`.

**Interfaces — Produces:**
- `type UrlState = { lastmod?: string; hash?: string; processedHash?: string; status: 'new' | 'fetched' | 'processed' | 'skipped' | 'blocked' | 'error'; entityIds: string[]; attempts: number; updatedAt: string; error?: string }`
- `loadState(root: string, source: SourceId): Promise<Record<string, UrlState>>`; `saveState(root, source, state): Promise<void>` → `engine-state/{source}.json` (sorted keys, stable output).
- `needsFetch(prev: UrlState | undefined, lastmod?: string, now: Date, refreshDays = 30): boolean` — new URL, newer lastmod, or (no lastmod and last fetch older than `refreshDays`).
- `writeSnapshot(root: string, source: SourceId, url: string, outline: { title: string; outline: string }): Promise<{ path: string; hash: string }>` → `sources/{source}/{slugify(path)}.md` with a YAML-ish header (`url`, `title`, `fetchedAt`), `hash` = sha256 of outline only.

- [ ] Step 1: Failing tests: `needsFetch` truth table (new, same lastmod, newer lastmod, no lastmod within/after 30 days, `blocked` within 7 days → false); state round-trip is byte-stable; snapshot hash ignores `fetchedAt`.
- [ ] Step 2–4. Step 5: commit `feat(engine): snapshot store and resumable state`.

### Task 5: Claude adapter + page processing contract

**Files:** Create `src/claude.ts`, `src/process.ts`, `src/prompts/process.md`, `src/sanitize.ts`, `test/process.test.ts`, `test/sanitize.test.ts`.

**Interfaces — Produces:**
- `type Llm = <T>(args: { system: string; prompt: string; schema: object }) => Promise<T>`; `claudeCli: Llm` (spawns `claude` with the Global Constraints flags, stdin = prompt, returns `structured_output`; throws on `is_error`).
- `ProcessedPage` zod schema (`ProcessedPageSchema`): `{ kind: 'species'|'plant'|'guide'|'skip'; scientificName?; enCommonNames: string[]; viName: string; viAltNames: string[]; group?; lNumber?; places: { continent: string; country?: string; region?: string }[]; dataCard: Partial<Record<DataCardField, Range | number>>; sections: { key: SectionKey; en: string; vi: string }[]; plant?: { difficulty: 1|2|3; light; co2; growth; placement[] }; guide?: { kind: GuideKind; viTitle: string; viBody: string }; productSlots: { category: string; keywords: string[] }[] }`.
- `sanitizeHtml(html: string): string` — allow-list from Global Constraints, strips all attributes and disallowed tags (keeping their text), drops `script/style` content entirely.
- `processPage(llm: Llm, input: { source: SourceId; url: string; title: string; outline: string; glossary: string[] }): Promise<ProcessedPage>` — builds prompt from `prompts/process.md`, validates; species without `scientificName` → `kind: 'skip'`; unknown section keys dropped; every `vi`/`viBody` passed through `sanitizeHtml`.

- [ ] Step 1: Failing tests with a fake `Llm` returning canned objects: valid species passes; species missing scientificName → skip; section key `history` dropped; `<script>alert(1)</script><p onclick="x">ok</p>` → `<p>ok</p>`; invalid JSON first time then valid → one retry succeeds; invalid twice → throws.
- [ ] Step 2–4. The prompt instructs: classify the page; for species extract SF-style sections in the given key set, data-card numbers in °C/cm/pH/dGH, difficulty on 1–8; translate faithfully to natural Vietnamese (Vietnamese common names where established, Latin names unchanged, metric units, keep it concise, no added claims); product slots as Vietnamese shopping keywords.
- [ ] Step 5: commit `feat(engine): claude adapter, page processing contract, html sanitiser`.

### Task 6: Merge into the content store

**Files:** Create `src/merge.ts`, `src/gbif.ts`, `test/merge.test.ts`, `test/gbif.test.ts`.

**Interfaces — Produces:**
- `type Taxon = { canonicalName: string; order?: string; family?: string; genus?: string; matchType: string }`; `gbifMatch(name: string, http: (url: string) => Promise<unknown>, cache: Record<string, Taxon | null>): Promise<Taxon | null>` (GBIF `/v1/species/match`, `matchType` NONE → null).
- `mergeSpecies(existing: { entity?: SpeciesEntity; vi?: Translation }, page: ProcessedPage, ctx: { source: SourceId; url: string; taxon: Taxon; now: string; takenSlugs: Set<string> }): { entity: SpeciesEntity; vi: Translation }` — id = `slugify(taxon.canonicalName)`; replaces this source's sections, data-card values, translations; keeps other sources'; places → place ids via `placeId(name)` = slugify of English name; vi name/altNames: keep existing name unless source is seriouslyfish; slug collision → `${slug}-${slugify(genus)}`.
- `mergePlant(...)`, `writeGuide(...)` analogues (guide id = `${source}-${slugify(urlPath)}`).
- `ensurePlaces(names: …): PlaceEntity + vi translation` for unknown continent/country (vi names from the page output).

- [ ] Step 1: Failing tests: two sources merge and re-merge (Review Focus 2); slug collision (Review Focus 5); GBIF NONE → species skipped; places created with parents.
- [ ] Step 2–4. Step 5: commit `feat(engine): merge processed pages into the content store`.

### Task 7: Enrichment — open-licence photos (+ optional videos)

**Files:** Create `src/photos.ts`, `src/videos.ts`, `test/photos.test.ts`.

**Interfaces — Produces:**
- `findPhotos(scientificName: string, http): Promise<Photo[]>` — Commons search `"<name>"` in File namespace, `iiprop=url|size|extmetadata`, width ≥ 800, `isAllowedLicence`, author stripped of HTML, 960px thumb URL, max 4.
- `findVideos(names, llm, apiKey?): Promise<Video[]>` — returns `[]` when `YOUTUBE_API_KEY` unset; otherwise YouTube search + Claude vet of title/description → 2–4.

- [ ] Step 1: Failing tests with recorded Commons JSON fixture: NC result dropped, small images dropped, HTML stripped from author, max 4.
- [ ] Step 2–4. Step 5: commit `feat(engine): open-licence photo enrichment`.

### Task 8: Quality gate + change log + "What's new" page

**Files:** Create `src/quality.ts`, `src/prompts/review.md`, `src/changelog.ts`, `test/quality.test.ts`; Create `apps/site/src/pages/vi/moi-cap-nhat/index.astro`; Modify `packages/schema/src/load.ts` (+ `changelog` in `Content`), schema for `ChangelogEntry`.

**Interfaces — Produces:**
- `reviewTranslation(llm, sections: { en: string; vi: string }[]): Promise<{ score: number; notes: string[] }>`
- `gate(score: number, retried: boolean): 'pass' | 'retry' | 'noindex'` (0.75 threshold).
- `ChangelogEntry = { date: string; kind: 'species'|'plant'|'guide'; id: string; source: SourceId; action: 'new'|'updated' }`; `appendChangelog(root, entries)` → `content/changelog.json` (newest first, max 500).

- [ ] Step 1: Failing tests: gate truth table; changelog append ordering/cap; site build test: `/vi/moi-cap-nhat/` lists fixture changelog entries with links.
- [ ] Step 2–4. Step 5: commit `feat: quality gate, change log, What's new page`.

### Task 9: Orchestrator CLI

**Files:** Create `src/run.ts`, `src/cli.ts`, `test/run.test.ts`; root script `engine` → `pnpm --filter @aq/engine exec tsx src/cli.ts`.

**Interfaces — Produces:** `runEngine(deps: { fetcher; llm; http; now: () => Date; root: string; sleep: (ms) => Promise<void> }, opts: { sources?: SourceId[]; limit?: number; maxMinutes?: number }): Promise<RunReport>`; `RunReport = { perSource: Record<SourceId, { discovered; fetched; processed; skipped; blocked; errors }>; changed: ChangelogEntry[] }`. CLI: `pnpm engine run [--sources a,b] [--limit N] [--max-minutes M]`, `pnpm engine status`. Writes `engine-state/last-run.json` (the daily summary).

- [ ] Step 1: Failing tests with fakes: full run writes entity + vi + snapshot + state + changelog; **second identical run calls `llm` zero times and changes no file** (Review Focus 1); blocked page → state `blocked`, `llm` not called (Review Focus 4); `limit` respected; an exception on one URL records `error` and continues.
- [ ] Step 2–4. Step 5: commit `feat(engine): orchestrator CLI`.

### Task 10: Live first run, schedule, deploy

**Files:** Create `scripts/engine-cycle.sh` (run → `pnpm test` → commit `content: engine run <date>` → push → `deploy-staging.sh`), `scripts/install-engine-schedule.sh` (launchd agent `run.thuysinh.engine`, every 6 h, logs to `~/Library/Logs/thuysinh-engine.log`), README section.

- [ ] Step 1: `pnpm engine run --limit 3` live for every source; tune `include` patterns; record per-source results + tuning in the ledger. Expected: SF/Glaser/BW/Co-op/Tropica/2HR/Spruce/Aquarium Breeder/Loaches produce content; PlanetCatfish `needs-human`.
- [ ] Step 2: `pnpm test`, `pnpm build` green with real content; screenshots desktop+mobile of one real species page.
- [ ] Step 3: Install schedule (`launchctl bootstrap gui/$UID …`); `launchctl print` shows it loaded.
- [ ] Step 4: Commit, PR, merge, deploy staging; verify live pages.
