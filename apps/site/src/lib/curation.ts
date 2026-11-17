import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { addDays, CurationSchema, type Card, type Curation, type CurationCopy, type Loop } from '@aq/schema'
import type { Box } from '@aq/schema/app-page'
import type { Lang } from './i18n'

/**
 * The editorial calendar (content/curation.json, planned by the engine's `curate`) as one language's app index carries
 * it. The app shows the day matching the reader's date, and its own rotation where a day or a slot is missing.
 */
export type AppDay = {
  date: string
  fish?: string
  img?: string
  /** Where the fish is in `img`, once the site's switch for it is on: protocols/photo-crop-vectors.json. */
  imgBox?: Box
  guide?: string
  guideImg?: string
  /** Where the fish is in `guideImg`, where that photo has a box, as `imgBox` for `img`. */
  guideImgBox?: Box
  /** `imgBox`: where the fish is in the story's `img`, where that photo has a box. */
  story?: { path: string; img?: string; imgBox?: Box; eyebrow?: string; title?: string; dek?: string }
  card?: AppCard
}
/** One of the app's short cards (content/cards), in this index's language: the eyebrow, title and photo on Hôm nay, and
 * a tap opens the body with its sources. `about` is the pages it links to that this index lists. */
export type AppCard = Pick<Card, 'id' | 'type' | 'event'> & Pick<Card['t'], 'eyebrow' | 'title' | 'body'> & {
  sources: { title: string; publisher: string; date: string; url: string }[]
  about: string[]
  photo?: { url: string; width: number; height: number; licence: string; author: string; authorUrl?: string; sourceUrl: string }
}
export type AppCuration = {
  days?: AppDay[]
  week?: { from: string; to: string; theme?: string }
  hero?: { path: string; img?: string; imgBox?: Box; eyebrow?: string; title?: string }[]
  shelves?: { id: string; title: string; paths: string[] }[]
  /** Tìm's suggested searches in this language, in order; none, and the app shows no section. */
  searches?: string[]
}

let cached: Curation | null | undefined
/** The calendar beside the content the build reads, or none. A file that doesn't parse stops the build. */
export function readCuration(): Curation | null {
  if (cached !== undefined) return cached
  const root = process.env.CONTENT_ROOT ?? resolve(process.cwd(), '../../content')
  let raw: string
  try {
    raw = readFileSync(join(root, 'curation.json'), 'utf8')
  } catch {
    return (cached = null)
  }
  return (cached = CurationSchema.parse(JSON.parse(raw)))
}

/** A shelf needs this many of its fish in a language, else that language goes without it. */
const SHELF_MIN = 3

/** An avoid reason about a card's crop alone, not the photo (the chief of staff, 16 Nov 12:14): a chip checks its own crop. */
export const cropOnly = (why: string) => /head outside the card's crop|cut by the card's \w+ edge/.test(why)

/**
 * A picture that stands for more than one fish (the day's fish, the week's top cards) never shows a photo on `avoid`,
 * though the planner named it before it went there: it takes the page's `cardPhoto` instead, else nothing, and the pick
 * goes (with no picture the app would show the page's own head, the photo on `avoid`). `avoided` is asked by the address
 * a card loads; `instead` gives a page's `cardPhoto` by its ref, as the address a card loads.
 */
export type Faces = { avoided: (address: string) => boolean; instead: (ref: string) => string | undefined }

/**
 * What one language's index gets from the calendar on `today` (Vietnam's date): the days from yesterday on (a reader
 * west of Vietnam can still be on it), and the week that holds today. `pathOf` gives a page's address in this index
 * ("species/<id>" → "/id/ikan/<slug>/"), or nothing when the index doesn't list it: that pick is dropped. Copy this
 * language has no words for is left out, and the app uses the page's own. `cards` are this language's short cards, those
 * the gate holds back already left out: a day's card shows only where it's written, and only within its `show` days.
 * `waits`: whether the build holds a picture back until the watermark screen has judged it (the content's
 * `photoWaits`, which asks the screen's record whatever this language's build loaded). The calendar names a picture by
 * its address, so one that waits is left off here, and the app shows the page's own. `boxAt`: where the fish is in a
 * picture, by its address (a day's fish, guide and story pictures and a pick's, beside each as its box), where the content
 * has a box for it. `guideLead`: the picture a guide's page opens on, by its ref, which a day's guide card shows where the
 * calendar names none (the planner names only a head at least 1,140 px across, and never a section's picture, a video's
 * poster or a fish the guide names, which its page can open on): a card and the page it opens show one picture (the
 * owner, 10 and 13 Nov). `faces`: the day's fish's and the top cards' pictures checked against `avoid` again (Faces).
 */
