import { piece } from './pieces'
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { LlmError } from './claude'
import { contactSheet } from './video-images'
import { deadScreenPhotoUrls, IMAGE_SWITCHES, LOGO_FOLDERS, logoFolder, ocrHit, publicPhotoVersion, type Photo, type SourceInfo } from '@aq/schema'
import { rememberMarkedPhotos } from './marked-photos'
import { compactScreen, summarizeOcr, PHOTO_MARK_KINDS, PHOTO_POSITIONS, photoFailure, photoModelStop, type CompactScreen } from './photo-observations'
import { writePhotoState } from './photo-state'
import { readPhotoWaits } from './photo-visibility'
import { holdForSecondLook, lastPhotos, looks, pagesShowing, readSecondLook } from './last-photo'

/** A line of text macOS Vision read on a photo: confidence 0–1, box 0–1 from the top left. */
export type TextLine = { t: string; c: number; x: number; y: number; w: number; h: number }
export type WatermarkKind = 'credit' | 'logo' | 'url' | 'name' | 'caption' | 'stamp' | 'none'
/** One photo's screen: the text read on it (`at`: where on the photo), then the model's verdict once it has looked. */
export type WatermarkEntry = CompactScreen
import { retainedOwnMark, screenedShop, type OwnMarkShop } from './own-mark'
export { retainedOwnMark }
/**
 * A photo the never-again list (engine-state/_photo-rejected.json) holds that stays all the same: a cleared shop's photo
 * with the shop's own mark, kept (own-mark.ts retainedOwnMark), where the list holds it for that mark alone.
 */
export const keptOwnMark = (rejected: Record<string, string>, marks: Record<string, WatermarkEntry>) => (url: string) =>
  retainedOwnMark(url, marks[url]) && (!rejected[url] || rejected[url]!.startsWith('watermark:'))
export type WatermarkDeps = {
  get: (url: string) => Promise<Uint8Array>
  read: (files: string[]) => Promise<(TextLine[] | null)[]>
  look: (sheet: string, prompt: string) => Promise<{ photos: { n: number; watermark: boolean; kind: WatermarkKind; locations?: string[]; what?: string; own?: boolean }[] }>
}
/** A screened shop's photo from its own pages (own-mark.ts SCREENED_OWN_MARK): its name and home page are ours (content/sources.json), never read off the photo. */
export type ShopPhoto = { source: OwnMarkShop; sourceUrl: string; name: string; homepage: string }

/** Text per image via macOS Vision (vision/text.swift); null = unreadable. `parallel` Swift processes of 100 images each. */
export async function visionText(files: string[], parallel = 1): Promise<(TextLine[] | null)[]> {
  const script = fileURLToPath(new URL('../vision/text.swift', import.meta.url))
  const batches: string[][] = []
  for (let i = 0; i < files.length; i += 100) batches.push(files.slice(i, i + 100))
  const out = await pool(batches, parallel, async b => {
    const { stdout } = await promisify(execFile)('swift', [script, ...b], { maxBuffer: 64 << 20 })
    return stdout.trim().split('\n').map(l => JSON.parse(l) as TextLine[] | null)
  })
  const flat = out.flat()
  if (flat.length !== files.length) throw new Error(`text: ${flat.length} results for ${files.length} images`)
  return flat
}

async function pool<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await f(items[i]!) }
  }))
  return out
}

const third = (v: number, lo: string, mid: string, hi: string) => (v < 1 / 3 ? lo : v > 2 / 3 ? hi : mid)
const at = (l: TextLine) => `${third(l.y + l.h / 2, 'top', 'middle', 'bottom')} ${third(l.x + l.w / 2, 'left', 'centre', 'right')}`
// The intake rule (text worth a model's look) and the logo sources are the schema's (photo-screen.ts): the build reads
// them too, to keep a photo the screen has not judged off pages.
export { LOGO_FOLDERS, ocrHit }

