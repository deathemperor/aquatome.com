import { SECTION_ORDER, slugify, type GuideEntity, type PlaceEntity, type PlantEntity, type Section, type SourceId, type SpeciesEntity, type Translation } from '@aq/schema'
import type { Taxon } from './gbif'
import type { ProcessedPage } from './process'

type Ctx = { source: SourceId; url: string; now: string; takenSlugs: Set<string>; quality?: Translation['quality'] }
type Item<E> = { entity: E; vi: Translation }
type PagePlace = ProcessedPage['places'][number]

export const placeId = (name: string) => slugify(name)
/** A region must be one proper name (river, lake, province), not a phrase like "mainly western" or "Kentucky (introduced)". */
const VAGUE = /\b(north|south|east|west|northern|southern|eastern|western|central|mainly|except|introduced|around|and|parts?|possibly|probably)\b|[()]/i
export const usableRegion = (r?: string): r is string => !!r && !VAGUE.test(r) && r.trim().split(/\s+/).length <= 4
export const guideId = (source: SourceId, url: string) => `${source}-${slugify(new URL(url).pathname)}`
const DEFAULT_QUALITY = { score: 1, indexable: true }
const uniq = <T>(xs: T[]) => [...new Set(xs)]
const order = (k: string) => SECTION_ORDER.indexOf(k as (typeof SECTION_ORDER)[number])

/** Slug from the name, cut at a word boundary to ≤ 60 chars. */
const shortSlug = (name: string) => {
  const s = slugify(name)
  return s.length <= 60 ? s : s.slice(0, 61).replace(/-[^-]*$/, '')
}

function pickSlug(name: string, suffix: string, taken: Set<string>): string {
  const base = shortSlug(name)
  for (const s of [base, `${base}-${slugify(suffix)}`]) if (!taken.has(s)) return s
  let i = 2
  while (taken.has(`${base}-${slugify(suffix)}-${i}`)) i++
  return `${base}-${slugify(suffix)}-${i}`
}

/** Replace this source's sections (entity: English, vi: translation); keep other sources'. */
function mergeSections(prev: Section[], prevVi: Record<string, string>, page: ProcessedPage, ctx: Ctx) {
  const kept = prev.filter(s => s.source !== ctx.source)
  const added: Section[] = page.sections.map(s => ({ key: s.key, source: ctx.source, sourceUrl: ctx.url, html: s.en }))
  const sections = [...kept, ...added].map((s, i) => [s, i] as const).sort((a, b) => order(a[0].key) - order(b[0].key) || a[1] - b[1]).map(([s]) => s)
  const vi = Object.fromEntries(Object.entries(prevVi).filter(([k]) => !k.endsWith(`:${ctx.source}`)))
  for (const s of page.sections) vi[`${s.key}:${ctx.source}`] = s.vi
  return { sections, vi }
}

function translation(prev: Translation | undefined, page: ProcessedPage, ctx: Ctx, fallbackName: string, suffix: string, sections: Record<string, string>): Translation {
  const name = (prev && ctx.source !== 'seriouslyfish' ? prev.name : page.viName) || prev?.name || fallbackName
  const altNames = uniq([...(prev?.altNames ?? []), ...page.viAltNames, ...page.enCommonNames]).filter(n => n !== name)
  return { slug: prev?.slug ?? pickSlug(name, suffix, ctx.takenSlugs), name, altNames, sections, quality: ctx.quality ?? prev?.quality ?? DEFAULT_QUALITY }
}

