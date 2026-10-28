# Plan 1 — Foundation: Content Schema + Mix-Skin Site (local) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A locally runnable Vietnamese site (Mix skin) rendering species, plants, guides, glossary and browse pages from a typed, language-keyed content store with sample data — the contract every later plan (content engine, skins/A-B, affiliate, comments) builds on.

**Architecture:** pnpm monorepo. `packages/schema` owns the content model (zod), merge rules, licence filter, slugging, units, glossary auto-linking and the content loader with the per-source publish gate. `content/` holds language-neutral entity JSON + per-language translation JSON. `apps/site` is an Astro static site that reads only through the loader.

**Tech Stack:** Node 24.22.1 (via `.nvmrc`), pnpm workspaces, TypeScript, zod, Vitest, Astro (latest stable), `@fontsource/*` (Vietnamese subsets), Pagefind.

**Spec:** `docs/superpowers/specs/2026-10-28-aquarium-site-design.md` (mockups in `docs/superpowers/specs/mockups/`)

**Later plans (not this one):** "What's new" log + fish finder data come with Plan 2. 2 content engine (detect/fetch/translate/enrich/quality gate) · 3 skins A/B/C + A/B test Worker · 4 affiliate · 5 comments · 6 Cloudflare deploy (gated on permissions).

## Global Constraints

- Node **24.22.1** for this repo (`.nvmrc`); never use the machine's Node 25.2.1 (CVE-2026-111497).
- Language-keyed from day one; all routes under `/{lang}/`; only `vi` populated.
- URL scheme: `/vi/ca/{slug}` · `/vi/cay/{slug}` · `/vi/huong-dan/{slug}` · `/vi/thiet-bi/{category}` · `/vi/kham-pha/{slug}` · `/vi/phan-loai/{order}/{family}/{genus}` · `/vi/nhom/{group}` · `/vi/nguon-goc/{continent}/{country}` · `/vi/thuat-ngu/{term}`.
- Species section order (SF): quickFacts, beforeYouBuy, distribution, habitat, aquariumSize, maintenance, waterConditions, equipment, diet, behaviour, dimorphism, reproduction, notes, references.
- Data card: SF value when present, else union of ranges; mark conflict when sources differ.
- Open photo licences allowed: **CC0, CC BY, CC BY-SA** only (any version). Everything else rejected.
- Every section and photo shows source credit + link to original.
- Source publish flag defaults to `false`; public builds exclude un-cleared sources.
- Pages with `quality.indexable === false` render `<meta name="robots" content="noindex">`.
- Default units cm/°C for `vi`.
- Fonts must render Vietnamese diacritics (Fraunces + Be Vietnam Pro, self-hosted).
- No content copied from sources into fixtures: fixture text is short original placeholder Vietnamese.

## Review Focus

