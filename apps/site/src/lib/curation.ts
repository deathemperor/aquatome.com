import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { addDays, CurationSchema, type Curation, type CurationCopy, type Loop } from '@aq/schema'
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
}
export type AppCuration = {
  days?: AppDay[]
  week?: { from: string; to: string; theme?: string }
  hero?: { path: string; img?: string; eyebrow?: string; title?: string }[]
  shelves?: { id: string; title: string; paths: string[] }[]
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
 * language has no words for is left out, and the app uses the page's own.
 */
export function curationFor(cur: Curation, lang: Lang, today: string, pathOf: (ref: string) => string | undefined): AppCuration {
  const word = (c?: CurationCopy) => c?.[lang]
  const page = (ref?: string) => (ref ? pathOf(ref) : undefined)
  const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
  const days: AppDay[] = []
  for (const d of cur.days) {
    if (d.date < addDays(today, -1)) continue
    const own = d.by?.[lang]
    const fish = page(own?.fish ?? d.fish)
    // A language's own fish brings its own photo, or none: the day's photo is of the day's fish.
    const img = fish && (own?.fish ? own.img : (own?.img ?? d.img))
    const guide = page(own?.guide ?? d.guide)
    // Likewise the guide's photo is of the day's guide, or of the language's own.
    const guideImg = guide && (own?.guide ? own.guideImg : d.guideImg)
    const sp = page(d.story?.page)
    const story = sp && d.story ? clean({ path: sp, img: d.story.img, eyebrow: word(d.story.eyebrow), title: word(d.story.title), dek: word(d.story.dek) }) : undefined
    if (fish || guide || story) days.push(clean({ date: d.date, fish, img, guide, guideImg, story }))
  }
  const w = cur.weeks.find(w => w.from <= today && today <= w.to)
  const out: AppCuration = days.length ? { days } : {}
  if (!w) return out
  out.week = clean({ from: w.from, to: w.to, theme: word(w.theme) })
  const hero = w.hero.flatMap(h => {
    const path = page(h.page)
    return path ? [clean({ path, img: h.img, eyebrow: word(h.eyebrow), title: word(h.title) })] : []
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

/** A species' or breed's loop, by its content id. */
export const loopOf = (cur: Curation | null, id: string | undefined): Loop | undefined => (cur && id ? cur.loops[id] : undefined)