export function curationFor(cur: Curation, lang: Lang, today: string, pathOf: (ref: string) => string | undefined, cards: Card[] = [], waits: (address: string) => boolean = () => false, boxAt: (address: string) => Box | undefined = () => undefined, guideLead: (ref: string) => string | undefined = () => undefined, faces: Faces = { avoided: () => false, instead: () => undefined }): AppCuration {
  const word = (c?: CurationCopy) => c?.[lang]
  const shown = (img?: string) => (img && !waits(img) ? img : undefined)
  // The picture a pick of `ref` shows: the one named, else (on `avoid`) the page's cardPhoto; null drops the pick.
  const face = (ref: string, img?: string): string | undefined | null => (!img || !faces.avoided(img) ? shown(img) : (shown(faces.instead(ref)) ?? null))
  // A page the planner found failing reader fit (`off`) is left out, as one this language has no page for.
  const page = (ref?: string) => (ref && !cur.off[ref] ? pathOf(ref) : undefined)
  const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
  const days: AppDay[] = []
  for (const d of cur.days) {
    if (d.date < addDays(today, -1)) continue
    const own = d.by?.[lang]
    const fishRef = own?.fish ?? d.fish
    // A language's own fish brings its own photo, or none: the day's photo is of the day's fish.
    const pic = fishRef && page(fishRef) ? face(fishRef, own?.fish ? own.img : (own?.img ?? d.img)) : undefined
    // Its photo since put on `avoid`, and the page has no cardPhoto: the day goes without a fish.
    const fish = pic === null ? undefined : page(fishRef)
    const img = pic ?? undefined
    const guide = page(own?.guide ?? d.guide)
    // Likewise the guide's photo is of the day's guide, or of the language's own; with none named, the one its page opens on.
    const guideImg = shown(guide && ((own?.guide ? own.guideImg : d.guideImg) ?? guideLead((own?.guide ?? d.guide)!)))
    const sp = page(d.story?.page)
    const storyImg = sp && d.story ? shown(d.story.img) : undefined
    const story = sp && d.story ? clean({ path: sp, img: storyImg, imgBox: storyImg ? boxAt(storyImg) : undefined, eyebrow: word(d.story.eyebrow), title: word(d.story.title), dek: word(d.story.dek) }) : undefined
    const c = d.card && cards.find(x => `cards/${x.id}` === d.card && x.show.from <= d.date && d.date <= x.show.until)
    const card: AppCard | undefined = c ? clean({
      id: c.id, type: c.type, eyebrow: c.t.eyebrow, title: c.t.title, body: c.t.body,
      sources: c.sources.map(x => ({ title: x.title, publisher: x.publisher, date: x.date, url: x.url })),
      about: c.about.map(page).filter((p): p is string => !!p),
      photo: c.photo && clean({ url: c.photo.url, width: c.photo.width, height: c.photo.height, licence: c.photo.licence, author: c.photo.author, authorUrl: c.photo.authorUrl, sourceUrl: c.photo.sourceUrl }),
      event: c.event,
    }) : undefined
    if (fish || guide || story || card) days.push(clean({ date: d.date, fish, img, imgBox: img ? boxAt(img) : undefined, guide, guideImg, guideImgBox: guideImg ? boxAt(guideImg) : undefined, story, card }))
  }
  const w = cur.weeks.find(w => w.from <= today && today <= w.to)
  const out: AppCuration = days.length ? { days } : {}
  const searches = cur.searches[lang]
  if (searches) out.searches = searches
  if (!w) return out
  out.week = clean({ from: w.from, to: w.to, theme: word(w.theme) })
  const hero = w.hero.flatMap(h => {
    const path = page(h.page)
    // A top card whose photo is on `avoid` and whose page has no cardPhoto goes; the others close up.
    const img = face(h.page, h.img)
    return path && img !== null ? [clean({ path, img, imgBox: img ? boxAt(img) : undefined, eyebrow: word(h.eyebrow), title: word(h.title) })] : []
  })
  if (hero.length) out.hero = hero
  const shelves = w.shelves.flatMap(s => {
    const title = word(s.title)
    const paths = s.pages.map(page).filter((p): p is string => !!p)
    return title && paths.length >= SHELF_MIN ? [{ id: s.id, title, paths }] : []
  })
  if (shelves.length) out.shelves = shelves
  return out
}

/** A species' or breed's loop, by its content id, as the app gets it: `replace` is the media lead's note, and `cut`,
 * `checkedAt` and `snapshot` the licence record, not the app's. */
export const loopOf = (cur: Curation | null, id: string | undefined): Omit<Loop, 'replace' | 'cut' | 'checkedAt' | 'snapshot'> | undefined => {
  const loop = cur && id ? cur.loops[id] : undefined
  if (!loop) return undefined
  const { replace: _, cut: _c, checkedAt: _d, snapshot: _s, ...rest } = loop
  return rest
}
