import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { z } from 'zod'
import { shownCard } from './card-facts'
import { cardShownIn, CardSchema, CardTextSchema, type Card } from './cards'
import { setsCookies, THUMB_WIDTH } from './thumb'
import { DEAD_OWED_FILE, DEAD_SCREEN_FILE, deadLooked, expandWholePhotoRejections, isVersionRejection, photoWaitsFor, ownDeadPhotoUrls, publicPhotoVersion, FACES_FILE, PHOTO_CHECK_FILE, PHOTO_REJECTED_FILE, PHOTO_SUBJECTS_FILE, SECOND_LOOK_RECORD, UNJUDGED_DEAD_LIMIT, UNREAD_FACES_LIMIT, facePhotoStatus, type PhotoScreenEntry } from './photo-screen'
import { photoRejections } from './own-mark'
import { ownerCropFitsPage } from './owner-crops'
import { generatedApproved, isOwnerCrop, IMAGE_SWITCHES, MARK_RESIDUE_LIMIT, MARK_RESIDUE_VERSION, realPhotosFirst, validImageJudgmentHashes, type ImageSwitches } from './image-policy'
import { HAND_BOXES } from './hand-boxes'
import { markOutsideCrop, photoFitsCard, photoFitsHead, photoFitsWholeHead, SUBJECT_FRAMES, subjectPixels, validCropGeometry, type SubjectFractions } from './image-geometry'
import { judgeQuality, speciesDepth } from './depth'
import { isNonCommercial, mayPublishLicence, ncAlone } from './licence'
import { isVietnamese, markVietnameseNames } from './text'
import { pageFish, videosForPage, videosOnTwoFish } from './videos'
import { BreedSchema, CaptionsSchema, VideoGeneratedSchema, VideoTitlesSchema, VideoTitlesOnSchema, OneVoiceSchema, PageDatesSchema, PictureHashesSchema, ChangelogSchema, EquipmentSchema, GallerySchema, GlossarySchema, GuideSchema, MATERIAL_SECTION_ORDER, MaterialSchema, MarketSchema, mayPublish, PlaceSchema, PlantSchema, ProductSchema, SeriesSchema, SourcesSchema, SpeciesSchema, TranslationSchema } from './schemas'
import type { PictureHashes } from './pictures'
import type { BreedEntity, ChangelogEntry, EquipmentGuide, GlossaryEntity, GuideEntity, Lang, Market, MaterialEntity, Photo, Video, PlaceEntity, PlantEntity, ProductEntity, Section, Series, SourceId, SourceInfo, SpeciesEntity, Translation } from './types'

export const QUALITY_THRESHOLD = 0.75
/** A video not spoken in the page's language shows only with its title translated (the owner's report, 2026-11-10). */
const REQUIRE_VIDEO_TITLE = true
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
  /** Whether photos get their box from the engine's record (`subject`): by default SUBJECT_FRAMES (image-geometry.ts). */
  subjectFrames?: boolean
  /**
   * With the boxes on: whether a fish's or breed's photo the record has no box for (not boxed yet, or no animal found),
   * and a plant's photo taller than it is wide, gets its whole area as its box, so every frame shows it whole wherever its
   * shape differs from the frame's (the Design Lead, 13 Nov). On by default; the planner, which reads where a fish really
   * is, reads the record's boxes alone (false).
   */
  wholeBoxes?: boolean
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

/**
 * A heading whose sources can't both be true shows only the source content/one-voice.json names, once this language has
 * its text; one it names no source for (`false`) isn't shown at all, and its text is left out too, so nothing that reads
 * the page's text (the gate's checks, the summary's writer) reads what readers don't see.
 */
