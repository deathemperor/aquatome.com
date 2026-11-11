import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { z } from 'zod'
import { shownCard } from './card-facts'
import { cardShownIn, CardSchema, CardTextSchema, type Card } from './cards'
import { setsCookies } from './thumb'
import { generatedApproved, IMAGE_SWITCHES, MARK_RESIDUE_LIMIT, MARK_RESIDUE_VERSION, realPhotosFirst, validImageJudgmentHashes, type ImageSwitches } from './image-policy'
import { markOutsideCrop, photoFitsCard, photoFitsHead, validCropGeometry } from './image-geometry'
import { judgeQuality, speciesDepth } from './depth'
import { isAllowedLicence } from './licence'
import { isVietnamese, markVietnameseNames } from './text'
import { BreedSchema, CaptionsSchema, OneVoiceSchema, PageDatesSchema, PictureHashesSchema, ChangelogSchema, EquipmentSchema, GallerySchema, GlossarySchema, GuideSchema, MarketSchema, mayPublish, PlaceSchema, PlantSchema, ProductSchema, SeriesSchema, SourcesSchema, SpeciesSchema, TranslationSchema } from './schemas'
import type { PictureHashes } from './pictures'
import type { BreedEntity, ChangelogEntry, EquipmentGuide, GlossaryEntity, GuideEntity, Lang, Market, Photo, PlaceEntity, PlantEntity, ProductEntity, Section, Series, SourceId, SourceInfo, SpeciesEntity, Translation } from './types'

export const QUALITY_THRESHOLD = 0.75
/** The market (prices, shops) each site language serves. */
export const MARKET: Record<Lang, string> = { vi: 'vn', id: 'id', th: 'th', ms: 'my' }

/**
 * `leaveOutHeld`: a page the reader-fit gate holds back in this language (its `held`) is no page here, as one without a
 * translation. The site's build sets it; the engine reads every page, to read the held ones again and let them out.
 */
