import { piece } from './pieces'
import { replacePhotoDocument } from './image-cache-write'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GallerySchema, hashDistance, IMAGE_SWITCHES, isAllowedLicence, isGenerated, isInatNonCommercial, isNonCommercial, photoAddressSet, SAME_PICTURE, thumbOf, type ImageSwitches, type Photo } from '@aq/schema'
import sharp from 'sharp'
import { LlmError } from './claude'
import { galleryPlan, TARGETS, TIER_ORDER, type PlanItem } from './gallery-plan'
import { gbifMediaPage, gbifUsageKey } from './gbif'
import { inatNcPage, inatPage, inatTaxon, newInatCursor, type InatCursor, type InatNcCursor } from './inat'
import { openversePage } from './openverse'
import { cantTellOn, OFF, type PhotoVerdict } from './photo-check'
import { namedOn, namedOrder, SPECIES, type Named } from './photo-named'
import { keptCap, keptMarks } from './own-mark'
import { isRejected, rejectedEntry, unfitCommons } from './photos'
import { captureWaiting, entriesDir, CLEARED_VERDICT, looks, notePlaces, placesIn, readSecondLook, withoutClearedWaits, type Stood } from './last-photo'
import { contactSheet } from './video-images'
import { authorText } from './wiki-author'
import { WikimediaRefused } from './wikimedia-rest'
import { shouldStripPhoto } from './watermarks'

/** A photo found for a species or plant, before screening: `key` identifies it across runs (Commons title, iNaturalist photo id…). */
export type Candidate = Photo & { key: string }
type Http = (url: string) => Promise<unknown>

/** Subcategories that are about the species but hold no photos of a living fish or plant. */
const SKIP_CAT = /in art|anatomy|stamps|maps|specimens|illustrations|drawings|museum|diseases|disorders|herbari/i

const text = (html = '') => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

type Members = { query?: { categorymembers?: { ns: number; title: string }[] }; continue?: { cmcontinue?: string } }
type Info = { query?: { pages?: Record<string, { title: string; imageinfo?: { width: number; mime: string; thumburl: string; thumbwidth: number; thumbheight: number; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] }> } }

/**
 * Commons photos of a species: its category and two levels of subcategories, then a search; open licences, ≥ 800 px.
 * `loose`: search the name's words rather than the exact phrase (a breed: few files carry "Crowntail betta" as such).
 */
