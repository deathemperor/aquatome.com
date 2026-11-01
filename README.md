# AquaTome

[aquatome.com](https://aquatome.com): an aquarium handbook for Vietnam first, with Indonesian and Thai versions. Species,
plants, guides, a glossary and tools (tank volume, tank-mates, Chihiros lights, saved tanks). A content engine translates
the pages from sources that gave permission. An iOS app is in progress.

## Layout

| Path | What |
|---|---|
| `apps/site` | Astro static site and its Cloudflare Worker (affiliate links, comments, accounts) |
| `apps/ios` | SwiftUI app ([README](apps/ios/README.md)) |
| `packages/schema` | the content model (`@aq/schema`); the site reads content only through `loadAll()` |
| `packages/engine` | the content engine ([README](packages/engine/README.md)) |
| `content/` | engine output: `{species,plants,guides,glossary,places}/{id}/entity.json` (data, English source text) + `vi.json` |
| `protocols/` | device and sync vectors the site and the app both test against |
| `docs/` | [governance](docs/governance.md) (checks and rules), [saved-tank sync](docs/my-tanks-sync.md), research, specs |
| `PRODUCT.md` | who the product is for and how it should feel |

## Develop

Node 24.22.1 (`nvm use` reads `.nvmrc`; not 25.x) and pnpm 10+.

| | |
|---|---|
| `pnpm i` | install |
| `pnpm dev` | local site at http://localhost:4321/vi/ |
| `pnpm test` | every package's tests; builds the site from `apps/site/test/fixture-content/` |
| `pnpm typecheck` | `tsc` and `astro check` |
| `pnpm --filter site e2e` | browser checks on that build ([e2e/README](apps/site/e2e/README.md)) |
| `pnpm build` | static build to `apps/site/dist` with the Pagefind index |

Build environment: `PUBLIC_BUILD=1` builds only cleared sources, `SITE_URL` sets canonical links and the sitemap,
`STAGING=1` makes every page `noindex`, `CONTENT_ROOT` / `OUT_DIR` move content and output, and `I18N_LENIENT=1` lets an
untranslated UI string through (the engine cycle only).

## Ship

A pull request runs `ci.yml`. A squash merge to `main` runs `deploy.yml`, which tests and deploys to aquatome.com, and
`watch.yml` then checks the live site. Problems become issues, and `fix.yml` drafts fixes for them
([governance](docs/governance.md)). The engine (`engine.yml`, every 3 h) pushes content the same way. A manual deploy:
`CLOUDFLARE_API_TOKEN="$(cat ~/.config/thuysinh/cf-token)" ./scripts/deploy.sh`.

## Content rules

- Every source in `content/sources.json` starts with `"publish": false`. It turns `true` only once its written permission
  (translation, automated copying, restating facts, commercial use with ads and affiliate links) is recorded in its
  `permission` field. A permission for photos only is `"publish": "photos"`: public builds show its photos and nothing
  written from its text. Public builds drop the rest.
- Photos: CC0, CC BY, CC BY-SA, public domain, or recorded permission; no people.
- Product links go through `/go/…` ([affiliate](apps/site/worker/affiliate/README.md)).