export type LoadOptions = { root: string; lang: Lang; publicBuild: boolean; leaveOutHeld?: boolean; imageSwitches?: Readonly<ImageSwitches> }
export type Localized<E> = E & { t: Translation }
export type Content = {
  species: Localized<SpeciesEntity>[]
  plants: Localized<PlantEntity>[]
  guides: Localized<GuideEntity>[]
  glossary: Localized<GlossaryEntity>[]
  places: Localized<PlaceEntity>[]
  /**
   * Every place's name in this language by its id, those without a page here too: what a river or a region a fish's
   * range names is called (the site's range lines). `places` keeps only those with a page in this language.
   */
  placeNames: Record<string, string>
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
  /** The day each content file last changed for a reader (content/page-dates.json): the sitemap's dates. */
  pageDates: Record<string, string>
  /** The app's short cards (content/cards, cards.ts) in this language, those the gate holds back left out. No page of their own. */
  cards: Card[]
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

/** A guide's note for this language's readers goes first in its text, wherever the text is read (schemas.ts localNote). */
export const withLocalNote = (t: Translation): Translation => t.localNote ? { ...t, body: `${t.localNote.html}${t.body ?? ''}` } : t

/** A heading whose sources can't both be true shows only the source content/one-voice.json names, once this language has its text. */
export function oneVoice<S extends { sections: Section[]; t: Translation }>(x: S, keep: z.infer<typeof OneVoiceSchema>[string] | undefined): S {
  if (!keep) return x
  const written = (key: Section['key'], source: SourceId) => x.sections.some(s => s.key === key && s.source === source) && !!x.t.sections[`${key}:${source}`]
  return { ...x, sections: x.sections.filter(s => { const k = keep[s.key]; return !k || s.source === k || !written(s.key, k) }) }
}

async function loadKind<S extends z.ZodType>(root: string, dir: string, schema: S, lang: Lang, leaveOutHeld = false): Promise<Localized<z.infer<S>>[]> {
  const base = join(root, dir)
  const ids = await readdir(base).catch(() => [] as string[])
  const out: Localized<z.infer<S>>[] = []
  for (const id of ids.sort()) {
    const tPath = join(base, id, `${lang}.json`)
    // A translation left behind with no entity (an engine run named it while a merged change removed the page) is no page.
    if (!(await exists(tPath)) || !(await exists(join(base, id, 'entity.json')))) continue
    const entity = await readJson(join(base, id, 'entity.json'), schema)
    const t = withLocalNote(marked(lang, await readJson(tPath, TranslationSchema)))
    if (leaveOutHeld && t.held) continue
    out.push({ ...(entity as object), t } as Localized<z.infer<S>>)
  }
  return out
}

export async function loadAll(opts: LoadOptions): Promise<Content> {
  const { root, lang, publicBuild, leaveOutHeld = false } = opts
  const images = opts.imageSwitches ?? IMAGE_SWITCHES
  const sources = await readJson(join(root, 'sources.json'), SourcesSchema)
  // Text, and everything written from it (sections, guides, card values, quality, changelog); photos have their own gate.
  const allowed = (s: SourceId) => !publicBuild || mayPublish(sources[s], 'text')
  const approvals: { calibrationHash?: string; photos: Record<string, { page: string; recordHash: string; check: unknown }> } = images.publishGenerated ? await readFile(join(root, 'image-approvals.json'), 'utf8').then(s => JSON.parse(s) as { calibrationHash?: string; photos: Record<string, { page: string; recordHash: string; check: unknown }> }, () => ({ photos: {} })) : { photos: {} }
  const generatedUrls = new Set<string>()
  for (const [url, approval] of Object.entries(approvals.photos)) {
    if (!/^(species|plants)\/[a-z0-9-]+$/.test(approval.page)) continue
    const e = await readFile(join(root, approval.page, 'entity.json'), 'utf8').then(s => JSON.parse(s), () => undefined)
    const gallery = await readFile(join(root, 'gallery', `${approval.page.split('/')[1]}.json`), 'utf8').then(s => JSON.parse(s), () => undefined)
    const hash = e && createHash('sha256').update(JSON.stringify([e.scientificName, e.sections])).digest('hex')
    const same = (p: Photo) => p.url === url && generatedApproved(p) && p.generated?.check?.calibrationHash === ('calibrationHash' in approvals ? approvals.calibrationHash : undefined) && JSON.stringify(p.generated?.check) === JSON.stringify(approval.check)
    if (hash === approval.recordHash && e.photos.some(same) && gallery?.photos.some(same)) generatedUrls.add(url)
  }
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
  const cleanPhotos = <P extends Photo>(xs: P[]): P[] => realPhotosFirst(xs.flatMap(p => {
    const removedMark = p.altered?.find(a => a.method === 'mark-removal' || a.method === 'mark-crop')
    const permission = p.source && sources[p.source]?.permission?.markRemoval
    const markOn = images.removeMarks && !!permission && permission.allowed && permission.date === removedMark?.permissionDate
    const revoked = p.altered?.length && (!images.publishAltered || (removedMark ? !markOn : !images.upscaleReal))
    if (revoked && !p.generated) {
      // One source's objection takes effect in the very next build. Its marked original stays hidden, except Glaser's
      // own logo, whose original was permitted; an ordinary upscale always falls back to its unchanged original.
      if (!p.original || (removedMark && p.source !== 'glaser')) return []
      const { altered: _altered, original, large: _large, thumb: _thumb, ...rest } = p
      return [{ ...rest, ...original } as P]
    }
    return [p]
  }).filter(p => {
    if (publicBuild && setsCookies(p.url)) return false
    if (p.generated) return images.publishGenerated && generatedUrls.has(p.url) && generatedApproved(p) && !p.altered?.some(a => a.method === 'mark-removal' || a.method === 'mark-crop')
    if (p.altered?.length) {
      if (!images.publishAltered) return false
      for (const a of p.altered) {
        if (a.method === 'lanczos3-upscale' && !images.upscaleReal) return false
        if (a.method === 'mark-removal' || a.method === 'mark-crop') {
          const permission = p.source && sources[p.source]?.permission?.markRemoval
          if (!images.removeMarks || !permission || !permission.allowed || permission.date !== a.permissionDate || !validImageJudgmentHashes(a.checks?.species) || !validImageJudgmentHashes(a.checks?.ownership)) return false
          if(a.method==='mark-removal' && (a.outsideChanged !== 0 || a.noTrace !== 'pass' || !a.box || !validImageJudgmentHashes(a.checks?.noTrace) || !validImageJudgmentHashes(a.checks?.preservation) || a.residue?.version !== MARK_RESIDUE_VERSION || a.residue.limit !== MARK_RESIDUE_LIMIT || !Number.isFinite(a.residue.score) || a.residue.score >= MARK_RESIDUE_LIMIT))return false
          if(a.method==='mark-crop' && (a.retainedChanged!==0 || !validCropGeometry(a.crop) || p.width!==a.crop.window.x1-a.crop.window.x0 || p.height!==a.crop.window.y1-a.crop.window.y0 || !a.excludedMarks?.length || a.excludedMarks.some(m=>!markOutsideCrop(a.crop!,m))))return false
        }
      }
    }
    return p.source ? photoAllowed(p.source) : isAllowedLicence(p.licence)
  }).map(caption))
  /** The card's values from sources this build may show, without a tank length that is that source's tank volume (card-facts). */
  const cleanCard = (card: SpeciesEntity['dataCard'], sections: Section[]): SpeciesEntity['dataCard'] => shownCard(card, sections, s => allowed(s as SourceId))

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

  const voices = (await exists(join(root, 'one-voice.json'))) ? await readJson(join(root, 'one-voice.json'), OneVoiceSchema) : {}
  // After the depth is judged: a block set aside here still counts for the page's place in search.
  const generatedPages = new Set<string>()
  const rememberGenerated = <E extends { id: string; photos: Photo[] }>(page: E): E => { if (page.photos.some(p => p.generated)) generatedPages.add(page.id); return page }
  const species = (await loadKind(root, 'species', SpeciesSchema, lang, leaveOutHeld)).map(rememberGenerated)
    .map(s => oneVoice(judgeDepth({ ...s, sections: cleanSections(s.sections), photos: cleanPhotos(s.photos), dataCard: cleanCard(s.dataCard, s.sections) }), voices[s.id]))
    .filter(s => s.sections.length > 0)
  const plants = (await loadKind(root, 'plants', PlantSchema, lang, leaveOutHeld)).map(rememberGenerated)
    .map(p => cleanQuality({ ...p, sections: cleanSections(p.sections), photos: cleanPhotos(p.photos) }))
    .filter(p => p.sections.length > 0)
  const guides = (await loadKind(root, 'guides', GuideSchema, lang, leaveOutHeld))
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
    // A photo the photo check has not judged yet (`unchecked`) waits: no page shows it, and it counts towards no album.
    const photos = cleanPhotos(g.photos.filter(p => !p.unchecked))
    if (photos.length) galleries[g.id] = photos
  }

  // Breeds share the species' address space: a clash would silently drop one page, so it stops the build.
  // A care figure the engine hid (out of bounds, a tank too short for the fish: `hidden`) stays off the page.
  const shownCare = (care: BreedEntity['care']) => Object.fromEntries(Object.entries(care).map(([f, vs]) => [f, (vs ?? []).filter(v => !v.hidden)] as const).filter(([, vs]) => vs.length)) as BreedEntity['care']
  const breeds = (await loadKind(root, 'breeds', BreedSchema, lang, leaveOutHeld)).map(rememberGenerated).map(b => ({ ...b, care: shownCare(b.care), photos: cleanPhotos(b.photos) }))
  // A newly passed real album photo immediately leads a formerly generated-only page, even before lead-photos runs.
  for (const page of [...species, ...plants, ...breeds]) if (page.photos.some(p=>!photoFitsHead(p)) || page.photos[0]?.generated || (!page.photos.length && generatedPages.has(page.id))) {
    const all=realPhotosFirst([...new Map([...page.photos,...(galleries[page.id]??[])].map(p=>[p.url,p])).values()])
    const albumOnly=page.photos.filter(p=>!photoFitsHead(p))
    if(albumOnly.length)galleries[page.id]=realPhotosFirst([...new Map([...(galleries[page.id]??[]),...albumOnly].map(p=>[p.url,p])).values()])
    page.photos=page.photos.filter(photoFitsHead)
    const real = all.find(p => !p.generated && photoFitsHead(p))
    if (real) page.photos = [real, ...page.photos.filter(p => p.url !== real.url)]
    else if(all.some(p=>!p.generated))page.photos=page.photos.filter(p=>!p.generated)
  }
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

  // A card in this language, unless the gate holds it back there or it's an event in another reader's country
  // (cardShownIn); a photo this build may not show is dropped, not the card.
  const cards: Card[] = []
  const cardsDir = join(root, 'cards')
  for (const id of (await readdir(cardsDir).catch(() => [] as string[])).sort()) {
    const tPath = join(cardsDir, id, `${lang}.json`)
    if (!(await exists(tPath)) || !(await exists(join(cardsDir, id, 'entity.json')))) continue
    const t = await readJson(tPath, CardTextSchema)
    if (t.held) continue
    const { photo, ...card } = await readJson(join(cardsDir, id, 'entity.json'), CardSchema)
    if (!cardShownIn(card, lang)) continue
    const shown = photo && !photo.generated && photoFitsCard(photo) ? cleanPhotos([photo])[0] : undefined
    cards.push({ ...card, ...(shown ? { photo: shown } : {}), t })
  }

  const allPlaces = await loadKind(root, 'places', PlaceSchema, lang)
  return {
    species, plants, guides, changelog, equipment, series, galleries, products, breeds, cards,
    glossary: await loadKind(root, 'glossary', GlossarySchema, lang),
    // Another language's species pages are still being made: it has the places one of its fish comes from, so no origin
    // page is empty and no link points at one it lacks. Vietnamese has every place.
    places: allPlaces.filter(p => lang === 'vi' || species.some(s => s.places.includes(p.id))),
    placeNames: Object.fromEntries(allPlaces.map(p => [p.id, p.t.name])),
    sources,
    pictureHashes: (await exists(join(root, 'picture-hashes.json'))) ? await readJson(join(root, 'picture-hashes.json'), PictureHashesSchema) : {},
    pageDates: (await exists(join(root, 'page-dates.json'))) ? await readJson(join(root, 'page-dates.json'), PageDatesSchema) : {},
  }
}