export const WATERMARK_SCHEMA = {
  type: 'object', required: ['photos'],
  properties: { photos: { type: 'array', items: { type: 'object', required: ['n', 'watermark', 'kind', 'locations', 'own'], properties: { n: { type: 'number' }, watermark: { type: 'boolean' }, kind: { type: 'string', enum: [...PHOTO_MARK_KINDS] }, locations: { type: 'array',items:{type:'string',enum:[...PHOTO_POSITIONS]} }, own: { type: 'boolean' } } } } },
}

const prompt = (photos: { n: number; ocr: WatermarkEntry['ocr']; shop?: ShopPhoto }[]) => `Numbered photos from an aquarium handbook. Some carry a watermark: text, a logo or a web address ADDED on top of the photo after it was taken.
Added (watermark: true):
- credit: a photographer's or owner's credit or signature ("© Name", "Photo: Name")
- logo: a shop, dealer, breeder, magazine or video channel logo or banner, with or without words
- url: a website name or address
- name: a species name, a common name or a label ("male", "female", "Brazil", "F1") typed onto the photo
- caption: a title, caption or subtitle printed over the photo (also subtitles burned into a video still)
- stamp: a camera's or phone's date stamp or "shot on" mark
Not added (watermark: false, kind "none"): text that is part of the scene, there when the photo was taken: a product's own box, bottle, bag or label, a sticker or label on a tank, a shop sign or price tag in the shot, a museum or specimen tag, a ruler, a herbarium sheet's label, the printed caption of an old book plate or drawing, a diagram's own labels.
Below are the machine reader's measurements, never the words. It misreads and misses faint marks and logos without letters. Look at every photo and read the photo itself if needed. Never transcribe lettering, signatures, names or web addresses.
${photos.map(p => `${p.n}: ${p.shop ? `taken from the web pages of the shop ${p.shop.name} (${p.shop.homepage}); ` : ''}${p.ocr.length ? p.ocr.map(l => `lettering (${l.at ?? 'unknown'}; letters/digits ${l.alnum}; credit/URL marker ${l.mark}; hash ${l.hash})`).join('; ') : 'no text found'}`).join('\n')}
For each photo n: watermark (true/false), kind (one of the above, "none" if not added), locations from the controlled position list, and own (true/false); no prose or quoted words.
own: for a photo taken from a shop's web pages, true only if it carries an added mark and every added mark is that shop's own: its name, its logo or banner, its web address. false if any added mark is anyone else's (a person's or photographer's signature or credit, a stock agency's mark, another site's or shop's) or you can't tell whose it is. For every other photo, false.`

/** Controlled measurements from the native reader; no lettering is kept or included in the prompt. */
export const ocrOf = (lines: TextLine[]): WatermarkEntry['ocr'] => lines.slice(0, 8).map(l => summarizeOcr({...l,at:at(l)}))

/**
 * The model's verdicts on up to 6 photos with the text read on each, from one numbered sheet written to `file`; undefined
 * where it gave none. A screened shop's photo from its own pages (`shop`) is also asked whose its marks are: marked, and
 * every mark the shop's own, its verdict carries the kept record (own-mark.ts retainedOwnMark); a verdict without that
 * answer is none, so the photo waits for the next run rather than going on the never-again list unasked.
 */