export async function commonsCandidates(name: string, http: Http, max = 450, loose = false): Promise<Candidate[]> {
  const api = (q: Record<string, string>) => http(`https://commons.wikimedia.org/w/api.php?${new URLSearchParams({ format: 'json', ...q }).toString().replace(/\+/g, '%20')}`)
  const titles = new Set<string>()
  const walk = async (cat: string, depth: number) => {
    let cont: string | undefined
    do {
      const r = (await api({ action: 'query', list: 'categorymembers', cmtitle: cat, cmtype: 'file|subcat', cmlimit: '500', ...(cont ? { cmcontinue: cont } : {}) })) as Members
      for (const m of r.query?.categorymembers ?? []) {
        if (m.ns === 6) titles.add(m.title)
        else if (m.ns === 14 && depth < 2 && !SKIP_CAT.test(m.title)) await walk(m.title, depth + 1)
      }
      cont = r.continue?.cmcontinue
    } while (cont && titles.size < max)
  }
  await walk(`Category:${name}`, 0)
  const s = (await api({ action: 'query', list: 'search', srsearch: loose ? `filetype:bitmap ${name}` : `filetype:bitmap "${name}"`, srnamespace: '6', srlimit: '100' })) as { query?: { search?: { title: string }[] } }
  for (const x of s.query?.search ?? []) titles.add(x.title)
  const list = [...titles].filter(t => !unfitCommons({ title: t })).slice(0, max)
  const out: Candidate[] = []
  for (const batch of titleBatches(list)) {
    const r = (await api({ action: 'query', titles: batch.join('|'), prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280', iiextmetadatafilter: 'LicenseShortName|Artist|ImageDescription|Categories' })) as Info
    for (const p of Object.values(r.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0]
      const licence = ii?.extmetadata?.LicenseShortName?.value ?? ''
      if (!ii || ii.width < 800 || !/jpeg|png|webp/.test(ii.mime) || !isAllowedLicence(licence)) continue
      // Its own description and categories: a drawing, a dead or measured specimen, food, another species (photos.ts).
      if (unfitCommons({ title: p.title, description: ii.extmetadata?.ImageDescription?.value, categories: ii.extmetadata?.Categories?.value })) continue
      const url = ii.thumburl.replace(/\?.*$/, '') // without Commons' utm tracking query
      // Its description, kept beside the caption the album step writes, for the genus rule (photo-named.ts): the chief of
      // staff, 2026-11-14, after the Pseudoplatystoma album's Commons file was described as our fish in words our caption lost.
      const said = text(ii.extmetadata?.ImageDescription?.value).slice(0, 300)
      out.push({
        key: p.title, url, thumb: thumbOf(url) ?? url, width: ii.thumbwidth, height: ii.thumbheight, licence,
        author: authorText(ii.extmetadata?.Artist?.value) || 'Wikimedia Commons', sourceUrl: ii.descriptionurl, ...(said ? { sourceCaption: said } : {}),
      })
    }
  }
  return out
}

/**
 * Titles for one file-details request: 50 at most (the API's limit), fewer when their names are long. Commons refuses an
 * address past about 8,000 characters (HTTP 414), and museum shell series are named in whole sentences: until 2026-11-10
 * the nerite and mystery snails' pages failed here every cycle, so Commons was never read for them.
 */
export function titleBatches(titles: string[], most = 50, room = 6000): string[][] {
  const out: string[][] = []
  let used = 0
  for (const t of titles) {
    const size = encodeURIComponent(t).length + 3 // and the "|" between two, as it is sent
    if (!out.length || out.at(-1)!.length >= most || used + size > room) { out.push([]); used = 0 }
    out.at(-1)!.push(t)
    used += size
  }
  return out
}

export const SHEET = 20
/** What a kept photo shows, so a gallery mixes them (a plant's list differs from an animal's). */
export const FISH_KINDS = ['male', 'female', 'form', 'pair', 'juvenile', 'group', 'habitat', 'other'] as const
export const PLANT_KINDS = ['submersed', 'scape', 'emersed', 'flower', 'detail', 'habitat', 'other'] as const
export const VET_SCHEMA = {
  type: 'object', required: ['keep', 'best'],
  properties: { keep: { type: 'array', items: { type: 'object', required: ['n', 'caption', 'kind', 'setup'], properties: { n: { type: 'number' }, caption: { type: 'string' }, kind: { type: 'string', enum: [...new Set([...FISH_KINDS, ...PLANT_KINDS])] }, setup: { type: 'boolean' } } } }, best: { type: 'array', items: { type: 'number' } } },
}
const vetPrompt = (name: string, viName: string, strict?: boolean, plant?: boolean) => plant
  ? `Numbered photos that may show the aquarium plant ${name} (${viName}), for a photo gallery in an aquarium handbook.
${strict ? `${name} is a cultivar or trade form: keep only photos of it, not the plain species or its other forms.\n` : ''}Keep a photo only if it clearly shows living ${name}: in an aquarium, grown emersed, in a pot or in the wild, the plant the main subject, sharp enough to enjoy.
Reject: herbarium sheets, dried or pressed plants; held in a hand or with any person or body part; drawings, diagrams, maps, collages, screenshots, text overlays or banners; another plant as the main subject; a shop packshot (a pot or cup with a label); very blurry, or the plant tiny in the frame; a near-copy of a photo you keep (keep the better one).
For each kept photo give n, kind, setup and a caption. kind: "submersed" (growing under water), "scape" (one plant among others in a planted tank), "emersed" (growing above water or in a pot), "flower", "detail" (leaves or stem up close), "habitat" (in the wild), else "other". setup: true if the plant lies in a tray, box or cup, or beside a ruler or a printed board, else false. caption: Vietnamese, at most 12 words, saying what the photo shows, e.g. "Bụi ${viName} mọc dưới nước trong bể thủy sinh".
best: up to 3 numbers of the most beautiful, clearest photos on this sheet.`
  : `Numbered photos that may show ${name} (${viName}), for a photo gallery in an aquarium handbook.
${strict ? `${name} is a man-made line or hybrid: keep only photos of it, not the plain species or other varieties, colour forms or hybrids of the same fish.\n` : ''}Keep a photo only if it clearly shows a living ${name}: in an aquarium or in the wild, the fish the main subject, sharp enough to enjoy.
Reject: dead, preserved or in a jar; held in a hand or with any person or body part; drawings, diagrams, maps, collages, screenshots, text overlays or banners; another species as the main subject; very blurry, or the fish tiny in the frame; a near-copy of a photo you keep (keep the better one).
For each kept photo give n, kind, setup and a caption. kind: "male", "female", "pair", "juvenile", "group" (several together), "form" (a bred colour or fin form), "habitat" (in its wild place), else "other". setup: true if the fish is in a small photo tank, box, tray, cup or bucket, or beside a ruler or a printed board (a field or lab photo), else false. caption: Vietnamese, at most 12 words, saying what the photo shows (sex, colour form, where), e.g. "Cá betta đực đuôi dài màu đỏ trong bể thủy sinh".
best: up to 3 numbers of the most beautiful, clearest photos on this sheet.`

export type Vet = { keep: { n: number; caption: string; kind?: string; setup?: boolean }[]; best: number[] }
export type GalleryDeps = {
  http: Http; get: (url: string) => Promise<Uint8Array>; faces: (files: string[]) => Promise<number[]>; look: (file: string, prompt: string) => Promise<Vet>; sleep: (ms: number) => Promise<void>; now: () => Date
  /** Openverse's API with the requests left today (no client: the source is skipped). */
  openverse?: (url: string) => Promise<{ json: unknown; remaining: number }>
}

/** A 64-bit difference hash of an image (hex): near-copies (resized, re-encoded, imported from one site to another) differ in a few bits. */
export async function dhash(bytes: Uint8Array): Promise<string> {
  const px = await sharp(bytes).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer()
  let bits = ''
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += px[y * 9 + x]! > px[y * 9 + x + 1]! ? '1' : '0'
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0')
}
export const isNearCopy = (h: string, known: Iterable<string>) => { for (const k of known) if (hashDistance(h, k) <= SAME_PICTURE) return true; return false }

export type Screened = { key: string; photo: Photo; best: boolean; kind?: string; setup?: boolean; hash: string }

/**
 * The shared photo screening, for every gallery photo: each candidate downloaded (one that doesn't decode is skipped),
 * near-copies of a photo already shown (`hashes`) or of an earlier candidate dropped, human faces dropped (macOS
 * Vision), then contact sheets of 20 judged by Claude (the right species, alive, no people, no text, sharp).
 * Returns the kept photos in candidate order and how many sheets (model calls) it took.
 */
export async function screenTagged(cands: Candidate[], name: string, viName: string, d: GalleryDeps, o: { strict?: boolean; plant?: boolean; hashes?: Iterable<string> } = {}): Promise<{ kept: Screened[]; sheets: number }> {
  const dir = await mkdtemp(join(tmpdir(), 'aq-gal-'))
  try {
    const got: { c: Candidate; file: string; b: Buffer; hash: string }[] = []
    for (let i = 0; i < cands.length; i += 6) {
      await Promise.all(cands.slice(i, i + 6).map(async (c, j) => {
        try {
          const b = Buffer.from(await d.get(c.thumb ?? c.url))
          const hash = await dhash(b) // a corrupt image would break the whole contact sheet: skip it
          const file = join(dir, `${i + j}.jpg`)
          await writeFile(file, b)
          got.push({ c, file, b, hash })
        } catch (e) {
          // Wikimedia resting is no verdict on the photo: the whole screening stops, and its candidates stay queued
          // unjudged (a page's album, a breed's month) until the rest ends.
          if (e instanceof WikimediaRefused || e instanceof InatBytesSpent) throw e
          /* unreachable or corrupt thumb: skip */
        }
      }))
    }
    got.sort((a, b) => cands.indexOf(a.c) - cands.indexOf(b.c))
    // With `hashes` (galleries): near-copies of a photo shown, or of an earlier candidate, are dropped.
    const known = o.hashes ? [...o.hashes] : undefined
    const unique = known ? got.filter(g => !isNearCopy(g.hash, known) && (known.push(g.hash), true)) : got
    const faces = unique.length ? await d.faces(unique.map(g => g.file)) : []
    const clean = unique.filter((_, i) => faces[i] === 0)
    const kept: Screened[] = []
    let sheets = 0
    for (let i = 0; i < clean.length; i += SHEET) {
      const part = clean.slice(i, i + SHEET)
      const sheet = join(dir, `sheet-${i}.jpg`)
      await writeFile(sheet, await contactSheet(part.map(g => g.b), 240, 180, 5))
      const v = await d.look(sheet, vetPrompt(name, viName, o.strict, o.plant))
      sheets++
      const top = new Set(v.best ?? [])
      for (const k of v.keep ?? []) {
        const g = part[k.n - 1]
        if (!g || kept.some(x => x.key === g.c.key)) continue
        const { key, ...photo } = g.c
        kept.push({ key, photo: { ...photo, caption: k.caption.trim().slice(0, 120) }, best: top.has(k.n), ...(k.kind ? { kind: k.kind } : {}), ...(typeof k.setup === 'boolean' ? { setup: k.setup } : {}), hash: g.hash })
      }
    }
    kept.sort((a, b) => cands.findIndex(c => c.key === a.key) - cands.findIndex(c => c.key === b.key))
    return { kept, sheets }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Screened photos, best first (breed pages, Unsplash): `screenTagged` without the tags. */
export async function screen(cands: Candidate[], name: string, viName: string, d: GalleryDeps, strict?: boolean): Promise<Photo[]> {
  const { kept } = await screenTagged(cands, name, viName, d, { strict })
  return [...kept.filter(k => k.best), ...kept.filter(k => !k.best)].map(k => k.photo)
}

export type GalleryPhoto = Photo & { best?: boolean; kind?: string; setup?: boolean; unchecked?: boolean }
/**
 * A photo as a step adds it to a gallery: `unchecked`, so no page shows it until the photo check has judged it and left
 * it on (the chief of staff, 2026-11-10: of 2,611 gallery photos that check had judged, it took off 272, most as another
 * fish, and each had been on a page meanwhile). Every step that adds to a gallery adds through this.
 */
export const waiting = <P extends Photo>(p: P): P & { unchecked: true } => ({ ...p, unchecked: true })
const KIND_ORDER: string[] = [...FISH_KINDS, ...PLANT_KINDS]

/** Where the album check screened a photo, `undefined` for one it didn't (screenedAt). */
export type ScreenedAt = (p: Photo) => number | undefined

/**
 * The candidate key the album check knew a photo by, read off its source's address: an iNaturalist photo, a Commons file,
 * a Flickr photo, a GBIF occurrence. A GBIF candidate's key names its photo by the end of GBIF's address and its stored
 * copy by the start, and the photo keeps only the occurrence's page: an occurrence's photos (two albums hold two each on
 * 14 Nov) share its place and keep the order they have among themselves.
 */
function sourceKey(sourceUrl: string): string | undefined {
  let m: RegExpExecArray | null
  if ((m = /inaturalist\.org\/photos\/(\d+)/.exec(sourceUrl))) return `inat:${m[1]}`
  if ((m = /commons\.wikimedia\.org\/wiki\/(File:[^?#]+)/.exec(sourceUrl))) { try { return decodeURIComponent(m[1]!).replace(/_/g, ' ') } catch { return undefined } }
  if ((m = /flickr\.com\/photos\/[^/]+\/(\d+)/.exec(sourceUrl))) return `flickr:${m[1]}`
  if ((m = /gbif\.org\/occurrence\/(\d+)/.exec(sourceUrl))) return `gbif:${m[1]}`
  return undefined
}

/**
 * Where the album check screened each photo, from the album's state (GalleryState `judged`, in the order it screened
 * them). A photo another step added (a breed's, Tropica's, Unsplash's, a page's photo moved into its album) has none.
 */
export function screenedAt(judged: readonly string[]): ScreenedAt {
  const at = new Map<string, number>()
  judged.forEach((k, i) => { const key = k.startsWith('gbif:') ? k.split(':').slice(0, 2).join(':') : k; if (!at.has(key)) at.set(key, i) })
  return p => { const k = sourceKey(p.sourceUrl); return k === undefined ? undefined : at.get(k) }
}

/**
 * The photos the check screened in the order it screened them, then the rest (another step's) in the order they came: so
 * a second pass over an album gives the order the first gave.
 */
function inCheckOrder<P extends Photo>(ps: P[], at: ScreenedAt): P[] {
  return [...ps.filter(p => at(p) !== undefined).sort((a, b) => at(a)! - at(b)!), ...ps.filter(p => at(p) === undefined)]
}

/**
 * Round robin across kinds (male, female, colour form… in that order), each kind in the check's order. Not by size: each
 * source's copies are stored at one width (iNaturalist's 1,024, Commons' 1,200), the large ones capped too, so stored
 * width times height picked the squarest photo, not the largest (the chief of staff, 2026-11-14: it changed which photo
 * led 60 albums), and no file keeps the original's size.
 */
function mix(photos: GalleryPhoto[], at: ScreenedAt): GalleryPhoto[] {
  const groups = new Map<string, GalleryPhoto[]>()
  for (const p of photos) groups.set(p.kind!, [...(groups.get(p.kind!) ?? []), p])
  const lists = [...groups.entries()].sort(([a], [b]) => (KIND_ORDER.indexOf(a) + 1 || 99) - (KIND_ORDER.indexOf(b) + 1 || 99))
    .map(([, ps]) => inCheckOrder(ps, at))
  const out: GalleryPhoto[] = []
  while (lists.some(l => l.length)) for (const l of lists) if (l.length) out.push(l.shift()!)
  return out
}

/**
 * The album check's words for a fish in a photo tank, box, tray, cup or bucket, or beside a ruler (its captions), for a
 * photo it judged before it was asked (`setup`): 291 photos on 14 Nov.
 */
const SETUP_WORDS = /bể chụp|bể đo|trong hộp|hộp chụp|hộp quan sát|hộp đo|hộp nhựa|hộp acrylic|hộp nhỏ|hộp trong suốt|bể kính nhỏ|khay|thước đo|có thước|cạnh thước|bên thước|đo kích thước|lưới ô|trong cốc|cốc nhựa|trong xô|túi nước/i
/** A planted or aquascaped tank, which "bể kính nhỏ" (a small glass tank) can be too: not a photo tank, whatever else the caption says (the independent reader, 14 Nov). */
const PLANTED_WORDS = /thủy sinh|trồng cây|có cây|cây thủy/i
/**
 * What the other steps saw in an album photo, by its address, for the album's order (albumLooks):
 * - `typical`: the photo check's word on whether it shows the page's fish as it usually looks, where it was sure the
 *   photo shows that fish;
 * - `share`: how much of the frame the box step's box around the fish takes (engine-state/_photo-boxes.json);
 * - `setup`, `whole`, `small`: the album ask's answers (album-ask.ts): a photo tank or a ruler; the whole fish inside the
 *   frame; the fish filling only a small part of it.
 */
export type Look = { typical?: boolean; share?: number; setup?: boolean; whole?: boolean; small?: boolean }
export type Looks = (url: string) => Look
/** A photo of the fish in a photo tank, box, tray or cup, or beside a ruler or a printed board: the album ask's word, else the album check's, else its caption's. */
export const isSetup = (p: GalleryPhoto, l: Look = {}) => l.setup ?? p.setup ?? (SETUP_WORDS.test(p.caption ?? '') && !PLANTED_WORDS.test(p.caption ?? ''))
/** How many other photos an album shows before such a photo can be left behind them: a screen's worth (the strip). */
export const SETUP_ROOM = 6
/**
 * A lone fish whose box takes under a twentieth of the frame (the chief of staff, 2026-11-14: by eye 18 of the 25 such in
 * albums' first sixes were too small to make out; under a tenth, 10 of 24). Not a group's or a wild place's photo, where
 * the box is one fish of many or the place is the subject.
 */
export const TINY = 0.05
const MANY = new Set(['group', 'habitat'])
/** A photo that goes behind the others wherever six others show: a photo tank or a ruler, the fish cut by the frame or filling a small part of it, or a lone fish under TINY. */
export const isPoor = (p: GalleryPhoto, l: Look = {}) =>
  isSetup(p, l) || l.whole === false || l.small === true || (l.share !== undefined && l.share < TINY && !MANY.has(p.kind ?? ''))

/** The best picks mixed by kind, then photos screened before kinds were recorded, then the other kept photos mixed. */
function byKind(photos: GalleryPhoto[], at: ScreenedAt): GalleryPhoto[] {
  const tagged = (best: boolean) => photos.filter(p => p.kind !== undefined && !!p.best === best)
  return [...mix(tagged(true), at), ...inCheckOrder(photos.filter(p => p.kind === undefined), at), ...mix(tagged(false), at)]
}

/**
 * A gallery's order: the model's best picks first, mixed so the first screen shows the range (male, female, colour
 * forms, young, the wild fish; a plant under water, emersed, in flower), each kind in the order the check screened it
 * (`at`); then photos screened before kinds were recorded, in that order too; then the other kept photos, mixed the same
 * way. Where six photos the photo check called typical show, those come first, then the ones it hasn't judged, then the
 * ones it called not typical (the chief of staff, 2026-11-14: 16 albums led with a photo it called not typical; with the
 * typical ones first, 13 of 24 leads that changed were better by eye, 10 as good, 1 worse). Photo-tank and
 * ruler photos, fish cut by the frame or filling a small part of it (isPoor) stay in the album but come after all of those
 * wherever six others show (the chief of staff, 2026-11-14: a measuring board led the green swordtail's 60), ordered the
 * same way among themselves. Then, whatever their rank, the photos the photo check could not tell show the page's subject
 * (`cantTell`: photo-check.ts cantTellOn), so a later run keeps the place the check gave them; then the photos with a
 * cleared shop's own mark kept (`kept`, own-mark.ts), ordered the same way among themselves (the chief of staff, 15 Nov),
 * after every other real photo, a non-commercial one too (below); AI pictures last. Each part is ordered on its own, so ordering an album twice changes nothing: the sweep orders every
 * album so each cycle (orderAlbums), with the same `looks` as the album step, so the two agree. A photo its source names
 * only with "cf.", to its genus or as another fish (`named`, photo-named.ts) goes behind those it names better, among
 * the photos the check is sure of and among those it can't tell alike, so the photo check's moving the latter last keeps
 * the order (the chief of staff, 2026-11-14). A non-commercial photo (isNonCommercial: iNaturalist's CC BY-NC and CC
 * BY-NC-SA, behind their switch) comes after every open one with no mark, those ordered the same way among themselves
 * (the owner's yes, 10 Nov), and before the kept-mark photos: the owner was told a banner photo sits below the clean
 * ones, and a non-commercial photo is a clean one (the chief of staff, 19 Nov).
 */
export function rankGallery(photos: GalleryPhoto[], cantTell: (url: string) => boolean = () => false, at: ScreenedAt = () => undefined, looks: Looks = () => ({}), named: (p: GalleryPhoto) => Named = () => SPECIES, kept: (url: string) => boolean = () => false): GalleryPhoto[] {
  const marked = photos.filter(p => !isGenerated(p) && kept(p.url))
  if (marked.length) {
    const rest = rankGallery(photos.filter(p => !marked.includes(p)), cantTell, at, looks, named)
    return [...rest.filter(p => !isGenerated(p)), ...rankGallery(marked, cantTell, at, looks, named), ...rest.filter(isGenerated)]
  }
  const nc = photos.filter(p => !isGenerated(p) && isNonCommercial(p.licence))
  if (nc.length && nc.length < photos.length) {
    const rest = rankGallery(photos.filter(p => !nc.includes(p)), cantTell, at, looks, named)
    return [...rest.filter(p => !isGenerated(p)), ...rankGallery(nc, cantTell, at, looks, named), ...rest.filter(isGenerated)]
  }
  const real = photos.filter(p => !isGenerated(p))
  const sure = real.filter(p => !cantTell(p.url)), unsure = real.filter(p => cantTell(p.url))
  const poor = (p: GalleryPhoto) => isPoor(p, looks(p.url))
  const back = sure.filter(p => !poor(p) && !p.unchecked).length >= SETUP_ROOM ? poor : () => false
  // Where six typical show: typical, then not judged yet, then not typical.
  const typed = sure.filter(p => !p.unchecked && looks(p.url).typical === true).length >= SETUP_ROOM
  const step = (p: GalleryPhoto) => { const t = looks(p.url).typical; return !typed || t === true ? 0 : t === undefined ? 1 : 2 }
  const front = sure.filter(p => !back(p))
  const parts = [...[0, 1, 2].map(k => front.filter(p => step(p) === k)), sure.filter(back)]
  const order = (ps: GalleryPhoto[]) => namedOrder(ps, named, p => !p.unchecked)
  return [...order(parts.flatMap(ps => byKind(ps, at))), ...order(byKind(unsure, at)), ...photos.filter(isGenerated)]
}

/**
 * What the photo check, the box step and the album ask saw in each album photo (Look), for one album's page: the same for
 * the album step, the sweep and Tropica's photos, so none of them undoes another's order.
 */
export async function albumLooks(root: string, subjects?: Record<string, Record<string, PhotoVerdict>>): Promise<(page: string) => Looks> {
  const read = async <T>(f: string) => JSON.parse(await readFile(join(root, 'engine-state', f), 'utf8').catch(() => '{}')) as T
  const subs = subjects ?? await read<Record<string, Record<string, PhotoVerdict>>>('_photo-subjects.json')
  const boxes = await read<Record<string, { w: number; h: number } | null>>('_photo-boxes.json')
  const asked = await read<Record<string, AlbumAnswer>>(ALBUM_ASK_FILE)
  return page => url => {
    const v = subs[url]?.[page], b = boxes[url], a = asked[url]
    return {
      ...(v && !v.guide && v.ok === 'yes' && typeof v.typical === 'boolean' ? { typical: v.typical } : {}),
      ...(b ? { share: b.w * b.h } : {}),
      ...(a && typeof a.setup === 'boolean' ? { setup: a.setup } : {}),
      ...(a && typeof a.whole === 'boolean' ? { whole: a.whole } : {}),
      ...(a && typeof a.small === 'boolean' ? { small: a.small } : {}),
    }
  }
}
/** The album ask's answers by photo address (album-ask.ts); `tries` counts sheets that gave none, so a photo is asked at most twice. */
export const ALBUM_ASK_FILE = '_album-ask.json'
export type AlbumAnswer = { setup?: boolean; whole?: boolean; small?: boolean; tries?: number }

/**
 * Where each source stands for one species, plant or breed (engine-state/gallery/<id>.json), so each run continues
 * where the last stopped: iNaturalist's cursor, when Commons was read, GBIF's and Openverse's next page; candidates found
 * but not screened yet (`queue`); every candidate screened, kept or not (`judged`), never screened again; the image hash
 * of every photo shown, against near-copies; `exhausted`: the day every source ran dry below target (tried again later);
 * `seeded`: the keys of queued candidates a person found by hand (gallery-seed.ts), until they are screened; `inatNc`:
 * iNaturalist's non-commercial pass, read only while its switch is on.
 */
export type GalleryState = {
  inat?: InatCursor
  inatNc?: InatNcCursor
  commons?: string
  gbif?: { key: number | null; next: number | null }
  openverse?: { next: number | null }
  queue: Candidate[]
  judged: string[]
  hashes: Record<string, string>
  exhausted?: string
  seeded?: string[]
}
/**
 * How far past its target a full album may grow, from candidates a person seeded only: a full album is never read for its
 * sources' own finds. The chief of staff, 2026-11-12, for the weather loach, whose album was full and whose head can't
 * reach the card's size: a card-size photo found by hand had no way in.
 */
export const SEED_OVER = 3
/** Requests a run may make to each source (iNaturalist asks for about one a second and under 10,000 a day; Openverse lets anonymous clients make 200 a day). */
export type SourceBudget = { inat: number; gbif: number; openverse: number }
const RETRY_DAYS = 30
const UNSPLASH = 'Unsplash License'
/** The source a candidate key came from, for the report. */
export const sourceOfKey = (key: string) => (key.startsWith('inat:') ? 'iNaturalist' : key.startsWith('flickr:') ? 'Openverse (Flickr)' : key.startsWith('gbif:') ? 'GBIF' : 'Wikimedia Commons')
class OutOfBudget extends Error {}
/**
 * iNaturalist's photo bytes a run of the album step may download (the photos it screens, at iNaturalist's "medium" size,
 * 500 px). iNaturalist asks for under 5 GB of photos an hour and 24 GB a day (its API's recommended practices); the step
 * runs once a cycle, about 8 a day, so its runs stay under 1.6 GB a day whatever they meet. A run starts no download once
 * it has reached the cap, but the six downloads of a batch start together (`screenTagged`), so a run can end up to one
 * batch past it: six photos at 500 px, about a megabyte.
 */
export const INAT_BYTES = 200_000_000
/**
 * Non-commercial album photos that may wait for the photo check at once. They are judged last, behind every other photo
 * that waits, so past this the album step reads no more of them: more would only wait, their screening paid for (the
 * chief of staff, 2026-11-17).
 */
export const NC_WAITING = 200
/** The run's iNaturalist photo bytes are spent: the run stops, and the candidates it hadn't screened stay queued. */
class InatBytesSpent extends Error {}
const isInatPhoto = (url: string) => /(^|\.)inaturalist\.org$|^inaturalist-open-data\.s3\.amazonaws\.com$/.test(new URL(url).host)

type Page = { scientificName?: string; photos: Photo[]; commons?: string }

/**
 * The names a breed's photos are searched by: its English and trade names from its research
 * (engine-state/breeds/<id>.json, where its page's English names come from; Commons and Flickr describe photos in
 * English, so never its Vietnamese names), each without a note in brackets ("King Kong parrot (large form)"); its id's
 * words when it has no research. Its own name first; left out, a single word but its own name ("Moor", "Lionhead",
 * "Plakat" are other things there) and a name another breed has too (koi's "Butterfly koi").
 */
export async function breedNames(root: string, id: string): Promise<string[]> {
  const read = async (b: string) => (JSON.parse(await readFile(join(root, 'engine-state/breeds', `${b}.json`), 'utf8').catch(() => '{}')) as { enNames?: string[] }).enNames ?? []
  const clean = (n: string) => n.replace(/\s*\([^)]*\)/g, '').trim()
  const others = new Set<string>()
  for (const b of await readdir(join(root, 'content/breeds')).catch(() => [] as string[])) if (b !== id) for (const n of await read(b)) others.add(clean(n).toLowerCase())
  const research = (await read(id)).map(clean).filter(Boolean)
  const out: string[] = []
  for (const [i, n] of (research.length ? research : [id.replace(/-/g, ' ')]).entries()) {
    if (out.some(x => x.toLowerCase() === n.toLowerCase()) || (i > 0 && (!n.includes(' ') || others.has(n.toLowerCase())))) continue
    out.push(n)
  }
  return out
}

/**
 * Commons photos of a breed: its own category when it has one (Category:Koi), then each of its names as a phrase, and
 * the first name's words when it has no category (few files carry "Balloon molly" as such). Each file once.
 */
async function breedCommons(category: string | undefined, names: string[], http: Http): Promise<Candidate[]> {
  const cat = category?.replace(/^Category:/i, '').trim()
  const out = new Map<string, Candidate>()
  if (cat) for (const c of await commonsCandidates(cat, http)) out.set(c.key, c)
  for (const [i, n] of names.entries()) {
    if (n.toLowerCase() === cat?.toLowerCase()) continue
    for (const c of await commonsCandidates(n, http, 450, !cat && i === 0)) if (!out.has(c.key)) out.set(c.key, c)
  }
  return [...out.values()]
}

/**
 * What every other breed page shows (its photos and gallery): their addresses, and their image hashes from the gallery
 * state. A photo there stays there: Commons and Flickr rarely say which line a fish is (red-tailed golden or super red).
 */
async function otherBreeds(root: string, id: string): Promise<{ urls: Set<string>; hashes: string[] }> {
  const read = async <T>(f: string) => JSON.parse(await readFile(join(root, f), 'utf8').catch(() => 'null')) as T | null
  const urls = new Set<string>()
  const hashes: string[] = []
  for (const b of await readdir(join(root, 'content/breeds')).catch(() => [] as string[])) {
    if (b === id) continue
    const e = await read<{ photos?: Photo[] }>(`content/breeds/${b}/entity.json`)
    const g = await read<{ photos: Photo[] }>(`content/gallery/${b}.json`)
    for (const p of [...e?.photos ?? [], ...g?.photos ?? []]) urls.add(p.url).add(p.sourceUrl)
    hashes.push(...Object.values((await read<GalleryState>(`engine-state/gallery/${b}.json`))?.hashes ?? {}).filter(Boolean))
  }
  return { urls, hashes }
}

/**
 * Tops up the galleries of species, plants and breeds below their tier's target (gallery-plan.ts), most popular first,
 * until `sheets` contact sheets (model calls) are spent. Candidates come from iNaturalist first (every observation with an
 * open-licence photo, research grade, then a community ID that agrees), then Wikimedia Commons, GBIF and Openverse; a
 * breed's from Commons and Openverse only, by its English and trade names (`breedNames`), screened for that line alone;
 * photos the owner rejected or the page already shows are left out; the rest go through the shared screening
 * (`screenTagged`), and only the photos it keeps are added. A page whose sources run dry below target is reported as
 * short and tried again after 30 days. Photos the owner rejected leave every gallery. Stops on a model failure (usage
 * limit). With IMAGE_SWITCHES.inatNonCommercial on (`switches`), iNaturalist's research-grade CC BY-NC and CC BY-NC-SA
 * photos are a last source, read once every open one has run dry. content/gallery/<id>.json;
 * engine-state/gallery/<id>.json; docs/review/galleries.md.
 */
export async function galleries(root: string, deps: GalleryDeps, o: { sheets: number; only?: string; budget?: Partial<SourceBudget>; shard?: [number, number]; switches?: Readonly<ImageSwitches>; inatBytes?: number; ncWaiting?: number }) {
  const content = join(root, 'content')
  const report = { done: [] as string[], failed: [] as string[], stopped: '', sheets: 0, added: {} as Record<string, number>, short: [] as string[], inatBytes: 0, ncWaiting: 0 }
  // Every iNaturalist photo the run downloads is counted; once at the cap (INAT_BYTES) it starts no more, and the run stops.
  const inatCap = o.inatBytes ?? INAT_BYTES
  const d: GalleryDeps = {
    ...deps,
    get: async url => {
      if (!isInatPhoto(url)) return deps.get(url)
      if (report.inatBytes >= inatCap) throw new InatBytesSpent(`iNaturalist's photo bytes for this run spent (${Math.round(report.inatBytes / 1e6)} MB)`)
      const b = await deps.get(url)
      report.inatBytes += b.byteLength
      return b
    },
  }
  const sl = await readSecondLook(root)
  const rejected = JSON.parse(await readFile(join(root, 'engine-state/_photo-rejected.json'), 'utf8').catch(() => '{}')) as Record<string, string>
  const cleanupRejected = withoutClearedWaits({ ...rejected }, sl)
  const pendingPlaces = new Map<string, string[]>()
  for (const [url, mark] of Object.entries(sl)) {
    if (mark.back) continue
    for (const { file } of mark.left ?? []) {
      const id = /^content\/gallery\/([^/]+)\.json$/.exec(file)?.[1]
      if (id) pendingPlaces.set(id, [...(pendingPlaces.get(id) ?? []), url])
    }
  }
  // Keep the intake hold until recovery restores the saved entry. Cleanup can leave an existing cleared copy in place.
  const rejectedPhoto = isRejected(rejected)
  // A photo the photo check took off a page (another fish, none, dead), by its address in our bucket: never back in that
  // page's gallery, from a search or from the queue. A hand seed (gallery-seed.ts) queued a bred discus the owner had
  // judged off Heckel's discus by eye, and the gallery's own screening put it back (2026-11-08).
  const subjects = JSON.parse(await readFile(join(root, 'engine-state/_photo-subjects.json'), 'utf8').catch(() => '{}')) as Record<string, Record<string, PhotoVerdict>>
  const offBy = new Map<string, Record<string, string>>()
  // One a second look cleared isn't off on that verdict on the pages its record names, so their albums may take it again
  // (last-photo.ts); another page's verdict still keeps it off that page (the chief of staff, 20 Nov 2026). For one marked
  // off at its first verdict, the clear answers only the dead fish there: another fish, nothing of the subject or "no" on
  // its own page still keeps it out, as in the put-back (CLEARED_VERDICT; the chief of staff, 21 Nov). The record names
  // pages as kind/id, the verdicts by id.
  const cleared = looks(sl).cleared
  const clearedOn = (url: string, id: string, ok: PhotoVerdict['ok']) => cleared(url) && sl[url]!.pages.some(p => p.slice(p.indexOf('/') + 1) === id) && (sl[url]!.off !== true || ok === CLEARED_VERDICT)
  for (const [url, pages] of Object.entries(subjects)) for (const [id, v] of Object.entries(pages)) if (OFF.has(v.ok) && !clearedOn(url, id, v.ok)) (offBy.get(id) ?? offBy.set(id, {}).get(id)!)[url] = v.ok
  const gbifNames = JSON.parse(await readFile(join(root, 'engine-state/_gbif-names.json'), 'utf8').catch(() => '{}')) as Record<string, { canonicalName: string } | null>
  const looksOn = await albumLooks(root, subjects)
  const on = await namedOn(content)
  const markKept = await keptMarks(root)
  const left: SourceBudget & { sheets: number } = { inat: 150, gbif: 60, openverse: 20, ...o.budget, sheets: o.sheets }
  const nc = (o.switches ?? IMAGE_SWITCHES).inatNonCommercial
  // Openverse is slow (20 s or more a query) and sometimes stalls: after 3 failures it rests until the next run.
  let openverseFailures = 0
  const today = d.now().toISOString().slice(0, 10)
  const days = (date: string) => (d.now().getTime() - Date.parse(date)) / 86_400_000
  const rejection = rejectedEntry(cleanupRejected)
  const why = (url: string) => {
    const entry = rejection(url)
    return entry?.[1].startsWith('watermark:') && (markKept(url) || markKept(entry[0])) ? undefined : entry?.[1]
  }
  await dropRejected(root, content, why, captureWaiting(sl, rejection))
  // `shard` [i, n]: every n-th page from the i-th, so n runs can share the work (each still most popular first).
  const plan = (await galleryPlan(root)).filter((t, i) => (!o.only || t.id === o.only) && (!o.shard || i % o.shard[1] === o.shard[0]))
  // Each source's requests: counted against the run's budget, at the pace the source asks for (shared by n shards).
  const runs = o.shard?.[1] ?? 1
  const paced = (name: keyof SourceBudget, gap: number) => async (url: string) => {
    if (left[name] <= 0) throw new OutOfBudget(name)
    left[name]--
    await d.sleep(gap * runs)
    return d.http(url)
  }
  const inat = paced('inat', 1100)
  const gbif = paced('gbif', 300)
  const size = async (url: string) => { const m = await sharp(Buffer.from(await d.get(url))).metadata(); return m.width && m.height ? { width: m.width, height: m.height } : null }

  // Non-commercial album photos waiting for the photo check now, and while under NC_WAITING, room to read more.
  if (nc) for (const f of (await readdir(join(content, 'gallery')).catch(() => [] as string[])).filter(f => f.endsWith('.json'))) {
    const g = JSON.parse(await readFile(join(content, 'gallery', f), 'utf8')) as { photos?: GalleryPhoto[] }
    report.ncWaiting += (g.photos ?? []).filter(p => p.unchecked && isNonCommercial(p.licence)).length
  }
  const ncRoom = () => report.ncWaiting < (o.ncWaiting ?? NC_WAITING)
  /** Every open source of a species' or plant's page read to its end: iNaturalist's open passes, Commons, GBIF, Openverse. */
  const openDry = (st: GalleryState) => st.inat?.pass === 'done' && !!st.gbif && (!st.gbif.key || st.gbif.next === null) && !!st.commons && (!d.openverse || st.openverse?.next === null)
  // Two rounds with the non-commercial switch on: every page's open sources first, then iNaturalist's non-commercial pass
  // with the sheets left, on pages whose open sources are read to their end. They rank last, so they never take a run's
  // sheets from an open photo further down the plan (the chief of staff, 2026-11-17).
  // The non-commercial round takes the pages with no photo of their own first, in the plan's order, then the rest: where
  // these photos matter (the chief of staff, 2026-11-17).
  const ownPhoto = new Set<string>()
  if (nc) for (const t of plan) {
    const e = JSON.parse(await readFile(join(content, t.kind, t.id, 'entity.json'), 'utf8').catch(() => '{}')) as { photos?: Photo[] }
    if ((e.photos ?? []).some(p => !isGenerated(p))) ownPhoto.add(t.id)
  }
  const ncPlan = [...plan.filter(t => !ownPhoto.has(t.id)), ...plan.filter(t => ownPhoto.has(t.id))]
  // A page with no photo of its own reads that pass right after iNaturalist's open passes, where one of its photos may
  // be the one way to show that fish (lead-photo.ts); a page with one, once every open source is read to its end (the
  // chief of staff's rule, 17 Nov).
  const ncReady = (t: PlanItem, st: GalleryState) => (ownPhoto.has(t.id) ? openDry(st) : st.inat?.pass === 'done')
  for (const ncRound of nc ? [false, true] : [false]) for (const t of ncRound ? ncPlan : plan) {
    if (left.sheets <= 0 || report.stopped || (ncRound && !ncRoom())) break
    const gfile = join(content, 'gallery', `${t.id}.json`)
    const g = JSON.parse(await readFile(gfile, 'utf8').catch(() => 'null')) as { photos: GalleryPhoto[]; seen: number; updatedAt: string; builtAt?: string } | null
    let gallery = g?.photos ?? []
    const sfile = join(root, 'engine-state/gallery', `${t.id}.json`)
    const saved = JSON.parse(await readFile(sfile, 'utf8').catch(() => 'null')) as GalleryState | null
    // A full album is read only for what a person seeded, and those alone (SEED_OVER).
    const seeded = new Set((saved?.seeded ?? []).filter(k => saved!.queue.some(q => q.key === k)))
    const full = gallery.length >= t.target
    if (full && !seeded.size) continue
    const limit = full ? t.target + SEED_OVER : t.target
    // Full to its last seeded space: the seeds left wait in the queue for a photo the check takes off.
    if (gallery.length >= limit) continue
    const st: GalleryState = saved ?? { queue: [], judged: [], hashes: {} }
    // A pass read to its end can still leave candidates queued (the waiting limit, the run's sheets or its bytes stopped
    // its round): its round screens them in a later run, and the page runs dry once they're judged.
    const ncQueued = st.queue.some(c => isNonCommercial(c.licence))
    if (ncRound && (t.kind === 'breeds' || (st.inatNc?.done && !ncQueued) || !ncReady(t, st))) continue
    // A page dry before the non-commercial switch went on has never read that pass: it is read now, not in a month.
    const ncUnread = ncRound && !st.inatNc
    const due = !st.exhausted || !!o.only || days(st.exhausted) >= RETRY_DAYS
    if (!due && !ncUnread) continue
    // Read for that pass alone: the open sources stay dry from the day they ran dry, so their month isn't put back.
    const drySince = due ? undefined : st.exhausted
    if (st.exhausted && due) {
      // A month on: new observations are past iNaturalist's cursor; the other sources are read again (what was judged stays judged).
      if (st.inat?.taxon) st.inat.pass = 'research'
      delete st.commons
      if (st.gbif?.key) st.gbif.next = 0
      delete st.openverse
      if (nc && st.inatNc) delete st.inatNc.done
    }
    delete st.exhausted
    // A gallery the old step built screened every Commons candidate it found then: those count as judged. Not a breed's:
    // the breed step searched one name, and the photos it kept stay out by address and image hash.
    const legacy = !saved && t.kind !== 'breeds' && gallery.some(p => !p.source && p.licence !== UNSPLASH)
    const before = gallery.length
    let seenCount = g?.seen ?? 0
    let page: Page | undefined
    const save = async () => {
      // That pass not read after all (iNaturalist's requests ran out): still dry from the same day, the pass to come.
      if (drySince && !st.inatNc) st.exhausted = drySince
      // Hashes of photos still shown only (a photo moved to our bucket has a new address).
      const shown = new Set([...page?.photos ?? [], ...gallery].map(p => p.url))
      st.hashes = Object.fromEntries(Object.entries(st.hashes).filter(([u]) => shown.has(u)))
      st.seeded = st.seeded?.filter(k => st.queue.some(q => q.key === k))
      if (!st.seeded?.length) delete st.seeded
      await mkdir(join(root, 'engine-state/gallery'), { recursive: true })
      await writeFile(sfile, `${JSON.stringify(st, null, 1)}\n`)
    }
    try {
      const e = JSON.parse(await readFile(join(content, t.kind, t.id, 'entity.json'), 'utf8')) as Page
      page = e
      const vi = JSON.parse(await readFile(join(content, t.kind, t.id, 'vi.json'), 'utf8').catch(() => '{}')) as { name?: string }
      // A breed (a line, colour form or hybrid people made) has no scientific name: it goes by its first English name, is
      // searched on Commons and Openverse (iNaturalist and GBIF know species, and give the wild fish), and a photo another
      // breed's page shows is not a candidate.
      const breed = t.kind === 'breeds'
      const search = breed ? await breedNames(root, t.id) : []
      const other = breed ? await otherBreeds(root, t.id) : { urls: new Set<string>(), hashes: [] }
      const sci = breed ? search[0]! : e.scientificName!
      // A cultivar or trade form ("Anubias barteri 'Mini Coin'", "Eriocaulon sp. 'Vietnam'"), and every breed: only its own
      // name, never its species' photos, and screened for that form alone. A variety's name also as iNaturalist writes it ("Anubias barteri nana").
      const line = breed || /['‘’"]|\bsp\./.test(sci)
      const names = line ? [sci] : [sci, sci.replace(/\s(?:var|subsp|ssp|f)\.\s/, ' '), gbifNames[sci]?.canonicalName ?? '']
      const seen = new Set([...[...e.photos, ...gallery].flatMap(p => [p.url, p.sourceUrl]), ...other.urls])
      const judged = new Set(st.judged)
      const offHere = isRejected(offBy.get(t.id) ?? {})
      const awaitingRecovery = photoAddressSet(pendingPlaces.get(t.id) ?? [])
      const offIntake = (url: string) => offHere(url) || rejectedPhoto(url) || awaitingRecovery(url)
      // A candidate queued before it joined the never-again list (by any address) never reaches the screen.
      st.queue = st.queue.filter(c => !offIntake(c.url))
      // Its switch off, a non-commercial candidate queued while it was on is never screened.
      if (!nc) st.queue = st.queue.filter(c => !isNonCommercial(c.licence))
      const isNew = (c: Candidate) => !offIntake(c.url) && !seen.has(c.url) && !seen.has(c.sourceUrl) && !judged.has(c.key) && !st.queue.some(q => q.key === c.key)
      for (const p of [...e.photos, ...gallery]) {
        if (!st.hashes[p.url]) st.hashes[p.url] = await d.get(p.thumb ?? p.url).then(dhash).catch(() => '')
      }
      const skip = new Set<string>() // sources that failed or ran out of budget for this page this run
      /** The next batch of candidates from the first source with more to give; null when none has (this run). */
      const more = async (): Promise<Candidate[] | null> => {
        const attempt = async (name: string, f: () => Promise<Candidate[]>) => {
          try { return await f() } catch (err) {
            skip.add(name)
            if (name === 'openverse' && !(err instanceof OutOfBudget) && ++openverseFailures >= 3) left.openverse = 0
            if (!(err instanceof OutOfBudget)) report.failed.push(`${t.id} ${name}: ${(err as Error).message.slice(0, 120)}`)
            return undefined
          }
        }
        if (!breed && !skip.has('inat') && st.inat?.pass !== 'done') {
          const r = await attempt('inat', async () => {
            st.inat ??= newInatCursor(await inatTaxon(names, inat))
            const p = await inatPage(st.inat, inat)
            st.inat = p.cursor
            return p.cands
          })
          if (r) return r
        }
        // iNaturalist's CC BY-NC and CC BY-NC-SA photos, its switch on: in their own round, so they fill only what no open
        // photo can; on a page with a photo of its own once every open source is read to its end (one out of requests this
        // run is not), on a page with none right after iNaturalist's open passes (`ncReady`).
        if (ncRound && !breed && !skip.has('inat') && !st.inatNc?.done && ncReady(t, st) && ncRoom()) {
          const r = await attempt('inat', async () => {
            st.inat ??= newInatCursor(await inatTaxon(names, inat))
            const p = await inatNcPage(st.inat.taxon, st.inatNc ?? { after: 0 }, inat)
            st.inatNc = p.cursor
            return p.cands
          })
          if (r) return r
        }
        if (!skip.has('commons') && !st.commons) {
          const r = await attempt('commons', () => (breed ? breedCommons(e.commons, search, d.http) : commonsCandidates(sci, d.http)))
          if (r) {
            st.commons = today
            if (!legacy) return r
            st.judged.push(...r.map(c => c.key)); r.forEach(c => judged.add(c.key))
            return []
          }
        }
        if (!breed && !skip.has('gbif') && (!st.gbif || (st.gbif.key && st.gbif.next !== null))) {
          const r = await attempt('gbif', async () => {
            st.gbif ??= { key: line ? null : await gbifUsageKey(gbifNames[sci]?.canonicalName ?? sci, gbif), next: 0 }
            if (!st.gbif.key || st.gbif.next === null) return []
            const p = await gbifMediaPage(st.gbif.key, st.gbif.next, gbif, size)
            st.gbif.next = p.next
            return p.cands
          })
          if (r) return r
        }
        if (d.openverse && !skip.has('openverse') && st.openverse?.next !== null) {
          const api = d.openverse
          const r = await attempt('openverse', async () => {
            if (left.openverse <= 0) throw new OutOfBudget('openverse')
            left.openverse--
            await d.sleep(3100 * runs) // 20 a minute
            const p = await openversePage(sci, st.openverse?.next ?? 1, api)
            st.openverse = { next: p.next }
            if (p.remaining < 10) left.openverse = 0 // leave the day's last requests alone
            return p.cands
          })
          if (r) return r
        }
        return null
      }
      const dry = () => (breed || (st.inat?.pass === 'done' && !!st.gbif && (!st.gbif.key || st.gbif.next === null) && (!nc || !!st.inatNc?.done))) && !!st.commons && (!d.openverse || st.openverse?.next === null)

      while (gallery.length < limit && left.sheets > 0 && (!ncRound || ncRoom())) {
        const want = Math.max(SHEET, (t.target - gallery.length) * 2)
        while (!full && st.queue.length < want) {
          const got = await more()
          if (got === null) break
          st.queue.push(...got.filter(isNew))
        }
        // The open round screens no non-commercial candidate left queued from an earlier run: those wait for their own round.
        const pool = (full ? st.queue.filter(c => seeded.has(c.key)) : st.queue).filter(c => ncRound || !isNonCommercial(c.licence))
        if (!pool.length) break
        // A full album screens no more seeds than it has spaces, so none is judged and then turned away for want of room.
        const chunk = pool.slice(0, full ? Math.min(SHEET, limit - gallery.length) : SHEET)
        // A breed's Vietnamese name without the English one in brackets ("Cá bình tích balloon (Balloon molly)").
        const viName = (breed ? vi.name?.replace(/\s*\(.*\)\s*$/, '') : vi.name) || sci
        const r = await piece(`${t.id}/${chunk[0]?.key}`, () => screenTagged(chunk, sci, viName, d, { plant: t.kind === 'plants', strict: line, hashes: [...Object.values(st.hashes).filter(Boolean), ...other.hashes] }))
        st.queue = st.queue.filter(c => !chunk.includes(c))
        st.judged.push(...chunk.map(c => c.key))
        chunk.forEach(c => judged.add(c.key))
        left.sheets -= r.sheets
        report.sheets += r.sheets
        seenCount += chunk.length
        const kept = r.kept
        report.ncWaiting += kept.filter(k => isNonCommercial(k.photo.licence)).length
        for (const k of kept) {
          st.hashes[k.photo.url] = k.hash
          report.added[sourceOfKey(k.key)] = (report.added[sourceOfKey(k.key)] ?? 0) + 1
        }
        gallery = rankGallery([...gallery, ...kept.map(k => waiting({ ...k.photo, best: k.best, kind: k.kind ?? 'other', ...(k.setup !== undefined ? { setup: k.setup } : {}) }))], cantTellOn(subjects, t.id), screenedAt(st.judged), looksOn(t.id), on(t.id), markKept)
        if (kept.length) {
          await mkdir(join(content, 'gallery'), { recursive: true })
          await writeFile(gfile, `${JSON.stringify(GallerySchema.parse({ id: t.id, photos: gallery, seen: seenCount, updatedAt: today, builtAt: today }), null, 2)}\n`)
        }
        await save()
      }
      if (gallery.length < t.target && !st.queue.length && dry()) st.exhausted = drySince ?? today
      await save()
      report.done.push(`${t.id}${ncRound ? ' (non-commercial)' : ''}: ${gallery.length}/${t.target} (+${gallery.length - before})`)
    } catch (err) {
      await save()
      if (err instanceof LlmError || err instanceof InatBytesSpent) { report.stopped = `${t.id}: ${err.message}`; break }
      report.failed.push(`${t.id}: ${(err as Error).message.slice(0, 160)}`)
    }
  }
  report.short = await galleryReview(root, await galleryPlan(root), today)
  return report
}

/**
 * Every album in rankGallery's order, each cycle (the sweep): the album step ranks only an album it adds to, so the rest
 * kept the order an older rule left them (by stored size, with no rule for photo-tank photos, until 14 Nov). Each album's
 * screening order is its state's (`judged`); the photo check's verdicts say which photos it can't tell. Then no more
 * Aquarium Glaser kept-mark photos than an album shows, the first in that order (own-mark.ts keptCap; the chief of staff,
 * 16 Nov). The files changed, the albums whose lead photo changed (`id: old -> new`), and the kept-mark photos left out
 * of an album (`id: url`).
 */
export async function orderAlbums(root: string, subjects: Record<string, Record<string, PhotoVerdict>>): Promise<{ files: string[]; leads: string[]; keptOut: string[] }> {
  const dir = join(root, 'content', 'gallery')
  const out = { files: [] as string[], leads: [] as string[], keptOut: [] as string[] }
  const lead = (ps: GalleryPhoto[]) => ps.find(p => !p.unchecked && !isGenerated(p))?.url
  const looksOn = await albumLooks(root, subjects)
  const on = await namedOn(join(root, 'content'))
  const markKept = await keptMarks(root)
  for (const f of (await readdir(dir).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort()) {
    const id = f.replace(/\.json$/, ''), file = join(dir, f)
    const raw = await readFile(file, 'utf8')
    const g = JSON.parse(raw) as { photos?: GalleryPhoto[] }
    if (!g.photos?.length) continue
    const st = JSON.parse(await readFile(join(root, 'engine-state', 'gallery', f), 'utf8').catch(() => '{}')) as Partial<GalleryState>
    const own = await pageOf(root, id)
    const capped = keptCap(rankGallery(g.photos, cantTellOn(subjects, id), screenedAt(st.judged ?? []), looksOn(id), on(id), markKept), own, markKept)
    const ranked = capped.album
    out.keptOut.push(...capped.out.map(p => `${id}: ${p.url}`))
    if (ranked.length === g.photos.length && ranked.every((p, i) => p === g.photos![i])) continue
    if (lead(g.photos) !== lead(ranked)) out.leads.push(`${id}: ${lead(g.photos)} -> ${lead(ranked)}`)
    await writeFile(file, `${JSON.stringify({ ...g, photos: ranked }, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
    out.files.push(`gallery/${f}`)
  }
  return out
}

/** The own photos of the page an album belongs to: a species', a plant's or a breed's. */
async function pageOf(root: string, id: string): Promise<Photo[]> {
  for (const kind of ['species', 'plants', 'breeds']) {
    const raw = await readFile(join(root, 'content', kind, id, 'entity.json'), 'utf8').catch(() => null)
    if (raw) return (JSON.parse(raw) as { photos?: Photo[] }).photos ?? []
  }
  return []
}

/** Photos the owner rejected (engine-state/_photo-rejected.json) leave every gallery, the next run after they are listed. */
async function dropRejected(root: string, content: string, why: (url: string) => string | undefined, waiting: (url: string) => string | undefined) {
  const canCapture = !!entriesDir()
  const listed = (url: string) => {
    const reason = why(url)
    return !!reason && (!reason.startsWith('waiting:') || (canCapture && !!waiting(url)))
  }
  for (const f of (await readdir(join(content, 'gallery')).catch(() => [] as string[])).filter(f => f.endsWith('.json'))) {
    const file = join(content, 'gallery', f)
    const g = JSON.parse(await readFile(file, 'utf8')) as { photos: Photo[] }
    const remove = (p: Photo) => shouldStripPhoto(p, listed, (url, original, blocked) =>
      /^(?:dead|people|waiting): /.test(why(url) ?? '') && (!blocked || why(original)?.startsWith('waiting:') === true),
    )
    const removing = g.photos.filter(remove)
    if (!removing.length) continue
    const stood = new Map<string, Stood[]>()
    placesIn(root, file, g, (url, slot) => removing.includes(slot.photo as Photo) ? waiting(url) : undefined, stood)
    await notePlaces(root, stood)
    await replacePhotoDocument(file, `${JSON.stringify({ ...g, photos: g.photos.filter(p => !removing.includes(p)) }, null, 2)}\n`)
  }
}

/**
 * Every non-commercial photo (its licence's NC, isNonCommercial) taken off every album and every page, in one step: the
 * sweep's, each cycle. With IMAGE_SWITCHES.inatNonCommercial on, iNaturalist's CC BY-NC and CC BY-NC-SA album photos
 * stay (isInatNonCommercial); off, none does. A source's photo shows by its permission and is left alone. The files
 * changed, and `file: url` for each photo taken off.
 */
export async function dropNonCommercial(content: string, switches: Readonly<ImageSwitches> = IMAGE_SWITCHES, withheld: (photo: Photo, ref: string, scientificName: string) => boolean = () => false): Promise<{ files: string[]; photos: string[] }> {
  const out = { files: [] as string[], photos: [] as string[] }
  const files: string[] = []
  for (const f of (await readdir(join(content, 'gallery')).catch(() => [] as string[])).filter(f => f.endsWith('.json'))) files.push(`gallery/${f}`)
  for (const kind of ['species', 'plants', 'breeds', 'guides']) for (const id of await readdir(join(content, kind)).catch(() => [] as string[])) files.push(`${kind}/${id}/entity.json`)
  for (const f of files.sort()) {
    const raw = await readFile(join(content, f), 'utf8').catch(() => null)
    if (!raw) continue
    const data = JSON.parse(raw) as { photos?: Photo[]; scientificName?: string }
    if (!Array.isArray(data.photos)) continue
    const album = f.startsWith('gallery/')
    const ref = f.replace(/\/entity\.json$/, '')
    // A fish's page keeps one only as its head with no other real photo, where it's the one way to show that fish (the
    // chief of staff's rule, 17 Nov; lead-photo.ts puts it there); a guide never. With the switch off, heads go too.
    const head = (i: number) => !f.startsWith('guides/') && data.photos!.every((photo, j) => i === j || photo.generated || withheld(photo, ref, data.scientificName ?? ''))
    const off = data.photos.filter((p, i) => !p.source && isNonCommercial(p.licence) && !((album || head(i)) && switches.inatNonCommercial && isInatNonCommercial(p)))
    if (!off.length) continue
    await writeFile(join(content, f), `${JSON.stringify({ ...data, photos: data.photos.filter(p => !off.includes(p)) }, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
    out.files.push(f)
    out.photos.push(...off.map(p => `${f}: ${p.url}`))
  }
  return out
}

/**
 * docs/review/galleries.md: per tier, how many pages are at their target and how many below; then the pages whose
 * sources ran dry below target (the shortfall), most popular first. Returns that list.
 */
export async function galleryReview(root: string, plan: PlanItem[], today: string): Promise<string[]> {
  const rows = await Promise.all(plan.map(async t => {
    const g = JSON.parse(await readFile(join(root, 'content/gallery', `${t.id}.json`), 'utf8').catch(() => 'null')) as { photos: Photo[] } | null
    const st = JSON.parse(await readFile(join(root, 'engine-state/gallery', `${t.id}.json`), 'utf8').catch(() => 'null')) as GalleryState | null
    return { ...t, have: g?.photos.length ?? 0, exhausted: st?.exhausted }
  }))
  const short = rows.filter(r => r.exhausted && r.have < r.target)
  const lines = [
    '# Photo galleries', '',
    `Written by \`pnpm engine gallery\` (${today}). Targets: packages/engine/src/gallery-plan.ts; rules: docs/governance.md, "Photos".`, '',
    '| Tier | Target | Species | Plants | Breeds | At target | Below |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...TIER_ORDER.map(tier => {
      const r = rows.filter(x => x.tier === tier)
      return `| ${tier} | ${TARGETS[tier]} | ${r.filter(x => x.kind === 'species').length} | ${r.filter(x => x.kind === 'plants').length} | ${r.filter(x => x.kind === 'breeds').length} | ${r.filter(x => x.have >= x.target).length} | ${r.filter(x => x.have < x.target).length} |`
    }),
    '', `## Short of target: every source read (${short.length})`, '',
    'Open-licence photos run out for these; each is read again 30 days after it ran dry.', '',
    '| Page | Tier | Photos | Target |', '| --- | --- | --- | --- |',
    ...short.map(r => `| ${r.kind}/${r.id} | ${r.tier} | ${r.have} | ${r.target} |`), '',
  ]
  await mkdir(join(root, 'docs/review'), { recursive: true })
  await writeFile(join(root, 'docs/review/galleries.md'), lines.join('\n'))
  return short.map(r => `${r.id}: ${r.have}/${r.target}`)
}
