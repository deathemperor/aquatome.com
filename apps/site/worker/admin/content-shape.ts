/**
 * The shape of dist/_ab/content.json: what the site's content is, written by scripts/content-stats.ts after each build and
 * read by the Worker (admin/content.ts) for the dashboard. Types only (the language table's, as types): the build script
 * (astro check) and the Worker (tsc -p worker) both import it.
 */
import type { Lang, OtherLang } from '@aq/schema/langs'

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

/**
 * Counts in each language, by its code. Snapshots kept before 2026-11-06 hold them as [vi, id, th]: the Worker reads
 * those as these (admin/content.ts listSnapshots).
 */
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
