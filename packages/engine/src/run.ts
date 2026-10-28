import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GuideSchema, PlaceSchema, PlantSchema, SOURCE_IDS, SpeciesSchema, TranslationSchema, slugify, type ChangelogEntry, type SourceId, type Translation } from '@aq/schema'
import type { z } from 'zod'
import { appendChangelog } from './changelog'
import type { Llm } from './claude'
import { discover } from './discover'
import type { ChromeFetcher } from './fetch'
import { gbifMatch, type Taxon } from './gbif'
import { ensurePlaces, guideId, mergePlant, mergeSpecies, writeGuide } from './merge'
import { htmlToOutline, isChallenge } from './outline'
import { findPhotos } from './photos'
import { processPage, type ProcessedPage } from './process'
import { QUALITY_THRESHOLD, gate, reviewTranslation } from './quality'
import { snapshotHash, writeSnapshot } from './snapshot'
import { sourceById } from './sources'
import { loadState, needsFetch, saveState, type UrlState } from './state'
import { findVideos } from './videos'

export type Deps = {
  fetcher: Pick<ChromeFetcher, 'get' | 'text' | 'links'>
  llm: Llm
  http: (url: string) => Promise<unknown>
  now: () => Date
  root: string
  sleep: (ms: number) => Promise<void>
}
type Counts = { discovered: number; fetched: number; processed: number; skipped: number; blocked: number; errors: number }
export type RunReport = { perSource: Partial<Record<SourceId, Counts>>; needsHuman: SourceId[]; changed: ChangelogEntry[]; errors: string[] }

type Kind = 'species' | 'plants' | 'guides' | 'places' | 'glossary'
const readJson = async <T>(path: string): Promise<T | undefined> => readFile(path, 'utf8').then(s => JSON.parse(s) as T, () => undefined)
const writeJson = async (path: string, data: unknown) => writeFile(path, `${JSON.stringify(data, null, 2)}\n`)

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

/** Per-source translation scores; the page is indexable only if every source's translation passed. */
function combineQuality(prev: Translation['quality'] | undefined, source: SourceId, score: number): Translation['quality'] {
  const bySource = { ...prev?.bySource, [source]: score }
  const min = Math.min(...Object.values(bySource))
  return { score: min, indexable: min >= QUALITY_THRESHOLD, bySource }
}