export async function judgeSheet(photos: { b: Buffer; ocr: WatermarkEntry['ocr']; shop?: ShopPhoto }[], file: string, look: WatermarkDeps['look']): Promise<(Omit<WatermarkEntry, 'ocr'> | undefined)[]> {
  await writeFile(file, await contactSheet(photos.map(x => x.b), 640, 480, 2, 'contain'))
  const v = await look(file, prompt(photos.map((x, j) => ({ n: j + 1, ocr: x.ocr, ...(x.shop ? { shop: x.shop } : {}) }))))
  const out: (Omit<WatermarkEntry, 'ocr'> | undefined)[] = photos.map(() => undefined)
  for (const p of v.photos ?? []) {
    if (!photos[p.n - 1] || typeof p.watermark !== 'boolean') continue
    if(!(PHOTO_MARK_KINDS as readonly unknown[]).includes(p.kind))continue
    const shop = photos[p.n - 1]!.shop
    if (shop && typeof p.own !== 'boolean') continue
    const keep = shop && p.watermark && p.own ? { retainedOwnMark: { source: shop.source, sourceUrl: shop.sourceUrl, owner: 'source', by: 'screen' } } : {}
    const {ocr:_ocr,...record}=compactScreen({ocr:[],watermark:p.watermark,kind:p.watermark?p.kind:'none',locations:p.locations,what:p.what,...keep})
    out[p.n - 1] = record
  }
  return out
}

const isRef = (x: unknown): x is { url: string } => !!x && typeof x === 'object' && typeof (x as { url: unknown }).url === 'string'

/**
 * Photos a content file shows: `photos` lists (pages, galleries), equipment heroes and type photos, video guides' stills
 * and photos; with the pages each was taken from (`from`).
 */
function urlsIn(x: unknown, out: Set<string>, from: Map<string, Set<string>>) {
  const add = (p: { url: string; sourceUrl?: unknown }) => {
    out.add(p.url)
    if (typeof p.sourceUrl === 'string') (from.get(p.url) ?? from.set(p.url, new Set()).get(p.url)!).add(p.sourceUrl)
  }
  if (Array.isArray(x)) for (const v of x) urlsIn(v, out, from)
  else if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>
    for (const k of ['photos', 'moments']) if (Array.isArray(o[k])) for (const p of o[k] as unknown[]) if (isRef(p)) add(p)
    for (const k of ['photo', 'hero']) { const p = o[k]; if (isRef(p)) add(p) }
    for (const v of Object.values(o)) urlsIn(v, out, from)
  }
}

type PreserveOriginal = (url: string, original: string, blockedOriginal: boolean) => boolean

/** Shared by the last-photo calculation and the actual edit. */
export function shouldStripPhoto(p: Photo, blocked: (url: string) => boolean, preserveOriginal?: PreserveOriginal): boolean {
  if (!blocked(p.url)) return false
  const original = preserveOriginal && deadScreenPhotoUrls(p)[1]
  return !original || !preserveOriginal?.(p.url, original, blocked(original))
}

/**
 * Takes blocked photos off a content file, in place: from `photos` lists, video stills and figure photos (a figure left
 * with neither goes too), equipment type photos. An equipment hero is required: it becomes the first type photo left,
 * and stays (`kept`) when there is none.
 */
export function stripPhotos(x: unknown, blocked: (url: string) => boolean, removed: string[], kept: string[], preserveOriginal?: PreserveOriginal) {
  if (Array.isArray(x)) { for (const v of x) stripPhotos(v, blocked, removed, kept, preserveOriginal); return }
  if (!x || typeof x !== 'object') return
  const o = x as Record<string, unknown>
  for (const v of Object.values(o)) stripPhotos(v, blocked, removed, kept, preserveOriginal)
  const drop = (p: unknown) => isRef(p) && shouldStripPhoto(p as Photo, blocked, preserveOriginal) && removed.push(p.url) > 0
  for (const k of ['photos', 'moments']) if (Array.isArray(o[k])) o[k] = (o[k] as unknown[]).filter(p => !drop(p))
  if (drop(o.photo)) delete o.photo
  if (Array.isArray(o.figures)) o.figures = (o.figures as { moments?: unknown[]; photo?: unknown }[]).filter(f => f.moments?.length || f.photo)
  if (isRef(o.hero) && blocked(o.hero.url)) {
    const next = Array.isArray(o.types) ? (o.types as { photo?: unknown }[]).map(t => t.photo).find(isRef) : undefined
    if (next) { removed.push(o.hero.url); o.hero = { ...next } } else kept.push(o.hero.url)
  }
}

