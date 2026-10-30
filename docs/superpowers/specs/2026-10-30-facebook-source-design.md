# Facebook source: Jim Cumming's posts and albums

Date: 2026-10-30

## Intent

AquaTome wants the posts and photos from one Facebook profile:
**Jim Cumming**, https://www.facebook.com/jim.cumming.982410/ (reached from the share link
`facebook.com/share/19dP3PVeaX`; a creator-mode personal profile, about 5.2k followers). It has two uses:

1. **Posts for rewriting later.** Each post's text and images are kept as a raw snapshot that a later step can
   rewrite into site content. That rewriting step is **not** part of this build.
2. **Photos for species galleries.** When a photo shows a species that already has a page on the site, it goes into
   that species' gallery next to the Commons and iNaturalist photos.

The owner has all the permissions needed (text, photos, commercial use). Record this in `content/sources.json`
the same way as the other sources. Don't raise permission again.

## Goals

- Collect every post on the profile timeline: text, date, permalink, and every image at the largest size Facebook serves.
- Collect every photo album on the profile: album name, and each photo with its own caption and permalink, full size.
- Incremental: a later run fetches only new posts, new albums and new photos.
- Identify the species in the photos and add **high-confidence** matches to the gallery of species that have a page
  on the site (`content/species/<id>`, 300 today).

## Non-goals

- Rewriting or translating posts into site content. A later project.
- Comments, reactions, videos, reels, stories, other profiles, pages or groups.
- Creating new species pages for fish the site doesn't cover.
- A review queue. The owner chose: **only high-confidence matches go in, and there's nothing to review.**

## Anti-goals (failure even if it "works")

- **A wrong species in a gallery.** When it's unsure, leave the photo out. Losing a good photo is fine; a mislabelled one isn't.
- Photos with people in them on the site (the existing face filter applies).
- Evading Facebook's defences: no stealth plugins, proxies, captcha solvers or fake fingerprints. This matches the
  engine's rule ("No stealth or solvers"). Use a real, logged-in Chrome profile at a person's pace.
- Re-downloading everything on each run, or hammering Facebook. Follow the engine's polite pace (≥ 5 s between page loads).

## Constraints and what exists

- Engine: `packages/engine` (TypeScript, Playwright `ChromeFetcher` in `src/fetch.ts`, which drives headed real Chrome
  with the persistent profile `~/.cache/thuysinh/chrome-profile`). Facebook needs a login to see most of a profile: the owner
  logs in by hand once in that profile with a **spare Facebook account** that the owner creates (not their personal account,
  so a checkpoint or restriction costs nothing important). A logged-out, checkpoint or login wall is treated like a challenge
  (`ChallengeError` / mark `needs-human`): stop cleanly and say what the person needs to do.
- Raw snapshots live in `sources/<source>/` (see `src/snapshot.ts`; markdown with front matter).
- Sources: add an id (suggested `facebook-jim`) to `SOURCE_IDS` in `@aq/schema` and an entry in `content/sources.json`
  with `publish: true` and a permission record (scope: text, photos, automated copying, commercial use).
- Galleries: `content/gallery/<id>.json` (`GallerySchema`), built by `src/gallery.ts`. Photos with `source` set publish on that
  source's flag, not on a licence (`packages/schema/src/load.ts`). Facebook photos set `source: 'facebook-jim'`,
  `author: 'Jim Cumming'`, `sourceUrl`: the photo or post permalink, and a short Vietnamese caption like gallery photos.
- **Every collected image (owner's decision):** the full-size original goes to the public media bucket `thuysinh-media`
  under its own prefix (e.g. `facebook/<photo id>.jpg`, unconverted, no face filter). It isn't linked from the site, but
  anyone with the URL can reach it. The raw snapshot markdown links to these R2 URLs; image bytes are never committed to git.
- Gallery images are stored in R2 through `r2Media` (`src/media.ts`; ≤ 1200 px WebP + 480 px thumb), never hotlinked from Facebook
  (Facebook CDN URLs expire).
- **Galleries are rebuilt** by `pnpm engine gallery` (when older than 180 days or with `--only`), and that rebuild currently
  overwrites the file. Facebook photos must survive a rebuild.
- Faces: drop any photo with a human face (`src/faces.ts`, macOS Vision), as for every gallery photo.
- Model calls go through `src/claude.ts` (`claude -p` on the owner's subscription; `claudeVision` reads an image file).
  A usage-limit failure (`LlmError`) stops the run cleanly and the next run carries on.

## How species are identified (decided with the owner)

Captions often don't name the fish, so Claude identifies it from the photo:

- **Closed set:** Claude picks from the site's species list (scientific + Vietnamese names, ~300) or answers "none" or "unsure".
  It never names a species outside the list.
- **Text clues first:** the album name, photo caption and post text go into the prompt. A name there that matches the
  list is strong evidence, but the photo still has to agree.
- **Only high confidence is used.** Medium or low, "none", "unsure", or several fish species as main subjects: the photo stays in the raw snapshot only.
- After matching, the photo goes through the same quality bar as gallery photos (living fish as the main subject, sharp,
  no hands, people, text overlays or collages).
- Each photo is judged once and the decision is stored, so it isn't paid for again on the next run. The owner can still remove
  any gallery photo through `engine-state/_photo-rejected.json`.

## Running it

- A new engine command (suggested `pnpm engine facebook`) with `--limit` / `--max-minutes` like the others. It does both
  parts: collect, then identify and add to galleries.
- Once the first manual run works, add it to `scripts/engine-cycle.sh` (after `engine run`, before `faces` and `thumbs`),
  tolerant of failure (`|| log ...`) like the other steps. A logged-out profile must not fail the whole cycle.
- `pnpm engine status` (or the command's own output) reports posts, albums and photos collected, and photos matched,
  skipped and left out.

## Left to the builder

- How to read Facebook's pages (DOM scrolling, the mobile/basic site, or the GraphQL responses the page itself loads), how
  to get full-size image URLs, and how to detect "logged out / checkpoint". Pick what's most robust and say why.
- The raw snapshot layout under `sources/facebook-jim/` (one file per post and per album is the suggestion).
- State/dedupe keys (Facebook post and photo ids), and how to pace scrolling.
- How identification is batched (contact sheet to drop non-fish first, then one photo per call, or something else) and the
  exact prompt and schema, as long as the closed set and the high-confidence-only rule hold.
- How Facebook photos are kept through gallery rebuilds (e.g. the rebuild keeps photos whose `source` is set) and their order
  in a gallery.
- Tests in the engine's existing style (`vitest`, injected deps; no live Facebook in tests).

## My calls (not discussed with the owner)

- Source id `facebook-jim`, credit "Jim Cumming", linking to the photo's Facebook permalink.
- Videos/reels are skipped, and so are images inside shared posts from other people (reshares are not Jim's photos).
- Added to the 6-hourly cycle after a successful manual first run (fine because it's a spare account). After a checkpoint it
  skips Facebook until the person clears it, and doesn't retry every cycle.
- The first backfill is resumable across runs: a backfill cursor, kept separate from "new since last run", with a cap on page
  loads and on model calls per run. This keeps it from eating the quota that `rewrite-vi`, `traits` and `gallery` share.
  A cheap contact-sheet "no fish here" pass runs before the per-photo identification.
- Adding Facebook photos to a species with no gallery file must not stop its Commons and iNaturalist gallery from being built.
  The 180-day skip in `galleries()` only counts a Commons/iNaturalist build, not a file that holds Facebook photos alone.
- `licence` on Facebook photos is the existing `SOURCE_PHOTO_LICENCE`, as other copied source photos use.
