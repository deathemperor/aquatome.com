# Four more languages: Malay, Filipino, English, Traditional Chinese

The owner, 2026-11-06: "All" — the four the site lead ranked as next languages (Malay, Filipino, English, Traditional
Chinese), after the language chooser (#565) shipped to count visitors whose language the site lacks.

## Where we start

- Three languages: Vietnamese at the root, Indonesian under /id/, Thai under /th/. Pages are written once in Vietnamese
  with UI text in `t()`; other languages mount the same files at their own addresses (`src/lib/i18n.ts`, astro
  `i18nRoutes`) and take UI text from `src/i18n/<lang>.json` (the build fails on a missing key).
- Content: the engine writes Vietnamese, then `localize*` commands translate per language (`packages/engine/src/localize.ts`
  `TARGETS`, `scripts/engine-cycle.sh`): 20 species, 4 plants, 2 guides, 2 breeds, 10 captions per language per cycle,
  8 cycles a day, on the owner's Claude subscription. On 2026-11-06 Indonesian had 422 of 1,458 species, 149 of 175
  plants and 44 of 786 guides; Thai about the same. A page exists in a language only once translated (`served`).
- The language list is written out in ~25 places: `packages/schema` `LANGS`, site `LANGS`/`LOCALE`/`OG_LOCALE`/
  `LANG_NAME`/`SECTIONS`/`SUB`/`langOf`, worker `rootLang`/`chosenLang`/accounts/fish ID/telemetry/admin content
  (`ByLang` is a `[vi, id, th]` tuple), engine `TARGETS`/`metric`/`shops`/`sweep`/`pages`/`reader`/`topic-check`/
  `content-rules`/`cli`, `wrangler.jsonc` `run_worker_first`, the chooser (`worker/lang-ask.ts`).
- Shop links are Vietnam's (shopee.vn, lazada.vn, tiki.vn); Indonesian and Thai pages have none of their own. New
  languages launch the same way; a country's marketplace comes later, through its affiliate API.
- The iOS app has vi/id/th; its leads add languages on their side once the site serves them.

## Decisions (site lead's calls; the owner can overturn any)

| Language | Code, address | `lang`, locale | Section words | Country default |
|---|---|---|---|---|
| Malay | `ms`, /ms/ | `ms`, ms-MY | Malay (ikan, tumbuhan, panduan, alat, …) | MY, BN |
| Filipino | `fil`, /fil/ | `fil`, fil-PH | English, as Thai's | none (see below) |
| English | `en`, /en/ | `en`, en-US | English, as Thai's | the fallback |
| Traditional Chinese | `zh-hant`, /zh-hant/ | `zh-Hant`, zh-TW | English, as Thai's | TW, HK, MO |

- **The root's order** (`worker/index.ts`): the picked language (cookie `aq_lang`), then a browser language of ours other
  than English (vi, id, th, ms, fil/tl, zh-TW/zh-HK/zh-Hant), then the country's (table), then English if the browser
  asks for it, then the chooser for a browser asking for none of ours from a placed country, else Vietnamese.
  English ranks after the country on purpose: phones in Vietnam, Indonesia and Thailand are often set to English (the
  owner's are), and they keep getting their country's language. Simplified Chinese (zh-CN, zh-Hans) is not matched.
- **Filipino has no country default**: hobby reading in the Philippines is largely English, so an English browser there
  gets English; a browser asking for fil/tl gets Filipino. The chooser's numbers can change this.
- **Crawlers** keep the Vietnamese home at `/` (x-default) and reach every language through hreflang and the sitemap.
- **One language at a time, Malay first**, then Filipino, English, Traditional Chinese. Each goes live when its UI text
  is complete and its first content is translated; content keeps filling in after, as Indonesian and Thai do.
- **Engine pace**: a new language starts at 10 species a cycle (popular first) and the same plant/guide/breed/caption
  pace as the others; the owner's subscription carries roughly one more translation load per live language.

## Phases

1. **One language list** (no visible change). A dependency-free language table in `packages/schema` (code, address
   prefix, html `lang`, locale, OG locale, own name, Accept-Language tags, country defaults, whether it is the
   English-after-country kind) that the engine, the site, the worker and the chooser read, replacing the copies above;
   `ByLang` becomes a record. Tests hold every copy that has to stay literal (wrangler's `run_worker_first`, the iOS
   protocol files) to the table.
2. **Malay in the engine**: a `TARGETS.ms` style (Malaysian hobby words; how it differs from Indonesian), `ms` in the
   cycle's localize loop at 10 species, `translate-ui` for `src/i18n/ms.json`. Content and UI text land through the
   normal 3-hourly pushes; nothing is served yet.
3. **Malay on the site**: `ms` in the table's served set; section and sub-page words; LangMenu, hreflang, sitemap, the
   chooser's list and MY/BN default; fonts (none needed); Lighthouse and e2e on /ms/; the privacy page in Malay
   (a translation of the current text, no new terms). Tell the iOS leads.
4. **Filipino**, phases 2–3 again.
5. **English**, phases 2–3 again, plus the root's English rule above and the chooser keeping only non-English visitors.
6. **Traditional Chinese**, phases 2–3 again, plus CJK fonts in the font stacks (system: PingFang TC, Microsoft JhengHei,
   Noto Sans TC) and Pagefind's Chinese indexing checked.

Each phase is its own PR, checked with the root `pnpm test`, `pnpm typecheck` and `pnpm --filter site e2e`.
