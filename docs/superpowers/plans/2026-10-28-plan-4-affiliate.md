# Plan 4 — Affiliate System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Every product mention on species, plant and guide pages is a tracked `/go/` link. The Worker resolves it to the best active affiliate product, else to an affiliate-wrapped marketplace search, else to a plain search. A daily cron checks concrete products through network adapters and retires dead ones automatically. Plants are affiliate items (Shopee).

**Architecture:**
- D1 `thuysinh` holds `products` (concrete listings once accounts exist), `clicks_daily` (aggregates) and `checks` (checker log).
- Worker route `GET /go/:network?k=&c=&e=` does the resolve-and-redirect, counts the click, and returns a 302.
- Network adapters (`shopee`, `lazada`, `tiki`) provide `searchUrl(keyword)`, `wrap(url)` (from an owner-provided deeplink template secret such as AccessTrade/Involve Asia `https://go.isclix.com/deep_link/<id>?url={url}`) and `check(product)` (official API once credentials exist; until then it returns `unknown` and never deactivates).
- The `scheduled` cron runs the checker after the A/B allocation.
- Admin endpoint `POST /_aff/products` (dashboard-token auth) adds or updates products, used by Claude or the owner once accounts exist.
- The `/_ab` dashboard gains an affiliate section.

**Spec:** §7.

## Global Constraints

- Links are `rel="sponsored nofollow noopener"` and visibly labelled. Ranking signals never depend on affiliate status.
- Search links are the default and never go dead. A concrete product is only shown while it is `active` and was checked within 48 h.
- A dead or out-of-stock product (adapter says so twice in a row) → `inactive`. The redirect then falls through to the next active product for the same placement, then to search. No manual step.
- Click logging stores no IP and no UA: only date, network, category, entity ref and product id.
- Deeplink templates and API keys are secrets (`AFF_TEMPLATE_SHOPEE`, `SHOPEE_APP_ID`/`SHOPEE_SECRET`, …). They are never committed and never logged.
- `/go/` only redirects to the allow-listed marketplace hosts and deeplink hosts derived from templates, so it is not an open redirect.

## Review Focus

1. `/go/` can't be turned into an open redirect: arbitrary `u=` is impossible because only keyword + network are accepted. (Task 2 test.)
2. With no products and no templates, every slot still works and points to the marketplace search. (Task 2 test.)
3. A product failing two consecutive checks is never served again until it passes. (Task 4 test.)
4. Plant pages have Shopee slots even when the engine produced none. (Task 5 test.)

### Task 1: D1 schema + migrations
`apps/site/migrations/0001_affiliate.sql`:
- `products(id TEXT PK, network, external_id, title, url, price_vnd INT, image, category, entity_ref, keyword, status CHECK IN ('active','inactive'), fail_count INT, checked_at TEXT, created_at)`
- `clicks_daily(date, network, category, entity_ref, product_id, n, PK(date,network,category,entity_ref,product_id))`
- `checks(id, product_id, at, result, detail)`

Binding `DB` in `wrangler.jsonc`. Test: the migration applies to a fresh local D1 (`wrangler d1 migrations apply --local`).

### Task 2: Adapters + `/go/` redirect
- `worker/affiliate/networks.ts`: `NETWORKS: Record<'shopee'|'lazada'|'tiki', Adapter>` with `searchUrl`, `hosts`, `wrap(url, env)` and `check(product, env)`.
- `worker/affiliate/go.ts`: `resolveGo(params, db, env)` → `{ location, productId? }`. Order: an active fresh product matching (entity_ref, category, network); else the product matching (keyword, network); else `wrap(searchUrl(k))`; else `searchUrl(k)`.
- `recordClick(db, …)` is an upsert `n = n + 1` (via `ctx.waitUntil`).
- Tests use a fake D1 (in-memory adapter over the same SQL shapes): no products → search; template set → wrapped; active product → product; inactive → skipped; unknown network or missing k → 404; the location host is always allow-listed.

### Task 3: Site links
- `ProductSlots.astro` points at `/go/{network}/?k=…&c=…&e={kind}:{id}`, keeping the rel attributes and the label "Liên kết tiếp thị — trang có thể nhận hoa hồng".
- `lib/format.ts` `goLink()` replaces `shopeeSearch`/`lazadaSearch` in pages.
- Static hosting without the Worker: `/go/*` falls back to a static page per network that JS-redirects to the search. The build emits `/go/shopee/index.html` and the others.
- Tests: build output links are `/go/…`, nothing links directly to shopee.vn or lazada.vn, and the beacon still sees `rel~=sponsored`.

### Task 4: Daily checker
- `worker/affiliate/check.ts`: `runChecks(db, env, now)` checks active products whose `checked_at` is older than 20 h. On `ok` it resets `fail_count` and updates the price; on `dead` it increments `fail_count` and sets `inactive` at 2; on `unknown` it only bumps `checked_at`.
- It is called from `scheduled`.
- Tests: the two-strike rule, a revival when a product passes, unknown never deactivates, and price updates.

### Task 5: Plants as affiliate items + admin API
- Loader or site: plant pages without a `cay-thuy-sinh` slot get `{ category: 'cay-thuy-sinh', keywords: [vi name, scientific name] }`.
- `POST /_aff/products` (dashboard auth, JSON array) upserts products after validation (allow-listed host, network known).
- `scripts/aff-add.sh` posts a JSON file.
- Tests: plant page has a Shopee slot; admin rejects a missing token or a bad host.

### Task 6: Dashboard + deploy
- `/_ab/` gains an affiliate table: clicks (14 days) by network and category, top entities, product status counts and the last checker run.
- D1 create plus migrations on remote, deploy, then verify live:
  - a `/go/shopee/?k=cá neon` request → 302 to `shopee.vn/search`
  - `clicks_daily` row incremented
  - dashboard shows it
- PR → merge.
