import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GuideSchema, PlaceSchema, PlantSchema, SOURCE_IDS, SpeciesSchema, TranslationSchema, slugify, type ChangelogEntry, type Photo, type Section, type SourceId, type Translation } from '@aq/schema'
import type { z } from 'zod'
import { appendChangelog } from './changelog'
import { LlmError, type Llm } from './claude'
import { discover } from './discover'
import { ChallengeError, type ChromeFetcher } from './fetch'
import { gbifMatch, type Taxon } from './gbif'
import { ensurePlaces, guideId, mergePlant, mergeSpecies, writeGuide } from './merge'
import { htmlToOutline, isChallenge, type PageImage } from './outline'
import { findPhotos } from './photos'
import { processPage, type ProcessedPage } from './process'
import { QUALITY_THRESHOLD, gate, reviewTranslation } from './quality'
import { pickSourcePhotos, storeSourcePhotos, type Media } from './source-photos'
import { snapshotHash, writeSnapshot } from './snapshot'
import { sourceById } from './sources'
import { loadState, needsFetch, saveState, setSourceBlock, sourceBlockedSince, type UrlState } from './state'
import { findVideos } from './videos'
import { candidates, resolveWanted, wantedFirst, wantedIn, type Wanted } from './wanted'

export type Deps = {
  fetcher: Pick<ChromeFetcher, 'get' | 'text' | 'links' | 'bytes'>
  llm: Llm
  http: (url: string) => Promise<unknown>
  media: Media
  now: () => Date
  root: string
  sleep: (ms: number) => Promise<void>
}
type Counts = { discovered: number; fetched: number; processed: number; skipped: number; blocked: number; errors: number }
export type RunReport = { perSource: Partial<Record<SourceId, Counts>>; needsHuman: SourceId[]; changed: ChangelogEntry[]; errors: string[] }

type Kind = 'species' | 'plants' | 'guides' | 'places' | 'glossary'
const readJson = async <T>(path: string): Promise<T | undefined> => readFile(path, 'utf8').then(s => JSON.parse(s) as T, () => undefined)
const writeJson = async (path: string, data: unknown) => writeFile(path, `${JSON.stringify(data, null, 2)}\n`)
const MAX_PHOTOS = 8
const rank = (p: Photo) => (p.source ? SOURCE_IDS.indexOf(p.source) : SOURCE_IDS.length)

const MAX_LLM_FAILURES = 3
const BLOCK_MEMORY_MS = 86_400_000

/** This page's fresh photos replace its old ones; source photos first (registry order), open-licence photos after. */
export const mergePhotos = (prev: Photo[], source: SourceId, url: string, fresh: Photo[]) =>
  [...fresh, ...prev.filter(p => !(p.source === source && p.sourceUrl === url))].map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(x => x.p).slice(0, MAX_PHOTOS)

