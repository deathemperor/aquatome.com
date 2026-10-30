# Facebook Source (Jim Cumming) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `pnpm engine facebook` command that collects Jim Cumming's posts and album photos (raw snapshots + full-size originals in R2) and adds high-confidence species photos to species galleries.

**Architecture:** Three engine modules under `packages/engine/src/facebook/`:
- `parse.ts`: pure HTML parsers, tested on saved fixtures.
- `collect.ts`: drives a logged-in Chrome through a small `FbBrowser` interface; incremental state lives in `engine-state/facebook-jim.json`.
- `identify.ts`: faces → contact-sheet "is there a fish" → one vision call per photo against the site's closed species list → only high-confidence matches go into `content/gallery/<id>.json`.

Gallery rebuilds keep photos that carry a `source`.

**Tech Stack:** TypeScript (Node 24), playwright-core (real Chrome, persistent profile), node-html-parser, sharp, vitest, `claude -p` via `src/claude.ts`, Cloudflare R2 via `src/media.ts`.

**Spec:** `docs/superpowers/specs/2026-10-30-facebook-source-design.md`

## Global Constraints

- Source id `facebook-jim`; display name / photo author `Jim Cumming`; profile `https://www.facebook.com/jim.cumming.982410/`.
- Licence on gallery photos: `SOURCE_PHOTO_LICENCE` (`'dùng với sự cho phép'`), with `source: 'facebook-jim'` and `sourceUrl` set to the photo's Facebook permalink.
- No stealth, proxies, captcha solving or fingerprint tricks. Real Chrome profile `~/.cache/thuysinh/chrome-profile`, logged in by hand with the owner's **spare** Facebook account.
- Pace: ≥ 5 s between page loads or scroll steps (`POLITE = 5000`, as in `src/sources.ts`).
- Every collected original goes to the public bucket `thuysinh-media` under `facebook/<photoId>.<ext>`, unconverted, with no face filter. The repo never stores image bytes.
- Gallery copies go through `media.put` (≤ 1200 px WebP + 480 px thumb) under `facebook-jim/<photoId>.webp`.
- Only `confidence: 'high'` species matches enter a gallery. No review queue.
- Faces: a photo with any human face never enters a gallery (`visionFaces`).
- A model usage failure (`LlmError`) stops identification cleanly; the next run continues.
- Login wall or checkpoint: the source is marked blocked (`setSourceBlock`) and skipped by later runs **until `--retry-blocked`**, with no 24 h expiry.
- Skipped: videos, reels, comments, reactions, and photos inside posts reshared from other people.
- No new dependencies.

## Review Focus

1. **Logged out or checkpoint mid-run**: whatever was collected so far is saved, the source is marked blocked, the command exits 0 with a clear message, and the cycle continues with its other steps. Test: Task 4.
2. **A post with more photos than the timeline shows** (the "+N" tile): every photo id in the post is collected by opening the post permalink. Test: Task 4.
3. **The same photo in a post and in an album**: one R2 upload and one identification. Its text clues combine the album title and the post text. Tests: Tasks 4 and 5.
4. **A Facebook image URL that has expired or returns 403 when downloaded**: that photo is marked `error` and retried on later runs (max 3 attempts), and the run continues. Test: Task 4.
5. **The timeline loops back to known posts** (a pinned post, or Facebook re-ordering): collection stops after 3 consecutive scrolls with no new post id, not at the first known post. Before the first full backfill it keeps scrolling past known posts. Test: Task 4.

---

### Task 1: Register the source

**Files:**
- Modify: `packages/schema/src/schemas.ts:3` (add `'facebook-jim'` to `SOURCE_IDS`)
- Modify: `content/sources.json`
- Create: `packages/engine/src/facebook/config.ts`
- Test: `packages/schema/test/` (the existing sources-load test; add a case if none covers new ids)