1. Vietnamese diacritics in slugs/search — "Cá đĩa" → `ca-dia`; searching "ca dia" should still find "Cá đĩa". (Tests in Task 2, Task 8.)
2. Species with missing sections or data-card fields — no empty headings or "undefined" in output. (Test in Task 5.)
3. Conflicting values across sources — card shows SF value and a "nguồn khác nhau" marker. (Test in Task 2.)
4. Public build containing an un-cleared source — its sections/photos must be absent and an entity with no remaining sections must not be built. (Test in Task 3.)
5. Photo carrying an NC/ND or unknown licence — dropped, never rendered. (Test in Task 2.)

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `.nvmrc`, `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `tsconfig.base.json`, `packages/schema/package.json`, `packages/schema/tsconfig.json`, `packages/schema/vitest.config.ts`, `packages/schema/test/smoke.test.ts`

**Interfaces:**
- Produces: root scripts `pnpm test` (all workspaces), `pnpm dev`, `pnpm build` (site); workspace package name `@aq/schema`.

- [ ] **Step 1:** `.nvmrc` = `24.22.1`; run `nvm install && nvm use`. Expected: `node -v` → `v24.22.1`.
- [ ] **Step 2:** Write `packages/schema/test/smoke.test.ts`: `expect(1+1).toBe(2)`.
- [ ] **Step 3:** Add workspace files, install `typescript zod vitest` in `@aq/schema`. `.gitignore`: `node_modules`, `dist`, `.astro`, `.superpowers`, `.wrangler`.
- [ ] **Step 4:** Run `pnpm test`. Expected: 1 passed.
- [ ] **Step 5:** Commit `chore: monorepo scaffold (node 24.22.1, pnpm, vitest)`.

---

### Task 2: Content model + pure rules

**Files:**
- Create: `packages/schema/src/types.ts`, `schemas.ts`, `slug.ts`, `datacard.ts`, `licence.ts`, `units.ts`, `index.ts`
- Test: `packages/schema/test/{slug,datacard,licence,units,schemas}.test.ts`

**Interfaces:**
- Produces (exported from `@aq/schema`):
  - `type Lang = 'vi'` (extensible union); `type SourceId = 'seriouslyfish'|'planetcatfish'|'loachesonline'|'glaser'|'bwaquatics'|'2hraquarist'|'aquariumcoop'|'sprucepets'|'aquariumbreeder'|'tropica'`
  - `type Range = { min: number; max: number }`; `type DataCardField = 'tempC'|'ph'|'gh'|'sizeCm'|'tankCm'|'difficulty'` (difficulty is a number 1–8)
  - `type SourcedValue = { source: SourceId; value: Range | number }`
  - `type SectionKey` = the 14 keys in Global Constraints order; `SECTION_ORDER: SectionKey[]`
  - `SECTION_LABELS: Record<Lang, Record<SectionKey, string>>` (vi labels, e.g. `dimorphism` → "Phân biệt đực cái", `reproduction` → "Sinh sản")
  - `type Section = { key: SectionKey; source: SourceId; sourceUrl: string; html: string }` (English source HTML)
  - `type Photo = { url: string; width: number; height: number; licence: string; author: string; sourceUrl: string; caption?: string }`
  - `type Video = { youtubeId: string; title: string; durationSec: number; lang: string }`
  - `type ProductSlot = { category: string; keywords: string[] }`
  - `type SpeciesEntity = { id: string; scientificName: string; order: string; family: string; genus: string; group: string; lNumber?: string; places: string[] /* place ids */; dataCard: Partial<Record<DataCardField, SourcedValue[]>>; sections: Section[]; photos: Photo[]; videos: Video[]; productSlots: ProductSlot[]; updatedAt: string }`
  - `type PlantEntity = { id; scientificName; difficulty: 1|2|3; light: 'low'|'medium'|'high'; co2: 'none'|'optional'|'required'; growth: 'slow'|'medium'|'fast'; placement: ('foreground'|'midground'|'background'|'epiphyte'|'floating')[]; sections: Section[]; photos: Photo[]; productSlots: ProductSlot[]; updatedAt }`
  - `type GuideEntity = { id; kind: 'setup'|'care'|'breeding'|'disease'|'aquascaping'|'plantCare'|'discovery'; source: SourceId; sourceUrl; html; photos: Photo[]; mentions: string[] /* entity ids */; updatedAt }`
  - `type GlossaryEntity = { id; en: string; latin?: string }`; `type PlaceEntity = { id; kind: 'continent'|'country'|'region'|'river'; parent?: string }`
  - `type Translation = { slug: string; name: string; altNames: string[]; sections: Record<string /* `${key}:${source}` */, string>; body?: string; definition?: string; quality: { score: number; indexable: boolean } }`
  - zod schemas `SpeciesSchema, PlantSchema, GuideSchema, GlossarySchema, PlaceSchema, TranslationSchema` matching the types.
  - `slugify(text: string): string`
  - `resolveDataCard(values: SourcedValue[]): { value: Range | number; sources: SourceId[]; conflict: boolean } | null`
  - `isAllowedLicence(licence: string): boolean`; `filterPhotos(photos: Photo[]): Photo[]`
  - `cToF(c: number): number` (1 decimal), `cmToIn(cm: number): number` (1 decimal)

- [ ] **Step 1: Write failing tests**

```ts
// slug.test.ts
expect(slugify('Cá neon vua')).toBe('ca-neon-vua')
expect(slugify('Cá đĩa')).toBe('ca-dia')
expect(slugify('  Tép  Red-Cherry! ')).toBe('tep-red-cherry')
expect(slugify('Ancistrus sp. (L144)')).toBe('ancistrus-sp-l144')
// datacard.test.ts
const sf = { source: 'seriouslyfish', value: { min: 24, max: 30 } } as const
const pc = { source: 'planetcatfish', value: { min: 22, max: 28 } } as const
expect(resolveDataCard([pc, sf])).toEqual({ value: { min: 24, max: 30 }, sources: ['seriouslyfish','planetcatfish'], conflict: true })
expect(resolveDataCard([pc, { source: 'glaser', value: { min: 20, max: 26 } }])).toEqual({ value: { min: 20, max: 28 }, sources: ['planetcatfish','glaser'], conflict: true })
expect(resolveDataCard([pc, { ...pc, source: 'glaser' }])?.conflict).toBe(false)
expect(resolveDataCard([])).toBeNull()
// licence.test.ts
for (const ok of ['CC0','CC0 1.0','CC BY 4.0','CC BY-SA 3.0','cc-by-sa-4.0']) expect(isAllowedLicence(ok)).toBe(true)
for (const no of ['CC BY-NC 4.0','CC BY-ND 2.0','CC BY-NC-SA 3.0','All rights reserved','','unknown']) expect(isAllowedLicence(no)).toBe(false)
// units.test.ts
expect(cToF(24)).toBe(75.2); expect(cmToIn(5)).toBe(2)
// schemas.test.ts — a minimal valid SpeciesEntity parses; one missing scientificName throws.
```

- [ ] **Step 2:** `pnpm --filter @aq/schema test`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement. `slugify`: NFD-normalise, strip combining marks, map `đ/Đ`→`d`, lowercase, non-alphanumerics → `-`, trim dashes. `resolveDataCard`: SF value if present else union (min of mins, max of maxes; for plain numbers, SF else max); `sources` = SF first then input order; `conflict` = any two values not deep-equal. Licence: normalise case/separators, allow only `CC0`, `CC BY`, `CC BY-SA` families.
- [ ] **Step 4:** Run tests. Expected: all PASS.
- [ ] **Step 5:** Commit `feat(schema): content model, data-card merge, licence filter, slug, units`.

---

### Task 3: Content store layout, loader, publish gate

**Files:**
- Create: `content/sources.json`, `packages/schema/src/load.ts`, `packages/schema/test/load.test.ts`, `packages/schema/test/fixtures/` (tiny store for tests)

Store layout (decided):
```
content/sources.json                          # { [SourceId]: { name, homepage, publish: boolean, permission?: { date, file, scope: string[] } } }
content/{species|plants|guides|glossary|places}/{id}/entity.json
content/{species|plants|guides|glossary|places}/{id}/{lang}.json   # Translation
```

**Interfaces:**
- Consumes: Task 2 types/schemas.
- Produces:
  - `type SourceInfo = { name: string; homepage: string; publish: boolean; permission?: { date: string; file: string; scope: string[] } }`
  - `type LoadOptions = { root: string; lang: Lang; publicBuild: boolean }`
  - `type Localized<E> = E & { t: Translation }`
  - `loadAll(opts: LoadOptions): Promise<{ species: Localized<SpeciesEntity>[]; plants: Localized<PlantEntity>[]; guides: Localized<GuideEntity>[]; glossary: Localized<GlossaryEntity>[]; places: Localized<PlaceEntity>[]; sources: Record<SourceId, SourceInfo> }>`
  - Rules: entities without a `{lang}.json` are skipped; photos pass through `filterPhotos`; when `publicBuild` is true, sections/guides/photos whose source has `publish: false` are removed, and species/plants left with zero sections are dropped. When false (local dev), everything loads. Invalid JSON → throw with the file path in the message.

- [ ] **Step 1: Write failing tests** in `load.test.ts` against `test/fixtures/`: (a) local load returns 2 species; (b) `publicBuild: true` with fixture source `glaser.publish=false` removes the glaser section from species A and drops species B (glaser-only); (c) NC-licensed fixture photo is absent; (d) species without `vi.json` is skipped; (e) malformed `entity.json` rejects with message containing its path.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `loadAll` (fs/promises + zod parse). `content/sources.json` lists all 10 sources with `publish: false`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(schema): content loader with per-source publish gate`.

