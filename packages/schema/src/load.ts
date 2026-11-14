import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { z } from 'zod'
import { shownCard } from './card-facts'
import { cardShownIn, CardSchema, CardTextSchema, type Card } from './cards'
import { setsCookies, THUMB_WIDTH } from './thumb'
import { awaitsScreen, type PhotoScreenEntry } from './photo-screen'
import { ownerCropApproved, ownerCropCanonical } from './owner-crops'
import { generatedApproved, isOwnerCrop, IMAGE_SWITCHES, MARK_RESIDUE_LIMIT, MARK_RESIDUE_VERSION, realPhotosFirst, validImageJudgmentHashes, type ImageSwitches } from './image-policy'
import { markOutsideCrop, photoFitsCard, photoFitsHead, photoFitsWholeHead, validCropGeometry } from './image-geometry'
import { judgeQuality, speciesDepth } from './depth'
import { isAllowedLicence } from './licence'
import { isVietnamese, markVietnameseNames } from './text'
import { BreedSchema, CaptionsSchema, OneVoiceSchema, PageDatesSchema, PictureHashesSchema, ChangelogSchema, EquipmentSchema, GallerySchema, GlossarySchema, GuideSchema, MATERIAL_SECTION_ORDER, MaterialSchema, MarketSchema, mayPublish, PlaceSchema, PlantSchema, ProductSchema, SeriesSchema, SourcesSchema, SpeciesSchema, TranslationSchema } from './schemas'
import type { PictureHashes } from './pictures'
import type { BreedEntity, ChangelogEntry, EquipmentGuide, GlossaryEntity, GuideEntity, Lang, Market, MaterialEntity, Photo, PlaceEntity, PlantEntity, ProductEntity, Section, Series, SourceId, SourceInfo, SpeciesEntity, Translation } from './types'

export const QUALITY_THRESHOLD = 0.75
/** The market (prices, shops) each site language serves. */
export const MARKET: Record<Lang, string> = { vi: 'vn', id: 'id', th: 'th', ms: 'my' }

/**
 * `leaveOutHeld`: a page the reader-fit gate holds back in this language (its `held`) is no page here, as one without a
 * translation. The site's build sets it; the engine reads every page, to read the held ones again and let them out.
 */