/** content/ access for one run: existing items, taken slugs, validated writes. */
function store(contentRoot: string) {
  const slugs = new Map<Kind, Set<string>>()
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
    write: async (kind: Kind, schema: z.ZodType, item: { entity: { id: string }; vi: Translation }) => {
      const entity = schema.parse(item.entity) as { id: string }
      const vi = TranslationSchema.parse(item.vi)
      if (!entity.id || !vi.slug) throw new Error(`empty id or slug for ${kind}`)
      const dir = join(contentRoot, kind, entity.id)
      await mkdir(dir, { recursive: true })
      await writeJson(join(dir, 'entity.json'), entity)
      await writeJson(join(dir, 'vi.json'), vi)
      slugs.get(kind)?.add(vi.slug)
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

const BROWSER_GONE = /Target page, context or browser has been closed|Browser has been closed|Target closed/i

/** Optional enrichment never fails a page. */
async function soft<T>(what: string, f: () => Promise<T>, fallback: T): Promise<T> {
  try { return await f() } catch (e) { console.warn(`${what} skipped: ${(e as Error).message}`); return fallback }
}

export async function runEngine(deps: Deps, opts: { sources?: SourceId[]; limit?: number; maxMinutes?: number; only?: RegExp; retryBlocked?: boolean; force?: boolean } = {}): Promise<RunReport> {
  const { llm, http, root } = deps
  const contentRoot = join(root, 'content')
  const s = store(contentRoot)
  const glossary = await glossaryTerms(s)
  const sourceNames = (await readJson<Partial<Record<SourceId, { name: string }>>>(join(contentRoot, 'sources.json'))) ?? {}
  const gbifCache: Record<string, Taxon | null> = {}
  const deadline = opts.maxMinutes ? deps.now().getTime() + opts.maxMinutes * 60_000 : Infinity
  const report: RunReport = { perSource: {}, needsHuman: [], changed: [], errors: [] }
  const today = () => deps.now().toISOString().slice(0, 10)

  // Species our pages name but don't have yet: their source pages are fetched first (see wanted.ts); the audit lists the rest.
  const gbifNamesFile = join(root, 'engine-state/_gbif-names.json')
  const gbifNames: Record<string, Taxon | null> = (await readJson(gbifNamesFile)) ?? {}
  const wanted = await soft('wanted species', async () => {
    const words = new Set((await readFile('/usr/share/dict/words', 'utf8').catch(() => '')).split('\n').map(w => w.trim().toLowerCase()))
    const have = new Set([...(await s.ids('species')), ...(await s.ids('plants'))])
    const before = Object.keys(gbifNames).length
    const w = await resolveWanted(await candidates(contentRoot, x => words.has(x)), have, n => gbifMatch(n, http, gbifNames), n => n in gbifNames)
    if (Object.keys(gbifNames).length !== before) {
      await mkdir(join(root, 'engine-state'), { recursive: true })
      await writeJson(gbifNamesFile, Object.fromEntries(Object.entries(gbifNames).sort()))
    }
    return w
  }, new Map() as Wanted)
  const onSource: Record<string, string> = {}

  /** Translate, review, and re-translate once with the reviewer's notes if it scores low. */
  async function translate(input: Parameters<typeof processPage>[1]) {
    let page = await processPage(llm, input)
    if (page.kind === 'skip') return { page, score: 1 }
    const pairs = (p: ProcessedPage) => (p.kind === 'guide' ? [{ en: input.outline, vi: p.guide?.viBody ?? '' }] : p.sections)
    let { score, notes } = await reviewTranslation(llm, pairs(page))
    if (gate(score, false) === 'retry') {
      page = await processPage(llm, { ...input, notes })
      if (page.kind === 'skip') return { page, score: 1 }
      score = (await reviewTranslation(llm, pairs(page))).score
    }
    return { page, score }
  }

  /** Write the processed page; returns entity ids (`kind/id`) or null when it isn't usable content. */
  async function apply(source: SourceId, url: string, page: ProcessedPage, score: number, images: PageImage[], bytes: Deps['fetcher']['bytes']): Promise<string[] | null> {
    const now = today()
    const sourcePhotos = (names: string[], existing: Photo[], max?: number) =>
      storeSourcePhotos(source, sourceNames[source]?.name ?? source, url, pickSourcePhotos(images, url, names, max, page.kind === 'guide' ? 'guide' : 'subject'), { bytes, media: deps.media }, existing)
    const log = (kind: ChangelogEntry['kind'], id: string, existed: boolean) => {
      const e: ChangelogEntry = { date: now, kind, id, source, action: existed ? 'updated' : 'new' }
      report.changed.push(e)
      return e
    }
    if (page.kind === 'species') {
      const taxon = await gbifMatch(page.scientificName!, http, gbifCache)
      if (!taxon) return null
      const existing = await s.read<z.infer<typeof SpeciesSchema>>('species', slugify(taxon.canonicalName))
      if (outranked(existing.entity?.sections, source, url, page.sections.length)) return [`species/${slugify(taxon.canonicalName)}`]
      const item = mergeSpecies(existing, page, { source, url, taxon, now, takenSlugs: await s.taken('species', existing.vi?.slug), quality: combineQuality(existing.vi?.quality, source, score) })
      item.entity.photos = mergePhotos(item.entity.photos, source, url, await sourcePhotos([taxon.canonicalName, page.scientificName!, ...page.enCommonNames], item.entity.photos))
      if (!item.entity.photos.length) item.entity.photos = await soft('commons photos', () => findPhotos(taxon.canonicalName, http), [])
      if (!item.entity.videos.length) item.entity.videos = await soft('videos', () => findVideos([taxon.canonicalName, ...page.enCommonNames], llm, http), [])
      const known = new Set(await s.ids('places'))
      for (const p of ensurePlaces(page.places, known)) await s.write('places', PlaceSchema, p)
      await s.write('species', SpeciesSchema, item)
      await appendChangelog(contentRoot, [log('species', item.entity.id, !!existing.entity)])
      return [`species/${item.entity.id}`]
    }
    if (page.kind === 'plant') {
      if (!page.scientificName) return null
      const existing = await s.read<z.infer<typeof PlantSchema>>('plants', slugify(page.scientificName))
      if (outranked(existing.entity?.sections, source, url, page.sections.length)) return [`plants/${slugify(page.scientificName)}`]
      const item = mergePlant(existing, page, { source, url, now, takenSlugs: await s.taken('plants', existing.vi?.slug), quality: combineQuality(existing.vi?.quality, source, score) })
      if (!item) return null
      item.entity.photos = mergePhotos(item.entity.photos, source, url, await sourcePhotos([item.entity.scientificName, ...page.enCommonNames], item.entity.photos))
      if (!item.entity.photos.length) item.entity.photos = await soft('commons photos', () => findPhotos(item.entity.scientificName, http), [])
      await s.write('plants', PlantSchema, item)
      await appendChangelog(contentRoot, [log('plant', item.entity.id, !!existing.entity)])
      return [`plants/${item.entity.id}`]
    }
    if (page.kind === 'guide') {
      const existing = await s.read<z.infer<typeof GuideSchema>>('guides', guideId(source, url))
      const item = writeGuide(page, { source, url, now, existing, takenSlugs: await s.taken('guides', existing.vi?.slug), quality: combineQuality(undefined, source, score) })
      if (!item) return null
      item.entity.photos = await sourcePhotos([], item.entity.photos, 6) // more pictures to place through the text
      await s.write('guides', GuideSchema, item)
      await appendChangelog(contentRoot, [log('guide', item.entity.id, !!existing.entity)])
      return [`guides/${item.entity.id}`]
    }
    return null
  }

  let llmFailures = 0
  // Least-covered sources first, each capped at a fair share of the time left (unused time rolls forward),
  // so one large backlog (Seriously Fish) can't starve the others; the most-covered source runs last and gets the rest.
  const covered = new Map<SourceId, number>()
  for (const id of opts.sources ?? SOURCE_IDS) covered.set(id, Object.keys(await loadState(root, id)).length)
  const order = [...covered.keys()].sort((a, b) => covered.get(a)! - covered.get(b)!)
  sources: for (const [i, id] of order.entries()) {
    const src = sourceById(id)
    const until = deadline === Infinity ? Infinity : deps.now().getTime() + (deadline - deps.now().getTime()) / (order.length - i)
    const counts: Counts = { discovered: 0, fetched: 0, processed: 0, skipped: 0, blocked: 0, errors: 0 }
    report.perSource[id] = counts
    const blockedAt = await sourceBlockedSince(root, id)
    if (blockedAt && !opts.retryBlocked && deps.now().getTime() - new Date(blockedAt).getTime() < BLOCK_MEMORY_MS) {
      report.needsHuman.push(id) // still waiting for the owner to pass the browser check in the engine's Chrome profile
      continue
    }
    const block = async () => { counts.blocked++; report.needsHuman.push(id); await setSourceBlock(root, id, deps.now().toISOString()) }
    let last = -Infinity
    /** ≥ delayMs between any two requests to this source (pages, sitemaps, images); time spent translating counts. */
    const polite = <A extends unknown[], R>(f: (...a: A) => Promise<R>) => async (...a: A) => {
      await deps.sleep(Math.max(0, last + src.delayMs - deps.now().getTime()))
      try { return await f(...a) } finally { last = deps.now().getTime() }
    }
    const get = polite((u: string) => deps.fetcher.get(u))
    const links = polite((u: string, scope?: string) => deps.fetcher.links(u, scope))
    const bytes = polite((u: string, referer: string) => deps.fetcher.bytes(u, referer))
    let found
    try {
      found = await discover(src, polite((u: string) => deps.fetcher.text(u)), links)
    } catch (e) {
      if (e instanceof ChallengeError) { await block(); continue }
      counts.errors++
      report.errors.push(`${id}: discovery failed: ${(e as Error).message}`)
      continue
    }
    counts.discovered = found.length
    found = wantedFirst(found, wanted)
    for (const f of found) { const w = wantedIn(f.url, wanted); if (w && !onSource[w]) onSource[w] = f.url }
    await setSourceBlock(root, id, undefined)
    const state = await loadState(root, id)
    // `force` (with `only`): re-translate the matching pages now, even if unchanged since the last run (e.g. after a prompt fix).
    const forced = (url: string) => !!opts.force && !!opts.only?.test(url)
    const todo = found.filter(f => (!opts.only || opts.only.test(f.url)) && (forced(f.url) || needsFetch(state[f.url], f.lastmod, deps.now()))).slice(0, opts.limit ?? Infinity)

    for (const { url, lastmod } of todo) {
      if (deps.now().getTime() > until) break
      const prev = state[url]
      const base = { ...(lastmod ? { lastmod } : {}), entityIds: prev?.entityIds ?? [], updatedAt: deps.now().toISOString() }
      const save = async (next: UrlState) => { state[url] = next; await saveState(root, id, state) }
      counts.fetched++
      try {
        const r = await get(url)
        const o = htmlToOutline(r.html, src.contentSelector)
        if (isChallenge(o.title, o.outline)) {
          await block()
          await save({ ...base, ...keep(prev), status: 'blocked', attempts: 0, error: `challenge: ${o.title}` })
          break // never retry around a challenge; the owner clears it in the engine's Chrome profile
        }
        if (r.status >= 400) throw new Error(`HTTP ${r.status}`)
        const hash = snapshotHash(o)
        if (hash !== prev?.hash) await writeSnapshot(root, id, url, o, deps.now())
        if (prev?.processedHash === hash && !forced(url)) {
          counts.skipped++
          const { error: _stale, ...rest } = prev
          await save({ ...rest, ...base, hash, status: prev.entityIds.length ? 'processed' : 'skipped', attempts: 0 })
          continue
        }
        const { page, score } = await translate({ source: id, url, title: o.title, outline: o.outline, glossary })
        const entityIds = await apply(id, url, page, score, o.images, bytes)
        if (entityIds) counts.processed++
        else counts.skipped++
        await save({ ...base, hash, processedHash: hash, status: entityIds ? 'processed' : 'skipped', entityIds: entityIds ?? [], attempts: 0 })
        llmFailures = 0
      } catch (e) {
        counts.errors++
        report.errors.push(`${url}: ${(e as Error).message}`)
        // The browser itself is gone (crash, closed window): every later page would fail the same way, and this one isn't at fault.
        if (BROWSER_GONE.test((e as Error).message)) {
          report.errors.push('stopping: the browser closed — the next cycle starts a fresh one')
          break sources
        }
        await save({ ...base, ...keep(prev), status: 'error', attempts: (prev?.status === 'error' ? prev.attempts : 0) + 1, error: (e as Error).message.slice(0, 300) })
        if (e instanceof LlmError && ++llmFailures >= MAX_LLM_FAILURES) {
          report.errors.push(`stopping: ${MAX_LLM_FAILURES} consecutive Claude failures (${(e as Error).message.slice(0, 120)})`)
          break sources
        }
      }
    }
  }
  await soft('wanted report', () => writeJson(join(root, 'engine-state/_wanted.json'), Object.fromEntries([...wanted].map(([slug, w]) => [slug, { name: w.name, mentionedIn: w.mentionedIn.slice(0, 5), mentions: w.mentionedIn.length, ...(onSource[slug] ? { onSource: onSource[slug] } : {}) }]))), undefined)
  return report
}