**Interfaces:**
- Produces: `export const FB = { id: 'facebook-jim' as const, name: 'Jim Cumming', profile: 'https://www.facebook.com/jim.cumming.982410/', stateFile: 'engine-state/facebook-jim.json', decisionsFile: 'engine-state/facebook-jim-photos.json', snapshotDir: 'sources/facebook-jim', rawPrefix: 'facebook', galleryPrefix: 'facebook-jim', polite: 5000 }` in `config.ts`.

- [ ] **Step 1:** Add the `sources.json` entry: `"facebook-jim": {"name": "Jim Cumming (Facebook)", "homepage": "https://www.facebook.com/jim.cumming.982410/", "publish": true, "permission": {"date": "2026-10-30", "file": "Owner statement 2026-10-30: all permissions granted", "scope": ["text", "photos", "automated copying", "commercial use (ads, affiliate)"]}}`.
- [ ] **Step 2:** Add the id to `SOURCE_IDS`. Write `config.ts`.
- [ ] **Step 3:** Run `pnpm typecheck && pnpm test` from the repo root. Expected: all pass, including the sources schema refinement (publish requires permission).
- [ ] **Step 4:** Commit `feat(engine): facebook-jim source`.

### Task 2: Recon and fixtures (needs the owner)

**Owner steps first** (the implementer asks the owner to do these and waits):
1. Create a spare Facebook account and set its language to **English (US)**.
2. With no engine cycle running (the profile is locked while one runs), open Chrome with `--user-data-dir=$HOME/.cache/thuysinh/chrome-profile`, log into the spare account, open Jim's profile once, and close Chrome.

**Files:**
- Create: `packages/engine/scripts/fb-recon.ts` (throwaway, but kept for re-capturing when Facebook changes)
- Create: `packages/engine/test/fixtures/facebook/{timeline,albums,album,photo,post-many,logged-out}.html`
- Create: `packages/engine/test/fixtures/facebook/NOTES.md`

- [ ] **Step 1:** Write `fb-recon.ts`. It opens `ChromeFetcher` on the engine profile, then for each target loads the page, waits 5 s, scrolls 3 times (5 s apart) where it's a feed or grid, clicks every "See more", and saves `page.content()`.
  - Targets: profile timeline; `…/jim.cumming.982410/photos_albums` (or whatever URL the albums tab lands on); one album; one photo page; one post with "+N" photos; a logged-out load in a fresh temp profile.
