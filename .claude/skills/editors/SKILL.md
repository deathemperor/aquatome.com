---
name: editors
description: Use when the owner says "editors", or asks for writing, wording or translation to be reviewed or scored: any text readers see (pages, the site's or the app's buttons and labels, chat answers, emails) in any language the site writes; or to keep rewriting until the editors reach a score.
---

# The editors

Models read the same text, in one language, with what it was written from, and each scores it out of 10 as a native
reader of that language. Every finding quotes the exact words and gives the words that language's hobbyists would
write instead. Asked to "go until the editors agree", fix at the source, rewrite and read again, round after round,
until every seated member scores each piece at or above the bar: 9 (owner, 2026-11-07: "there are many contents to
improve"). Once a kind of text reaches it, move on: breadth first, through the engine's prompts, rules and phrase lists,
so whole batches rise together rather than one page.

It reads words, not layout: how things look goes to the design council (`.claude/skills/council/SKILL.md`).

Models are confidently wrong about languages too: one calls a common word "translationese", another invents a hobby
term. So every wording finding is checked against how that language's hobbyists actually write (the corpus check,
step 4) before anyone acts on it.

## What it reads

| Text | Packet (`node .claude/skills/editors/packet.mjs …`) | Fixed at the source in |
|---|---|---|
| Pages: species, plants, guides, breeds, glossary | `page <lang>/<kind>/<slug>` | the engine's prompts and `packages/engine/src/phrases.ts`; never `content/` (AGENTS.md "Content") |
| The site's buttons and labels | `strings <lang> site [--match <regex>]` | Vietnamese in `apps/site/src`; the others in `apps/site/src/i18n/<lang>.json` (AGENTS.md "Strings") |
| The app's buttons and labels | `strings <lang> app [--match <regex>]` | `apps/ios/AquaTome/Localizable.xcstrings`, by the app's owners |
| Chat answers, emails, anything else | `file <lang> <path> [--source <path>]` | the chat's prompt (`apps/site/worker/chat/agent.ts`), the sign-in mail (`apps/site/worker/accounts/email.ts`) |

Every packet names its language and holds what the text was written from: a page's English source, video transcript or
researched facts, the Vietnamese a translation came from. `--out <dir>` puts it in a round's folder; `CONTENT_ROOT=<dir>`
reads pages from a scratch rewrite. Send checked findings on text you don't own to whoever owns it.

## The seats

As in the design council: run `orchestrator_capabilities` first; a seat whose provider isn't there sits out, and the
report says so. Never fill a seat with another provider's model.

