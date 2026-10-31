# AGENTS.md

Read [PRODUCT.md](PRODUCT.md) (readers, tone, content rules) and [docs/governance.md](docs/governance.md) (the checks,
and the rules every change follows) before changing the site. Commands and layout: [README.md](README.md).

## Verify

- Run the root `pnpm test`, not one package's: engine tests read the site's fixture content. Then `pnpm typecheck` and
  `pnpm --filter site e2e`.
- Each checkout running browser checks needs its own `E2E_PORT`. A server already on the port is reused, so a shared port
  tests another checkout's build.
- A bug fix comes with a check that fails without it. Lighthouse budgets (`apps/site/e2e/lighthouse.spec.ts`) only
  tighten.

## Checks also run on aquatome.com

`watch.yml` runs every browser check against the live site, with real content (about 800 species), after each deploy and
nightly. A journey holds on both the fixture build and the live site when it reads names, slugs and counts from the page
(`#species-index`, the result line) or uses species both have. Try one against the live site from `apps/site`:

```sh
node ../../scripts/site-watch.mjs prepare https://aquatome.com .
E2E_BASE_URL=https://aquatome.com E2E_PAGES=e2e-pages.json pnpm exec playwright test <spec>
```

## Strings

- UI text is Vietnamese in the code. Indonesian and Thai live in `apps/site/src/i18n/{id,th}.json`, and the build fails
  on a missing key. Add or rename keys in place: the engine's `translate-ui.ts` sorts the files, and a hand re-sort turns
  a few lines into a thousand-line diff.
- After adding a `ct('…')` or `msg('…')` string, run `node apps/site/scripts/i18n-client.mjs`.
- These files and the engine's JSON merge through the drivers in `.gitattributes`. Set them once per clone:

  ```sh
  git config merge.jsonmap.driver 'node scripts/merge-json-map.mjs %O %A %B'
  git config merge.entity.driver 'node scripts/merge-entity.mjs %O %A %B'
  git config merge.changelog.driver 'node scripts/merge-changelog.mjs %O %A %B'
  ```

## Content

`content/`, `engine-state/` and `sources/` are engine output, pushed every 3 hours. Fix the engine (`packages/engine`) so
the next run keeps the fix. A hand edit to one item needs a guard the engine respects (as `nameFixed` does for names).

## Guardrails

- The repository is public. Secrets stay in `~/.config/thuysinh/` and GitHub secrets, out of commits and logs. Device
  addresses, personal emails and personal names stay out too.
- A challenge page (Cloudflare, Turnstile) marks a source `needs-human`, and the owner passes it by hand in the engine's
  Chrome profile. Marketplaces (Shopee, Lazada, Tiki, Tokopedia) are reached only through their affiliate APIs.
- Ask the owner first before App Store Connect or TestFlight uploads, review submissions, and production D1 migrations.

## Pull requests

Open a draft PR. `main` takes squash merges after the `test` check (ci.yml) passes. Commit subjects read
`type(scope): what changes`, as in `fix(tank volume): the ready-made tank table fits a phone`; the body says why.
