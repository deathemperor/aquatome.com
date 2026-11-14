import { piece, PieceAdmissionError } from './pieces'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GuideSchema, isAllowedLicence, isOwnerCrop, mayPublish, setsCookies, ownerCropApproved, ownerCropCanonical, metricPage, PlaceSchema, PlantSchema, SOURCE_IDS, SpeciesSchema, TranslationSchema, judgeQuality, nameKey, slugify, speciesDepth, type ChangelogEntry, type Photo, type Section, type SourceId, type Translation } from '@aq/schema'
import type { z } from 'zod'
import { across, LARGE_PX } from './curation'
import { cardGaps } from './card-fill'
import { appendChangelog } from './changelog'
import { LlmError, type Llm } from './claude'
import { deeperPages, depthReport, popularityOrder, readSearchCache, runOrder, saveSearchCache, searchThin, thinSpecies, type DepthReport } from './depth'
import { discover } from './discover'
import { ChallengeError, type ChromeFetcher } from './fetch'
import { gbifMatch, pageTaxon, type Taxon } from './gbif'
import { GROUP_PAGES } from './page-folds'
import { recordKindFallback } from './kind-words'
import { ensurePlaces, guideId, mergePlant, mergeSpecies, writeGuide } from './merge'
import { METRIC_KINDS } from './metric'
import { htmlToOutline, isChallenge, type PageImage } from './outline'
import { findPhotos } from './photos'
import { withSections } from './guide-sections'
import { processPage, type ProcessedPage } from './process'
import { readVarietyPages, recordVarietyPage } from './species-sources'
import { rewriteVi, VI_WRITE } from './vi-rewrite'
import { QUALITY_THRESHOLD, gate, reviewTranslation, steadyRead, WRITER_BAND } from './quality'
import { logReviews, type Review } from './review-log'
import { holdForSecondLook } from './last-photo'
import { linkedPhotos, mayTake, pickSourcePhotos, storeSourcePhotos, type CreditTerms, type Media } from './source-photos'
import { snapshotHash, writeSnapshot } from './snapshot'
import { ARCHIVE_POLITE, ArchiveRefused } from './archive'
import { SOURCES, sourceById, type SourceConfig } from './sources'
import { BROWSER_GONE, attemptsAfter, errorKind, loadState, moveToArchive, needsFetch, noteBlock, saveState, setSourceBlock, sourceBlockedSince, sourcesOnArchive, type UrlState } from './state'
import { findVideos, readVideoRejected } from './videos'
import { popularFirst } from './shops'
import { acceptedNames, addSourceNames, candidates, resolveWanted, wantedFirst, wantedIn, withPopular, type Wanted } from './wanted'
import { addReaders, readersReport, type ReaderRow, type ReaderWant } from './readers-wanted'
import { WikimediaRefused } from './wikimedia-rest'

/** How a source is read. `capturedAt`: the date of the archive's copy, for a source read through it. */
type Reader = Pick<ChromeFetcher, 'text' | 'links' | 'bytes'> & { get(url: string): Promise<{ status: number; html: string; finalUrl: string; capturedAt?: string }> }

export type Deps = {
  fetcher: Reader
  /** Reads sources with `via: 'archive'`, and those that moved there by themselves (the Internet Archive's copies). */
  archive?: Reader
  llm: Llm
  http: (url: string) => Promise<unknown>
  media: Media
  now: () => Date
  root: string
  sleep: (ms: number) => Promise<void>
  /** Names readers keep on their tanks without a page (readers-wanted.ts): absent without the Cloudflare token. */
  readersWanted?: () => Promise<ReaderWant[]>
}
type Counts = { discovered: number; fetched: number; processed: number; skipped: number; blocked: number; errors: number }
export type RunReport = { perSource: Partial<Record<SourceId, Counts>>; needsHuman: SourceId[]; movedToArchive: SourceId[]; changed: ChangelogEntry[]; errors: string[]; depth?: DepthReport; stopped?: string }

type Kind = 'species' | 'plants' | 'guides' | 'places' | 'glossary' | 'breeds'
const readJson = async <T>(path: string): Promise<T | undefined> => readFile(path, 'utf8').then(s => JSON.parse(s) as T, () => undefined)
const writeJson = async (path: string, data: unknown) => writeFile(path, `${JSON.stringify(data, null, 2)}\n`)
/** The photos a page keeps as its own. */
export const MAX_PHOTOS = 8
/**
 * A source's photos come before open-licence ones, in the registry's order. Not those a step of the source's own places
 * (`photoStep`: Tropica): they keep the place that step gave them, behind what the page had, whichever source is read.
 */
const rank = (p: Photo) => (p.source && !SOURCES.find(s => s.id === p.source)?.photoStep ? SOURCE_IDS.indexOf(p.source) : SOURCE_IDS.length)

const MAX_LLM_FAILURES = 3
/** Pages in a row that failed on the network: it is the network, not the pages, so the source stops (their attempts last). */
const MAX_NETWORK_FAILURES = 3
const BLOCK_MEMORY_MS = 86_400_000
/** A source that meets a browser check on this many runs within the window reads the Internet Archive's copies from then on (the owner, 2026-11-10: a person can't always pass one). */
export const ARCHIVE_AFTER_BLOCKS = 2
export const ARCHIVE_BLOCK_WINDOW_MS = 7 * 86_400_000

