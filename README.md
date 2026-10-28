# thủy·sinh (working name)

Vietnamese-first aquarium knowledge site: species, plants, guides and glossary, translated from licensed sources.
Design: `docs/superpowers/specs/2026-10-28-aquarium-site-design.md` · Plans: `docs/superpowers/plans/`.

## Requirements
- [nvm](https://github.com/nvm-sh/nvm) and **Node 24.22.1** (`nvm install && nvm use` reads `.nvmrc`). Do not use Node 25.x (CVE-2026-111497).
- pnpm 10+

## Commands
| | |
|---|---|
| `pnpm i` | install |
| `pnpm dev` | local site at http://localhost:4321/vi/ |
| `pnpm build` | static build to `apps/site/dist` (+ Pagefind search index) |
| `pnpm typecheck` | `tsc` for the schema, `astro check` for the site (pins TypeScript 6; astro check doesn't support TS 7 yet) |
| `pnpm test` | all tests (schema unit tests; site builds, then tests its output) |

Build-time environment:
- `PUBLIC_BUILD=1`: only sources with `"publish": true` in `content/sources.json` are built.
- `STAGING=1`: every page `noindex`, `robots.txt` disallows all (use for the huuloc.com staging subdomain).
- `SITE_URL`: absolute site URL for canonical links and the sitemap.
- `CONTENT_ROOT`, `OUT_DIR`: override content and output directories.

## Content layout
```
content/sources.json                                    # per-source name, homepage, publish flag, permission record
content/{species|plants|guides|glossary|places}/{id}/entity.json   # language-neutral data + English source sections
content/{species|plants|guides|glossary|places}/{id}/vi.json       # Vietnamese translation, slug, quality score
```
The model and its rules live in `packages/schema` (`@aq/schema`). The site reads content only through `loadAll()`.

## Publish gate
Every source starts with `"publish": false`. Set it to `true` only after its written permission (translation, automated copying,
restating facts, commercial use with ads and affiliate links) is recorded in its `permission` field. Public builds drop content
from sources that aren't cleared. Photos load only with CC0, CC BY, CC BY-SA or public-domain licences.

`content/` holds engine output (Plan 2). Site tests use the sample store in `apps/site/test/fixture-content/` (placeholder Vietnamese text, Wikimedia Commons photos; generator `scripts/gen-sample-content.py`).

## Staging deploy
`CLOUDFLARE_API_TOKEN="$(cat ~/.config/thuysinh/cf-token)" ./scripts/deploy-staging.sh` builds with `STAGING=1` and deploys to
https://thuysinh.infinitus.run (Cloudflare Workers static assets, `apps/site/wrangler.jsonc`). Every response carries
`X-Robots-Tag: noindex, nofollow` and robots.txt disallows everything. Content is the local (ungated) build.
huuloc.com is in a different Cloudflare account (loc.truongh@gmail.com); moving staging there needs a token from that account.

## Content engine

`packages/engine` keeps `content/` in sync with the sources on the always-on home machine.

| Command | Does |
|---|---|
| `pnpm engine run [--sources a,b] [--limit N] [--max-minutes M]` | discover → fetch (real Chrome, ≥5 s per source) → snapshot to `sources/` → Claude classify + translate + review → merge into `content/` → photos → changelog |
| `pnpm engine status` | URL counts per source and status from `engine-state/` |

- Fetching uses headed Chrome (`~/.cache/thuysinh/chrome-profile`). A challenge page marks the source `needs-human`: open that profile, pass the check by hand, and the next run continues. No stealth or solvers.
- Translation: `claude -p --model sonnet` on the owner's subscription with a lean prompt; a second pass scores it. Scores under 0.75 get one re-translation with the reviewer's notes, and are noindexed if still low.
- Photos: the best few photos on each source page are copied to R2 `thuysinh-media` (≤1200 px WebP, `https://media.thuysinh.infinitus.run`) and credited to the source page. They follow the source's publish flag. Wikimedia Commons (open licences) is the fallback.
- Credentials (never committed): `~/.config/thuysinh/cf-token` and `~/.config/thuysinh/cf-account`, or `CLOUDFLARE_API_TOKEN` / `CF_ACCOUNT_ID`. Optional: `YOUTUBE_API_KEY` for videos.
- Schedule: `scripts/install-engine-schedule.sh` installs the launchd agent `run.thuysinh.engine`, which runs every 6 h from a dedicated clone. It calls `scripts/engine-cycle.sh` (pull → run → test → commit + push → deploy staging). Log: `~/Library/Logs/thuysinh-engine.log`.