export function oneVoice<S extends { sections: Section[]; t: Translation }>(x: S, keep: z.infer<typeof OneVoiceSchema>[string] | undefined): S {
  if (!keep) return x
  const written = (key: Section['key'], source: SourceId) => x.sections.some(s => s.key === key && s.source === source) && !!x.t.sections[`${key}:${source}`]
  const off = (key: string) => keep[key as Section['key']] === false
  const t = { ...x.t, sections: Object.fromEntries(Object.entries(x.t.sections).filter(([k]) => !off(k.split(':')[0]!))) }
  return { ...x, t, sections: x.sections.filter(s => { const k = keep[s.key]; return k === undefined || (k !== false && (s.source === k || !written(s.key, k))) }) }
}

/**
 * Whether a place's name is this language's: not one judged alone and failed (the engine's place-judge.ts). A failed one
 * leaves the place with no name here, as before it was translated, so the site shows what the source wrote: a river's
 * or a region's name as the fish's range gives it (the site's range.ts regionNames), a country's own name in this
 * language (countryNames), until a name passes. A name only a batch scored, low or not, shows as it is (the chief of
 * staff, 14 Nov 2026: no blanket step back, as most of them are right).
 */
export const placeNamed = (t: Translation) => t.nameCheck?.ok !== false

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
  for (const [id, parent] of parents)
    if (parent !== undefined && (parent === id || !parents.has(parent))) throw new Error(`material ${id}: parent "${parent}" is not another material`)
  // Each material walked once: a chain stops at one already known to end.
  const ends = new Set<string>()
  for (const id of parents.keys()) {
    const chain = new Map<string, number>()
    for (let p: string | undefined = id; p !== undefined && !ends.has(p); p = parents.get(p)) {
      const at = chain.get(p)
      if (at !== undefined) throw new Error(`material ${id}: its parents go round (${[...[...chain.keys()].slice(at), p].join(' → ')})`)
      chain.set(p, chain.size)
    }
    for (const p of chain.keys()) ends.add(p)
  }
  return parents
}

/** The watermark screen's record, in the engine's state beside the content root. */
export const PHOTO_SCREEN_FILE = '_photo-watermarks.json'
/** The engine's box of where the fish is in each photo, by address (null: no animal found), beside the content root. */
export const PHOTO_BOXES_FILE = '_photo-boxes.json'
const records = new Map<string, { at: string; record: Promise<unknown> }>()
/**
 * An engine record beside this content root (engine-state/<name>), read once per change of the file (a write, a
 * replacement, a change of size or of either of its times). None where the root has none beside it (a fixture, a test's
 * store).
 */
