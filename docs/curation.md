# Curation: what Hôm nay and Khám phá show

The app's v2 has two editorial tabs. **Hôm nay** shows a fish of the day, a guide and sometimes a story card. **Khám phá**
leads with a week's top cards and its shelves. The Curation & Media Lead (an agent thread) picks what they show, and the
owner can veto a pick but doesn't approve them. v2 Lab decides how the picks look.

## The calendar

The calendar is `content/curation.json` (schema: `packages/schema/src/curation.ts`). The build turns it into each
language's app index (`/app/<lang>.json`, `apps/site/src/lib/curation.ts`):

| In the calendar | In the index | What the app does with it |
| --- | --- | --- |
| `days[]`: `date`, `fish`, `img`, `guide`, `guideImg`, `story`, `by.<lang>` | `home.days[]`, from yesterday on | shows the day matching the reader's date; a day the index doesn't have falls back to the app's own rotation, but a listed day without a fish shows no fish card, since nothing passed both checks that day |
| `weeks[]`: `from`, `to`, `theme` | `home.week` | an eyebrow over the week's cards |
| `weeks[].hero` | `home.hero` | Khám phá's top cards, in order |
| `weeks[].shelves` | `home.shelves` | collections after the fixed shelves |
| `loops.<id>` | `items[].loop` | a fish's short silent loop, wherever its card is |
| `avoid` | none | photos that never lead a card, with the reason |

- **Pages are named by content id** (`species/<id>`, `breeds/<id>`, `guides/<id>`), so one pick serves every language.
  The build drops a pick that a language has no page for. `by.<lang>` gives that language its own fish or guide.
- **Copy is per language** (`{vi, id, th, ms}`). A language without the words gets none, and the app uses the page's
  own title. A shelf without a title in a language isn't shown in that language.
- **Photos on large cards are always given** (`img`, `guideImg`, `hero[].img`). The app shows exactly those, never a
  small index photo scaled up. A guide or story with no photo big enough gets a card drawn without one.

## How picks are made

`pnpm engine curate` (`packages/engine/src/curation.ts`) fills every day of the next 21. A pick must pass two checks:

1. **Reader fit.** The page isn't held back by the gate (`gate.ts`), and has no finding the gate holds a page for.
2. **A checked photo big enough for its card.**
   - "Checked" means judged the right subject and typical, with no person, logo, face or watermark (the engine's photo
     checks), and not on the `avoid` list.
   - "Big enough" means at least 1,140 px across once cropped to the card: Hôm nay's cards are about 400×420 pt, and
     Khám phá's top cards are wider than tall.

