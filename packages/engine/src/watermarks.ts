import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { LlmError } from './claude'
import { contactSheet } from './video-images'

/** A line of text macOS Vision read on a photo: confidence 0–1, box 0–1 from the top left. */
export type TextLine = { t: string; c: number; x: number; y: number; w: number; h: number }
export type WatermarkKind = 'credit' | 'logo' | 'url' | 'name' | 'caption' | 'stamp' | 'none'
/** One photo's screen: the text read on it (`at`: where on the photo), then the model's verdict once it has looked. */
export type WatermarkEntry = { ocr: { t: string; c: number; at: string }[]; watermark?: boolean; kind?: WatermarkKind; what?: string }
export type WatermarkDeps = {
  get: (url: string) => Promise<Uint8Array>
  read: (files: string[]) => Promise<(TextLine[] | null)[]>
  look: (sheet: string, prompt: string) => Promise<{ photos: { n: number; watermark: boolean; kind: WatermarkKind; what: string }[] }>
}

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
const MARK = /©|\(c\)|copyright|www\.|https?:|\.(com|net|org|de|co|vn|th|id|uk)\b/i

/**
 * The intake rule: text on a photo worth a model's look. A credit sign or a web address always; otherwise a line Vision
 * is sure of with at least 3 letters or digits (fish scales and plant stems read as stray "I", "ll" or "W").
 */
export function ocrHit(lines: { t: string; c: number }[]): boolean {
  return lines.some(l => MARK.test(l.t) || (l.c >= 0.5 && (l.t.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 3))
}

/**
 * R2 folders (sources) whose photos all go to the model, text read or not: the 2026-10-31 scan found marks on 15–96% of
 * their photos, some a logo with no letters or a signature too faint for Vision.
 */
export const LOGO_FOLDERS = ['glaser', 'seriouslyfish', 'bwaquatics', 'scotcat', 'panitvong']
const logoFolder = (url: string) => LOGO_FOLDERS.some(f => url.includes(`/${f}/`))

export const WATERMARK_SCHEMA = {
  type: 'object', required: ['photos'],
  properties: { photos: { type: 'array', items: { type: 'object', required: ['n', 'watermark', 'kind', 'what'], properties: { n: { type: 'number' }, watermark: { type: 'boolean' }, kind: { type: 'string', enum: ['credit', 'logo', 'url', 'name', 'caption', 'stamp', 'none'] }, what: { type: 'string' } } } } },
}

const prompt = (photos: { n: number; ocr: WatermarkEntry['ocr'] }[]) => `Numbered photos from an aquarium handbook. Some carry a watermark: text, a logo or a web address ADDED on top of the photo after it was taken.
Added (watermark: true):
- credit: a photographer's or owner's credit or signature ("© Name", "Photo: Name")
- logo: a shop, dealer, breeder, magazine or video channel logo or banner, with or without words
- url: a website name or address
- name: a species name, a common name or a label ("male", "female", "Brazil", "F1") typed onto the photo
- caption: a title, caption or subtitle printed over the photo (also subtitles burned into a video still)
- stamp: a camera's or phone's date stamp or "shot on" mark
Not added (watermark: false, kind "none"): text that is part of the scene, there when the photo was taken: a product's own box, bottle, bag or label, a sticker or label on a tank, a shop sign or price tag in the shot, a museum or specimen tag, a ruler, a herbarium sheet's label, the printed caption of an old book plate or drawing, a diagram's own labels.
Below is the text a machine reader found on each photo, with where it sits. It misreads and misses things: a logo without letters, faint text. Look at every photo, not only those with text listed.
${photos.map(p => `${p.n}: ${p.ocr.length ? p.ocr.map(l => `"${l.t}" (${l.at})`).join('; ') : 'no text found'}`).join('\n')}
For each photo n: watermark (true/false), kind (one of the above, "none" if not added), what: a few words on what was added and where (e.g. "Aquarium Glaser banner, top"), or what the text is if it belongs to the scene.`

const isRef = (x: unknown): x is { url: string } => !!x && typeof x === 'object' && typeof (x as { url: unknown }).url === 'string'

/** Photos a content file shows: `photos` lists (pages, galleries), equipment heroes and type photos, video guides' stills and photos. */
function urlsIn(x: unknown, out: Set<string>) {
  if (Array.isArray(x)) for (const v of x) urlsIn(v, out)
  else if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>
    for (const k of ['photos', 'moments']) if (Array.isArray(o[k])) for (const p of o[k] as unknown[]) if (isRef(p)) out.add(p.url)
    for (const k of ['photo', 'hero']) { const p = o[k]; if (isRef(p)) out.add(p.url) }
    for (const v of Object.values(o)) urlsIn(v, out)
  }
}

