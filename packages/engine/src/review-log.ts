import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { modelOf } from './claude'

/**
 * What every quality review found, kept: engine-state/reviews/<kind>.json, so a page out of search can say why, a rewrite
 * can start from what the last review found, and the faults that recur show which prompt to fix (review-report.ts).
 *
 * One file a kind of review (the step that writes and reviews), one key a page: its language and content path
 * ("vi/guides/youtube-…", "id/species/…"), and the part reviewed when a page is reviewed in parts ("#seriouslyfish": a
 * species' text from one source). Each key holds that page's latest reviews, newest first, KEEP of them. The engine's
 * parts and the video job write at once; each kind is one step's, and a source's part is one source's, so two jobs never
 * change one key and the cycles' jsonmap driver (scripts/merge-json-map.mjs) merges the files key by key.
 */
export const REVIEW_KINDS = [
  /** A Vietnamese guide written from a YouTube video, against its transcript (youtube.ts). */
  'video-guide',
  /** A source page's Vietnamese translation, against the English (run.ts); part: the source. */
  'translation',
  /** Older Vietnamese rewritten in the site's style, against the English or the old Vietnamese (vi-backfill.ts); part: the source or field. */
  'vi-rewrite',
  /** A part the reader step rewrote with its findings (reader.ts); part: the field. */
  'reader-rewrite',
  /** A title rewritten to promise only what the text has (sweep.ts). */
  'title',
  /** A breed page, against its research (breeds.ts), in every language. */
  'breed',
  /** An AquaTome guide, against its research (topics.ts), in every language. */
  'topic',
  /** A product page, against its research (products.ts). */
  'product',
  /** A product page's review summary: the code's checks, no score of a model's (product-reviews.ts). */
  'product-reviews',
  /** A species' quick summary: the numbers and claims check, pass or fail (summaries.ts). */
  'summary',
  /** A species or plant page in another language, against the English (localize.ts). */
  'localize',
  /** A glossary term in another language, reviewed in a batch (localize.ts). */
  'glossary',
  /** A place's name in another language, reviewed in a batch (localize.ts). */
  'places',
  /** An equipment buying guide in another language, against the Vietnamese (equipment-intl.ts). */
  'equipment',
  /** A plant's "where it goes and how to plant it", against the page's figures, text and video guides (planting.ts). */
  'planting',
  /** A species page AquaTome writes from research, against it (species-research.ts); part: a video's id, for what that video added to the page (species-videos.ts). */
  'species',
] as const
export type ReviewKind = (typeof REVIEW_KINDS)[number]
/** The kinds that review a page's own text (not its title, summary or review section): what a rewrite of the text starts from. */
export const TEXT_KINDS: readonly ReviewKind[] = ['translation', 'vi-rewrite', 'reader-rewrite', 'video-guide', 'topic', 'breed', 'localize']

/** What a reviewer returns. A check that passes or fails without a score of its own scores 1 or 0. */
/** `reads`: a score taken as the median of these reads. */
export type Review = { score: number; notes: string[]; reads?: number[] }
/** first: the first version; rewrite: the one written again with the notes; recheck: the version already on the page, reviewed again. */
export type Attempt = 'first' | 'rewrite' | 'recheck'
export type Trace = { at: string; model: string; score: number; notes: string[]; attempt: Attempt; /** This version is the one the page has. */ kept: boolean; /** The reads a median score was taken from. */ reads?: number[]; /** A translation recheck: hash of the source text it read. */ textHash?: string }
/** A page: its content path (`species/<id>`, `guides/<id>`), language, and the part reviewed when it is reviewed in parts. */
export type PageRef = { id: string; lang: string; part?: string }
export type PageTrace = Trace & PageRef & { kind: ReviewKind }
export type Store = Record<string, Trace[]>

/** Reviews kept a page (a run makes one or two), so a file stays a few hundred KB. */
export const KEEP = 6
/** Notes a review, and characters a note: a reviewer that quotes a whole paragraph doesn't grow the file. */
const NOTES = 10
const NOTE_CHARS = 400

export const reviewFile = (root: string, kind: ReviewKind) => join(root, 'engine-state', 'reviews', `${kind}.json`)
export const reviewKey = (p: PageRef) => `${p.lang}/${p.id}${p.part ? `#${p.part}` : ''}`
export function pageOf(key: string): PageRef {
  const [path, part] = key.split('#') as [string, string?]
  const slash = path.indexOf('/')
  return { lang: path.slice(0, slash), id: path.slice(slash + 1), ...(part ? { part } : {}) }
}

async function readStore(root: string, kind: ReviewKind): Promise<Store> {
  try {
    return JSON.parse(await readFile(reviewFile(root, kind), 'utf8')) as Store
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw e
  }
}

// One write at a time a file in this process (summaries run several pages at once).
const queues = new Map<string, Promise<unknown>>()

/** A kind's reviews, once this process's writes to its file are done (a read during one would find half a file). */
export async function readReviews(root: string, kind: ReviewKind): Promise<Store> {
  await queues.get(reviewFile(root, kind))?.catch(() => undefined)
  return readStore(root, kind)
}

