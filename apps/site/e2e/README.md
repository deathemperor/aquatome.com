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
- `fixtures.ts`: blocks every request that isn't the site itself (ads, analytics, photo hosts), and collects script
  errors in `errors`.
- `E2E_DIST`: another build folder to serve. `E2E_BASE_URL`: run against a live site instead (no local server); the page list and the link check still read the local build.

A failure leaves a screenshot and a trace in `test-results/` (in CI: the `e2e-report` artifact).
`npx playwright show-trace <trace.zip>` replays it.