| Seat | Provider (`providerInstanceId`) | Model | Options |
|---|---|---|---|
| Anthropic | `claudeAgent` | `claude-opus-5-5` | `effort: xhigh` |
| OpenAI | `cursor` (the owner's own Cursor plan) | `gpt-5.6-sol` | `reasoning: xhigh` |
| Google | `cursor` | `gemini-4-argon` | `reasoning_effort: high` (its highest) |
| xAI | `cursor` | `grok-4.7` | `reasoning_effort: xhigh`, `fastMode: false` |
| Muse | (to fill: `muse`, off on 2026-11-07) | | |

Cursor lists most of its models only on a search, and each model names its options its own way: check a seat with
`orchestrator_capabilities` (`search: "<model id>"`) before a round. GPT only through the owner's own plan (Cursor),
never through Codex or a proxy (owner, 2026-11-07). With one seat seated, a score is one model's reading: say so in
the record.

### Weighing the seats

How well a model judges what reads natural differs by language. Per language, `docs/review/editors.md` keeps each
seat's naturalness findings and how many the corpus check (step 4) held. A seat whose findings mostly hold, over two
rounds or more, judges that language well: its naturalness findings count even when it raised them alone, and its
**natural** score holds the bar. A seat whose findings mostly fail the check is still read, but its naturalness
findings count only when another seat raised them or the corpus holds them up, and its **natural** score is listed,
not held to the bar. Faithfulness findings are weighed by the source, whoever raised them.

## A round

1. **Packets**, the same for every member, in one folder per round.
2. **One brief, the same for every member**, with:
   - the language, and the reader: a hobbyist in that language's country (Vietnam, Indonesia, Thailand, Malaysia…),
     a beginner beside a first tank or an experienced keeper, mostly on a phone. "Judge as a native reader of this
     language. Where you're unsure what its hobbyists say, say so";
   - the owner's words: "AI written posts use words human rarely use in some sentences which turn readers off";
   - the packet paths;
   - to read first: PRODUCT.md's Voice and content rules, the language's style guide (Vietnamese:
     `packages/engine/src/prompts/vi-style.md`), and the prompts a packet names as the text's writers. Their rules bind
     a finding: one that asks for a price, the author's name or a fact the source lacks is not a finding;
   - the bar, and "Read only: change nothing, push nothing, build nothing";
   - what to answer, for each packet:
     - four scores out of 10: **natural** (words and turns the language's hobbyists use: no calques of English or of
       the Vietnamese it came from, no words people rarely say), **clear** (a beginner follows it and acts on it),
       **faithful** (nothing added, dropped, strengthened or weakened against the source; numbers and units right),
       **tone** (an experienced hobbyist talking to a newer one, as PRODUCT.md says); its score is the lowest of the four;
     - findings, most important first, each: the score it lowers; the exact words, copied from the packet; the whole
       sentence or label as it should read; one line on why (what it copies, what hobbyists say instead, what the
       source says). A finding with no quote, or a quote with no rewrite, is not a finding;
     - across packets: the habits that recur, with their quotes and what to write instead.
3. **Send it** to each seated member with `delegate_task` (`role: review`, the seat's `target`), all at once, and wait
   for every answer.
4. **Check each finding before acting.**
   - The quote is in the packet. A quote that isn't there is dropped.
   - Wording: `node .claude/skills/editors/phrase-check.mjs --lang <lang> "<flagged words>" "<replacement>"`.
     It counts each per million words (per million characters for Thai and Chinese) on the site and in the
     language's hobbyist corpus (`ref:forum`, `ref:blog`, `ref:wiki`), with examples. Keep the finding when hobbyists
     use the replacement and use the flagged words far less than the site. Drop it when they use the flagged words as
     often as the site. When both are rare, or the language has no corpus yet, keep it only if two members raised it, or one that judges
     that language well.
   - Faithfulness: read the source in the packet.
5. **Fix at the source** (the table above). Words the engine writes again and again go in the language's list in
   `packages/engine/src/phrases.ts`, which the writers' prompts and the `phrasing` content rule read; a way of writing
   goes in the style guide or the kind's prompt. For pages, rewrite the samples on a scratch copy
   (`pnpm --filter @aq/engine exec tsx scripts/rewrite-sample.ts <kind>/<slug>…`) and read the new packets next round.
   Pages on the site change through the engine's rewrite step, in batches the site lead agrees.
6. **Summarise**: each member's score per packet; findings two or more raised; findings only one raised that held up;
   findings dropped and why (what the corpus shows); what changes next. Add each seat's naturalness findings, held and
   dropped, to its line in `docs/review/editors.md`.

A fresh read after fixes is a new round, with a brief that says what changed since the last one.

## A language's corpus

Each language gets its own reference of real hobbyist writing, local and never committed: `~/.cache/aquatome/corpus/<lang>/`,
one text file per page and `manifest.jsonl` (`{file, url, site, type: forum|blog|shop-blog|wiki, year, words}`). The
crawlers are in `~/.cache/aquatome/corpus-tools/`. Build one before a language's first round:
- forum threads first (real people talking), hobbyists' blogs, the language's Wikipedia as a general baseline; tag shop
  and SEO blogs `shop-blog`, they're often machine-written; prefer posts from before 2023;
- a plain fetch only: skip a site that answers with a challenge page or wants a login; keep to robots.txt and one
  request a second a site;
- commit only what's derived: the list in `phrases.ts` and its counts in `docs/review/phrases.md`.

## The record

In the PR's description, under `## Editors`: one row per round, one column per packet, each cell the seated
members' scores (the lowest of their four). Name the seats that sat out and why.
