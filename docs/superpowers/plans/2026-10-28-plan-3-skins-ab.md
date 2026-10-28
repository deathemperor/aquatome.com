# Plan 3 — Skins A/B/C + A/B Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three more skins (A "Đáy sâu", B "Sổ tay tự nhiên", C "Khám phá") beside Mix. Each visitor gets one skin, sticky by cookie, and engagement plus affiliate-click events go to Workers Analytics Engine. A daily bandit cron reallocates traffic toward the best estimated revenue per 1,000 visits, and a token-protected dashboard shows the per-skin results.

**Architecture:**
- **One static build, so markup and URLs are identical for every skin.** Each skin is a CSS layer scoped by `html[data-skin="a|b|c"]`, plus fonts loaded only by that skin. Mix is the unscoped default.
- **Skin assignment.** A Worker (`apps/site/worker/index.ts`) sits in front of the static assets (`run_worker_first` for HTML). It picks the skin from cookie, `?skin=` override or bandit weights in KV, and HTMLRewriter stamps `data-skin` on `<html>`. Bots always get Mix.
- **Events.** A small client beacon posts events to `/_e`, and the Worker writes them to Analytics Engine.
- **Daily cron.** It reads Analytics Engine through its SQL API, computes allocation, and writes the weights to KV.
- **Dashboard.** `/_ab/` is served by the Worker.

**Tech Stack:** Astro 7 static, Cloudflare Workers (assets binding, HTMLRewriter, Analytics Engine, KV, Cron Triggers), vitest. Skin fonts come from @fontsource: Newsreader for B, Bricolage Grotesque for C, both with the Vietnamese subset.

**Spec:** `docs/superpowers/specs/2026-10-28-aquarium-site-design.md` §9 (skins, A/B), §10. Mockups: `docs/superpowers/specs/mockups/skin-{a-day-sau,b-so-tay,c-kham-pha}.html`.

## Global Constraints

- Skins change presentation only: no skin-specific URLs, text or content. A skin may hide or rearrange elements that exist for every skin. `html[data-skin]` is the only switch.
- Bots and crawlers (UA match plus missing `accept-language`) always get Mix. Mix is also what a no-JS, no-cookie first view gets when the Worker is absent (plain static hosting still works).
- Assignment is sticky: cookie `skin` with 90-day max-age, `SameSite=Lax`, no PII. `?skin=a` sets the cookie (QA); `?skin=reset` clears it.
- Events carry only: skin, path, event type, value, and a random session id (sessionStorage). No IP and no user agent are stored.
- Allocation: Thompson sampling on the per-visit "converted" rate (affiliate click, or ≥3 pages and ≥60 s), with a 10% floor per skin. The guardrail drops a skin to the floor if its pages/visit is below 80% of Mix with ≥500 visits each. Weights live in KV `ab:weights`; the default is equal weights.
- Revenue per 1,000 visits = (affiliate clicks × `AFFILIATE_CLICK_VALUE_VND`) / visits × 1000. Ad RPM is 0 until AdSense exists.
- Staging stays noindex. The Worker adds `X-Robots-Tag: noindex, nofollow` when `env.STAGING === '1'`.
- Lighthouse mobile performance must not regress by more than 5 points on species pages for any skin. Skin CSS is ≤ 25 KB gzipped each.

## Review Focus

1. A crawler UA never receives a non-Mix skin or a `Set-Cookie`. (Task 4 test.)
2. A page's HTML is byte-identical across skins except the `data-skin` attribute. (Task 4 test.)
3. The allocation floor and guardrail hold for any stats input, and weights sum to 1. (Task 6 test.)
4. The dashboard can't be read without the token. (Task 7 test.)
5. Every skin is readable: contrast ≥ 4.5:1 for body text, and focus is visible. (Task 2/3 checks.)

---

### Task 1: Skin mechanism + QA switch

**Files:** Modify `apps/site/src/layouts/Base.astro`, `apps/site/src/styles/global.css`; Create `apps/site/src/styles/skins/{a,b,c}.css`, `apps/site/src/components/SkinPreview.astro` (inline script: honours `?skin=` locally when no Worker, sets `data-skin`), `apps/site/test/skins.test.ts`.

- [ ] Step 1: Failing test: built species page includes all three skin stylesheets (`<link rel="stylesheet" … data-skin-css="a">`, or the CSS bundled under `[data-skin=a]` selectors); `<html>` has no `data-skin` by default; no skin CSS selector leaks outside `[data-skin=…]`.
- [ ] Step 2–4. Mechanism: skin CSS imported in Base as global CSS whose every rule is nested under `:root[data-skin="x"]` (native CSS nesting); skin fonts imported inside the skin file via `@font-face` with `font-display: swap` (only fetched when a rule using them matches).
- [ ] Step 5: commit `feat(site): skin mechanism`.

### Task 2: Skin A "Đáy sâu" and Skin B "Sổ tay tự nhiên"

**Files:** `apps/site/src/styles/skins/a.css`, `b.css`; small markup hooks in components only if a skin needs a wrapper (applies to all skins).

- [ ] A: dark blackwater ground, cinematic full-bleed hero image on species and home, neon accents, large display type, image-led cards. Matches `skin-a-day-sau.html`.
- [ ] B: warm paper, Newsreader serif body, specimen-plate cards with thin rules and captions, field-guide data card. Matches `skin-b-so-tay.html`.
- [ ] Verify with screenshots of home, species, browse and guide (desktop 1280 + mobile 390) for each skin, plus a contrast check on the body text and data card. Run the impeccable critique pass and fix its findings.
- [ ] Commit `feat(site): skins A and B`.

### Task 3: Skin C "Khám phá"