---

### Task 4: Sample content

**Files:**
- Create under `content/`: species `paracheirodon-axelrodi`, `paracheirodon-innesi`, `mikrogeophagus-ramirezi`, `symphysodon-aequifasciatus`, `danio-margaritatus`, `neocaridina-davidi`, `boraras-brigittae`, `apistogramma-cacatuoides`; plants `anubias-barteri-nana`, `cryptocoryne-wendtii`, `monte-carlo`; guides `setup-be-dau-tien`, `loc-cho-be-nano`; glossary `ph`, `gh`, `chu-trinh-nito`, `ca-dan`; places `south-america`, `brazil`, `rio-negro`, `asia`, `myanmar`, `thailand`, `vietnam`.
- Test: `packages/schema/test/content.test.ts`

Photos: the Wikimedia Commons files already used in the mockups (960px/1280px thumb URLs), with real author + licence looked up from each Commons file page. Section HTML/translations: short original Vietnamese placeholder text (2–3 sentences), `source` set to the plausible source, `sourceUrl` to that source's real page URL for the species. At least one species missing `gh` and `dimorphism`; at least one with conflicting temp between two sources; one with `quality.indexable: false`.

- [ ] **Step 1:** Write `content.test.ts`: `loadAll({ root: 'content', lang: 'vi', publicBuild: false })` resolves; ≥8 species, ≥3 plants, ≥2 guides; every photo `isAllowedLicence`; every `t.slug === slugify(t.name)`; no two species share a slug.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Author the fixtures.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `content: sample species, plants, guides, glossary, places`.