/** Whether the archive has a readable copy of the page that lists this source, or else of a page already read. */
async function archiveHolds(archive: Reader | undefined, src: SourceConfig, read: string[]): Promise<boolean> {
  if (!archive) return false
  const listing = src.discover.kind === 'crawl' ? src.discover.start[0] : src.discover.kind === 'sitemap' ? src.discover.urls[0] : undefined
  for (const url of [listing, read[0]]) {
    if (!url) continue
    try { await archive.get(url); return true } catch { /* no copy of this one */ }
  }
  return false
}

/**
 * A crop the owner approved one by one for this page (schema's owner-crops.json), checked as the build checks it (load.ts).
 * Only a species page's crop can pass: the build checks a plant's with no page or name, so it never shows one.
 */
export const approvedCrop = (page: string, scientificName: string, approvals?: Parameters<typeof ownerCropApproved>[4]) => (p: Photo) =>
  page.startsWith('species/') && isOwnerCrop(p) && ownerCropApproved(p, page, scientificName, createHash('sha256').update(ownerCropCanonical(p, page, scientificName)).digest('hex'), approvals)

/** What a read keeps whatever its page shows (`owned`: the owner's approved crops), and what may never stay (`gone`: never-again, or a source that no longer lets us show photos). */
/**
 * A photo no reader sees, whatever its page: a never-again one, one whose source no longer lets us show photos, an owner's
 * crop whose source has since refused mark removal, one still on a host that sets cookies (until mirror-photos), or one
 * with no source and no open licence (the build hides each: load.ts cleanPhotos). Two the build also hides are left out,
 * since they turn on its switches and stored checks: an altered photo with no original while those switches are off, and
 * an approved crop whose stored checks fail. No page held either on 14 Nov 2026.
 */
export const hiddenFromReaders = (blocked: Record<string, unknown>, sources: Partial<Record<SourceId, { publish?: boolean | 'photos'; permission?: { markRemoval?: { allowed?: boolean } } }>>) => (p: Photo) =>
  p.url in blocked || setsCookies(p.url) || (!p.source && !isAllowedLicence(p.licence)) ||
  (!!p.source && (!mayPublish(sources[p.source], 'photos') || (isOwnerCrop(p) && sources[p.source]?.permission?.markRemoval?.allowed === false)))
export type ReadKeeps = { owned?: (p: Photo) => boolean; gone?: (p: Photo) => boolean }
/** What a re-read of a page keeps, the same on every path that merges one (the run and the content backfill). */
export const readKeeps = (page: string, scientificName: string, blocked: Record<string, unknown>, sources: Parameters<typeof hiddenFromReaders>[1]): ReadKeeps =>
  ({ owned: approvedCrop(page, scientificName), gone: hiddenFromReaders(blocked, sources) })

/**
 * This page's fresh photos replace its old ones; source photos first (registry order), open-licence photos after. A head
 * that fills the card stays first, unless this read replaced it: it's what the fish's cards show (lead-photo.ts).
 * Two things a read never does (14 Nov 2026: a pages rewrite took Betta rutilans' only photo, the owner's crop):
 * - replace a crop the owner approved (`owned`), whatever the source's page now shows. The page's crops take their seats
 *   inside its MAX_PHOTOS first, before any other photo's, its head's too, and keep their place in the page's order; a page
 *   with more than MAX_PHOTOS crops keeps its first MAX_PHOTOS (none has more than three today). The other seats go to
 *   photos a reader sees before those no reader sees;
 * - leave a page that had a photo a reader could see with none such: those stay, `held` for a person's second look
 *   (last-photo.ts). A reader sees neither a photo `gone` names (never-again, a source that no longer lets us show
 *   photos, or a crop whose source has since refused mark removal: `hiddenFromReaders`), a crop that fails its approval, nor a generated photo (the build hides both: a generated one shows only with
 *   its approval and a switch that is off, and never stands for the fish), so none counts either way: a page left with
 *   only the first two takes what Commons has instead, and one whose last such photo the read replaced keeps that one.
 */