async function contentFiles(content: string): Promise<string[]> {
  return (await readdir(content, { recursive: true })).filter(f => f.endsWith('.json')).map(f => join(content, f))
}

/**
 * No watermarks on the site: every photo the content shows is read once by macOS Vision (cached by URL). Photos with
 * text on them (`ocrHit`), and every photo from a `LOGO_FOLDERS` source, go to the model on numbered sheets of 6, which
 * tells a mark added to the photo (a credit, a dealer's logo, a URL, a stamped name) from text in the scene (a product's
 * own label). A watermarked photo leaves every page and gallery and joins `rejectedFile`, which the photo steps respect
 * (so a source re-read or a gallery rebuild doesn't bring it back), but an Aquarium Glaser photo from Glaser's own pages
 * whose every mark is Glaser's own stays, with its kept record (own-mark.ts SCREENED_OWN_MARK; the chief of staff, 16
 * Nov). Runs each cycle after the photo steps.
 * `limit`: model calls this run; stops on a model failure (usage limit), and the rest wait for the next run.
 */
export async function screenWatermarks(root: string, cacheFile: string, rejectedFile: string, d: WatermarkDeps, o: { limit: number; parallel?: number }) {
  const old=JSON.parse(await readFile(cacheFile, 'utf8').catch(() => '{}'))
  const cache: Record<string, WatermarkEntry> = Object.fromEntries(Object.entries(old).map(([u,v])=>[u,compactScreen(v)]))
  const rejected: Record<string, string> = JSON.parse(await readFile(rejectedFile, 'utf8').catch(() => '{}'))
  const report = { read: 0, hits: 0, judged: 0, confirmed: [] as string[], removed: [] as string[], kept: [] as string[], held: [] as string[], failed: [] as string[], stopped: '' }
  const files = await contentFiles(join(root, 'content'))
  const urls = new Set<string>(), from = new Map<string, Set<string>>()
  for (const f of files) urlsIn(JSON.parse(await readFile(f, 'utf8')), urls, from)
  // A screened shop's photo from its own pages is asked whose its marks are (own-mark.ts SCREENED_OWN_MARK), with the
  // shop's name and home page as we hold them. Not one already on the never-again list: a kept record would bring it back
  // (keptOwnMark), and photos listed before this rule return only by their own step, on the chief of staff's word.
  const sources = JSON.parse(await readFile(join(root, 'content', 'sources.json'), 'utf8').catch(() => '{}')) as Record<string, SourceInfo>
  const shopOf = (u: string): ShopPhoto | undefined => {
    // Nor one with a kept record already (a person's, on the chief of staff's word, or the image step's): the record
    // stands, and the screen's answer can't take it off or keep it a second way.
    if (u in rejected || retainedOwnMark(u, cache[u])) return undefined
    for (const sourceUrl of from.get(u) ?? []) {
      const source = screenedShop(u, sourceUrl), held = source && sources[source]
      if (source && held?.name && held.homepage) return { source, sourceUrl, name: held.name, homepage: held.homepage }
    }
    return undefined
  }

  const dir = await mkdtemp(join(tmpdir(), 'watermarks-'))
  const fetchTo = async (url: string, file: string) => {
    try { await writeFile(file, await d.get(url)); return true } catch (err) { report.failed.push(`${url}: ${photoFailure(err)}`); return false }
  }
  try {
    // 1. Vision reads every photo not read yet (an unreadable or unreachable one is retried next run).
    const todo = [...urls].filter(u => !(u in cache))
    const got = (await pool(todo.map((url, i) => ({ url, file: join(dir, `r${i}`) })), 8, async x => ((await fetchTo(x.url, x.file)) ? x : null))).filter(x => !!x)
    const lines = got.length ? await d.read(got.map(x => x.file)).catch(()=>{throw new Error('native text reader unavailable')}) : []
    got.forEach((x, i) => {
      const l = lines[i]
      if (!l) { report.failed.push(`${x.url}: unreadable`); return }
      cache[x.url] = { ocr: ocrOf(l) }
      report.read++
    })
    await Promise.all(got.map(x => rm(x.file, { force: true })))

    // 2. The model looks at photos with text, and at every photo from a logo source.
    const look = [...urls].filter(u => cache[u] && cache[u]!.watermark === undefined && (ocrHit(cache[u]!.ocr) || logoFolder(u)))
    report.hits = look.length
    const sheets: string[][] = []
    for (let i = 0; i < look.length && sheets.length < o.limit; i += 6) sheets.push(look.slice(i, i + 6))
    await pool(sheets.map((s, i) => ({ s, i })), o.parallel ?? 1, async ({ s, i }) => {
      if (report.stopped) return
      const ok: { url: string; b: Buffer }[] = []
      for (const url of s) { const f = join(dir, `s${i}-${ok.length}`); if (await fetchTo(url, f)) ok.push({ url, b: await readFile(f) }) }
      if (!ok.length) return
      try {
        const v = await piece(`sheet-${i}`, () => judgeSheet(ok.map(x => { const shop = shopOf(x.url); return { b: x.b, ocr: cache[x.url]!.ocr, ...(shop ? { shop } : {}) } }), join(dir, `sheet-${i}.jpg`), d.look))
        v.forEach((r, j) => { if (r) { cache[ok[j]!.url] = { ...cache[ok[j]!.url]!, ...r }; report.judged++ } })
      } catch (err) {
        if (err instanceof LlmError) report.stopped ||= photoModelStop(err)
        else report.failed.push(`sheet ${i}: ${photoFailure(err)}`)
      }
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  // 3. Watermarked photos join the blocklist and leave every page. One whose going would leave a species, plant or breed
  // page with nothing stays where it is, held for a second look (last-photo.ts), and one the second look cleared stays.
  const sl = looks(await readSecondLook(root))
  const markedNow = (u: string) => cache[u]?.watermark === true && !retainedOwnMark(u, cache[u]) && sl.open(u)
  const waits = await readPhotoWaits(root, { rejected })
  const pages = await pagesShowing(join(root, 'content'), p => {
    if (markedNow(p.url) || p.url in rejected) return p.url
    return publicPhotoVersion(p, IMAGE_SWITCHES, p.source ? sources[p.source]?.permission?.markRemoval : undefined)?.url
  })
  const held = new Map([...lastPhotos(pages, u => markedNow(u) || u in rejected || waits(u))].filter(([u]) => markedNow(u) && !(u in rejected)))
  const marked = (u: string) => markedNow(u) && !held.has(u)
  for (const [u, pages] of held) report.held.push(`${u}: ${pages.join(', ')}`)
  await holdForSecondLook(root, new Map([...held].map(([u, pages]) => [u, { why: `watermark: ${cache[u]!.kind ?? 'unknown'}`, pages }])), 'the watermark screen')
  for (const u of urls) if (marked(u)) {
    report.confirmed.push(u)
    if (!(u in rejected)) rejected[u] = `watermark: ${cache[u]!.kind ?? 'unknown'}`
  }
  for (const f of files) {
    const raw = await readFile(f, 'utf8')
    const data = JSON.parse(raw) as unknown
    if (IMAGE_SWITCHES.removeMarks) await rememberMarkedPhotos(f, data, u => cache[u]?.watermark === true)
    const removed: string[] = []
    stripPhotos(data, marked, removed, report.kept)
    if (!removed.length) continue
    report.removed.push(...removed.map(u => `${relative(root, f)}: ${u}`))
    await writeFile(f, `${JSON.stringify(data, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
  }
  await writePhotoState(cacheFile, Object.fromEntries(Object.entries(cache).sort()))
  await writePhotoState(rejectedFile, rejected)
  return report
}