- [ ] C: bright bento grid, Bricolage Grotesque display, chunky rounded cards, mobile-first, playful colour chips on the group and difficulty filters. Matches `skin-c-kham-pha.html`.
- [ ] Same verification as Task 2. Commit `feat(site): skin C`.

### Task 4: A/B Worker — assignment

**Files:** Create `apps/site/worker/{index.ts,assign.ts}`, `apps/site/worker/test/assign.test.ts`, `apps/site/worker/tsconfig.json`; Modify `apps/site/wrangler.jsonc` (`main`, `assets.binding: "ASSETS"`, `assets.run_worker_first: ["/*", "!/_astro/*", "!/pagefind/*", "!/*.webp", …]`, KV `AB`, analytics_engine_datasets `EVENTS`, vars `STAGING`, `AFFILIATE_CLICK_VALUE_VND`), `scripts/deploy-staging.sh` (drop `_headers` hack; Worker sets the header).

**Interfaces — Produces:**
- `isBot(ua: string | null, acceptLanguage: string | null): boolean`
- `pickSkin(weights: Record<Skin, number>, r: number): Skin`; `type Skin = 'mix' | 'a' | 'b' | 'c'`
- `resolveSkin(req: Request, weights, r): { skin: Skin; setCookie?: string }` — query override > cookie > bot → mix > weighted pick.
- Worker `fetch`: non-HTML → `ASSETS.fetch`; HTML → HTMLRewriter `html` element `setAttribute('data-skin', skin)` unless mix, `Vary: Cookie`, `Cache-Control: private` on HTML when a skin cookie is set.

- [ ] Step 1: Failing tests: Googlebot/Bingbot/AhrefsBot/curl → mix, no cookie; `?skin=b` → b + cookie; cookie `skin=c` → c; weights {mix:1} → always mix; `pickSkin` boundaries; HTML identical except `data-skin` (rewriter applied to a fixture page).
- [ ] Step 2–4. Step 5: commit `feat(worker): sticky skin assignment`.

### Task 5: Events

**Files:** Create `apps/site/src/components/Beacon.astro` (inline, <1.5 KB: session id, `view` on load, `scroll` at 50/90%, `time` at 30/60/180 s, `aff` on click of `a[rel~=sponsored]`), `apps/site/worker/events.ts`, tests.

- [ ] `parseEvent(body): Event | null` validates `{ s: Skin, p: path ≤ 200, t: 'view'|'scroll'|'time'|'aff', v: number, sid: [a-z0-9]{12} }`; Worker `POST /_e` → `EVENTS.writeDataPoint({ blobs: [skin, type, path, sid], doubles: [v], indexes: [skin] })`; 204; invalid → 400; ≤ 4 KB body.
- [ ] Beacon reads skin from `document.documentElement.dataset.skin ?? 'mix'`; uses `sendBeacon`.
- [ ] Tests: parseEvent truth table; site build test asserts beacon present and that `aff` handler targets sponsored links.
- [ ] Commit `feat: engagement and affiliate events`.

### Task 6: Bandit allocation cron

**Files:** Create `apps/site/worker/allocate.ts`, `apps/site/worker/stats.ts`, tests; Modify `wrangler.jsonc` (`triggers.crons: ["17 3 * * *"]`, secret `AE_API_TOKEN`, var `CF_ACCOUNT_ID`).

**Interfaces — Produces:**
- `type SkinStats = { visits: number; pages: number; converted: number; clicks: number }`
- `allocate(stats: Record<Skin, SkinStats>, rand: () => number, draws = 2000): Record<Skin, number>` — Thompson on Beta(converted+1, visits−converted+1), share of wins, floor 10%, guardrail, normalise.
- `queryStats(accountId, token, days = 14): Promise<Record<Skin, SkinStats>>` — AE SQL API (`SELECT blob1 AS skin, … FROM EVENTS WHERE timestamp > NOW() - INTERVAL '14' DAY GROUP BY …`), sessions derived from `blob4`.
- `scheduled` → `queryStats` → `allocate` → `AB.put('ab:weights', json)`, plus `ab:stats` snapshot for the dashboard.

- [ ] Tests: equal stats → each ≈ 25% (±5); one dominant skin → it gets most of the traffic while the others stay ≥ 10%; guardrail drops a skin with low pages/visit; zero data → equal; weights sum to 1.
- [ ] Commit `feat(worker): bandit allocation`.

### Task 7: Dashboard

**Files:** `apps/site/worker/dashboard.ts`, test.

- [ ] `GET /_ab/?token=…` (or the `ab_token` cookie, set on the first valid visit) compares the token to secret `AB_DASH_TOKEN` in constant time, then shows a table per skin with visits, pages/visit, avg time, scroll 90% rate, affiliate clicks, est. revenue per 1,000 visits, current weight and last updated. A wrong or missing token → 404. Always `noindex`.
- [ ] Tests: no token → 404; wrong → 404; right → 200 with all four skins.
- [ ] Commit `feat(worker): A/B dashboard`.

### Task 8: Deploy + verify

- [ ] Create the KV namespace and set the secrets (`AB_DASH_TOKEN` generated locally into `~/.config/thuysinh/ab-dash-token`, plus `AE_API_TOKEN`). The Analytics Engine read token needs the account "Analytics: Read" permission. If the current token lacks it, use `request_secret` for one.
- [ ] Deploy staging, then verify live:
  - `curl -A Googlebot` → no `data-skin`, no `set-cookie`
  - a browser UA → cookie set and the skin attribute present
  - `?skin=a|b|c` screenshots
  - `POST /_e` → 204
  - the dashboard with the token → 200, without → 404
  - `X-Robots-Tag` present
- [ ] PR (draft → review → ready → squash merge), deploy.
