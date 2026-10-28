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
| `pnpm test` | schema unit tests |
| `pnpm --filter site test` | site tests (run after `pnpm build`) |

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

Sample content in `content/` is placeholder Vietnamese text with Wikimedia Commons photos (`scripts/gen-sample-content.py`).
