import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { z } from 'zod'
import { tankIsVolume } from './card-facts'
import { setsCookies } from './thumb'
import { judgeQuality, speciesDepth } from './depth'
import { isAllowedLicence } from './licence'
import { isVietnamese, markVietnameseNames } from './text'
import { BreedSchema, CaptionsSchema, PictureHashesSchema, ChangelogSchema, EquipmentSchema, GallerySchema, GlossarySchema, GuideSchema, MarketSchema, mayPublish, PlaceSchema, PlantSchema, ProductSchema, SeriesSchema, SourcesSchema, SpeciesSchema, TranslationSchema } from './schemas'
import type { PictureHashes } from './pictures'
import type { BreedEntity, ChangelogEntry, DataCardField, EquipmentGuide, GlossaryEntity, GuideEntity, Lang, Market, Photo, PlaceEntity, PlantEntity, ProductEntity, Section, Series, SourceId, SourceInfo, SpeciesEntity, Translation } from './types'

export const QUALITY_THRESHOLD = 0.75
/** The market (prices, shops) each site language serves. */
export const MARKET: Record<Lang, string> = { vi: 'vn', id: 'id', th: 'th' }

export type LoadOptions = { root: string; lang: Lang; publicBuild: boolean }
export type Localized<E> = E & { t: Translation }
export type Content = {
  species: Localized<SpeciesEntity>[]
  plants: Localized<PlantEntity>[]
  guides: Localized<GuideEntity>[]
  glossary: Localized<GlossaryEntity>[]
  places: Localized<PlaceEntity>[]
  equipment: EquipmentGuide[]
  /** Photo galleries by species id (content/gallery): open licences, or a source's permission. */
  galleries: Record<string, Photo[]>
  /** Products with a page in this language, with their prices in the language's market when known. */
  products: (Localized<ProductEntity> & { market?: Market })[]
  /** Man-made fish (hybrids, lines, colour forms): pages beside the species, at /<lang>/ca/<slug>/. */
  breeds: Localized<BreedEntity>[]
  /** YouTube playlists turned into guide series (content/series/*.json); only those with a published guide. */
  series: Series[]
  sources: Partial<Record<SourceId, SourceInfo>>
  changelog: ChangelogEntry[]
  /** Each photo's image hash by its address (content/picture-hashes.json): a page never shows one picture twice (pictures.ts). */
  pictureHashes: PictureHashes
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

/** Indonesian and Thai text with the Vietnamese names in it marked as Vietnamese (text.ts markVietnameseNames). */
const marked = (lang: Lang, t: Translation): Translation => lang === 'vi' ? t : {
  ...t,
  sections: Object.fromEntries(Object.entries(t.sections).map(([k, html]) => [k, markVietnameseNames(html)])),
  ...(t.body !== undefined ? { body: markVietnameseNames(t.body) } : {}),
  ...(t.definition !== undefined ? { definition: markVietnameseNames(t.definition) } : {}),
}

async function loadKind<S extends z.ZodType>(root: string, dir: string, schema: S, lang: Lang): Promise<Localized<z.infer<S>>[]> {
  const base = join(root, dir)
  const ids = await readdir(base).catch(() => [] as string[])
  const out: Localized<z.infer<S>>[] = []
  for (const id of ids.sort()) {
    const tPath = join(base, id, `${lang}.json`)
    // A translation left behind with no entity (an engine run named it while a merged change removed the page) is no page.
    if (!(await exists(tPath)) || !(await exists(join(base, id, 'entity.json')))) continue
    const entity = await readJson(join(base, id, 'entity.json'), schema)
    const t = marked(lang, await readJson(tPath, TranslationSchema))
    out.push({ ...(entity as object), t } as Localized<z.infer<S>>)
  }
  return out
}

export async function loadAll(opts: LoadOptions): Promise<Content> {
  const { root, lang, publicBuild } = opts
  const sources = await readJson(join(root, 'sources.json'), SourcesSchema)
  // Text, and everything written from it (sections, guides, card values, quality, changelog); photos have their own gate.
  const allowed = (s: SourceId) => !publicBuild || mayPublish(sources[s], 'text')
  const photoAllowed = (s: SourceId) => !publicBuild || mayPublish(sources[s], 'photos')
  const cleanSections = (xs: Section[]) => xs.filter(s => allowed(s.source))
  // Captions written in Vietnamese (galleries, breed photos) are shown in this language from content/captions/<lang>.json;
  // one not translated yet is left off, so the photo's alt text falls back to the page's name.
  const captionsFile = join(root, 'captions', `${lang}.json`)
  const captions = lang !== 'vi' && (await exists(captionsFile)) ? await readJson(captionsFile, CaptionsSchema) : {}
  const caption = <P extends Photo>(p: P): P => {
    if (lang === 'vi' || !p.caption || !isVietnamese(p.caption)) return p
    const { caption: vi, ...rest } = p
    return (captions[vi] ? { ...rest, caption: captions[vi] } : rest) as P
  }
  /** Photos copied from a source follow that source's publish gate; others need an open licence. */
  // A public build shows no photo from a host that sets third-party cookies: it waits for `pnpm engine mirror-photos`
  // (2026-10-31: 487 Commons photos put on pages straight from Wikimedia failed best practices on every live page).
  const cleanPhotos = <P extends Photo>(xs: P[]): P[] => xs.filter(p => (p.source ? photoAllowed(p.source) : isAllowedLicence(p.licence)) && !(publicBuild && setsCookies(p.url))).map(caption)
  /** The card's values from sources this build may show, without a tank length that is that source's tank volume (card-facts). */
  const cleanCard = (card: SpeciesEntity['dataCard'], sections: Section[]): SpeciesEntity['dataCard'] =>
    Object.fromEntries(
      Object.entries(card)
        .map(([field, values]) => [field, (values ?? []).filter(v => allowed(v.source)
          && !(field === 'tankCm' && typeof v.value === 'number' && tankIsVolume(sections.filter(s => s.source === v.source).map(s => s.html).join('\n'), v.value)))] as const)
        .filter(([, values]) => values.length > 0),
    ) as Partial<Record<DataCardField, SpeciesEntity['dataCard'][DataCardField]>>

  /** Page quality counts only the sources this build may show. */
  const cleanQuality = <E extends { t: Translation }>(x: E): E => {
    const by = Object.entries(x.t.quality.bySource ?? {}).filter(([s]) => allowed(s as SourceId)).map(([, v]) => v as number)
    if (!by.length) return x
    const score = Math.min(...by)
    return { ...x, t: { ...x.t, quality: { ...x.t.quality, score, indexable: score >= QUALITY_THRESHOLD } } }
  }
  /**
   * A species page is also judged on its depth (depth.ts), here at every build: a page that gained an in-depth source (an
   * engine run, or two jobs' work merged) goes back in search by itself, whatever its translation file last recorded.
   */
  const judgeDepth = (x: Localized<SpeciesEntity>): Localized<SpeciesEntity> => {
    const q = cleanQuality(x).t.quality
    // A recorded `thin` was this rule's own call: the score alone decides the rest.
    const scoreOk = q.reason === 'thin' ? q.score >= QUALITY_THRESHOLD : q.indexable
    return { ...x, t: { ...x.t, quality: judgeQuality(q, scoreOk, speciesDepth(x.sections).deep) } }
  }

  const species = (await loadKind(root, 'species', SpeciesSchema, lang))
    .map(s => judgeDepth({ ...s, sections: cleanSections(s.sections), photos: cleanPhotos(s.photos), dataCard: cleanCard(s.dataCard, s.sections) }))
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
    // Another language has the guides translated so far (content/equipment/<lang>/<category>.json).
    const file = lang === 'vi' ? join(equipDir, f) : join(equipDir, lang, f)
    if (lang !== 'vi' && !(await exists(file))) continue
    const e = await readJson(file, EquipmentSchema)
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
    // Another language's species pages are still being made: it has the places one of its fish comes from, so no origin
    // page is empty and no link points at one it lacks. Vietnamese has every place.
    places: (await loadKind(root, 'places', PlaceSchema, lang)).filter(p => lang === 'vi' || species.some(s => s.places.includes(p.id))),
    sources,
    pictureHashes: (await exists(join(root, 'picture-hashes.json'))) ? await readJson(join(root, 'picture-hashes.json'), PictureHashesSchema) : {},
  }
}