export async function runEngine(deps: Deps, opts: { sources?: SourceId[]; limit?: number; maxMinutes?: number } = {}): Promise<RunReport> {
  const { llm, http, root } = deps
  const contentRoot = join(root, 'content')
  const s = store(contentRoot)
  const glossary = await glossaryTerms(s)
  const gbifCache: Record<string, Taxon | null> = {}
  const deadline = opts.maxMinutes ? deps.now().getTime() + opts.maxMinutes * 60_000 : Infinity
  const report: RunReport = { perSource: {}, needsHuman: [], changed: [], errors: [] }
  const today = () => deps.now().toISOString().slice(0, 10)

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
  async function apply(source: SourceId, url: string, page: ProcessedPage, score: number): Promise<string[] | null> {
    const now = today()
    const log = (kind: ChangelogEntry['kind'], id: string, existed: boolean) => {
      const e: ChangelogEntry = { date: now, kind, id, source, action: existed ? 'updated' : 'new' }
      report.changed.push(e)
      return e
    }
    if (page.kind === 'species') {
      const taxon = await gbifMatch(page.scientificName!, http, gbifCache)
      if (!taxon) return null
      const existing = await s.read<z.infer<typeof SpeciesSchema>>('species', slugify(taxon.canonicalName))
      const item = mergeSpecies(existing, page, { source, url, taxon, now, takenSlugs: await s.taken('species', existing.vi?.slug), quality: combineQuality(existing.vi?.quality, source, score) })
      if (!item.entity.photos.length) item.entity.photos = await findPhotos(taxon.canonicalName, http)
      if (!item.entity.videos.length) item.entity.videos = await findVideos([taxon.canonicalName, ...page.enCommonNames], llm, http)
      const known = new Set(await s.ids('places'))
      for (const p of ensurePlaces(page.places, known)) await s.write('places', PlaceSchema, p)
      await s.write('species', SpeciesSchema, item)
      await appendChangelog(contentRoot, [log('species', item.entity.id, !!existing.entity)])
      return [`species/${item.entity.id}`]
    }
    if (page.kind === 'plant') {
      if (!page.scientificName) return null
      const existing = await s.read<z.infer<typeof PlantSchema>>('plants', slugify(page.scientificName))
      const item = mergePlant(existing, page, { source, url, now, takenSlugs: await s.taken('plants', existing.vi?.slug), quality: combineQuality(existing.vi?.quality, source, score) })
      if (!item) return null
      if (!item.entity.photos.length) item.entity.photos = await findPhotos(item.entity.scientificName, http)
      await s.write('plants', PlantSchema, item)
      await appendChangelog(contentRoot, [log('plant', item.entity.id, !!existing.entity)])
      return [`plants/${item.entity.id}`]
    }
    if (page.kind === 'guide') {
      const existing = await s.read<z.infer<typeof GuideSchema>>('guides', guideId(source, url))
      const item = writeGuide(page, { source, url, now, existing, takenSlugs: await s.taken('guides', existing.vi?.slug), quality: combineQuality(undefined, source, score) })
      if (!item) return null
      await s.write('guides', GuideSchema, item)
      await appendChangelog(contentRoot, [log('guide', item.entity.id, !!existing.entity)])
      return [`guides/${item.entity.id}`]
    }
    return null
  }

  for (const id of opts.sources ?? [...SOURCE_IDS]) {
    const src = sourceById(id)
    const counts: Counts = { discovered: 0, fetched: 0, processed: 0, skipped: 0, blocked: 0, errors: 0 }
    report.perSource[id] = counts
    const polite = <A extends unknown[], R>(f: (...a: A) => Promise<R>) => async (...a: A) => { await deps.sleep(src.delayMs); return f(...a) }
    const get = polite((u: string) => deps.fetcher.get(u))
    let found
    try {
      found = await discover(src, polite((u: string) => deps.fetcher.text(u)), polite((u: string) => deps.fetcher.links(u)))
    } catch (e) {
      counts.errors++
      report.errors.push(`${id}: discovery failed: ${(e as Error).message}`)
      continue
    }
    counts.discovered = found.length
    const state = await loadState(root, id)
    const todo = found.filter(f => needsFetch(state[f.url], f.lastmod, deps.now())).slice(0, opts.limit ?? Infinity)

    for (const { url, lastmod } of todo) {
      if (deps.now().getTime() > deadline) break
      const prev = state[url]
      const base = { ...(lastmod ? { lastmod } : {}), entityIds: prev?.entityIds ?? [], updatedAt: deps.now().toISOString() }
      const save = async (next: UrlState) => { state[url] = next; await saveState(root, id, state) }
      counts.fetched++
      try {
        const r = await get(url)
        const o = htmlToOutline(r.html, src.contentSelector)
        if (isChallenge(o.title, o.outline)) {
          counts.blocked++
          report.needsHuman.push(id)
          await save({ ...base, ...(prev?.hash ? { hash: prev.hash } : {}), status: 'blocked', attempts: 0, error: `challenge: ${o.title}` })
          break // never retry around a challenge; the owner clears it in the engine's Chrome profile
        }
        if (r.status >= 400) throw new Error(`HTTP ${r.status}`)
        const hash = snapshotHash(o)
        if (hash !== prev?.hash) await writeSnapshot(root, id, url, o, deps.now())
        if (prev?.processedHash === hash) {
          counts.skipped++
          await save({ ...prev, ...base, hash, status: prev.status === 'skipped' ? 'skipped' : 'processed', attempts: 0 })
          continue
        }
        const { page, score } = await translate({ source: id, url, title: o.title, outline: o.outline, glossary })
        const entityIds = await apply(id, url, page, score)
        if (entityIds) counts.processed++
        else counts.skipped++
        await save({ ...base, hash, processedHash: hash, status: entityIds ? 'processed' : 'skipped', entityIds: entityIds ?? [], attempts: 0 })
      } catch (e) {
        counts.errors++
        report.errors.push(`${url}: ${(e as Error).message}`)
        await save({ ...base, ...(prev?.hash ? { hash: prev.hash } : {}), ...(prev?.processedHash ? { processedHash: prev.processedHash } : {}), status: 'error', attempts: (prev?.status === 'error' ? prev.attempts : 0) + 1, error: (e as Error).message.slice(0, 300) })
      }
    }
  }
  return report
}