async function stateRecord<T>(root: string, name: string): Promise<T | undefined> {
  const file = join(dirname(root), 'engine-state', name)
  const at = await stat(file).then(s => `${s.ino} ${s.ctimeMs} ${s.mtimeMs} ${s.size}`, () => undefined)
  if (at === undefined) return undefined
  const had = records.get(file)
  if (had?.at === at) return had.record as Promise<T>
  const record = readFile(file, 'utf8').then(s => JSON.parse(s) as T)
  records.set(file, { at, record })
  return record
}
/** The watermark screen's record, unless it is `required`: a missing record must not show the real content's every photo unscreened. */
async function photoScreenOf(root: string, required: boolean): Promise<Record<string, PhotoScreenEntry> | undefined> {
  const record = await stateRecord<Record<string, PhotoScreenEntry>>(root, PHOTO_SCREEN_FILE)
  if (!record && required) throw new Error(`${join(dirname(root), 'engine-state', PHOTO_SCREEN_FILE)}: the watermark screen's record is missing, so no photo can be shown as screened`)
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
  // A new photo the dead-fish screen still owes a look waits the same way (photo-screen.ts DEAD_OWED_FILE). No list beside
  // the root (the fixture build, a test's store): none waits for it.
  const owed = screen ? await stateRecord<Record<string, string>>(root, DEAD_OWED_FILE) : undefined
  // So does an own photo of a species, plant or guide page that the face finder has never read (photo-screen.ts
  // FACES_FILE), wherever it shows. Every such page on disk counts, as the face finder reads every one: one with no text
  // in this language or held back still owns its photos, which another page's album can show. The site's build of the
  // real content needs the record.
  const faces = screen ? await stateRecord<Record<string, number>>(root, FACES_FILE) : undefined
  if (screen && !faces && opts.photoScreen === 'required') throw new Error(`${join(dirname(root), 'engine-state', FACES_FILE)}: the face finder's record is missing, so no page's own photo can be shown as read`)
  const rejectedForDead = screen ? photoRejections(
    await expandWholePhotoRejections(root, await stateRecord<Record<string, string>>(root, PHOTO_REJECTED_FILE) ?? {}, screen), screen,
  ) : undefined
  const { unread, altered: flaggedAlterations } = await facePhotoStatus(root, faces)
  if (faces && opts.photoScreen === 'required') {
    const retryable = [...unread].filter(url => !rejectedForDead?.(url)).length
    console.log(`${lang}: ${retryable} own photos of species, plant and guide pages wait, the face finder has never read them`)
    if (retryable > UNREAD_FACES_LIMIT) throw new Error(`${lang}: ${retryable} own photos of species, plant and guide pages the face finder has never read (${join(dirname(root), 'engine-state', FACES_FILE)}). More than ${UNREAD_FACES_LIMIT} is a lost or damaged record, not a run's new photos: not built, rather than publish the pages without them. A faces step (pnpm engine faces) reads them.`)
  }
  // And an own photo of a species or plant page that no look has judged for a dead fish (photo-screen.ts deadLooked),
  // owed or not: the list is the engine's queue, and one that is behind can't let a photo through (the chief of staff,
  // 22 Nov 2026). With no screen record beside the root (the fixture build, a test's store) none waits for it; the site's
  // build of the real content needs the record.
  const deadScreen = screen ? await stateRecord<Record<string, unknown>>(root, DEAD_SCREEN_FILE) : undefined
  if (screen && !deadScreen && opts.photoScreen === 'required') throw new Error(`${join(dirname(root), 'engine-state', DEAD_SCREEN_FILE)}: the dead-fish screen's record is missing, so no photo can be shown as judged for a dead fish`)
  const secondLook = deadScreen || faces ? await stateRecord<Record<string, { why?: string; off?: boolean; look?: { said?: string } }>>(root, SECOND_LOOK_RECORD) : undefined
  const lookedForDead = deadScreen ? deadLooked({
    screen: deadScreen,
    check: await stateRecord<Record<string, unknown>>(root, PHOTO_CHECK_FILE),
    subjects: await stateRecord<Record<string, unknown>>(root, PHOTO_SUBJECTS_FILE),
    secondLook,
  }) : undefined
  const unjudged = new Set<string>()
  if (lookedForDead) {
    for (const url of await ownDeadPhotoUrls(root)) if (!lookedForDead(url)) unjudged.add(url)
    if (opts.photoScreen === 'required') {
      const retryable = [...unjudged].filter(url => !rejectedForDead?.(url)).length
      console.log(`${lang}: ${retryable} own photos of species and plant pages wait, no look has judged them for a dead fish`)
      if (retryable > UNJUDGED_DEAD_LIMIT) throw new Error(`${lang}: ${retryable} own photos of species and plant pages that no look has judged for a dead fish (${join(dirname(root), 'engine-state', DEAD_SCREEN_FILE)} and the photo check's records). More than ${UNJUDGED_DEAD_LIMIT} is a lost or damaged record, not a run's new photos: not built, rather than publish the pages without them. A faces step (pnpm engine faces) screens them.`)
    }
  }
  const waitsFor = photoWaitsFor({ watermarks: screen, owed, unread, flaggedAlterations, faces, unjudged, deadScreen, secondLook, rejected: rejectedForDead })
  // Every picture a build takes from content asks this: a page's, an album's, a guide's and its video sections', a
  // card's, an equipment guide's. Each one's addresses (its own, its thumb's, its larger copy's) are kept by the answer,
  // for what names a picture by address alone (the calendar: `photoWaits`).
  const shown = new Set<string>(), waiting = new Set<string>()
  const screened = (p: { url: string; thumb?: string; large?: { url: string } }): boolean => {
    if (!screen) return true
    const waits = waitsFor(p.url)
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
    return waitsFor(photo)
  }
  const cleanSections = (xs: Section[]) => xs.filter(s => allowed(s.source))
  // Captions written in Vietnamese (galleries, breed photos) are shown in this language from content/captions/<lang>.json;
  // one not translated yet is left off, so the photo's alt text falls back to the page's name.
  const captionsFile = join(root, 'captions', `${lang}.json`)
  const captions = lang !== 'vi' && (await exists(captionsFile)) ? await readJson(captionsFile, CaptionsSchema) : {}
  // Where the fish is in each photo, from the engine's record and behind its switch (SUBJECT_FRAMES): with it off no photo
  // has a box. Here a photo the record doesn't know, or where it found no animal, has none; a page's and an album's take
  // their whole area below (`wholeBoxes`). A box set by hand (HAND_BOXES) wins over the record's.
  const framed = opts.subjectFrames ?? SUBJECT_FRAMES
  const boxes = framed ? await stateRecord<Record<string, SubjectFractions | null>>(root, PHOTO_BOXES_FILE) : undefined
  const boxed = <P extends Photo>(p: P): P => {
    const { subject: _own, ...rest } = p
    const f = framed ? HAND_BOXES[p.url] ?? boxes?.[p.url] : undefined, subject = f && subjectPixels(f, p.width, p.height)
    return subject ? { ...rest, subject } as P : _own ? rest as P : p
  }
  const caption = <P extends Photo>(p: P): P => {
    if (lang === 'vi' || !p.caption || !isVietnamese(p.caption)) return p
    const { caption: vi, ...rest } = p
    return (captions[vi] ? { ...rest, caption: captions[vi] } : rest) as P
  }
  /**
   * Photos copied from a source follow that source's publish gate; others need an open licence. An album's (`album`) may
   * also be an iNaturalist photo under CC BY-NC or CC BY-NC-SA, while its switch is on (IMAGE_SWITCHES.inatNonCommercial).
   */
  // A public build shows no photo from a host that sets third-party cookies: it waits for `pnpm engine mirror-photos`
  // (2026-10-31: 487 Commons photos put on pages straight from Wikimedia failed best practices on every live page).
  const cleanPhotos = <P extends Photo>(xs: P[], page = '', scientificName = '', album = false, head = false): P[] => realPhotosFirst(xs.flatMap(p => {
    if (isOwnerCrop(p)) {
      const valid=ownerCropFitsPage(p, page, scientificName)
      const veto=p.source && sources[p.source]?.permission?.markRemoval?.allowed===false
      return valid && !veto ? [p] : []
    }
    const shown = publicPhotoVersion(p, images, p.source ? sources[p.source]?.permission?.markRemoval : undefined)
    const storedReason = shown && shown.url !== p.url ? rejectedForDead?.(p.url)?.[1] : undefined
    if (shown && storedReason && !isVersionRejection(storedReason)) {
      for (const url of [shown.url, shown.thumb, shown.large?.url]) if (url) waiting.add(url)
      return []
    }
    return shown ? [shown] : []
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
    return p.source ? photoAllowed(p.source) : mayPublishLicence(p, (album || head) && images.inatNonCommercial)
  }).map(p => caption(boxed(p))))
  // A fish's page shows a non-commercial photo (iNaturalist's, the switch on) only as its head with no other real photo,
  // where it's the one way to show that fish (the chief of staff's rule, 17 Nov; the engine's lead-photo.ts puts it there).
  const pagePhotos = <P extends Photo>(xs: P[], page = '', scientificName = ''): P[] => ncAlone(cleanPhotos(xs, page, scientificName, false, true))
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

  // A video's title in the page's language, and the mark on a generated one. One with no title in this language isn't shown,
  // unless it's spoken in the page's language.
  const titlesFile = join(root, 'video-titles', `${lang}.json`)
  const videoTitles = (await exists(titlesFile)) ? await readJson(titlesFile, VideoTitlesSchema) : {}
  // A language's translated titles show once it's in on.json, one line each, added with the chief of staff's yes; until then
  // only the kept ones the editors passed do, and every other video keeps its own title (the chief of staff, 15 Nov).
  const onFile = join(root, 'video-titles', 'on.json'), keptFile = join(root, 'video-titles', 'kept.json')
  const titlesOn = (await exists(onFile)) && (await readJson(onFile, VideoTitlesOnSchema)).includes(lang)
  const keptTitles = (await exists(keptFile)) ? await readJson(keptFile, VideoTitlesSchema) : {}
  // Titles the meaning check refused: the video keeps its own title, marked, even once the language is on (the chief of staff, 16 Nov).
  const refusedFile = join(root, 'video-titles', `${lang}.refused.json`)
  const refusedTitles = (await exists(refusedFile)) ? await readJson(refusedFile, VideoTitlesSchema) : {}
  // The words the meaning check passed: with the language on, a stored title shows only where they are its words (the
  // reviewers of the check, 16 Nov). No file is no title passed.
  const passedFile = join(root, 'video-titles', `${lang}.passed.json`)
  const passedTitles = (await exists(passedFile)) ? await readJson(passedFile, VideoTitlesSchema) : {}
  const generatedFile = join(root, 'video-generated.json')
  const videoGenerated = (await exists(generatedFile)) ? await readJson(generatedFile, VideoGeneratedSchema) : {}
  // Every species and product page in this language, held ones too, as the writer counts them: a video on the pages of
  // more than one fish keeps its own title on each, whatever the title files say (the reviewers of the check, 16 Nov).
  const allSpecies = await loadKind(root, 'species', SpeciesSchema, lang), allProducts = await loadKind(root, 'products', ProductSchema, lang)
  const sharedVideos = videosOnTwoFish([...allSpecies.map(s => ({ fish: pageFish('species', s.id, s), videos: s.videos })), ...allProducts.map(p => ({ fish: pageFish('products', p.id, null), videos: p.reviews?.videos ?? [] }))], lang)
  const forPage = <V extends Video>(videos: V[], o?: { order?: boolean; requireTitle?: boolean }) => videosForPage(videos, lang, videoTitles, videoGenerated, { requireTitle: REQUIRE_VIDEO_TITLE, on: titlesOn, kept: keptTitles, refused: refusedTitles, passed: passedTitles, shared: sharedVideos, ...o })

  const voices = (await exists(join(root, 'one-voice.json'))) ? await readJson(join(root, 'one-voice.json'), OneVoiceSchema) : {}
  // After the depth is judged: a block set aside here still counts for the page's place in search.
  const generatedPages = new Set<string>()
  const rememberGenerated = <E extends { id: string; photos: Photo[] }>(page: E): E => { if (page.photos.some(p => p.generated)) generatedPages.add(page.id); return page }
  const species = allSpecies.filter(s => !(leaveOutHeld && s.t.held)).map(rememberGenerated)
    .map(s => oneVoice(judgeDepth({ ...s, sections: cleanSections(s.sections), photos: pagePhotos(s.photos, `species/${s.id}`, s.scientificName), videos: forPage(s.videos), dataCard: cleanCard(s.dataCard, s.sections) }), voices[s.id]))
    .filter(s => s.sections.length > 0)
  const plants = (await loadKind(root, 'plants', PlantSchema, lang, leaveOutHeld)).map(rememberGenerated)
    .map(p => cleanQuality({ ...p, sections: cleanSections(p.sections), photos: pagePhotos(p.photos) }))
    .filter(p => p.sections.length > 0)
  const guides = (await loadKind(root, 'guides', GuideSchema, lang, leaveOutHeld))
    .filter(g => allowed(g.source))
    // A video's sections show a photo and stills of their own, and a section's photo can lead the guide or a card.
    .map(g => ({ ...g, photos: cleanPhotos(g.photos), ...(g.video?.figures ? { video: { ...g.video, figures: g.video.figures.map(f => ({ ...f, moments: f.moments.filter(screened), ...(f.photo ? { photo: screened(f.photo) ? boxed(f.photo) : undefined } : {}) })) } } : {}) }))

  const changelogPath = join(root, 'changelog.json')
  const changelog = (await exists(changelogPath) ? await readJson(changelogPath, ChangelogSchema) : []).filter(e => allowed(e.source))

  const equipDir = join(root, 'equipment')
  const equipment: EquipmentGuide[] = []
  for (const f of (await readdir(equipDir).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort()) {
    // Another language has the guides translated so far (content/equipment/<lang>/<category>.json).
    const file = lang === 'vi' ? join(equipDir, f) : join(equipDir, lang, f)
    if (lang !== 'vi' && !(await exists(file))) continue
    const e = await readJson(file, EquipmentSchema)
    const types = e.types.map(t => (!t.photo ? t : { ...t, photo: cleanPhotos([t.photo])[0] }))
    // Its head picture waits like any other: a type's photo stands in, and with none to stand in the guide waits too.
    const hero = screened(e.hero) ? boxed(e.hero) : types.find(t => t.photo)?.photo
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
    const photos = cleanPhotos(g.photos.filter(p => !p.unchecked), speciesPage ? `species/${g.id}` : '', speciesPage?.scientificName ?? '', true)
    if (photos.length) galleries[g.id] = photos
  }

  // Breeds share the species' address space: a clash would silently drop one page, so it stops the build.
  // A care figure the engine hid (out of bounds, a tank too short for the fish: `hidden`) stays off the page.
  const shownCare = (care: BreedEntity['care']) => Object.fromEntries(Object.entries(care).map(([f, vs]) => [f, (vs ?? []).filter(v => !v.hidden)] as const).filter(([, vs]) => vs.length)) as BreedEntity['care']
  const breeds = (await loadKind(root, 'breeds', BreedSchema, lang, leaveOutHeld)).map(rememberGenerated).map(b => ({ ...b, care: shownCare(b.care), photos: pagePhotos(b.photos) }))
  // A newly passed real album photo immediately leads a formerly generated-only page, even before lead-photos runs.
  // Preserve explicitly fitted heads; add a fitted fallback only after ordinary publication admission.
  const fitsHead = (p: Photo) => p.headFit === 'contain' || photoFitsHead(p)
  const fishAndPlants = new Set<SpeciesEntity | PlantEntity | BreedEntity>([...species, ...plants])
  for (const page of [...species, ...plants, ...breeds]) if (page.photos.some(p=>p.headFit==='contain'||!photoFitsHead(p)) || page.photos[0]?.generated || (!page.photos.length && (generatedPages.has(page.id) || (galleries[page.id]??[]).some(p=>!p.generated&&photoFitsWholeHead(p))))) {
    // A non-commercial album photo isn't put first here: the engine's lead step does that, only where it's the one way to
    // show that fish (lead-photo.ts), and one that leads gives way to any open photo here (ncAlone).
    // Promotion turns an album photo into the page's own photo. Keep the ordinary album under its own rule.
    const albumHeads = (galleries[page.id] ?? []).filter(p => !isNonCommercial(p.licence) &&
      (!lookedForDead || !fishAndPlants.has(page) || lookedForDead(p.url)))
    const all=realPhotosFirst([...new Map([...page.photos,...albumHeads].map(p=>[p.url,p])).values()])
    const albumOnly=page.photos.filter(p=>!fitsHead(p))
    if(albumOnly.length)galleries[page.id]=realPhotosFirst([...new Map([...(galleries[page.id]??[]),...albumOnly].map(p=>[p.url,p])).values()])
    page.photos=page.photos.filter(fitsHead)
    const real = all.find(p => !p.generated && photoFitsHead(p))
    const whole = !real && all.find(p=>!p.generated&&(p.headFit==='contain'||photoFitsWholeHead(p)))
    if (real) page.photos = [real, ...page.photos.filter(p => p.url !== real.url)]
    else if(whole)page.photos=[{...whole,headFit:'contain'}]
    else if(all.some(p=>!p.generated))page.photos=page.photos.filter(p=>!p.generated)
    page.photos=ncAlone(page.photos)
  }
  // A fish's or breed's photo with no box, and a plant's taller than it is wide, framed by its whole area (`wholeBoxes`):
  // no frame cuts a fish whose place in the photo isn't known, or a plant's height. A square or wide plant photo fills.
  if (framed && opts.wholeBoxes !== false) {
    const whole = <P extends Photo>(p: P): P => (p.subject ? p : { ...p, subject: { x0: 0, y0: 0, x1: Math.floor(p.width), y1: Math.floor(p.height) } })
    const tall = <P extends Photo>(p: P): P => (p.height > p.width ? whole(p) : p)
    for (const x of [...species, ...breeds]) x.photos = x.photos.map(whole)
    for (const x of plants) x.photos = x.photos.map(tall)
    const fish = new Set([...species, ...breeds].map(x => x.id)), plant = new Set(plants.map(x => x.id))
    for (const [id, ps] of Object.entries(galleries)) galleries[id] = fish.has(id) ? ps.map(whole) : plant.has(id) ? ps.map(tall) : ps
  }
  const speciesSlugs = new Set(species.map(s => s.t.slug))
  const breedSlugs = new Set<string>()
  for (const b of breeds) {
    if (speciesSlugs.has(b.t.slug) || breedSlugs.has(b.t.slug)) throw new Error(`breed ${b.id}: slug "${b.t.slug}" is already a ${speciesSlugs.has(b.t.slug) ? 'species' : 'breed'} page`)
    breedSlugs.add(b.t.slug)
  }

  const products: Content['products'] = []
  for (const p of allProducts) {
    const file = join(root, 'products', p.id, `${MARKET[lang]}.json`)
    // A product's reviews keep their order and all stay: the first is the one the page embeds, and its points cite them by number.
    const shown = p.reviews ? { ...p, reviews: { ...p.reviews, videos: forPage(p.reviews.videos, { order: false, requireTitle: false }) } } : p
    products.push(await exists(file) ? { ...shown, market: await readJson(file, MarketSchema) } : shown)
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

  const allPlaces = (await loadKind(root, 'places', PlaceSchema, lang)).filter(p => placeNamed(p.t))
  return {
    lang, species, plants, guides, changelog, equipment, series, galleries, products, breeds, materials, cards,
    ...(screen ? { photoWaits } : {}),
    // A term's photos follow the same rules as a page's (publish gates, the watermark screen).
    // A kind's photo passes the same screen as the term's; a kind whose photo doesn't is shown without one.
    glossary: (await loadKind(root, 'glossary', GlossarySchema, lang)).map(g => ({
      ...g,
      ...(g.photos ? { photos: cleanPhotos(g.photos, g.id) } : {}),
      ...(g.kinds ? { kinds: g.kinds.flatMap(k => cleanPhotos([k.photo], g.id).map(photo => ({ ...k, photo }))) } : {}),
    })),
    // Another language's species pages are still being made: it has the places one of its fish comes from, so no origin
    // page is empty and no link points at one it lacks. Vietnamese has every place.
    places: allPlaces.filter(p => lang === 'vi' || species.some(s => s.places.includes(p.id))),
    placeNames: Object.fromEntries(allPlaces.map(p => [p.id, p.t.name])),
    sources,
    pictureHashes: (await exists(join(root, 'picture-hashes.json'))) ? await readJson(join(root, 'picture-hashes.json'), PictureHashesSchema) : {},
    pageDates: (await exists(join(root, 'page-dates.json'))) ? await readJson(join(root, 'page-dates.json'), PageDatesSchema) : {},
  }
}