/**
 * One page's reviews from one run: `tries` in order (the first version's, then the rewrite's), and `kept`, the one whose
 * version the page now has (the same object as in `tries`; none when the page wasn't written). `recheck`: the version on
 * the page reviewed again, nothing written. `model`: the reviewer's (default: the engine's).
 */
export function logReviews(root: string, kind: ReviewKind, page: PageRef, tries: Review[], kept: Review | undefined, o: { model?: string; now?: Date; recheck?: boolean; /** Every one of `tries` is of a version written again with notes: a later step's edit of a text an earlier run reviewed. */ rewrite?: boolean; textHash?: string } = {}): Promise<void> {
  if (!tries.length) return Promise.resolve()
  const at = (o.now ?? new Date()).toISOString().slice(0, 19) + 'Z'
  const model = modelOf(o.model)
  const traces: Trace[] = tries.map((r, i) => ({
    at, model, score: Math.round(r.score * 1000) / 1000,
    notes: r.notes.slice(0, NOTES).map(n => (n.length > NOTE_CHARS ? `${n.slice(0, NOTE_CHARS - 1)}…` : n)),
    attempt: o.recheck ? 'recheck' : i === 0 && !o.rewrite ? 'first' : 'rewrite', kept: r === kept,
    ...(r.reads ? { reads: r.reads.map(s => Math.round(s * 1000) / 1000) } : {}),
    ...(o.textHash ? { textHash: o.textHash } : {}),
  }))
  return change(root, kind, store => {
    const key = reviewKey(page)
    store[key] = [...traces.reverse(), ...(store[key] ?? [])].slice(0, KEEP)
    return true
  })
}

/** One change to a kind's file, after this process's other writes to it; `edit` returns whether it changed anything. */
function change(root: string, kind: ReviewKind, edit: (store: Store) => boolean): Promise<void> {
  const file = reviewFile(root, kind)
  const next = (queues.get(file) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const store = await readStore(root, kind)
    if (!edit(store)) return
    await mkdir(join(root, 'engine-state', 'reviews'), { recursive: true })
    await writeFile(file, `${JSON.stringify(Object.fromEntries(Object.entries(store).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), null, 2)}\n`)
  })
  queues.set(file, next)
  return next
}

/**
 * The gate put these pages' committed texts back (gate.ts), so a review this kind's file has and `committed` (the file
 * as committed) doesn't is of a text no longer on the page. It stops being the page's, and lastKept finds the review of
 * the text put back again.
 */
export function unkeep(root: string, kind: ReviewKind, pages: PageRef[], committed: Store): Promise<void> {
  const same = (a: Trace, b: Trace) => a.at === b.at && a.attempt === b.attempt && a.score === b.score
  return change(root, kind, store => {
    let changed = false
    for (const [key, ts] of Object.entries(store)) {
      const p = pageOf(key)
      if (!pages.some(x => x.lang === p.lang && x.id === p.id)) continue
      for (const t of ts) if (t.kept && !(committed[key] ?? []).some(c => same(c, t))) { t.kept = false; changed = true }
    }
    return changed
  })
}

/** Every trace of these kinds, with its kind and page. */
export async function allTraces(root: string, kinds: readonly ReviewKind[] = REVIEW_KINDS): Promise<PageTrace[]> {
  const out: PageTrace[] = []
  for (const kind of kinds) for (const [key, ts] of Object.entries(await readReviews(root, kind))) for (const t of ts) out.push({ ...t, ...pageOf(key), kind })
  return out
}

/**
 * The newest review, of these kinds, of the version a page has now: what a rewrite of the page starts from. A part asked
 * for matches its own reviews and the whole page's; no part asked for matches every part.
 */
export async function lastKept(root: string, page: PageRef, kinds: readonly ReviewKind[]): Promise<PageTrace | undefined> {
  let best: PageTrace | undefined
  for (const kind of kinds) {
    for (const [key, ts] of Object.entries(await readReviews(root, kind))) {
      const p = pageOf(key)
      if (p.id !== page.id || p.lang !== page.lang || (p.part && page.part && p.part !== page.part)) continue
      const t = ts.find(x => x.kept)
      if (t && (!best || t.at > best.at)) best = { ...t, ...p, kind }
    }
  }
  return best
}

/**
 * A batch's reviews (glossary terms, place names) as one item's: the batch's score, and the notes that name the item, or
 * no item of the batch. `names`: each item's names (id, source and written forms), the item's own at `i`.
 */
export function itemReviews(tries: Review[], kept: Review | undefined, names: string[][], i: number): { tries: Review[]; kept: Review | undefined } {
  const has = (note: string, ns: string[]) => ns.some(n => n.trim().length > 1 && note.toLowerCase().includes(n.trim().toLowerCase()))
  const mine = (note: string) => has(note, names[i]!) || !names.some(ns => has(note, ns))
  const out = new Map(tries.map(r => [r, { score: r.score, notes: r.notes.filter(mine), ...(r.reads ? { reads: r.reads } : {}) }]))
  return { tries: tries.map(r => out.get(r)!), kept: kept && out.get(kept) }
}
