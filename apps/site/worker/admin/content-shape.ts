/**
 * The shape of dist/_ab/content.json: what the site's content is, written by scripts/content-stats.ts after each build and
 * read by the Worker (admin/content.ts) for the dashboard. Types, and the form a day's totals are kept in (KeptTotals), with
 * no imports but the language table: the build script (astro check), the backfill script (node) and the Worker (tsc -p
 * worker) all import it.
 */
import { LANGS, type Lang, type OtherLang } from '@aq/schema/langs'

export type { Lang }

/** A kind of content item (content/<dir>). A video guide is a guide written from a YouTube video (its entity has `video`). */
export type EntityKind = 'fish' | 'breed' | 'plant' | 'guide' | 'videoGuide' | 'series' | 'glossary' | 'equipment' | 'place' | 'product'

/**
 * A kind of built page: an item's own page, or one of the site's other pages. `gallery`: a fish's or plant's photo page
 * (/vi/ca/<slug>/anh/); `taxon`: /vi/phan-loai/…; `group`: /vi/nhom/…; `tool`: /vi/cong-cu/…; `list`: an index of a
 * section, its numbered pages, a video channel, the home page, search and latest; `other`: about, contact, privacy.
 */
export type PageKind = EntityKind | 'gallery' | 'taxon' | 'group' | 'tool' | 'list' | 'other'

/**
 * A built page: its path (as the reader beacon records it, "/vi/ca/ca-neon-vua/") and its h1. A page about one item
 * also has the item's id, which D1's entity_ref uses ("species:<id>", "plant:<id>", "guide:<id>", "breed:<id>").
 */
export type PageRow = [path: string, title: string] | [path: string, title: string, id: string]

/** Counts in each language, by its code. A day kept in KV holds them as rows (KeptTotals). */
export type ByLang = Record<Lang, number>

/** A short list to act on: how many, and up to 50 of them ([vi path, Vietnamese name]), staples and popular fish first. */
export type Gap = { n: number; top: [path: string, name: string][]; /** Per missing part, for a gap that is any of several (noKeyFacts: tempC, ph, sizeCm). */ by?: Record<string, number> }

/**
 * - noPhoto: no photo on the page as a public build shows it (gallery photos aside)
 * - noViName: the Vietnamese name is the scientific name ("Cá Abbottina rivularis")
 * - noSummary: no approved "Tóm tắt nhanh" (content/summaries)
 * - noKeyFacts: the card lacks temperature, pH or size (a figure the engine hid counts as missing)
 * - thin: a fish page out of search for being thin (@aq/schema depth.ts)
 * - oldVi: Vietnamese not yet rewritten in the site's style (engine rewrite-vi, engine-state/vi-rewrite.json)
 * - noId, noTh: no Indonesian or Thai page yet
 */
export type GapKey = 'noPhoto' | 'noViName' | 'noSummary' | 'noKeyFacts' | 'thin' | 'oldVi' | 'noId' | 'noTh'

/** Snapshot of the totals, the part kept per day in KV (stats:YYYY-MM-DD) for growth over time. Under 1 KB of JSON. */
export type Totals = {
  /** Items per kind and language (content/). */
  kinds: Record<EntityKind, ByLang>
  /** Built pages per language; null where no build was read (the backfill from git history). */
  built: ByLang | null
  /** Fish, plant and guide items with text from each source (an item with two sources counts for both; video guides are youtube's). */
  sources: Record<string, number>
  /** Photos on fish, plant and breed pages, and in galleries. */
  photos: { pages: number; gallery: number }
  /** Fish pages whose card has temperature, pH and size (the noKeyFacts gap's other side). Days kept before 2026-11-07 have none. */
  fullCards?: number
}

/**
 * A day's totals as kept in KV (stats:YYYY-MM-DD, worker/admin/content.ts): each count a row in `langs` order, which keeps a
 * day within KV's 1 KB of metadata, so one list() reads every day, as languages join (seven languages by name would pass it).
 * Days kept before 2026-11-06 have no `langs`: their rows are [vi, id, th]. A new language goes last in the table, so code
 * from before the table reads the rows it knows unchanged.
 */
export type KeptTotals = Omit<Totals, 'kinds' | 'built'> & { kinds: Record<EntityKind, number[]>; built: number[] | null; langs?: string[] }
const row = (by: ByLang) => LANGS.map(l => by[l])
export const keepTotals = (t: Totals): KeptTotals => ({
  ...t, kinds: Object.fromEntries(Object.entries(t.kinds).map(([k, n]) => [k, row(n)])) as KeptTotals['kinds'], built: t.built && row(t.built), langs: [...LANGS],
})
/** Kept totals by language again, 0 for a language the day had no row for. */
export function readKept({ langs = ['vi', 'id', 'th'], ...k }: KeptTotals): Totals {
  const by = (r: number[]) => Object.fromEntries(LANGS.map(l => [l, r[langs.indexOf(l)] ?? 0])) as ByLang
  return { ...k, kinds: Object.fromEntries(Object.entries(k.kinds).map(([kind, r]) => [kind, by(r)])) as Totals['kinds'], built: k.built && by(k.built) }
}

