import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { addDays, CurationSchema, type Card, type Curation, type CurationCopy, type Loop } from '@aq/schema'
import type { Lang } from './i18n'

/**
 * The editorial calendar (content/curation.json, planned by the engine's `curate`) as one language's app index carries
 * it. The app shows the day matching the reader's date, and its own rotation where a day or a slot is missing.
 */
export type AppDay = {
  date: string
  fish?: string
  img?: string
  guide?: string
  guideImg?: string
  story?: { path: string; img?: string; eyebrow?: string; title?: string; dek?: string }
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
  hero?: { path: string; img?: string; eyebrow?: string; title?: string }[]
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

/**
 * What one language's index gets from the calendar on `today` (Vietnam's date): the days from yesterday on (a reader
 * west of Vietnam can still be on it), and the week that holds today. `pathOf` gives a page's address in this index
 * ("species/<id>" → "/id/ikan/<slug>/"), or nothing when the index doesn't list it: that pick is dropped. Copy this
 * language has no words for is left out, and the app uses the page's own. `cards` are this language's short cards, those
 * the gate holds back already left out: a day's card shows only where it's written, and only within its `show` days.
 * `waits`: whether the build holds a picture back until the watermark screen has judged it (the content's
 * `photoWaits`, which asks the screen's record whatever this language's build loaded). The calendar names a picture by
 * its address, so one that waits is left off here, and the app shows the page's own.
 */
export function curationFor(cur: Curation, lang: Lang, today: string, pathOf: (ref: string) => string | undefined, cards: Card[] = [], waits: (address: string) => boolean = () => false): AppCuration {
  const word = (c?: CurationCopy) => c?.[lang]
  const shown = (img?: string) => (img && !waits(img) ? img : undefined)
  // A page the planner found failing reader fit (`off`) is left out, as one this language has no page for.
  const page = (ref?: string) => (ref && !cur.off[ref] ? pathOf(ref) : undefined)
  const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
  const days: AppDay[] = []
  for (const d of cur.days) {
    if (d.date < addDays(today, -1)) continue
    const own = d.by?.[lang]
    const fish = page(own?.fish ?? d.fish)
    // A language's own fish brings its own photo, or none: the day's photo is of the day's fish.
    const img = shown(fish && (own?.fish ? own.img : (own?.img ?? d.img)))
    const guide = page(own?.guide ?? d.guide)
    // Likewise the guide's photo is of the day's guide, or of the language's own.
    const guideImg = shown(guide && (own?.guide ? own.guideImg : d.guideImg))
    const sp = page(d.story?.page)
    const story = sp && d.story ? clean({ path: sp, img: shown(d.story.img), eyebrow: word(d.story.eyebrow), title: word(d.story.title), dek: word(d.story.dek) }) : undefined
    const c = d.card && cards.find(x => `cards/${x.id}` === d.card && x.show.from <= d.date && d.date <= x.show.until)
    const card: AppCard | undefined = c ? clean({
      id: c.id, type: c.type, eyebrow: c.t.eyebrow, title: c.t.title, body: c.t.body,
      sources: c.sources.map(x => ({ title: x.title, publisher: x.publisher, date: x.date, url: x.url })),
      about: c.about.map(page).filter((p): p is string => !!p),
      photo: c.photo && clean({ url: c.photo.url, width: c.photo.width, height: c.photo.height, licence: c.photo.licence, author: c.photo.author, authorUrl: c.photo.authorUrl, sourceUrl: c.photo.sourceUrl }),
      event: c.event,
    }) : undefined
    if (fish || guide || story || card) days.push(clean({ date: d.date, fish, img, guide, guideImg, story, card }))
  }
  const w = cur.weeks.find(w => w.from <= today && today <= w.to)
  const out: AppCuration = days.length ? { days } : {}
  const searches = cur.searches[lang]
  if (searches) out.searches = searches
  if (!w) return out
  out.week = clean({ from: w.from, to: w.to, theme: word(w.theme) })
  const hero = w.hero.flatMap(h => {
    const path = page(h.page)
    return path ? [clean({ path, img: shown(h.img), eyebrow: word(h.eyebrow), title: word(h.title) })] : []
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