/**
 * Takes blocked photos off a content file, in place: from `photos` lists, video stills and figure photos (a figure left
 * with neither goes too), equipment type photos. An equipment hero is required: it becomes the first type photo left,
 * and stays (`kept`) when there is none.
 */
export function stripPhotos(x: unknown, blocked: (url: string) => boolean, removed: string[], kept: string[]) {
  if (Array.isArray(x)) { for (const v of x) stripPhotos(v, blocked, removed, kept); return }
  if (!x || typeof x !== 'object') return
  const o = x as Record<string, unknown>
  for (const v of Object.values(o)) stripPhotos(v, blocked, removed, kept)
  const drop = (p: unknown) => isRef(p) && blocked(p.url) && removed.push(p.url) > 0
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
 * (so a source re-read or a gallery rebuild doesn't bring it back). Runs each cycle after the photo steps.
 * `limit`: model calls this run; stops on a model failure (usage limit), and the rest wait for the next run.
 */
export async function screenWatermarks(root: string, cacheFile: string, rejectedFile: string, d: WatermarkDeps, o: { limit: number; parallel?: number }) {
  const cache: Record<string, WatermarkEntry> = JSON.parse(await readFile(cacheFile, 'utf8').catch(() => '{}'))
  const rejected: Record<string, string> = JSON.parse(await readFile(rejectedFile, 'utf8').catch(() => '{}'))
  const report = { read: 0, hits: 0, judged: 0, confirmed: [] as string[], removed: [] as string[], kept: [] as string[], failed: [] as string[], stopped: '' }
  const files = await contentFiles(join(root, 'content'))
  const urls = new Set<string>()
  for (const f of files) urlsIn(JSON.parse(await readFile(f, 'utf8')), urls)

  const dir = await mkdtemp(join(tmpdir(), 'watermarks-'))
  const fetchTo = async (url: string, file: string) => {
    try { await writeFile(file, await d.get(url)); return true } catch (err) { report.failed.push(`${url}: ${(err as Error).message.slice(0, 120)}`); return false }
  }
  try {
    // 1. Vision reads every photo not read yet (an unreadable or unreachable one is retried next run).
    const todo = [...urls].filter(u => !(u in cache))
    const got = (await pool(todo.map((url, i) => ({ url, file: join(dir, `r${i}`) })), 8, async x => ((await fetchTo(x.url, x.file)) ? x : null))).filter(x => !!x)
    const lines = got.length ? await d.read(got.map(x => x.file)) : []
    got.forEach((x, i) => {
      const l = lines[i]
      if (!l) { report.failed.push(`${x.url}: unreadable`); return }
      cache[x.url] = { ocr: l.slice(0, 8).map(t => ({ t: t.t.slice(0, 60), c: t.c, at: at(t) })) } // what the model is shown
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
        const sheet = join(dir, `sheet-${i}.jpg`)
        await writeFile(sheet, await contactSheet(ok.map(x => x.b), 640, 480, 2, 'contain'))
        const v = await d.look(sheet, prompt(ok.map((x, j) => ({ n: j + 1, ocr: cache[x.url]!.ocr }))))
        for (const p of v.photos ?? []) {
          const x = ok[p.n - 1]
          if (!x || typeof p.watermark !== 'boolean') continue
          cache[x.url] = { ...cache[x.url]!, watermark: p.watermark, kind: p.watermark ? p.kind : 'none', what: String(p.what ?? '').slice(0, 120) }
          report.judged++
        }
      } catch (err) {
        if (err instanceof LlmError) report.stopped ||= err.message
        else report.failed.push(`sheet ${i}: ${(err as Error).message.slice(0, 120)}`)
      }
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  // 3. Watermarked photos join the blocklist and leave every page.
  const marked = (u: string) => cache[u]?.watermark === true
  for (const u of urls) if (marked(u)) {
    report.confirmed.push(u)
    if (!(u in rejected)) rejected[u] = `watermark: ${cache[u]!.what || cache[u]!.kind}`
  }
  for (const f of files) {
    const raw = await readFile(f, 'utf8')
    const data = JSON.parse(raw) as unknown
    const removed: string[] = []
    stripPhotos(data, marked, removed, report.kept)
    if (!removed.length) continue
    report.removed.push(...removed.map(u => `${relative(root, f)}: ${u}`))
    await writeFile(f, `${JSON.stringify(data, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
  }
  await writeFile(cacheFile, `${JSON.stringify(Object.fromEntries(Object.entries(cache).sort()), null, 2)}\n`)
  await writeFile(rejectedFile, `${JSON.stringify(rejected, null, 2)}\n`)
  return report
}
