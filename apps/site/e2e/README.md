# Browser checks

Playwright on the built site, as a phone (Pixel 7, touch) and a computer (1280 × 800). Why they exist and the rules:
[docs/governance.md](../../../docs/governance.md).

```sh
pnpm test                                    # builds the fixture site into dist/ (and runs vitest)
pnpm --filter site exec playwright install chromium   # once
pnpm --filter site e2e                       # every check
pnpm --filter site e2e --grep @invariants    # page checks only
E2E_SEED=3 pnpm --filter site e2e --grep @invariants   # other pages of each kind
```

- `invariants.spec.ts`: what every page must do, on one or two pages of each kind (`pages.ts` groups the build's pages
  by language, section and depth).
- `search.spec.ts`, `glossary.spec.ts`, `tools.spec.ts`: journeys, one file per feature. Add one for each new feature.
- `review.spec.ts`: the AI page review (`E2E_REVIEW=1`; needs the `claude` CLI signed in). `E2E_REVIEW_PAGES=/vi/ca/?q=neon,/vi/` reviews other pages once.
- `fixtures.ts`: blocks every request that isn't the site itself (ads, analytics, photo hosts), and collects script
  errors in `errors`.
- `E2E_DIST`: another build folder to serve.
- `E2E_BASE_URL`: check a live site instead (no local server). Its pages come from `E2E_PAGES` (the sitemap as JSON) plus
  `E2E_RECHECK`. `scripts/site-watch.mjs prepare` writes both: `node scripts/site-watch.mjs prepare https://aquatome.com apps/site`.
- `E2E_JSON`: results as JSON too (what `site-watch.mjs report` reads).

A failure leaves a screenshot and a trace in `test-results/` (in CI: the `e2e-report` artifact).
`npx playwright show-trace <trace.zip>` replays it.