- [ ] **Step 2:** Run it: `pnpm --filter @aq/engine exec tsx scripts/fb-recon.ts`. Trim each fixture to the main feed or region, keeping the attributes the parsers will use, so files stay under ~300 KB each.
- [ ] **Step 3:** In `NOTES.md`, record what the parsers key on, preferring hrefs, `role`, `aria-*` and `data-*` over Facebook's generated class names:
  - how a post's id and permalink look;
  - where the timestamp is (if it can't be read, `time` stays optional);
  - how a reshare is marked;
  - how the "+N" overflow shows;
  - the album link pattern (`media/set/?set=a.<id>`);
  - the photo link pattern (`photo/?fbid=<id>`);
  - the full-size `img` on a photo page;
  - what the login and checkpoint pages look like (URL and markup).

  Also write down the exact expected values for Task 3's tests: post ids, text snippets, photo ids, album titles.
- [ ] **Step 4:** Commit `test(engine): facebook page fixtures and recon notes`.

### Task 3: Parsers

**Files:**
- Create: `packages/engine/src/facebook/parse.ts`
- Test: `packages/engine/test/facebook-parse.test.ts`

**Interfaces:**
- Produces:
  - `type FbPost = { id: string; url: string; time?: string; text: string; photoIds: string[]; more: boolean; reshare: boolean }` (`more`: the post has more photos than shown).
  - `type FbAlbum = { id: string; url: string; title: string }`
  - `type FbPhoto = { src: string; caption: string; time?: string }`
  - `parseTimeline(html: string): FbPost[]`
  - `parsePostPhotos(html: string): string[]`
  - `parseAlbums(html: string): FbAlbum[]`
  - `parseAlbumPhotos(html: string): string[]`
  - `parsePhotoPage(html: string): FbPhoto | null` (null means no main image)
  - `wall(url: string, html: string): 'login' | 'checkpoint' | null`
  - `photoUrl(id: string): string` → `https://www.facebook.com/photo/?fbid=${id}`

- [ ] **Step 1: Write failing tests** against the fixtures, using the values from `NOTES.md`:
  - `parseTimeline(timeline)` returns unique ids. The expanded post's `text` contains the snippet that only shows after "See more". The reshared post has `reshare: true`. The "+N" post has `more: true`. No post text contains "See more" or "Xem thêm".
  - `parsePostPhotos(post-many)` returns more ids than that post's `photoIds` on the timeline.
  - `parseAlbums(albums)` returns the recorded titles and ids.
  - `parseAlbumPhotos(album)` returns unique numeric ids.
  - `parsePhotoPage(photo)` returns a `src` on a Facebook CDN host, plus the recorded caption.
  - `wall` returns `'login'` for `logged-out` and `null` for `timeline`. Use `wall('https://www.facebook.com/checkpoint/1501092823525282/', '')` for `'checkpoint'`.
- [ ] **Step 2:** Run `pnpm --filter @aq/engine exec vitest run test/facebook-parse.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement with `node-html-parser`. Choose the full-size `src` as the largest candidate in the photo page's main image `srcset`/`src`.
- [ ] **Step 4:** Run the tests again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): facebook page parsers`.

### Task 4: Collector, state, snapshots, raw upload

**Files:**
- Create: `packages/engine/src/facebook/collect.ts`
- Modify: `packages/engine/src/media.ts` (add `putRaw`)
- Modify: `packages/engine/src/fetch.ts` (add `html()`, `scroll()`, `clickText(re)` to `ChromeFetcher`)
- Test: `packages/engine/test/facebook-collect.test.ts`

**Interfaces:**
- Consumes: Task 3 parsers; `FB` config; `setSourceBlock` / `sourceBlockedSince` (`src/state.ts`).
- Produces:
  - `r2Media(...).putRaw(key: string, bytes: Uint8Array, contentType: string): Promise<string>` (returns the public URL).
  - `type FbBrowser = { goto(url: string): Promise<{ url: string; html: string }>; scroll(): Promise<string>; expand(): Promise<void>; bytes(url: string, referer: string): Promise<Uint8Array> }`
    - `scroll` returns the HTML after scrolling.
    - `expand` clicks "See more" / "Xem thêm".
  - `chromeFb(f: ChromeFetcher): FbBrowser`
  - `type FbState`:
    ```ts
    {
      posts: Record<string, FbPost & { seenAt: string }>
      albums: Record<string, FbAlbum & { photoIds: string[]; listedAt: string }>
      photos: Record<string, { status: 'new' | 'stored' | 'error'; attempts: number; caption?: string; time?: string; raw?: string; error?: string }>
      timelineDone: boolean
    }
    ```
  - `loadFbState(root: string): Promise<FbState>` and `saveFbState(root: string, s: FbState): Promise<void>` (sorted keys, like `saveState`).
  - `class FbBlocked extends Error { kind: 'login' | 'checkpoint' }`
  - `collect(root: string, b: FbBrowser, d: { putRaw: (key: string, bytes: Uint8Array, contentType: string) => Promise<string>; sleep: (ms: number) => Promise<void>; now: () => Date }, o: { maxMinutes: number; maxPhotos: number; maxScrolls: number }): Promise<{ newPosts: number; newAlbums: number; stored: number; failed: string[]; blocked?: 'login' | 'checkpoint' }>`

Behaviour:
1. **Timeline.** Scroll the timeline. Each new post id is recorded. A post with `more` is opened at its permalink for its full photo list. Stop after 3 consecutive scrolls with no new id once `timelineDone` is set, or when the timeline ends (then set `timelineDone`), or at `maxScrolls`.
2. **Albums.** List albums. Each album is scrolled for its photo ids; an album is re-listed when it is older than 7 days.
3. **Photos.** For photos with `new` status, or `error` with `attempts < 3`, up to `maxPhotos`:
   - open the photo page and parse it;
   - download with the photo page as referer, and read the format with `sharp(bytes).metadata()`;
   - `putRaw('facebook/<id>.<jpg|png|webp>', bytes, 'image/<fmt>')`, then set `stored`.

   A reshare's photo ids are never queued.
4. **Pace and saving.** `sleep(FB.polite)` between every goto/scroll. State is saved after each phase and every 20 photos.
5. **Walls.** Each goto checks `wall()`. On a wall it saves state, calls `setSourceBlock(root, 'facebook-jim', now)`, and returns `blocked`.
6. **Snapshots.** Written at the end:
   - `sources/facebook-jim/posts/<postId>.md`: front matter `url`, `time`, `photos` (raw R2 URLs), then the text.
   - `sources/facebook-jim/albums/<albumId>.md`: front matter `url`, `title`, then a `- <raw URL> — <caption>` line per photo.

- [ ] **Step 1: Write failing tests.** Use a fake `FbBrowser` that serves fixture HTML (or tiny synthetic HTML in the fixtures' format) per URL, a fake `putRaw` that records keys, and `sleep` that records waits.
  - First run: posts, albums and photos are all collected. Snapshot files exist with the raw URLs. Every wait is ≥ 5000.
  - "+N" post: the post permalink is opened, and all its photo ids end up in state (Review Focus 2).
  - A photo id in both a post and an album: one `putRaw` call (Review Focus 3).
  - `bytes` throws `HTTP 403` for one photo: that photo is `error` with `attempts: 1`, the others are `stored`. On the second run it's retried, and after 3 failures it's left alone (Review Focus 4).
  - Second run with nothing new: zero `putRaw` calls, and timeline scrolling stops after 3 no-new scrolls even though the first post (pinned) is known (Review Focus 5).
  - A login page served mid-album: `blocked: 'login'`, state from the timeline phase saved, and `sourceBlockedSince` set (Review Focus 1).
  - Reshared post: no photo ids queued.
- [ ] **Step 2:** Run `pnpm --filter @aq/engine exec vitest run test/facebook-collect.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `putRaw` (reuses the retrying `upload`, with a content-type parameter), the `ChromeFetcher` additions, `chromeFb`, and `collect`.
- [ ] **Step 4:** Run the tests again, then `pnpm --filter @aq/engine typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): facebook collector`.

### Task 5: Species identification into galleries

**Files:**
- Create: `packages/engine/src/facebook/identify.ts`
- Create: `packages/engine/src/prompts/fb-fish.md`, `packages/engine/src/prompts/fb-species.md`
- Test: `packages/engine/test/facebook-identify.test.ts`

**Interfaces:**
- Consumes: `FbState` / `loadFbState` (Task 4); `contactSheet` (`src/video-images.ts`); `Media` (`src/source-photos.ts`); `SOURCE_PHOTO_LICENCE`; `GallerySchema`.
- Produces:
  - `type FbVerdict = { species: string | null; confidence: 'high' | 'medium' | 'low'; ok: boolean; caption: string }`
    - `species` is a species id from the list, or null.
    - `ok`: a living fish is the main subject, sharp, with no hands or people, text overlays or collages.
    - `caption`: Vietnamese, ≤ 12 words.
  - `FB_FISH_SCHEMA` (`{ fish: number[] }`, the numbers on the sheet that show a fish as the main subject) and `FB_SPECIES_SCHEMA`.
  - `type FbIdDeps = { get: (url: string) => Promise<Uint8Array>; faces: (files: string[]) => Promise<number[]>; sheet: (file: string, prompt: string) => Promise<{ fish: number[] }>; look: (file: string, prompt: string) => Promise<FbVerdict>; media: Media; now: () => Date }`
  - `identifyPhotos(root: string, d: FbIdDeps, o: { limit: number }): Promise<{ added: string[]; dropped: number; stopped: string }>`
    - `limit` is the number of model calls.
    - `added` entries look like `"<speciesId>: <photoId>"`.

Behaviour:
- **Candidates:** `stored` photos with no entry in `FB.decisionsFile`. Decisions are `photoId → { status: 'face' | 'no-fish' | 'unsure' | 'off-list' | 'added' | 'rejected'; species?: string; at: string }` and are written after each photo or sheet.
- **Order:** faces on 480 px local copies first; then contact sheets of 20; then one `look` per remaining photo.
- **The `look` prompt** contains:
  - the closed list: `id — scientificName — vi name` for every `content/species/*`;
  - text clues: the album title(s) holding the photo, its caption, and the text of any post holding it;
  - the rule: answer null unless sure; `high` only when the fish's features clearly fit that species and no listed relative fits.
- **Added** only when `species` is in the list, `confidence === 'high'` and `ok` are both true, and the gallery URL isn't in `_photo-rejected.json`.
  - Store with `media.put('facebook-jim/<photoId>.webp', bytes)`.
  - Append `{ ...stored, licence: SOURCE_PHOTO_LICENCE, author: FB.name, sourceUrl: photoUrl(id), caption, source: 'facebook-jim' }` to `content/gallery/<species>.json`. If that file doesn't exist, create `{ id, photos: [], seen: 0, updatedAt: today }` with no `builtAt`.
  - Set `updatedAt` to today.
- **Stopping:** an `LlmError` stops with `stopped` set; undecided photos stay undecided.

- [ ] **Step 1: Write failing tests** with fake deps, a temp root holding two species (`betta-splendens`, `paracheirodon-innesi`) and a state with 5 stored photos. Expected results:
  - Photo 1 → high, betta, ok: added with `source`, `author: 'Jim Cumming'`, `licence: SOURCE_PHOTO_LICENCE`, and `sourceUrl` ending `fbid=1`.
  - Photo 2 → medium: not added; decision `unsure`.
  - Photo 3 → species `'pterophyllum-scalare'` (not on the list): not added; decision `off-list`.
  - Photo 4 has a face (`faces` returns 1): never sent to `sheet` or `look`.
  - Photo 5 not in the sheet's `fish`: `look` is never called for it.
  - The prompt passed to `look` for photo 1 contains its album title and the post text, and lists both species ids.
  - A second run makes zero `sheet`/`look` calls.
  - `look` throwing `LlmError` on photo 2: `stopped` is set, photo 1's decision is kept, and photo 2 has no decision.
  - A gallery URL listed in `_photo-rejected.json` is not added.
- [ ] **Step 2:** Run `pnpm --filter @aq/engine exec vitest run test/facebook-identify.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Write the two prompts (English instructions, Vietnamese caption, in the style of `gallery.ts`'s `vetPrompt`), then implement `identifyPhotos`.
- [ ] **Step 4:** Run the tests again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): identify species in facebook photos for galleries`.

### Task 6: Gallery rebuilds keep source photos

**Files:**
- Modify: `packages/schema/src/schemas.ts:89` (`GallerySchema` gets `builtAt: z.string().optional()`)
- Modify: `packages/schema/src/load.ts:21` (comment: open licences or a source's permission)
- Modify: `packages/engine/src/gallery.ts` (`galleries()`)
- Test: `packages/engine/test/gallery.test.ts`

**Interfaces:**
- Produces: in `galleries()`:
  - Freshness uses `prev.builtAt ?? (prev.photos.some(p => !p.source) ? prev.updatedAt : undefined)`.
  - It writes `builtAt: today`.
  - The written photos are `[...screened, ...prev.photos.filter(p => p.source)]`, deduped by `url`.

- [ ] **Step 1: Write failing tests:**
  - A gallery file holding only a `source: 'facebook-jim'` photo, with today's `updatedAt` and no `builtAt`, is built (not skipped). The result keeps the Facebook photo after the screened ones, and has `builtAt`.
  - A rebuild with `--only` keeps source photos.
  - A file with `builtAt` 10 days old is skipped.
- [ ] **Step 2:** Run `pnpm --filter @aq/engine exec vitest run test/gallery.test.ts`. Expected: the new cases FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck` from the root. Expected: PASS. The existing 21 gallery files still parse, and since they have no `builtAt` and do have non-source photos, they are treated as built on their `updatedAt`.
- [ ] **Step 5:** Commit `feat(engine): gallery rebuilds keep photos copied with permission`.

### Task 7: Command, cycle, docs

**Files:**
- Modify: `packages/engine/src/cli.ts` (new `facebook` branch and a usage line)
- Modify: `scripts/engine-cycle.sh`
- Modify: `README.md` (content-engine table and bullets)

**Interfaces:**
- Consumes: `collect`, `chromeFb`, `identifyPhotos`, `media()`, `visionFaces`, `claudeVision`, `sourceBlockedSince` / `setSourceBlock`.
- Produces: `pnpm engine facebook [--limit N] [--max-minutes M] [--retry-blocked]`.
  - `--limit`: model calls for identification, default 60.
  - `--max-minutes`: default 45.
  - `maxPhotos`: default 150 per run.

Behaviour:
- If blocked and no `--retry-blocked`: print `facebook: blocked since <date> (<kind>): log into the spare account in ~/.cache/thuysinh/chrome-profile, then run pnpm engine facebook --retry-blocked`, then go straight to identification.
- `--retry-blocked` clears the block before collecting.
- Exit code stays 0 when blocked.
- Output: `facebook: N new posts, N new albums, N photos stored, N failed` and `facebook photos: N added to galleries, N dropped (stopped: …)`, plus one line per added photo.

- [ ] **Step 1:** Implement the CLI branch. Collect opens `ChromeFetcher` with `profileDir: ~/.cache/thuysinh/chrome-profile` (same as `run`) and closes it in `finally`.
- [ ] **Step 2:** In `engine-cycle.sh`, after the `pnpm engine run …` line, add:
  ```bash
  # Jim Cumming's Facebook (spare account in the engine's Chrome profile): new posts and albums, then species photos for galleries.
  [ -n "${ENGINE_ARGS:-}" ] || pnpm engine facebook --max-minutes "${FACEBOOK_MAX_MINUTES:-45}" || log "facebook: failed"
  ```
- [ ] **Step 3:** In `README.md`, add a table row for `pnpm engine facebook`, and a bullet covering:
  - the spare account and the login-by-hand step;
  - `--retry-blocked`;
  - that originals sit in `media.aquatome.com/facebook/` (public, unlinked).
- [ ] **Step 4:** Run `pnpm typecheck && pnpm test` from the root. Expected: PASS.
- [ ] **Step 5:** Commit `feat(engine): pnpm engine facebook, in the cycle`.

### Task 8: First live run (with the owner)

- [ ] **Step 1:** With no cycle running, run `pnpm engine facebook --max-minutes 15 --limit 20`. Expected: new posts, albums and photos counted, and no `blocked`.
- [ ] **Step 2:** Spot-check:
  - three `sources/facebook-jim/posts/*.md` files have the full text and working raw R2 URLs;
  - an album file lists captions;
  - each photo added to a gallery is the right species (open it next to the species page). Report any wrong one to the owner and add it to `_photo-rejected.json`.
- [ ] **Step 3:** Run `pnpm build`. Expected: the build succeeds and the gallery pages show Facebook photos credited to Jim Cumming.
- [ ] **Step 4:** Commit the content (`content: facebook-jim first run`). The cycle then takes over.