export function mergeSpecies(existing: { entity?: SpeciesEntity; vi?: Translation }, page: ProcessedPage, ctx: Ctx & { taxon: Taxon }): Item<SpeciesEntity> {
  const { taxon } = ctx
  const prev = existing.entity
  const genus = taxon.genus ?? taxon.canonicalName.split(' ')[0] ?? ''
  const lNumber = prev?.lNumber ?? page.lNumber
  const { sections, vi } = mergeSections(prev?.sections ?? [], existing.vi?.sections ?? {}, page, ctx)
  const dataCard: SpeciesEntity['dataCard'] = {}
  const fields = uniq([...Object.keys(prev?.dataCard ?? {}), ...Object.keys(page.dataCard)]) as (keyof SpeciesEntity['dataCard'])[]
  for (const f of fields) {
    const values = [...(prev?.dataCard[f] ?? []).filter(v => v.source !== ctx.source), ...(page.dataCard[f] !== undefined ? [{ source: ctx.source, value: page.dataCard[f]! }] : [])]
    if (values.length) dataCard[f] = values
  }
  const entity: SpeciesEntity = {
    id: slugify(taxon.canonicalName), scientificName: taxon.canonicalName, order: taxon.order ?? '', family: taxon.family ?? '', genus,
    group: prev?.group ?? page.group ?? 'other', ...(lNumber ? { lNumber } : {}),
    places: uniq([...(prev?.places ?? []), ...page.places.flatMap(p => [p.continent, p.country, usableRegion(p.region) ? p.region : undefined].filter((x): x is string => !!x).map(placeId))]),
    dataCard, sections, photos: prev?.photos ?? [], videos: prev?.videos ?? [],
    productSlots: prev?.productSlots.length ? prev.productSlots : page.productSlots, updatedAt: ctx.now,
  }
  return { entity, vi: translation(existing.vi, page, ctx, `Cá ${taxon.canonicalName}`, genus, vi) }
}

export function mergePlant(existing: { entity?: PlantEntity; vi?: Translation }, page: ProcessedPage, ctx: Ctx): Item<PlantEntity> | null {
  if (!page.plant || !page.scientificName) return null
  const prev = existing.entity
  const { sections, vi } = mergeSections(prev?.sections ?? [], existing.vi?.sections ?? {}, page, ctx)
  const entity: PlantEntity = {
    id: slugify(page.scientificName), scientificName: page.scientificName, ...page.plant,
    sections, photos: prev?.photos ?? [], productSlots: prev?.productSlots.length ? prev.productSlots : page.productSlots, updatedAt: ctx.now,
  }
  return { entity, vi: translation(existing.vi, page, ctx, page.scientificName, page.scientificName.split(' ')[0] ?? '', vi) }
}

/** Guides are single-source: the English text stays in the sources/ snapshot; the entity carries provenance. */
export function writeGuide(page: ProcessedPage, ctx: Ctx & { existing?: { entity?: GuideEntity; vi?: Translation } }): Item<GuideEntity> | null {
  if (!page.guide) return null
  const u = new URL(ctx.url)
  const prev = ctx.existing
  const entity: GuideEntity = {
    id: guideId(ctx.source, ctx.url), kind: page.guide.kind, source: ctx.source, sourceUrl: `${u.origin}${u.pathname}`, html: '',
    photos: prev?.entity?.photos ?? [], mentions: prev?.entity?.mentions ?? [], updatedAt: ctx.now,
  }
  const name = page.guide.viTitle
  return { entity, vi: { slug: prev?.vi?.slug ?? pickSlug(name, ctx.source, ctx.takenSlugs), name, altNames: [], sections: {}, body: page.guide.viBody, quality: ctx.quality ?? DEFAULT_QUALITY } }
}

/** Places the page mentions that don't exist yet, parents first. Names stay English until a translator pass names them. */
export function ensurePlaces(places: PagePlace[], known: Set<string>): Item<PlaceEntity>[] {
  const out: Item<PlaceEntity>[] = []
  const add = (name: string, kind: PlaceEntity['kind'], parent?: string) => {
    const id = placeId(name)
    if (known.has(id)) return id
    known.add(id)
    out.push({ entity: { id, kind, ...(parent ? { parent } : {}) }, vi: { slug: id, name, altNames: [], sections: {}, quality: DEFAULT_QUALITY } })
    return id
  }
  for (const p of places) {
    let parent = add(p.continent, 'continent')
    if (p.country) parent = add(p.country, 'country', parent)
    if (usableRegion(p.region)) add(p.region, /\b(rio|river|río)\b/i.test(p.region) ? 'river' : 'region', parent)
  }
  return out
}