export const mergeRead = (prev: Photo[], source: SourceId, url: string, fresh: Photo[], o: ReadKeeps = {}): { photos: Photo[]; held: Photo[] } => {
  const owned = o.owned ?? (() => false)
  const seen = (p: Photo) => !p.generated && !o.gone?.(p) && (!isOwnerCrop(p) || owned(p))
  const replaced = (p: Photo) => p.source === source && p.sourceUrl === url && !owned(p)
  const merged = [...fresh, ...prev.filter(p => !replaced(p))].map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(x => x.p)
  const head = prev[0] && !replaced(prev[0]) && across(prev[0].large ?? prev[0], 'square') >= LARGE_PX ? prev[0] : undefined
  const all = head ? [head, ...merged.filter(p => p.url !== head.url)] : merged
  // The owner's crops first inside the cap, every other photo in its order after them.
  const crops = all.filter(owned).slice(0, MAX_PHOTOS), room = MAX_PHOTOS - crops.length
  const rest = all.filter(p => !owned(p))
  const others = new Set([...rest.filter(seen), ...rest.filter(p => !seen(p))].slice(0, room))
  const photos = all.filter(p => crops.includes(p) || others.has(p))
  const left = prev.filter(seen)
  // Nothing a reader could see left: the seen ones from before stay, held, behind the owner's crops (kept even when the
  // build hides them), and a generated photo the read kept stays behind them, as it would without this rule; with none of
  // these, none at all, and the caller looks to Commons.
  if (photos.some(seen)) return { photos, held: [] }
  const both = [...photos.filter(owned), ...left.filter(p => !owned(p)), ...photos.filter(p => p.generated)]
  const kept = both.filter((p, i) => both.findIndex(q => q.url === p.url) === i).slice(0, MAX_PHOTOS)
  return { photos: kept, held: kept.filter(p => left.includes(p) && replaced(p)) }
}
export const mergePhotos = (prev: Photo[], source: SourceId, url: string, fresh: Photo[], o: ReadKeeps = {}) => mergeRead(prev, source, url, fresh, o).photos

/**
 * A page's photos once one of its source pages is read: that page's photos as they are now (mergeRead), but for a
 * source whose photos a step of its own takes (sources.ts `photoStep`: Tropica). Its page's pictures aren't the picker's
 * to find, so a read brings none, and the ones its step stored stay. Photos kept as a page's last go into `held`.
 */
export const photosAfterRead = async (prev: Photo[], source: SourceId, url: string, fresh: () => Promise<Photo[]>, held: Photo[] = [], o: ReadKeeps = {}) => {
  if (sourceById(source).photoStep) return prev
  const r = mergeRead(prev, source, url, await fresh(), o)
  held.push(...r.held)
  return r.photos
}

/** content/ access for one run: existing items, taken slugs, validated writes. */
function store(contentRoot: string) {
  const slugs = new Map<Kind, Set<string>>()
  const names = new Map<Kind, Map<string, string>>()
  const ids = async (kind: Kind) => readdir(join(contentRoot, kind)).catch(() => [] as string[])
  return {
    read: async <E>(kind: Kind, id: string) => ({
      entity: await readJson<E>(join(contentRoot, kind, id, 'entity.json')),
      vi: await readJson<Translation>(join(contentRoot, kind, id, 'vi.json')),
    }),
    ids,
    /** Slugs used by other items of this kind (the item's own slug is free for it to keep). */
    taken: async (kind: Kind, own?: string) => {
      if (!slugs.has(kind)) {
        const set = new Set<string>()
        for (const id of await ids(kind)) { const t = await readJson<Translation>(join(contentRoot, kind, id, 'vi.json')); if (t) set.add(t.slug) }
        slugs.set(kind, set)
      }
      const set = new Set(slugs.get(kind))
      if (own) set.delete(own)
      return set
    },
    /** Names (nameKey) of the other items of this kind. */
    takenNames: async (kind: Kind, own?: string) => {
      if (!names.has(kind)) {
        const map = new Map<string, string>()
        for (const id of await ids(kind)) { const t = await readJson<Translation>(join(contentRoot, kind, id, 'vi.json')); if (t) map.set(id, nameKey(t.name)) }
        names.set(kind, map)
      }
      return new Set([...names.get(kind)!].filter(([id]) => id !== own).map(([, n]) => n))
    },
    write: async (kind: Kind, schema: z.ZodType, item: { entity: { id: string }; vi: Translation }) => {
      const entity = schema.parse(item.entity) as { id: string }
      const vi = TranslationSchema.parse(METRIC_KINDS.includes(kind) ? metricPage(item.vi, 'vi') : item.vi)
      if (!entity.id || !vi.slug) throw new Error(`empty id or slug for ${kind}`)
      const dir = join(contentRoot, kind, entity.id)
      await mkdir(dir, { recursive: true })
      await writeJson(join(dir, 'entity.json'), entity)
      await writeJson(join(dir, 'vi.json'), vi)
      slugs.get(kind)?.add(vi.slug)
      names.get(kind)?.set(entity.id, nameKey(vi.name))
    },
  }
}

async function glossaryTerms(s: ReturnType<typeof store>): Promise<string[]> {
  const out: string[] = []
  for (const id of await s.ids('glossary')) {
    const { entity, vi } = await s.read<{ en: string }>('glossary', id)
    if (entity && vi) out.push(`${entity.en} = ${vi.name}`)
  }
  return out
}

/** Hashes carried over when a fetch fails or is blocked, so an unchanged page isn't re-translated later. */
const keep = (prev?: UrlState) => ({ ...(prev?.hash ? { hash: prev.hash } : {}), ...(prev?.processedHash ? { processedHash: prev.processedHash } : {}) })

/** Per-source translation scores; the page is indexable only if every source's translation passed. */
function combineQuality(prev: Translation['quality'] | undefined, source: SourceId, score: number): Translation['quality'] {
  const bySource = { ...prev?.bySource, [source]: score }
  const min = Math.min(...Object.values(bySource))
  return { score: min, indexable: min >= QUALITY_THRESHOLD, bySource }
}