---

### Task 5: Astro site, Mix theme, home + species page

**Files:**
- Create: `apps/site/{package.json,astro.config.mjs,tsconfig.json}`, `apps/site/src/lib/content.ts`, `apps/site/src/styles/tokens.css`, `apps/site/src/layouts/Base.astro`, `apps/site/src/components/{Nav,Footer,SpeciesCard,DataCard,SourceCredit,PhotoGallery,VideoFacade,ProductSlots,CommentsPlaceholder,Difficulty}.astro`, `apps/site/src/pages/index.astro` (302 → `/vi/`), `apps/site/src/pages/vi/index.astro`, `apps/site/src/pages/vi/ca/[slug].astro`
- Test: `apps/site/test/build.test.ts` (runs against `dist/` after `pnpm build`)

**Interfaces:**
- Consumes: `loadAll`, `resolveDataCard`, `SECTION_ORDER`, `cToF`, `cmToIn` from `@aq/schema`.
- Produces: `apps/site/src/lib/content.ts` → `getContent(): Promise<Awaited<ReturnType<typeof loadAll>>>` (memoised; `root` = repo `content/`, `publicBuild = process.env.PUBLIC_BUILD === '1'`). CSS custom properties in `tokens.css` (all colours/fonts/radii) — later skins override only these + component variants.

Look and feel: match `mockups/mix-home.html` and `mockups/mix-species-profile.html` (dark hero + lime tank-match strip + paper specimen cards; species page: plate photo, stats grid, source line, dark video band, products + discussion columns). Tank-match strip is static UI in this plan. `VideoFacade` renders thumbnail + play button and swaps in the iframe on click (no iframe in initial HTML). `ProductSlots` renders Shopee/Lazada **search** links from `keywords` (`https://shopee.vn/search?keyword=…`, `https://www.lazada.vn/catalog/?q=…`) with `rel="sponsored nofollow"`. Sections render in `SECTION_ORDER`; a section heading appears only if ≥1 section of that key exists; multiple sources under one key render as credited sub-blocks. JSON-LD (`Article` + breadcrumb) on species pages.

- [ ] **Step 1: Write failing build test**: after build, `dist/vi/ca/ca-neon-vua/index.html` exists; contains "Paracheirodon axelrodi", "Seriously Fish" credit link, a `data-conflict` marker on the temperature cell, no `<iframe`, no "undefined"/"NaN"; species missing `dimorphism` has no "Phân biệt đực cái" heading; the `indexable:false` species page contains `noindex`; home page links to all 8 species cards.
- [ ] **Step 2:** `pnpm build && pnpm --filter site test`. Expected: FAIL.
- [ ] **Step 3:** Implement components/pages per mockups; self-host fonts via `@fontsource-variable/fraunces` and `@fontsource/be-vietnam-pro` (vietnamese subset).
- [ ] **Step 4:** Run build + test. Expected: PASS. Run `pnpm dev`, open `/vi/` and `/vi/ca/ca-neon-vua/` at 390px and 1280px widths; compare visually against the mockups.
- [ ] **Step 5:** Commit `feat(site): Astro Mix skin — home and species page`.

---

### Task 6: Browse pages (species list, classification, groups, origin) + units toggle

**Files:**
- Create: `apps/site/src/pages/vi/ca/index.astro`, `vi/phan-loai/[...path].astro`, `vi/nhom/[group].astro`, `vi/nguon-goc/[...path].astro`, `apps/site/src/components/{SpeciesFilter,UnitsToggle}.astro`, `apps/site/src/scripts/{filter,units}.ts`
- Test: extend `apps/site/test/build.test.ts`; `apps/site/test/filter.test.ts`

**Interfaces:**
- Produces: `filterSpecies(items: SpeciesIndexItem[], q: { difficultyMax?: number; tempC?: number; ph?: number; tankCm?: number; group?: string; text?: string }): SpeciesIndexItem[]` in `scripts/filter.ts`, where `SpeciesIndexItem = { slug; name; scientificName; group; difficulty?; tempC?: Range; ph?: Range; tankCm?: number }` (emitted as JSON into the list page). `text` match is diacritic-insensitive (uses `slugify` on both sides). Units toggle stores choice in `localStorage['units']` (`metric`|`imperial`) and rewrites elements carrying `data-c`/`data-cm` attributes.