Among the pages that pass, it scores:
- the week's own lists first, in their order;
- then the week's tags (`cold`, `heater`, `beginner`, `nano`, `local`), matched to the page's figures;
- then how well known the fish is (the site's staples and popular lists);
- then Search Console impressions across the four languages, and pages updated in the last 14 days.

The same page never comes back within 28 days, nor the same fish group two days running. A day a person chose
(`fixed`) is kept while it passes. A pick that stops passing (held back, its photo removed) is replaced, and the run
says why. `pnpm engine curate --check` lists every problem in the coming days and exits 1 if there is one.

The planner picks; the editor sets each week's theme, its tags and lists, its top cards, its shelves, and the copy. All
copy goes through the editors (`.claude/skills/editors`) before it ships.

### Seasons, by market

| When | Vietnam | Thailand | Indonesia, Malaysia |
| --- | --- | --- | --- |
| Nov–Feb | northern cold monsoon: heaters, cold-tolerant fish, power cuts in storms | cool season | rainy season: power cuts, cloudy water, temperature swings |
| late Jan–Feb | Tết: goldfish, koi, red and gold fish, arowana, setting up a tank for the new year | | Chinese New Year (same fish) |
| Mar–May | heat: oxygen, fans and chillers, feeding less | hottest months | |
| May–Oct | rainy season in the south; many fish spawn at its start | rainy season | |
| any | betta shows, aquascaping contests, fairs (see Events) | | |

## Cadence

- **Daily**: the planner fills and repairs the next 21 days. The engine's photos part runs it every cycle, after its
  photo checks (`scripts/engine-cycle.sh`); the file changes when a new day comes in or a pick fails.
- **Weekly**: the next theme two to three weeks ahead, its lists, top cards, shelves and copy, through the editors, in a
  pull request. The owner's daily report gets a few lines on what's planned.
- **When a page changes**: a pick that stops passing is replaced on the next daily run, so nothing held back is ever
  featured.

## New kinds of Hôm nay card (owner, 2026-11-08)

Each needs dated sources, and is written through the Writing Lead's writer and gate.

| Kind | Sources | Cadence | Rules |
| --- | --- | --- | --- |
| Trivia about a fish or plant | the handbook's own cited facts, then papers and Wikipedia's cited lines | one or two a week, rotated again after 6 months | one fact, with its source; never a fact the page doesn't back |
| Newly described species | Catalog of Fishes' updates, Zootaxa, ZooKeys, Ichthyological Exploration of Freshwaters, hobby news | when one is in the hobby or from our region | the paper and its date; "described", not "discovered", unless the source says so |
| Hobby trends | the trend sources below, scored by real engagement | weekly | the numbers behind it; no trend from one post |
| Events: contests, shows, fairs, hội chợ | organisers' pages, per market | listed from announcement to the event's last day | date, place and source; gone the day after it ends |
| Products: new, upgraded, niche | brands' announcements, marketplaces' new listings through the affiliate APIs | weekly | only what's sold in the reader's country; no invented prices; shops only through `/go/` |

## Trends: where they come from

Facebook groups are where Vietnamese hobbyists talk, but reading them signed in breaks Meta's terms and our rules, so
none of this scrapes them. Each source gives a number, and a trend is scored by that number, never by a guess.

| Source | What it gives | How we read it |
| --- | --- | --- |
| YouTube Data API | new uploads and views by topic and language | the engine's key, within its quota |
| Google Trends | search interest by country and week | its public explore data, a few topics a week |
| Search Console | what readers search before landing on us | the service account (`gsc-service-account.json`) |
| Reddit API | posts and upvotes in the hobby's subreddits | app-only OAuth, read only |
| Marketplaces | bestsellers and new listings | the affiliate APIs only |
| Our readers | pages read, searches with no result, chat questions with no page | the Metrics Lead's lists |
| Hobby news sites | announcements, new species, events | their feeds |
| The owner's shares | Facebook posts and anything else the owner sees | the share path below |

**The owner's share path.** The owner scrolls Facebook anyway, so a post they find goes to the Curation & Media Lead's
thread in two taps: Share → Infinitus → that thread. A screenshot works too, for a private group. The lead reads only
what the owner shares: the link and its visible text, never the group behind it. It never signs in to Facebook.

## Media

### Photos

Sources, in order, all at full size:
1. the page's own checked photos and gallery;
2. Wikimedia Commons, iNaturalist (CC0, BY, BY-SA), GBIF, Openverse (Flickr CC);
3. the permitted sources.

Every photo must really be that species. A doubtful one goes to the photo check, and to Fish ID when it's still unsure.
Pages likely to be featured come first.

### Video loops

Short silent loops, real footage of the species: a fish swimming, or hovering with its fins moving.
- **Format**: HEVC (tagged `hvc1`), 1080×1080, the source's own frame rate up to 30 fps (25 fps footage stretched to 30
  stutters), BT.709 SDR, no audio track, faststart, 5–8 s looping without a jump. 1 MB is the target and 1.5 MB the
  most. There's an H.264 copy for browsers, and a WebP poster of a sharp frame with the fish in it, under 120 KB.
  `scripts/make-loop.sh` makes all three.
- **Sources, in order**:
  1. clips under a licence that allows it: Wikimedia Commons, Pexels, Pixabay, other CC0 or CC BY with credit shown;
  2. permitted sources whose permission covers video (none does yet);
  3. the owner's tanks;
  4. Vietnamese shops, breeders and YouTubers, by permission.

  Never a cut from a YouTube video we may only embed.
- **Each clip** is checked: the right species, no people, hands, logos, watermarks or text, good enough for a large
  card. Its credit shows wherever it plays: the author, the licence linked to its own page (`licenceUrl`), and
  "cut and looped from" the original, linked. A CC BY-SA loop is itself CC BY-SA, with nothing added that restricts it.
- **Uploading**: to `aquatome-media/loops/<id>-<n>.{mp4,-h264.mp4,webp}` with a year's immutable cache, never over a key
  in use. Check that a key is free with a HEAD request, never a GET: media.aquatome.com caches a GET's 404 for four
  hours, so the file can't be fetched there even once it's uploaded.
- **A loop kept for now** (`replace`): one under the council's bar that the chief chose to ship, with what replaces it.
  The koi (8/10, a bubble shows twice in the dissolve) waits for the owner's or a shop's footage, and goes back to the
  photo if the owner dislikes the dissolve.

### Generated video

Not used for a species until an eval says it can be.
- **The eval**: about 20 species from easy to hard, clips from the best reachable generators, each judged blind against
  real footage for species accuracy (fins, pattern, colour, shape, behaviour), physical sense and artefacts. A keeper's
  standard applies: a wrong pattern on a Corydoras fails.
- **Where it passes**: used only for that group, with a small label saying it's AI-made, never in Fish ID, and with a
  real photo beside it.
- **Generated ambience** (plants swaying, light through water) is fine anywhere, since it shows no species.