/** A source already has a fuller page about this entity than the one being processed (e.g. species profile vs a news item). */
const outranked = (sections: Section[] | undefined, source: SourceId, url: string, incoming: number) =>
  (sections ?? []).filter(x => x.source === source && x.sourceUrl !== url).length > incoming

/**
 * Optional enrichment never fails a page. A refusal is not "nothing found": the archive's stops the source, and
 * Wikimedia's leaves the page unmarked, to be read again once the rest ends (wikimedia-rest.ts).
 */
export async function soft<T>(what: string, f: () => Promise<T>, fallback: T): Promise<T> {
  try { return await f() } catch (e) { if (e instanceof ArchiveRefused || e instanceof WikimediaRefused) throw e; console.warn(`${what} skipped: ${(e as Error).message}`); return fallback }
}

/**
 * `cardFill` (the card-fill step): only the profiles of species pages whose data card lacks a figure (card-fill.ts), on
 * sources that haven't given the page any text yet, most popular first; `limit` pages a source.
 */
export async function runEngine(deps: Deps, opts: { sources?: SourceId[]; limit?: number; maxMinutes?: number; only?: RegExp; retryBlocked?: boolean; force?: boolean; cardFill?: boolean } = {}): Promise<RunReport> {
  const { llm, http, root } = deps
  const contentRoot = join(root, 'content')
  const s = store(contentRoot)
  const glossary = await glossaryTerms(s)
  const sourceNames = (await readJson<Partial<Record<SourceId, { name: string; publish?: boolean | 'photos'; permission?: CreditTerms & { markRemoval?: { allowed?: boolean } } }>>>(join(contentRoot, 'sources.json'))) ?? {}
  const gbifCache: Record<string, Taxon | null> = {}
  const blocked = (await readJson<Record<string, string>>(join(root, 'engine-state/_photo-rejected.json'))) ?? {}
  const deadline = opts.maxMinutes ? deps.now().getTime() + opts.maxMinutes * 60_000 : Infinity
  const report: RunReport = { perSource: {}, needsHuman: [], movedToArchive: [], changed: [], errors: [] }
  const today = () => deps.now().toISOString().slice(0, 10)
  // What a re-read keeps of a page's photos (mergeRead): the owner's approved crops; never a never-again photo, or one whose source no longer lets us show photos.
  const keeps = (page: string, scientificName: string): ReadKeeps => readKeeps(page, scientificName, blocked, sourceNames)
  // A re-read that would leave a page with no photo keeps the old ones, each held for a person's second look (mergeRead).
  const holdLast = (held: Photo[], page: string) => holdForSecondLook(root, new Map(held.map(p => [p.url, { why: "rejected: the source's page no longer shows it", pages: [page] }])), 'the pages rewrite', today())

  // Species our pages name but don't have yet: their source pages are fetched first (see wanted.ts); the audit lists the rest.
  const gbifNamesFile = join(root, 'engine-state/_gbif-names.json')
  const gbifNames: Record<string, Taxon | null> = (await readJson(gbifNamesFile)) ?? {}
  const gbif = (n: string) => gbifMatch(n, http, gbifNames)
  let gbifKept = Object.keys(gbifNames).length
  /** GBIF's answers are kept for the next runs. */
  const keepGbifNames = async () => {
    if (Object.keys(gbifNames).length === gbifKept) return
    await mkdir(join(root, 'engine-state'), { recursive: true })
    await writeJson(gbifNamesFile, Object.fromEntries(Object.entries(gbifNames).sort()))
    gbifKept = Object.keys(gbifNames).length
  }
  // Shops' species first, then the most-kept fish (shops.ts), under the names GBIF accepts, as their pages would be kept.
  const listed = await popularFirst(root)
  const popular = await soft('popular names', () => acceptedNames(listed, gbif), listed)
  /** Readers' names and what became of them; undefined when they couldn't be read (the last report stays). */
  let readerRows: ReaderRow[] | undefined
  const wanted = await soft('wanted species', async () => {
    const words = new Set((await readFile('/usr/share/dict/words', 'utf8').catch(() => '')).split('\n').map(w => w.trim().toLowerCase()))
    const have = new Set([...(await s.ids('species')), ...(await s.ids('plants'))])
    const w = withPopular(await resolveWanted(await candidates(contentRoot, x => words.has(x)), have, gbif, n => n in gbifNames), have, popular)
    // What readers keep on their tanks without a page, most readers first (they go before every other wanted page).
    const wants = deps.readersWanted ? await soft('readers wanted', deps.readersWanted, undefined) : undefined
    if (wants) readerRows = await addReaders(w, wants, have, gbif, n => n in gbifNames)
    await keepGbifNames()
    return w
  }, new Map() as Wanted)
  const onSource: Record<string, string> = {}
  const varietyPages = await readVarietyPages(root)
  const videoRejected = await readVideoRejected(root)

  /** The site's Vietnamese style over the first translation (VI_WRITE, scripts/eval-translate.ts); unchanged if the output is
   * unusable. A model failure (usage limit) stops the run like any other: no page publishes unpolished without a trace. */
  async function polish(p: ProcessedPage, outline: string): Promise<ProcessedPage> {
    try {
      if (p.kind === 'guide' && p.guide) return { ...p, guide: { ...p.guide, viBody: (await rewriteVi(llm, [{ id: 'body', en: outline, vi: p.guide.viBody }], VI_WRITE)).get('body')! } }
      const parts = p.sections.filter(x => x.key !== 'references').map(x => ({ id: x.key, en: x.en, vi: x.vi }))
      if (!parts.length) return p
      const m = await rewriteVi(llm, parts, VI_WRITE)
      return { ...p, sections: p.sections.map(x => (m.has(x.key) ? { ...x, vi: m.get(x.key)! } : x)) }
    } catch (e) {
      if (e instanceof LlmError) throw e
      return p
    }
  }

  /** Translate, polish, review, and re-translate once with the reviewer's notes if it scores low. */
  async function translate(input: Parameters<typeof processPage>[1]): Promise<{ page: ProcessedPage; score: number; tries: Review[] }> {
    let page = await processPage(llm, input)
    if (page.kind === 'skip') return { page, score: 1, tries: [] }
    page = await polish(page, input.outline)
    const pairs = (p: ProcessedPage) => (p.kind === 'guide' ? [{ en: input.outline, vi: p.guide?.viBody ?? '' }] : p.sections)
    // Near the bar (WRITER_BAND), read three times: the middle read counts.
    const tries = [await steadyRead(() => reviewTranslation(llm, pairs(page)), WRITER_BAND)]
    if (gate(tries[0]!.score, false) === 'retry') {
      page = await processPage(llm, { ...input, notes: tries[0]!.notes })
      if (page.kind === 'skip') return { page, score: 1, tries: [] }
      page = await polish(page, input.outline)
      tries.push(await steadyRead(() => reviewTranslation(llm, pairs(page)), WRITER_BAND))
    }
    return { page, score: tries.at(-1)!.score, tries }
  }

  /** Write the processed page; returns entity ids (`kind/id`) or null when it isn't usable content. */
  async function apply(source: SourceId, url: string, page: ProcessedPage, score: number, images: PageImage[], bytes: Deps['fetcher']['bytes']): Promise<string[] | null> {
    const now = today()
    const minWidth = sourceById(source).minPhotoWidth
    const sourceName = sourceNames[source]?.name ?? source
    const terms = sourceNames[source]?.permission
    const photoDeps = { bytes, media: deps.media, blocked, refusedCredits: terms?.refusedCredits, coveredCredits: terms?.coveredCredits }
    const sourcePhotos = (names: string[], existing: Photo[], max?: number) =>
      storeSourcePhotos(source, sourceName, url, pickSourcePhotos(images, url, names, max, page.kind === 'guide' ? 'guide' : 'subject', minWidth, mayTake(source, sourceName, photoDeps, existing)), photoDeps, existing, max ?? 4)
    const log = (kind: ChangelogEntry['kind'], id: string, existed: boolean) => {
      const e: ChangelogEntry = { date: now, kind, id, source, action: existed ? 'updated' : 'new' }
      report.changed.push(e)
      return e
    }
    if (page.kind === 'species') {
      // A source page about several species is no one species' page (page-folds.ts).
      if (GROUP_PAGES.includes(url)) return null
      // A name newer than GBIF (the 2024 Corydoras split: Hoplisoma sterbai) is found under a synonym the page gives.
      const taxon = await pageTaxon([page.scientificName!, ...page.synonyms], page.group, n => gbifMatch(n, http, gbifCache))
      if (!taxon) return null
      // A page about one variety or strain says what that line is, not the species: kept off its page (species-sources.ts).
      if (page.variety || varietyPages[url]) {
        if (!varietyPages[url]) await recordVarietyPage(root, url, varietyPages[url] = { species: slugify(taxon.canonicalName), variety: page.variety, at: now })
        return null
      }
      const existing = await s.read<z.infer<typeof SpeciesSchema>>('species', slugify(taxon.canonicalName))
      if (outranked(existing.entity?.sections, source, url, page.sections.length)) return [`species/${slugify(taxon.canonicalName)}`]
      const item = mergeSpecies(existing, page, { source, url, taxon, now, takenSlugs: new Set([...await s.taken('species', existing.vi?.slug), ...await s.taken('breeds')]), takenNames: new Set([...await s.takenNames('species', slugify(taxon.canonicalName)), ...await s.takenNames('breeds')]), quality: combineQuality(existing.vi?.quality, source, score) })
      // Judged on depth at every merge too, as the public build shows it (published sources): a thin page is out of search.
      item.vi.quality = judgeQuality(item.vi.quality, item.vi.quality.indexable, speciesDepth(item.entity.sections.filter(x => mayPublish(sourceNames[x.source], 'text'))).deep)
      const held: Photo[] = []
      item.entity.photos = await photosAfterRead(item.entity.photos, source, url, () => sourcePhotos([taxon.canonicalName, page.scientificName!, ...page.enCommonNames], item.entity.photos), held, keeps(`species/${item.entity.id}`, item.entity.scientificName))
      await holdLast(held, `species/${item.entity.id}`)
      if (!item.entity.photos.length) item.entity.photos = await soft('commons photos', () => findPhotos(taxon.canonicalName, http, 4, blocked), [])
      if (!item.entity.videos.length) item.entity.videos = await soft('videos', () => findVideos([taxon.canonicalName, ...page.enCommonNames], llm, http, { skip: videoRejected }), [])
      const known = new Set(await s.ids('places'))
      for (const p of ensurePlaces(page.places, known)) await s.write('places', PlaceSchema, p)
      await s.write('species', SpeciesSchema, item)
      // A source's name that names another kind of animal: the page took its plain scientific form, listed for the Writing Lead.
      if (item.fellBack) await recordKindFallback(root, `species/${item.entity.id}`, { ...item.fellBack, took: item.vi.name, at: now })
      await appendChangelog(contentRoot, [log('species', item.entity.id, !!existing.entity)])
      return [`species/${item.entity.id}`]
    }
    if (page.kind === 'plant') {
      if (!page.scientificName) return null
      const existing = await s.read<z.infer<typeof PlantSchema>>('plants', slugify(page.scientificName))
      if (outranked(existing.entity?.sections, source, url, page.sections.length)) return [`plants/${slugify(page.scientificName)}`]
      const item = mergePlant(existing, page, { source, url, now, takenSlugs: await s.taken('plants', existing.vi?.slug), takenNames: await s.takenNames('plants', slugify(page.scientificName)), quality: combineQuality(existing.vi?.quality, source, score) })
      if (!item) return null
      const held: Photo[] = []
      item.entity.photos = await photosAfterRead(item.entity.photos, source, url, () => sourcePhotos([item.entity.scientificName, ...page.enCommonNames], item.entity.photos), held, keeps(`plants/${item.entity.id}`, item.entity.scientificName))
      await holdLast(held, `plants/${item.entity.id}`)
      if (!item.entity.photos.length) item.entity.photos = await soft('commons photos', () => findPhotos(item.entity.scientificName, http, 4, blocked), [])
      await s.write('plants', PlantSchema, item)
      await appendChangelog(contentRoot, [log('plant', item.entity.id, !!existing.entity)])
      return [`plants/${item.entity.id}`]
    }
    if (page.kind === 'guide') {
      const existing = await s.read<z.infer<typeof GuideSchema>>('guides', guideId(source, url))
      const item = writeGuide(page, { source, url, now, existing, takenSlugs: await s.taken('guides', existing.vi?.slug), quality: combineQuality(undefined, source, score) })
      if (!item) return null
      // Every photo the source shows (a list of fish has one per fish), each in the section it sat under.
      item.entity.photos = withSections(await sourcePhotos([], item.entity.photos, Infinity), { vi: item.vi.body ?? '' })
      await s.write('guides', GuideSchema, item)
      await appendChangelog(contentRoot, [log('guide', item.entity.id, !!existing.entity)])
      return [`guides/${item.entity.id}`]
    }
    return null
  }

  // Thin species pages (depth.ts), most popular first: their profiles on in-depth sources run before new species.
  const thinNow = await soft('thin species', () => thinSpecies(contentRoot, popularityOrder(popular)), { pages: 0, thin: [], families: new Map<string, string>() })
  // Species pages whose card lacks a figure, most popular first (the card-fill step reads only their profiles).
  const gaps = opts.cardFill ? await soft('card gaps', () => cardGaps(contentRoot, popularityOrder(popular)), []) : []
  const searchCache = await readSearchCache(root)
  let llmFailures = 0
  // Least-covered sources first, each capped at a fair share of the time left (unused time rolls forward),
  // so one large backlog (Seriously Fish) can't starve the others; the most-covered source runs last and gets the rest.
  const covered = new Map<SourceId, number>()
  for (const id of opts.sources ?? SOURCES.map(x => x.id)) covered.set(id, Object.keys(await loadState(root, id)).length)
  const order = [...covered.keys()].sort((a, b) => covered.get(a)! - covered.get(b)!)
  sources: for (const [i, id] of order.entries()) {
    const src = sourceById(id)
    const until = deadline === Infinity ? Infinity : deps.now().getTime() + (deadline - deps.now().getTime()) / (order.length - i)
    const counts: Counts = { discovered: 0, fetched: 0, processed: 0, skipped: 0, blocked: 0, errors: 0 }
    report.perSource[id] = counts
    const onArchive = src.via === 'archive' || (await sourcesOnArchive(root)).has(id)
    const fetcher = onArchive ? deps.archive : deps.fetcher
    if (!fetcher) { report.errors.push(`${id}: no archive reader`); continue }
    // An archived source never meets the site's browser check, so an old block doesn't hold it back.
    const blockedAt = onArchive ? undefined : await sourceBlockedSince(root, id)
    if (blockedAt && !opts.retryBlocked && deps.now().getTime() - new Date(blockedAt).getTime() < BLOCK_MEMORY_MS) {
      report.needsHuman.push(id) // still waiting for the owner to pass the browser check in the engine's Chrome profile
      continue
    }
    let blockNoted = false
    const block = async () => {
      counts.blocked++
      if (blockNoted) return
      blockNoted = true
      const at = deps.now().toISOString()
      if (await noteBlock(root, id, at, ARCHIVE_BLOCK_WINDOW_MS) >= ARCHIVE_AFTER_BLOCKS && await archiveHolds(deps.archive, src, Object.keys(await loadState(root, id)))) {
        await moveToArchive(root, id, at)
        report.movedToArchive.push(id)
        return
      }
      report.needsHuman.push(id)
      await setSourceBlock(root, id, at)
    }
    const delayMs = onArchive ? Math.max(src.delayMs, ARCHIVE_POLITE) : src.delayMs
    let last = -Infinity
    /** ≥ delayMs between any two requests to this source (pages, sitemaps, images); time spent translating counts. */
    const polite = <A extends unknown[], R>(f: (...a: A) => Promise<R>) => async (...a: A) => {
      await deps.sleep(Math.max(0, last + delayMs - deps.now().getTime()))
      try { return await f(...a) } finally { last = deps.now().getTime() }
    }
    const get = polite((u: string) => fetcher.get(u))
    const links = polite((u: string, scope?: string) => fetcher.links(u, scope))
    const bytes = polite((u: string, referer: string) => fetcher.bytes(u, referer))
    let found: Awaited<ReturnType<typeof discover>>
    // An archived source keeps its last good index: the archive's index is often down, the species list barely changes.
    const indexFile = join(root, 'engine-state', `_index-${id}.json`)
    try {
      // Off the capture index, a sitemap is read from its archived copy, never from the site.
      const text = onArchive && src.discover.kind !== 'archive' ? polite(async (u: string) => (await fetcher.get(u)).html) : polite((u: string) => fetcher.text(u))
      found = await discover(src, text, links)
      if (onArchive && !found.length) throw new Error('the archive lists no pages')
      if (onArchive && found.length) await mkdir(join(root, 'engine-state'), { recursive: true }).then(() => writeFile(indexFile, `${JSON.stringify(found)}\n`))
    } catch (e) {
      if (e instanceof ChallengeError) { await block(); continue }
      if (e instanceof ArchiveRefused) { report.errors.push(`${id}: not read: ${e.message}`); continue }
      const lastIndex = onArchive ? JSON.parse(await readFile(indexFile, 'utf8').catch(() => 'null')) as typeof found | null : null
      // No index yet: the pages already read are still there to read again.
      const kept = lastIndex?.length || !onArchive ? lastIndex : Object.keys(await loadState(root, id)).map(url => ({ url }))
      if (!kept?.length) {
        counts.errors++
        report.errors.push(`${id}: discovery failed: ${(e as Error).message}`)
        continue
      }
      report.errors.push(`${id}: discovery failed (${(e as Error).message}); using the last index (${kept.length} pages)`)
      found = kept
    }
    counts.discovered = found.length
    // A wanted species this source keeps under another name (a synonym, a newer genus, another spelling) is fetched first too.
    await soft('source names', async () => { await addSourceNames(found.map(f => f.url), wanted, gbif, n => n in gbifNames); await keepGbifNames() }, undefined)
    found = wantedFirst(found, wanted, popular)
    for (const f of found) { const w = wantedIn(f.url, wanted); if (w && !onSource[w]) onSource[w] = f.url }
    await setSourceBlock(root, id, undefined)
    const state = await loadState(root, id)
    // `force` (with `only`): re-translate the matching pages now, even if unchanged since the last run (e.g. after a prompt fix).
    const forced = (url: string) => !!opts.force && !!opts.only?.test(url)
    // card-fill: a page that already has this source's text has had its figures from it.
    const deeper = opts.cardFill ? deeperPages(found, gaps.filter(g => !g.sources.includes(id)), src) : deeperPages(found, thinNow.thin, src)
    // Not under our name in the index: the source's own search (not on targeted runs or card-fill).
    if (!opts.only && !opts.cardFill) {
      let searched: Map<string, number>
      try {
        searched = await soft(`${id}: thin species search`, () => searchThin(src, thinNow.thin, new Set(deeper.values()), thinNow.families, u => links(u), searchCache, deps.now()), new Map<string, number>())
      } catch (e) {
        if (!(e instanceof ArchiveRefused)) throw e
        report.errors.push(`${id}: not read: ${e.message}`)
        continue
      }
      for (const [url, i] of searched) {
        if (!found.some(f => f.url === url)) found.push({ url })
        if (!deeper.has(url)) deeper.set(url, i)
      }
      if (src.search) await soft('search cache', () => saveSearchCache(root, searchCache), undefined)
    }
    const due = found.filter(f => (!opts.only || opts.only.test(f.url)) && (!opts.cardFill || deeper.has(f.url)) && (forced(f.url) || needsFetch(state[f.url], f.lastmod, deps.now())))
    const todo = runOrder(due, state, deeper).slice(0, opts.limit ?? Infinity)

    let networkFailures = 0
    for (const { url, lastmod } of todo) {
      if (deps.now().getTime() > until) break
      const prev = state[url]
      const base = { ...(lastmod ? { lastmod } : {}), entityIds: prev?.entityIds ?? [], updatedAt: deps.now().toISOString() }
      const save = async (next: UrlState) => { state[url] = next; await saveState(root, id, state) }
      counts.fetched++
      try {
        const r = await get(url)
        networkFailures = 0
        const o = htmlToOutline(r.html, src.contentSelector)
        if (isChallenge(o.title, o.outline)) {
          await block()
          await save({ ...base, ...keep(prev), status: 'blocked', attempts: 0, error: `challenge: ${o.title}` })
          break // never retry around a challenge; the owner clears it in the engine's Chrome profile
        }
        if (r.status >= 400) throw new Error(`HTTP ${r.status}`)
        const hash = snapshotHash(o)
        if (hash !== prev?.hash || r.capturedAt) await writeSnapshot(root, id, url, o, deps.now(), r.capturedAt)
        if (prev?.processedHash === hash && !forced(url)) {
          counts.skipped++
          const { error: _stale, ...rest } = prev
          await save({ ...rest, ...base, hash, status: prev.entityIds.length ? 'processed' : 'skipped', attempts: 0 })
          continue
        }
        await piece(url, async () => {
          const { page, score, tries } = await translate({ source: id, url, title: o.title, outline: o.outline, glossary })
          const images = src.photoPages ? await linkedPhotos(r.html, url, src.photoPages, get) : o.images
          const entityIds = await apply(id, url, page, score, images, bytes)
          // The last translation reviewed is the page's, unless another source outranks this one there; a page is reviewed per source.
          for (const e of entityIds ?? []) {
            const on = (await readJson<Translation>(join(contentRoot, e, 'vi.json')))?.quality?.bySource?.[id] === score
            await logReviews(root, 'translation', { id: e, lang: 'vi', part: id }, tries, on ? tries.at(-1) : undefined, { now: deps.now() })
          }
          if (entityIds) counts.processed++
          else counts.skipped++
          await save({ ...base, hash, processedHash: hash, status: entityIds ? 'processed' : 'skipped', entityIds: entityIds ?? [], attempts: 0 })
          llmFailures = 0
        })
      } catch (e) {
        // Nothing is wrong with the page, so nothing is marked on it, and the source waits with the archive.
        if (e instanceof ArchiveRefused) { report.errors.push(`${id}: not read: ${e.message}`); break }
        // Wikimedia resting: the page waits, unmarked and with its attempts, and the source goes on.
        if (e instanceof WikimediaRefused) { report.errors.push(`${url}: waits for Wikimedia: ${e.message}`); continue }
        const message = (e as Error).message
        if (e instanceof PieceAdmissionError) { report.stopped = message; break sources }
        counts.errors++
        report.errors.push(`${url}: ${message}`)
        // A usage limit uses no attempt; a transient failure (browser, network, usage limit) runs first next time (state.ts, depth.ts).
        await save({ ...base, ...keep(prev), status: 'error', attempts: attemptsAfter(prev, message), error: message.slice(0, 300) })
        // The browser itself is gone (crash, closed window): every later page would fail the same way.
        if (BROWSER_GONE.test(message)) {
          report.errors.push('stopping: the browser closed — the next cycle starts a fresh one')
          break sources
        }
        // The archive said slow down: another request now only makes it wait longer. The next run carries on.
        if (errorKind(message) === 'throttled') {
          report.errors.push(`${id}: stopping: the archive asked us to slow down (${message.slice(0, 120)})`)
          break
        }
        if (!(e instanceof LlmError) && errorKind(message) === 'transient' && ++networkFailures >= MAX_NETWORK_FAILURES) {
          report.errors.push(`${id}: stopping: ${MAX_NETWORK_FAILURES} pages in a row failed on the network (${message.slice(0, 120)})`)
          break
        }
        if (e instanceof LlmError && ++llmFailures >= MAX_LLM_FAILURES) {
          report.errors.push(`stopping: ${MAX_LLM_FAILURES} consecutive Claude failures (${(e as Error).message.slice(0, 120)})`)
          break sources
        }
      }
    }
  }
  report.depth = await soft('depth report', async () => { const t = await thinSpecies(contentRoot, popularityOrder(popular)); return depthReport(t.pages, t.thin) }, undefined)
  await soft('wanted report', () => writeJson(join(root, 'engine-state/_wanted.json'), Object.fromEntries([...wanted].map(([slug, w]) => [slug, { name: w.name, mentionedIn: w.mentionedIn.slice(0, 5), mentions: w.mentionedIn.length, ...(w.readers ? { readers: w.readers } : {}), ...(onSource[slug] ? { onSource: onSource[slug] } : {}) }]))), undefined)
  if (readerRows) { const rows = readerRows; await soft('readers wanted report', () => writeJson(join(root, 'engine-state/_readers-wanted.json'), readersReport(rows)), undefined) }
  return report
}
