import { piece } from './pieces'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GallerySchema, hashDistance, isAllowedLicence, isGenerated, SAME_PICTURE, thumbOf, type Photo } from '@aq/schema'
import sharp from 'sharp'
import { LlmError } from './claude'
import { galleryPlan, TARGETS, TIER_ORDER, type PlanItem } from './gallery-plan'
import { gbifMediaPage, gbifUsageKey } from './gbif'
import { inatPage, inatTaxon, newInatCursor, type InatCursor } from './inat'
import { openversePage } from './openverse'
import { cantTellOn, OFF, type PhotoVerdict } from './photo-check'
import { isRejected, unfitCommons } from './photos'
import { contactSheet } from './video-images'
import { authorText } from './wiki-author'
import { WikimediaRefused } from './wikimedia-rest'

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
      out.push({
        key: p.title, url, thumb: thumbOf(url) ?? url, width: ii.thumbwidth, height: ii.thumbheight, licence,
        author: authorText(ii.extmetadata?.Artist?.value) || 'Wikimedia Commons', sourceUrl: ii.descriptionurl,
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
          if (e instanceof WikimediaRefused) throw e
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
 * (`cantTell`: photo-check.ts cantTellOn), so a later run keeps the place the check gave them; AI pictures last. Each part
 * is ordered on its own, so ordering an album twice changes nothing: the sweep orders every album so each cycle
 * (orderAlbums), with the same `looks` as the album step, so the two agree.
 */
export function rankGallery(photos: GalleryPhoto[], cantTell: (url: string) => boolean = () => false, at: ScreenedAt = () => undefined, looks: Looks = () => ({})): GalleryPhoto[] {
  const real = photos.filter(p => !isGenerated(p))
  const sure = real.filter(p => !cantTell(p.url)), unsure = real.filter(p => cantTell(p.url))
  const poor = (p: GalleryPhoto) => isPoor(p, looks(p.url))
  const back = sure.filter(p => !poor(p) && !p.unchecked).length >= SETUP_ROOM ? poor : () => false
  // Where six typical show: typical, then not judged yet, then not typical.
  const typed = sure.filter(p => !p.unchecked && looks(p.url).typical === true).length >= SETUP_ROOM
  const step = (p: GalleryPhoto) => { const t = looks(p.url).typical; return !typed || t === true ? 0 : t === undefined ? 1 : 2 }
  const front = sure.filter(p => !back(p))
  const parts = [...[0, 1, 2].map(k => front.filter(p => step(p) === k)), sure.filter(back), unsure]
  return [...parts.flatMap(ps => byKind(ps, at)), ...photos.filter(isGenerated)]
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
 * `seeded`: the keys of queued candidates a person found by hand (gallery-seed.ts), until they are screened.
 */
export type GalleryState = {
  inat?: InatCursor
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
 * limit). content/gallery/<id>.json; engine-state/gallery/<id>.json; docs/review/galleries.md.
 */
export async function galleries(root: string, d: GalleryDeps, o: { sheets: number; only?: string; budget?: Partial<SourceBudget>; shard?: [number, number] }) {
  const content = join(root, 'content')
  const report = { done: [] as string[], failed: [] as string[], stopped: '', sheets: 0, added: {} as Record<string, number>, short: [] as string[] }
  const rejected = JSON.parse(await readFile(join(root, 'engine-state/_photo-rejected.json'), 'utf8').catch(() => '{}')) as Record<string, string>
  // A Commons, iNaturalist, Flickr or GBIF photo rejected after it moved to our bucket is known there by its key (mirror-photos.ts).
  const rejectedPhoto = isRejected(rejected)
  // A photo the photo check took off a page (another fish, none, dead), by its address in our bucket: never back in that
  // page's gallery, from a search or from the queue. A hand seed (gallery-seed.ts) queued a bred discus the owner had
  // judged off Heckel's discus by eye, and the gallery's own screening put it back (2026-11-08).
  const subjects = JSON.parse(await readFile(join(root, 'engine-state/_photo-subjects.json'), 'utf8').catch(() => '{}')) as Record<string, Record<string, PhotoVerdict>>
  const offBy = new Map<string, Record<string, string>>()
  for (const [url, pages] of Object.entries(subjects)) for (const [id, v] of Object.entries(pages)) if (OFF.has(v.ok)) (offBy.get(id) ?? offBy.set(id, {}).get(id)!)[url] = v.ok
  const gbifNames = JSON.parse(await readFile(join(root, 'engine-state/_gbif-names.json'), 'utf8').catch(() => '{}')) as Record<string, { canonicalName: string } | null>
  const looksOn = await albumLooks(root, subjects)
  const left: SourceBudget & { sheets: number } = { inat: 150, gbif: 60, openverse: 20, ...o.budget, sheets: o.sheets }
  // Openverse is slow (20 s or more a query) and sometimes stalls: after 3 failures it rests until the next run.
  let openverseFailures = 0
  const today = d.now().toISOString().slice(0, 10)
  const days = (date: string) => (d.now().getTime() - Date.parse(date)) / 86_400_000
  await dropRejected(content, rejectedPhoto)
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

  for (const t of plan) {
    if (left.sheets <= 0) break
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
    if (st.exhausted && !o.only && days(st.exhausted) < RETRY_DAYS) continue
    if (st.exhausted) {
      // A month on: new observations are past iNaturalist's cursor; the other sources are read again (what was judged stays judged).
      delete st.exhausted
      if (st.inat?.taxon) st.inat.pass = 'research'
      delete st.commons
      if (st.gbif?.key) st.gbif.next = 0
      delete st.openverse
    }
    // A gallery the old step built screened every Commons candidate it found then: those count as judged. Not a breed's:
    // the breed step searched one name, and the photos it kept stay out by address and image hash.
    const legacy = !saved && t.kind !== 'breeds' && gallery.some(p => !p.source && p.licence !== UNSPLASH)
    const before = gallery.length
    let seenCount = g?.seen ?? 0
    let page: Page | undefined
    const save = async () => {
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
      st.queue = st.queue.filter(c => !offHere(c.url))
      const isNew = (c: Candidate) => !rejectedPhoto(c.url) && !offHere(c.url) && !seen.has(c.url) && !seen.has(c.sourceUrl) && !judged.has(c.key) && !st.queue.some(q => q.key === c.key)
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
      const dry = () => (breed || (st.inat?.pass === 'done' && !!st.gbif && (!st.gbif.key || st.gbif.next === null))) && !!st.commons && (!d.openverse || st.openverse?.next === null)

      while (gallery.length < limit && left.sheets > 0) {
        const want = Math.max(SHEET, (t.target - gallery.length) * 2)
        while (!full && st.queue.length < want) {
          const got = await more()
          if (got === null) break
          st.queue.push(...got.filter(isNew))
        }
        const pool = full ? st.queue.filter(c => seeded.has(c.key)) : st.queue
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
        for (const k of kept) {
          st.hashes[k.photo.url] = k.hash
          report.added[sourceOfKey(k.key)] = (report.added[sourceOfKey(k.key)] ?? 0) + 1
        }
        gallery = rankGallery([...gallery, ...kept.map(k => waiting({ ...k.photo, best: k.best, kind: k.kind ?? 'other', ...(k.setup !== undefined ? { setup: k.setup } : {}) }))], cantTellOn(subjects, t.id), screenedAt(st.judged), looksOn(t.id))
        if (kept.length) {
          await mkdir(join(content, 'gallery'), { recursive: true })
          await writeFile(gfile, `${JSON.stringify(GallerySchema.parse({ id: t.id, photos: gallery, seen: seenCount, updatedAt: today, builtAt: today }), null, 2)}\n`)
        }
        await save()
      }
      if (gallery.length < t.target && !st.queue.length && dry()) st.exhausted = today
      await save()
      report.done.push(`${t.id}: ${gallery.length}/${t.target} (+${gallery.length - before})`)
    } catch (err) {
      await save()
      if (err instanceof LlmError) { report.stopped = `${t.id}: ${err.message}`; break }
      report.failed.push(`${t.id}: ${(err as Error).message.slice(0, 160)}`)
    }
  }
  report.short = await galleryReview(root, await galleryPlan(root), today)
  return report
}

/**
 * Every album in rankGallery's order, each cycle (the sweep): the album step ranks only an album it adds to, so the rest
 * kept the order an older rule left them (by stored size, with no rule for photo-tank photos, until 14 Nov). Each album's
 * screening order is its state's (`judged`); the photo check's verdicts say which photos it can't tell. The files
 * changed, and the albums whose lead photo changed (`id: old -> new`).
 */
export async function orderAlbums(root: string, subjects: Record<string, Record<string, PhotoVerdict>>): Promise<{ files: string[]; leads: string[] }> {
  const dir = join(root, 'content', 'gallery')
  const out = { files: [] as string[], leads: [] as string[] }
  const lead = (ps: GalleryPhoto[]) => ps.find(p => !p.unchecked && !isGenerated(p))?.url
  const looksOn = await albumLooks(root, subjects)
  for (const f of (await readdir(dir).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort()) {
    const id = f.replace(/\.json$/, ''), file = join(dir, f)
    const raw = await readFile(file, 'utf8')
    const g = JSON.parse(raw) as { photos?: GalleryPhoto[] }
    if (!g.photos?.length) continue
    const st = JSON.parse(await readFile(join(root, 'engine-state', 'gallery', f), 'utf8').catch(() => '{}')) as Partial<GalleryState>
    const ranked = rankGallery(g.photos, cantTellOn(subjects, id), screenedAt(st.judged ?? []), looksOn(id))
    if (ranked.every((p, i) => p === g.photos![i])) continue
    if (lead(g.photos) !== lead(ranked)) out.leads.push(`${id}: ${lead(g.photos)} -> ${lead(ranked)}`)
    await writeFile(file, `${JSON.stringify({ ...g, photos: ranked }, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
    out.files.push(`gallery/${f}`)
  }
  return out
}

/** Photos the owner rejected (engine-state/_photo-rejected.json) leave every gallery, the next run after they are listed. */
async function dropRejected(content: string, isRejected: (url: string) => boolean) {
  for (const f of (await readdir(join(content, 'gallery')).catch(() => [] as string[])).filter(f => f.endsWith('.json'))) {
    const file = join(content, 'gallery', f)
    const g = JSON.parse(await readFile(file, 'utf8')) as { photos: Photo[] }
    const keep = g.photos.filter(p => !isRejected(p.url))
    if (keep.length < g.photos.length) await writeFile(file, `${JSON.stringify({ ...g, photos: keep }, null, 2)}\n`)
  }
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