- [ ] **Step 1: Failing tests**: `filterSpecies` — `{ tempC: 29 }` excludes neon xanh (20–26) and includes discus; `{ text: 'ca dia' }` returns Cá đĩa; `{ tankCm: 60 }` excludes species needing >60. Build test: `/vi/phan-loai/characiformes/characidae/paracheirodon/` lists both Paracheirodon species; `/vi/nguon-goc/south-america/brazil/` lists neon vua; `/vi/nhom/{group}` exists for every group present.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement pages, filter script (client-side over embedded JSON), units toggle.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(site): species browse, classification, groups, origin, units toggle`.

---

### Task 7: Plants, guides, glossary (auto-linking), equipment, discovery, hubs

**Files:**
- Create: `packages/schema/src/glossary-link.ts`, `packages/schema/test/glossary-link.test.ts`, `apps/site/src/pages/vi/cay/{index,[slug]}.astro`, `vi/huong-dan/{index,[slug]}.astro`, `vi/thuat-ngu/{index,[slug]}.astro`, `vi/thiet-bi/[category].astro` (one page per distinct `ProductSlot.category`, listing linked species/plants + search links), `vi/kham-pha/index.astro` (discovery guides + featured species), hub pages `vi/nguon-goc/asia/vietnam` titled "Cá Việt Nam" (via Task 6 route, custom intro)
- Test: extend `apps/site/test/build.test.ts`

**Interfaces:**
- Produces: `linkGlossary(html: string, terms: { name: string; href: string }[]): string` — links the **first** occurrence of each term per document, case-insensitive, whole-word, never inside an existing `<a>`, heading, or attribute; longest term wins on overlap.

- [ ] **Step 1: Failing tests**:
```ts
const terms = [{ name: 'pH', href: '/vi/thuat-ngu/ph/' }, { name: 'chu trình nitơ', href: '/vi/thuat-ngu/chu-trinh-nito/' }, { name: 'chu trình', href: '/x/' }]
expect(linkGlossary('<p>pH thấp. pH cao.</p>', terms)).toBe('<p><a href="/vi/thuat-ngu/ph/" class="gl">pH</a> thấp. pH cao.</p>')
expect(linkGlossary('<p>Hiểu chu trình nitơ</p>', terms)).toContain('href="/vi/thuat-ngu/chu-trinh-nito/"')
expect(linkGlossary('<a href="#">pH</a>', terms)).toBe('<a href="#">pH</a>')
expect(linkGlossary('<h2>pH</h2>', terms)).toBe('<h2>pH</h2>')
expect(linkGlossary('<p>phosphate</p>', terms)).toBe('<p>phosphate</p>')
```
  Build test: plant page shows light/CO₂/growth and product search links; guide page credits its source; glossary index lists 4 terms; species page body contains a `class="gl"` link; `/vi/thiet-bi/{category}/` exists for each category in fixtures; `/vi/kham-pha/` lists discovery guides.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement (HTML parsed with `parse5` or `node-html-parser`, text nodes only). Wire into species/plant/guide rendering.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: plants, guides, glossary pages with auto-linking`.

---

### Task 8: SEO + search

**Files:**
- Modify: `apps/site/astro.config.mjs`, `apps/site/src/layouts/Base.astro`
- Create: `apps/site/src/pages/robots.txt.ts`
- Test: extend `apps/site/test/build.test.ts`

Decided: `site` URL from env `SITE_URL` (default `http://localhost:4321`); `@astrojs/sitemap` excluding noindex pages; every page has canonical + `hreflang="vi"` + `x-default`; Pagefind runs after build (`pagefind --site dist`), indexing only `<main>`; search UI in nav.

- [ ] **Step 1: Failing tests**: every HTML file in `dist/vi/` has exactly one canonical and a `hreflang="vi"` link; sitemap excludes the noindex species; `dist/pagefind/` exists; a Pagefind node-API query for `"ca dia"` returns the Cá đĩa page (if Pagefind can't, add the slugified name as hidden `data-pagefind-meta` keywords and re-test).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm build && pnpm --filter site test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(site): canonical/hreflang, sitemap, robots, Pagefind search`.

---

### Task 9: Local run check

- [ ] **Step 1:** From clean clone: `nvm use && pnpm i && pnpm test && pnpm build`. Expected: all green.
- [ ] **Step 2:** `PUBLIC_BUILD=1 pnpm build` → build succeeds with zero species pages (all sources `publish:false`) and home page shows an empty-state, not an error. Add that as a build test.
- [ ] **Step 3:** Add `README.md`: requirements (nvm, Node 24.22.1), commands, content layout, publish gate.
- [ ] **Step 4:** Commit `docs: README; verify public-build gate`.
