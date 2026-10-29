import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { z } from 'zod'
import { isAllowedLicence } from './licence'
import { BreedSchema, ChangelogSchema, EquipmentSchema, GallerySchema, GlossarySchema, GuideSchema, MarketSchema, PlaceSchema, PlantSchema, ProductSchema, SeriesSchema, SourcesSchema, SpeciesSchema, TranslationSchema } from './schemas'
import type { BreedEntity, ChangelogEntry, DataCardField, EquipmentGuide, GlossaryEntity, GuideEntity, Lang, Market, Photo, PlaceEntity, PlantEntity, ProductEntity, Section, Series, SourceId, SourceInfo, SpeciesEntity, Translation } from './types'

export const QUALITY_THRESHOLD = 0.75
/** The market (prices, shops) each site language serves. */
export const MARKET: Record<Lang, string> = { vi: 'vn' }

export type LoadOptions = { root: string; lang: Lang; publicBuild: boolean }
export type Localized<E> = E & { t: Translation }
export type Content = {
  species: Localized<SpeciesEntity>[]
  plants: Localized<PlantEntity>[]
  guides: Localized<GuideEntity>[]
  glossary: Localized<GlossaryEntity>[]
  places: Localized<PlaceEntity>[]
  equipment: EquipmentGuide[]
  /** Photo galleries by species id (content/gallery), open licences only. */
  galleries: Record<string, Photo[]>
  /** Products with a page in this language, with their prices in the language's market when known. */
  products: (Localized<ProductEntity> & { market?: Market })[]
  /** Man-made fish (hybrids, lines, colour forms): pages beside the species, at /<lang>/ca/<slug>/. */
  breeds: Localized<BreedEntity>[]
  /** YouTube playlists turned into guide series (content/series/*.json); only those with a published guide. */
  series: Series[]
  sources: Partial<Record<SourceId, SourceInfo>>
  changelog: ChangelogEntry[]
}

async function readJson<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
  try {
    return schema.parse(JSON.parse(await readFile(path, 'utf8')))
  } catch (e) {
    throw new Error(`Invalid content file ${path}: ${(e as Error).message}`)
  }
}

async function exists(path: string): Promise<boolean> {
  return readFile(path).then(() => true, () => false)
}

async function loadKind<S extends z.ZodType>(root: string, dir: string, schema: S, lang: Lang): Promise<Localized<z.infer<S>>[]> {
  const base = join(root, dir)
  const ids = await readdir(base).catch(() => [] as string[])
  const out: Localized<z.infer<S>>[] = []
  for (const id of ids.sort()) {
    const tPath = join(base, id, `${lang}.json`)
    if (!(await exists(tPath))) continue
    const entity = await readJson(join(base, id, 'entity.json'), schema)
    const t = await readJson(tPath, TranslationSchema)
    out.push({ ...(entity as object), t } as Localized<z.infer<S>>)
  }
  return out
}

export async function loadAll(opts: LoadOptions): Promise<Content> {
  const { root, lang, publicBuild } = opts
  const sources = await readJson(join(root, 'sources.json'), SourcesSchema)
  const allowed = (s: SourceId) => !publicBuild || sources[s]?.publish === true
  const cleanSections = (xs: Section[]) => xs.filter(s => allowed(s.source))
  /** Photos copied from a source follow that source's publish gate; others need an open licence. */
  const cleanPhotos = (xs: Photo[]) => xs.filter(p => (p.source ? allowed(p.source) : isAllowedLicence(p.licence)))
  const cleanCard = (card: SpeciesEntity['dataCard']): SpeciesEntity['dataCard'] =>
    Object.fromEntries(
      Object.entries(card)
        .map(([field, values]) => [field, (values ?? []).filter(v => allowed(v.source))] as const)
        .filter(([, values]) => values.length > 0),
    ) as Partial<Record<DataCardField, SpeciesEntity['dataCard'][DataCardField]>>

  /** Page quality counts only the sources this build may show. */
  const cleanQuality = <E extends { t: Translation }>(x: E): E => {
    const by = Object.entries(x.t.quality.bySource ?? {}).filter(([s]) => allowed(s as SourceId)).map(([, v]) => v as number)
    if (!by.length) return x
    const score = Math.min(...by)
    return { ...x, t: { ...x.t, quality: { ...x.t.quality, score, indexable: score >= QUALITY_THRESHOLD } } }
  }

  const species = (await loadKind(root, 'species', SpeciesSchema, lang))
    .map(s => cleanQuality({ ...s, sections: cleanSections(s.sections), photos: cleanPhotos(s.photos), dataCard: cleanCard(s.dataCard) }))
    .filter(s => s.sections.length > 0)
  const plants = (await loadKind(root, 'plants', PlantSchema, lang))
    .map(p => cleanQuality({ ...p, sections: cleanSections(p.sections), photos: cleanPhotos(p.photos) }))
    .filter(p => p.sections.length > 0)
  const guides = (await loadKind(root, 'guides', GuideSchema, lang))
    .filter(g => allowed(g.source))
    .map(g => ({ ...g, photos: cleanPhotos(g.photos) }))

  const changelogPath = join(root, 'changelog.json')
  const changelog = (await exists(changelogPath) ? await readJson(changelogPath, ChangelogSchema) : []).filter(e => allowed(e.source))

  const equipDir = join(root, 'equipment')
  const equipment: EquipmentGuide[] = []
  for (const f of (await readdir(equipDir).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort()) {
    const e = await readJson(join(equipDir, f), EquipmentSchema)
    const ok = (p: Photo) => cleanPhotos([p]).length > 0
    equipment.push({ ...e, types: e.types.map(t => (t.photo && !ok(t.photo) ? { ...t, photo: undefined } : t)) })
  }

  const series: Series[] = []
  for (const f of (await readdir(join(root, 'series')).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort()) {
    const x = await readJson(join(root, 'series', f), SeriesSchema)
    if (guides.some(g => g.video?.series?.id === x.id)) series.push(x)
  }

  const galleries: Record<string, Photo[]> = {}
  for (const f of (await readdir(join(root, 'gallery')).catch(() => [] as string[])).filter(f => f.endsWith('.json'))) {
    const g = await readJson(join(root, 'gallery', f), GallerySchema)
    const photos = cleanPhotos(g.photos)
    if (photos.length) galleries[g.id] = photos
  }

  // Breeds share the species' address space: a clash would silently drop one page, so it stops the build.
  const breeds = (await loadKind(root, 'breeds', BreedSchema, lang)).map(b => ({ ...b, photos: cleanPhotos(b.photos) }))
  const speciesSlugs = new Set(species.map(s => s.t.slug))
  const breedSlugs = new Set<string>()
  for (const b of breeds) {
    if (speciesSlugs.has(b.t.slug) || breedSlugs.has(b.t.slug)) throw new Error(`breed ${b.id}: slug "${b.t.slug}" is already a ${speciesSlugs.has(b.t.slug) ? 'species' : 'breed'} page`)
    breedSlugs.add(b.t.slug)
  }

  const products: Content['products'] = []
  for (const p of await loadKind(root, 'products', ProductSchema, lang)) {
    const file = join(root, 'products', p.id, `${MARKET[lang]}.json`)
    products.push(await exists(file) ? { ...p, market: await readJson(file, MarketSchema) } : p)
  }

  return {
    species, plants, guides, changelog, equipment, series, galleries, products, breeds,
    glossary: await loadKind(root, 'glossary', GlossarySchema, lang),
    places: await loadKind(root, 'places', PlaceSchema, lang),
    sources,
  }
}
