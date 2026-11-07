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

## Addresses

- The languages are one table, `packages/schema/src/langs.ts`: whether it's served, code, address prefix, `lang`, locale,
  own name, browser tags and countries. The engine, the site and the Worker read it, and each one's words per language
  are keyed by its `Lang`, so the compiler names what a new row still needs.
- A row with `served: false` is the engine's alone (none since Malay went live): it writes the language through
  `WRITTEN_LANGS` and `WrittenLang`, while the site, the Worker, the sitemap, the chooser and the protocols read `LANGS`
  and `Lang` and don't see it. `served: true` puts it live, and then the compiler names the site's maps.
- Vietnamese pages are at the root (`src/pages/ca/[slug].astro` → `/ca/<slug>/`), and Indonesian, Thai and Malay ones
  mount the same files under `/id/`, `/th/` and `/ms/`. A new section gets a folder in `src/pages/` and an entry in
  `VI_SECTIONS` (`apps/site/worker/paths.ts`): a test holds them, and wrangler's `run_worker_first`, to the folders.
- Write a link to a page as `/vi/…`. The build rewrites it to each language's address (`src/lib/i18n.ts`). Old `/vi/…`
  addresses 301 to the root. The app's files keep the `/vi/` form until `APP_VI_ROOT` turns on.

- The owner's dashboard is `/_ab/<key>/` in the code, and `https://dashboard.aquatome.com/<key>/` once Cloudflare Access
  guards it (`ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `apps/site/wrangler.jsonc`; `worker/dashboard-host.ts`). A new page is
  in the rail's list (`WEB_PAGES`, `worker/admin/shell.ts`; `NAV` too if the app lists it): the host maps it, the pages
  under it and its `.json`, and its links there. Each needs its line in `run_worker_first` (`/<key>/*`, a `.json` form's
  own; a test names it), never a negative pattern, which would win over the app page's rules. A dashboard
  address printed anywhere else (mail, reports, JSON, docs) is `dashboardUrl` (`worker/paths.ts`),
  `https://aquatome.com/_ab/<key>/`, which lands on the page either way. Anything a machine calls stays on aquatome.com,
  with its bearer: Access would stop it on the host.

## Strings

- UI text is Vietnamese in the code. Indonesian and Thai live in `apps/site/src/i18n/{id,th}.json`, and the build fails
  on a missing key. `ms.json` fills in from them through the cycle while Malay isn't served, and no build reads it. Add or
  rename keys in place: the engine's `translate-ui.ts` sorts the files, and a hand re-sort turns
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

- The repository is public. Secrets stay in `~/.config/aquatome/` and GitHub secrets, out of commits and logs. Device
  addresses, personal emails and personal names stay out too. One exception, with the owner's OK: the Love Ecology
  light's recorded commands (`apps/ios/AquaTomeKit/Sources/FishLamp/love-ecology.json`).
- A challenge page (Cloudflare, Turnstile) marks a source `needs-human`, and the owner passes it by hand in the engine's
  Chrome profile. Marketplaces (Shopee, Lazada, Tiki, Tokopedia) are reached only through their affiliate APIs.
- Every app merge uploads to TestFlight's internal "Owner" group without asking (`testflight.yml`). Ask the owner first
  before uploads to outside testers, App Store review submissions, and production D1 migrations.

## Pull requests

Open a draft PR. `main` takes squash merges after the `test` check (ci.yml) passes. A PR that touches `apps/ios/**`
or `protocols/**` runs its iOS jobs (ios.yml) only once it's marked ready, so mark it ready when it's done and
checked locally, then merge after those jobs pass (or the scoping skips them), never straight after marking it ready.
Commit subjects read
`type(scope): what changes`, as in `fix(tank volume): the ready-made tank table fits a phone`; the body says why.

The council (`.claude/skills/council/SKILL.md`) has one model from each of three providers review a PR, a design or
screenshots and score it out of 10, round after round. Run it when the owner asks for it.

A PR's body has a `## Changelog` section, which the owner's daily report and change log (`/_ab/thay-doi/`) show: a
line for each product change, `- Site:`, `- App:` or `- Engine:` (the content engine) and one plain sentence for the
owner, not a developer (no file names, codes or PR numbers), or `- none` (CI, tests, refactors, docs). The `test` check
fails without it (`scripts/changelog.mjs`); run its job again once the body is fixed.