export type LoadOptions = {
  root: string; lang: Lang; publicBuild: boolean; leaveOutHeld?: boolean; imageSwitches?: Readonly<ImageSwitches>
  /**
   * The watermark screen's record, for a public build: by default the one in the engine's state beside the content root,
   * where there is one (a fixture has none, and shows every photo). `'required'`: a build of the real content, which
   * stops without it. A record given here stands in for it; `false`: none, every photo shows.
   */
  photoScreen?: Record<string, PhotoScreenEntry> | 'required' | false
}
export type Localized<E> = E & { t: Translation }
export type Content = {
  /** The language this content was loaded in. A content put together by hand (a test's) may have none: read as Vietnamese. */
  lang?: Lang
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
  /** Unlisted Vietnamese hobby materials. No other language or catalogue consumes the pilot. */
  materials: Localized<MaterialEntity>[]
  /** YouTube playlists turned into guide series (content/series/*.json); only those with a published guide. */
  series: Series[]
  sources: Partial<Record<SourceId, SourceInfo>>
  changelog: ChangelogEntry[]
  /** Each photo's image hash by its address (content/picture-hashes.json): a page never shows one picture twice (pictures.ts). */
  pictureHashes: PictureHashes
  /** The day each content file last changed for a reader (content/page-dates.json): the sitemap's dates. */
  pageDates: Record<string, string>
  /**
   * Whether this build holds a picture back until the watermark screen has judged it (photo-screen.ts), asked by any of
   * the picture's addresses: its own, its thumb's or its larger copy's. For what names a picture by address alone (the
   * calendar). It asks the screen's record, not only what this language's build loaded, so a picture on a page this
   * build leaves out is answered too, and one the record doesn't know waits. None where the build has no screen.
   */
  photoWaits?: (address: string) => boolean
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

/**
 * Every material's parent, by id, whatever its translations say (held, missing): each folder's entity read and checked,
 * its folder and its id the same. A parent is a material that is really there, never a folder name alone, and a chain
 * of parents ends: lua's parent lua-sa-tung, whose parent is lua, would make each page the other's parent and child.
 */
async function materialParents(root: string): Promise<Map<string, string | undefined>> {
  const parents = new Map<string, string | undefined>()
  for (const folder of await readdir(join(root, 'materials')).catch(() => [] as string[])) {
    const file = join(root, 'materials', folder, 'entity.json')
    if (!(await exists(file))) continue
    const m = await readJson(file, MaterialSchema)
    if (m.id !== folder) throw new Error(`material ${folder}: its entity's id is "${m.id}"`)
    parents.set(m.id, m.parent)
  }
  for (const [id, parent] of parents) {
    if (parent === undefined) continue
    if (parent === id || !parents.has(parent)) throw new Error(`material ${id}: parent "${parent}" is not another material`)
    const seen = [id]
    for (let p: string | undefined = parent; p !== undefined; p = parents.get(p)) {
      if (seen.includes(p)) throw new Error(`material ${id}: its parents go round (${[...seen, p].join(' → ')})`)
      seen.push(p)
    }
  }
  return parents
}

/** The watermark screen's record, in the engine's state beside the content root. */
export const PHOTO_SCREEN_FILE = '_photo-watermarks.json'
const screens = new Map<string, { at: string; record: Promise<Record<string, PhotoScreenEntry>> }>()
/**
 * The record beside this content root, read once per change of the file (a write, a replacement, a change of size or
 * of either of its times). None where the root has none beside it (a
 * fixture, a test's store), unless it is `required`: a missing record must not show the real content's every photo
 * unscreened.
 */
async function photoScreenOf(root: string, required: boolean): Promise<Record<string, PhotoScreenEntry> | undefined> {
  const file = join(dirname(root), 'engine-state', PHOTO_SCREEN_FILE)
  const at = await stat(file).then(s => `${s.ino} ${s.ctimeMs} ${s.mtimeMs} ${s.size}`, () => undefined)
  if (at === undefined) {
    if (required) throw new Error(`${file}: the watermark screen's record is missing, so no photo can be shown as screened`)
    return undefined
  }
  const had = screens.get(file)
  if (had?.at === at) return had.record
  const record = readFile(file, 'utf8').then(s => JSON.parse(s) as Record<string, PhotoScreenEntry>)
  screens.set(file, { at, record })
  return record
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
  // A public build shows no photo the watermark screen still owes a look (photo-screen.ts): it waits, on a page, in an
  // album, a guide or a card, and shows by itself once judged. The engine's own reads see every photo.
  const screen = !publicBuild || opts.photoScreen === false ? undefined
    : typeof opts.photoScreen === 'object' ? opts.photoScreen : await photoScreenOf(root, opts.photoScreen === 'required')
  // Every picture a build takes from content asks this: a page's, an album's, a guide's and its video sections', a
  // card's, an equipment guide's. Each one's addresses (its own, its thumb's, its larger copy's) are kept by the answer,
  // for what names a picture by address alone (the calendar: `photoWaits`).
  const shown = new Set<string>(), waiting = new Set<string>()
  const screened = (p: { url: string; thumb?: string; large?: { url: string } }): boolean => {
    if (!screen) return true
    const waits = awaitsScreen(p.url, screen[p.url])
    for (const u of [p.url, p.thumb, p.large?.url]) if (u) (waits ? waiting : shown).add(u)
    return !waits
  }
  // An address this build did not load (a picture on a page this language lacks, or one the gate holds) is asked of the
  // record by its photo's own address: in our store a thumb's and a larger copy's are the photo's with "-480" or
  // "-large" before ".webp" (thumb.ts, the engine's large-photos.ts). One the record doesn't know waits.
  const photoWaits = (address: string): boolean => {
    if (shown.has(address)) return false
    if (waiting.has(address)) return true
    const photo = address.replace(new RegExp(`-(?:${THUMB_WIDTH}|large)\\.webp$`), '.webp')
    return awaitsScreen(photo, screen![photo])
  }
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
  const cleanPhotos = <P extends Photo>(xs: P[], page = '', scientificName = ''): P[] => realPhotosFirst(xs.flatMap(p => {
    if (isOwnerCrop(p)) {
      const valid=ownerCropApproved(p,page,scientificName,createHash('sha256').update(ownerCropCanonical(p,page,scientificName)).digest('hex'))
      const veto=p.source && sources[p.source]?.permission?.markRemoval?.allowed===false
      return valid && !veto ? [p] : []
    }
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
    if (!screened(p)) return false
    if (p.generated) return images.publishGenerated && generatedUrls.has(p.url) && generatedApproved(p) && !p.altered?.some(a => a.method === 'mark-removal' || a.method === 'mark-crop')
    if (p.altered?.length) {
      if (!images.publishAltered && !isOwnerCrop(p)) return false
      for (const a of p.altered) {
        if (a.method === 'lanczos3-upscale' && !images.upscaleReal) return false
        if (a.method === 'mark-removal' || a.method === 'mark-crop') {
          const permission = p.source && sources[p.source]?.permission?.markRemoval
          if ((!isOwnerCrop(p) && (!images.removeMarks || !permission || !permission.allowed || permission.date !== a.permissionDate)) || !validImageJudgmentHashes(a.checks?.species) || !validImageJudgmentHashes(a.checks?.ownership)) return false
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
    .map(s => oneVoice(judgeDepth({ ...s, sections: cleanSections(s.sections), photos: cleanPhotos(s.photos, `species/${s.id}`, s.scientificName), dataCard: cleanCard(s.dataCard, s.sections) }), voices[s.id]))
    .filter(s => s.sections.length > 0)
  const plants = (await loadKind(root, 'plants', PlantSchema, lang, leaveOutHeld)).map(rememberGenerated)
    .map(p => cleanQuality({ ...p, sections: cleanSections(p.sections), photos: cleanPhotos(p.photos) }))
    .filter(p => p.sections.length > 0)
  const guides = (await loadKind(root, 'guides', GuideSchema, lang, leaveOutHeld))
    .filter(g => allowed(g.source))
    // A video's sections show a photo and stills of their own, and a section's photo can lead the guide or a card.
    .map(g => ({ ...g, photos: cleanPhotos(g.photos), ...(g.video?.figures ? { video: { ...g.video, figures: g.video.figures.map(f => ({ ...f, moments: f.moments.filter(screened), ...(f.photo && !screened(f.photo) ? { photo: undefined } : {}) })) } } : {}) }))

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
    const types = e.types.map(t => (t.photo && !ok(t.photo) ? { ...t, photo: undefined } : t))
    // Its head picture waits like any other: a type's photo stands in, and with none to stand in the guide waits too.
    const hero = screened(e.hero) ? e.hero : types.find(t => t.photo)?.photo
    if (hero) equipment.push({ ...e, hero, types })
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
    const speciesPage=species.find(p=>p.id===g.id)
    const photos = cleanPhotos(g.photos.filter(p => !p.unchecked), speciesPage ? `species/${g.id}` : '', speciesPage?.scientificName ?? '')
    if (photos.length) galleries[g.id] = photos
  }

  // Breeds share the species' address space: a clash would silently drop one page, so it stops the build.
  // A care figure the engine hid (out of bounds, a tank too short for the fish: `hidden`) stays off the page.
  const shownCare = (care: BreedEntity['care']) => Object.fromEntries(Object.entries(care).map(([f, vs]) => [f, (vs ?? []).filter(v => !v.hidden)] as const).filter(([, vs]) => vs.length)) as BreedEntity['care']
  const breeds = (await loadKind(root, 'breeds', BreedSchema, lang, leaveOutHeld)).map(rememberGenerated).map(b => ({ ...b, care: shownCare(b.care), photos: cleanPhotos(b.photos) }))
  // A newly passed real album photo immediately leads a formerly generated-only page, even before lead-photos runs.
  // Preserve explicitly fitted heads; add a fitted fallback only after ordinary publication admission.
  const fitsHead = (p: Photo) => p.headFit === 'contain' || photoFitsHead(p)
  for (const page of [...species, ...plants, ...breeds]) if (page.photos.some(p=>p.headFit==='contain'||!photoFitsHead(p)) || page.photos[0]?.generated || (!page.photos.length && (generatedPages.has(page.id) || (galleries[page.id]??[]).some(p=>!p.generated&&photoFitsWholeHead(p))))) {
    const all=realPhotosFirst([...new Map([...page.photos,...(galleries[page.id]??[])].map(p=>[p.url,p])).values()])
    const albumOnly=page.photos.filter(p=>!fitsHead(p))
    if(albumOnly.length)galleries[page.id]=realPhotosFirst([...new Map([...(galleries[page.id]??[]),...albumOnly].map(p=>[p.url,p])).values()])
    page.photos=page.photos.filter(fitsHead)
    const real = all.find(p => !p.generated && photoFitsHead(p))
    const whole = !real && all.find(p=>!p.generated&&(p.headFit==='contain'||photoFitsWholeHead(p)))
    if (real) page.photos = [real, ...page.photos.filter(p => p.url !== real.url)]
    else if(whole)page.photos=[{...whole,headFit:'contain'}]
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
    const shown = photo && !photo.generated && !isOwnerCrop(photo) && photoFitsCard(photo) ? cleanPhotos([photo])[0] : undefined
    cards.push({ ...card, ...(shown ? { photo: shown } : {}), t })
  }

  // Pilot content stays Vietnamese-only even if another language file arrives before its routes and address words.
  const materials = lang === 'vi' ? (await loadKind(root, 'materials', MaterialSchema, lang, leaveOutHeld)).map(m => {
    if (!m.t.summary || m.t.summary.length < 2 || m.t.summary.length > 4 || m.t.summary.some(s => !s.trim())) throw new Error(`material ${m.id}: summary needs 2–4 non-empty lines`)
    for (const key of Object.keys(m.t.sections)) if (!(MATERIAL_SECTION_ORDER as readonly string[]).includes(key)) throw new Error(`material ${m.id}: unknown section ${key}`)
    // A translation's citations are 1-based positions in this entity's source list, never an uncited fallback.
    for (const text of Object.values(m.t.sections)) {
      for (const mark of text.matchAll(/\[(\d+)\]/g)) {
        const n = Number(mark[1])
        if (n < 1 || n > m.sources.length) throw new Error(`material ${m.id}: source ${mark[0]} is outside sources (1–${m.sources.length})`)
      }
    }
    return { ...m, photos: cleanPhotos(m.photos) }
  }) : []
  const materialSlugs = new Set<string>()
  // A parent is another material, held back or not (a held parent leaves its kinds standing alone): never a typo that
  // the page would drop without a word, and never a chain that comes back round (materialParents).
  if (lang === 'vi') await materialParents(root)
  for (const m of materials) {
    if (materialSlugs.has(m.t.slug)) throw new Error(`material ${m.id}: duplicate slug "${m.t.slug}"`)
    materialSlugs.add(m.t.slug)
  }

  const allPlaces = await loadKind(root, 'places', PlaceSchema, lang)
  return {
    lang, species, plants, guides, changelog, equipment, series, galleries, products, breeds, materials, cards,
    ...(screen ? { photoWaits } : {}),
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
