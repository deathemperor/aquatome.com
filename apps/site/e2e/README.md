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
- `@page-checks` (in `invariants.spec.ts`): `scripts/page-check.ts` on each sampled page's HTML, once (phone project).
  It reads the content the build came from: the fixture's for a local build, `../../content` for a live site,
  `CONTENT_ROOT` for another build (`E2E_DIST`).
- `search.spec.ts`, `glossary.spec.ts`, `tools.spec.ts`: journeys, one file per feature. Add one for each new feature.
- `app-invite.spec.ts`: the app's invitations as an iPhone, an iPad (a Mac with touch), a Mac, Android, a computer and the
  app's own web view see them, the owner (the `aq_owner` cookie) and a reader. The on state's pages come from
  `dist-app-on`, which `pnpm test` builds; the owner's from `dist` while the switch is the owner's. On a live site it is
  skipped.
- `lighthouse.spec.ts`: Lighthouse's scores and budgets on one page of each main kind (`E2E_LIGHTHOUSE=1`, alone:
  `E2E_LIGHTHOUSE=1 pnpm --filter site e2e --grep @lighthouse --workers=1`). Each run's numbers are in the log.
- `review.spec.ts`: the AI page review (`E2E_REVIEW=1`; needs the `claude` CLI signed in). `E2E_REVIEW_PAGES=/ca/?q=neon,/` reviews other pages once. With `CLAUDE_CODE_OAUTH_TOKENS` (one token a line), an account out of its usage limit or rejected is set aside and the review goes to the next (`claude-accounts.ts`). A review stopped by Claude's usage limit on every account is skipped, with the CLI's text as the reason (`claude-limit.ts`).
- `page-shots.mjs`: before and after (governance rule 6). The same pages of two builds at both sizes; the pairs that
  differ, side by side, and `summary.md` listing them. CI's job `shots` runs it on PRs that change `apps/site/src`. Before
  pushing, build the base in a worktree and compare:

  ```sh
  # at the repository's root: the base, built in a worktree beside this checkout
  git worktree add ../base origin/main && (cd ../base && pnpm install && cd apps/site && CONTENT_ROOT=$PWD/test/fixture-content pnpm build)
  # in apps/site: this checkout's build, then the comparison ([path,path…] after `page-shots` for other pages)
  CONTENT_ROOT=$PWD/test/fixture-content pnpm build
  node e2e/page-shots.mjs ../../../base/apps/site/dist dist page-shots
  ```

- `fixtures.ts`: blocks every request that isn't the site itself (ads, analytics, photo hosts), and collects script
  errors in `errors`.
- `gestures.ts`: a swipe, pinch or double tap, as a finger on the phone project and the mouse on the computer (the
  photo viewer's journeys, `gallery.spec.ts` and `reader-photos.spec.ts`).
- `E2E_DIST`: another build folder to serve.
- `E2E_PORT`: another port for that server (default 4419). A server already on the port is reused, so with two
  checkouts running checks, give each its own port or one tests the other's build.
- `E2E_BASE_URL`: check a live site instead (no local server). Its pages come from `E2E_PAGES` (the sitemap as JSON) plus
  `E2E_RECHECK`. `scripts/site-watch.mjs prepare` writes both: `node scripts/site-watch.mjs prepare https://aquatome.com apps/site`.
  Every browser adds `AquaTomeCheck/1` to its user agent (`playwright.config.ts`), so the Worker doesn't count a live run's
  visits as readers, shop clicks or wanted names (`worker/bots.ts`).
- `E2E_JSON`: results as JSON too (what `site-watch.mjs report` reads).
- `E2E_REPORT`: another folder for the HTML report (in CI; default `e2e-report`), so a second run doesn't replace the first's.

A failure leaves a screenshot and a trace in `test-results/` (in CI: the `e2e-report` artifact, or `lighthouse-report` for Lighthouse).
`npx playwright show-trace <trace.zip>` replays it.