/** Per page source (engine-state/<source>.json): addresses the engine has met and what became of them. */
export type SourceRow = {
  id: string
  name: string
  /** Addresses in the state. */
  found: number
  /** Made into, or merged into, a page. */
  done: number
  /** Not a page we keep (a category page, a duplicate, a non-fish product). */
  skipped: number
  /** Still to do: new, fetched, or failed with tries left. */
  waiting: number
  /** Failed 3 times: given up until its page changes. */
  failed: number
  /** Behind a browser check. */
  blocked: number
  /** The source's own index, at the last engine run on this machine (engine-state/last-run.json); undefined without it. */
  discovered?: number
  /** Last time any address changed state. */
  lastAt?: string
}

export type EngineStats = {
  sources: SourceRow[]
  /** Sources waiting for the owner to pass a browser check (engine-state/_sources.json). */
  needsHuman: { source: string; since: string }[]
  /** Sources read through the Internet Archive since they kept meeting a browser check (engine-state/_sources.json). */
  movedToArchive?: { source: string; since: string }[]
  /** The video-guide queue: every video of the playlists and single videos queued (engine-state/youtube*.json). */
  videos: {
    /** Videos listed, each once. */
    listed: number
    written: number
    /** Not a guide, too short, captions too short, members only… */
    skipped: number
    /** Still to write: not tried, or failed with tries left. */
    waiting: number
    failed: number
    playlists: { queued: number; skipped: number }
    singles: { queued: number; skipped: number }
    /** When each guide of the 32 days before the build was written (ISO, oldest first): the dashboard counts them by its viewer's days. */
    writtenAt: string[]
  }
  /** Older Vietnamese rewritten in the site's style, of the pages there is text to rewrite on. */
  rewrite: { done: number; waiting: number; failed: number }
  /** The last engine run's report on the machine that built (engine-state/last-run.json, not committed); null without it. */
  lastRun: { startedAt: string; finishedAt: string; needsHuman: string[]; errors: number; changed: number } | null
}

export type PhotoStats = {
  /** Photos on fish, plant and breed pages, as a public build shows them. */
  pages: number
  /** Where they come from: a source with permission, else the open-licence host they were mirrored from (commons, inaturalist…). */
  byOrigin: Record<string, number>
  /** By licence family: "CC BY", "CC BY-SA", "CC0", "Public domain", "Unsplash", "permission". */
  byLicence: Record<string, number>
  /** Fish, plants and breeds with at least one photo on their page, of those with a page. */
  covered: Partial<Record<'fish' | 'plant' | 'breed', { with: number; of: number }>>
  /** Photos a public build leaves out until they are copied to our media host (engine mirror-photos). */
  waitingMirror: number
  gallery: { pages: number; photos: number }
}

/**
 * A quality review as the engine keeps it (engine-state/reviews/<kind>.json, packages/engine/src/review-log.ts), less its
 * model and attempt. `kind`: the step that reviewed ("video-guide", "translation", "localize"…); `kept`: the page has the
 * version it reviewed.
 */
export type LastReview = { kind: string; at: string; score: number; notes: string[]; kept: boolean }

/** A built page out of search for a score under the bar: its path, its kind, its score as the build judged it, and its last review. */
export type LowPage = { path: string; kind: PageKind; score: number; review?: LastReview }

/**
 * The shape of dist/_ab/reviews.json, written by scripts/content-stats.ts beside content.json and read only by the Worker's
 * content page (admin/content.ts loadLowScores): every built page out of search for its score, lowest score first.
 * Its own file, as the notes can run to a few KB a page: content.json, which every dashboard page and the nightly totals
 * read, stays small.
 */
export type LowScores = { v: 1; /** The score a page needs (@aq/schema QUALITY_THRESHOLD). */ bar: number; pages: LowPage[] }

export type ContentStats = {
  v: 1
  /** When the build wrote it (ISO). */
  builtAt: string
  /** Built with PUBLIC_BUILD=1 (production): sources without permission left out. */
  publicBuild: boolean
  /** Items per kind (content/): how many, and how many have a page in each other language. */
  inventory: Record<EntityKind, { total: number } & Record<OtherLang, number>>
  /** Built pages per language and per page kind; null when no build output was read. */
  built: { total: ByLang; byKind: Partial<Record<PageKind, ByLang>> } | null
  /** Per content source (content/sources.json): fish, plants and guides with its text, as the build shows them. Breeds cite web pages, not these sources. */
  sources: Record<string, { name: string; fish: number; plant: number; guide: number }>
  photos: PhotoStats
  /** null when engine-state wasn't there (the fixture build). */
  engine: EngineStats | null
  gaps: Partial<Record<EntityKind, Partial<Record<GapKey, Gap>>>>
  /** Every built page, by kind: the index readers' paths join with (admin/content.ts joinReads). null without a build. */
  pages: Partial<Record<PageKind, PageRow[]>> | null
  totals: Totals
}
