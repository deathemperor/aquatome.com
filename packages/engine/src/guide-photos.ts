import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import sharp from 'sharp'
import { LlmError } from './claude'
import { contactSheet } from './video-images'
import { stripPhotos } from './watermarks'

/**
 * No people and no logos in the pictures the subject check (photo-check.ts) doesn't look at: every guide's photos (the
 * lead and those set under its headings) and its video sections' photos, and the equipment guides' photos. Before
 * this, a guide photo had only the face detector (it misses hands, and a person seen from behind) and the watermark
 * step, whose model looks only where macOS Vision reads text and calls a product's own label part of the scene. Found
 * by a design review (2026-11-07): hands planting a sword plant leading one guide, a person siphoning a tank leading
 * another, and an Aquarium Co-op test-strip bottle in the betta setup guide; 5,960 of 6,428 guide pictures had never
 * had a model look for a mark, and none for people.
 *
 * The model answers per photo, 6 to a sheet (a faint signature needs the size): a person or any part of one (PRODUCT.md:
 * "Photos never show people (hands count)"); a mark added on the photo; a shop's or dealer's brand in it, on its own-brand
 * products too (governance: no "dealer logos"; a maker's brand on its own product is fine). A person or a mark is the photo's: it leaves every guide and equipment guide and joins
 * `_photo-rejected.json` ("people: …", "watermark: …"), which the photo steps respect, so a source re-read doesn't bring
 * it back and the faces and subject steps take it off any other page. A brand leaves the guides ("logo: …"), and is kept
 * on an equipment guide, whose subject is the product. Each photo is judged once (`engine-state/_photo-guides.json`, URL
 * → verdict); one that can't be fetched is tried again next run. Leads first, since they are the guide's card too.
 * Video stills (a video's own frames) aren't judged here: video-stills.ts screens them for faces and text.
 */
export type GuidePhotoVerdict = { person: boolean; mark: boolean; brand: boolean; note: string }
export type GuidePhotoDeps = {
  get: (url: string) => Promise<Uint8Array>
  look: (sheet: string, prompt: string) => Promise<{ photos: ({ n: number } & GuidePhotoVerdict)[] }>
}
export const GUIDE_PHOTO_SCHEMA = {
  type: 'object', required: ['photos'],
  properties: { photos: { type: 'array', items: { type: 'object', required: ['n', 'person', 'mark', 'brand', 'note'], properties: { n: { type: 'number' }, person: { type: 'boolean' }, mark: { type: 'boolean' }, brand: { type: 'boolean' }, note: { type: 'string' } } } } },
}
export const GUIDE_PHOTO_PROMPT = `Numbered photos from an aquarium handbook's guides. For each photo n:
- person: true if a person or any part of one is in it: a hand or fingers (planting, holding, pointing, working in the tank), an arm, a foot, a face, a body seen from behind, even small, cut off at the edge, blurred or behind the glass; false if not.
- mark: true if a logo, watermark, signature, credit, web address or caption was added on top of the photo after it was taken, even small or faint, in a corner, in any script, with or without letters; false if not.
- brand: true if a shop's or dealer's logo or name can be read or recognised in the photo: on a product it sells under its own name (such as an Aquarium Co-op bottle), a bag, a box, a sign or a price tag; false for a maker's own brand on its own product (Seachem, API, Fluval, Tetra, Oase and the like), for a product with no brand in view, and for text that isn't a brand.
- note: a few words on what it shows and, for each true, what and where (e.g. "hands planting a sword plant in gravel"; "Aquarium Co-op logo on a test-strip bottle").
Answer every photo, by its number.`
const PER_SHEET = 6

type Item = { url: string; lead: boolean; equipment: boolean }
type Guide = { photos?: { url: string }[]; video?: { figures?: { photo?: { url: string } }[] } }
type Equipment = { hero?: { url: string }; types?: { photo?: { url: string } }[] }
const readJson = async <T>(path: string): Promise<T | undefined> => readFile(path, 'utf8').then(s => JSON.parse(s) as T, () => undefined)

async function pool<T>(items: T[], n: number, f: (x: T) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (next < items.length) await f(items[next++]!) }))
}

/** Why a photo leaves a guide, or an equipment guide (where a brand is the product's), or undefined. */
export function guidePhotoOff(v: GuidePhotoVerdict | undefined, equipment: boolean): string | undefined {
  if (!v) return undefined
  return v.person ? `people: ${v.note}` : v.mark ? `watermark: ${v.note}` : v.brand && !equipment ? `logo: ${v.note}` : undefined
}

export async function screenGuidePhotos(root: string, d: GuidePhotoDeps, o: { limit: number; parallel?: number }) {
  const content = join(root, 'content')
  const state = (f: string) => join(root, 'engine-state', f)
  const cache = (await readJson<Record<string, GuidePhotoVerdict>>(state('_photo-guides.json'))) ?? {}
  const rejected = (await readJson<Record<string, string>>(state('_photo-rejected.json'))) ?? {}
  const report = { sheets: 0, judged: 0, off: [] as string[], removed: [] as string[], kept: [] as string[], failed: [] as string[], left: 0, stopped: '' }

  // Every photo a guide or an equipment guide shows, with the files it is in.
  const files: string[] = []
  const items = new Map<string, Item>()
  const add = (url: string, lead: boolean, equipment: boolean) => {
    const it = items.get(url) ?? { url, lead, equipment }
    items.set(url, { url, lead: it.lead || lead, equipment: it.equipment || equipment })
  }
  for (const id of (await readdir(join(content, 'guides')).catch(() => [] as string[])).sort()) {
    const file = join(content, 'guides', id, 'entity.json')
    const g = await readJson<Guide>(file)
    if (!g) continue
    files.push(file)
    for (const [i, p] of (g.photos ?? []).entries()) add(p.url, i === 0, false)
    for (const f of g.video?.figures ?? []) if (f.photo) add(f.photo.url, false, false)
  }
  // An equipment guide's photos are in each language's file too (equipment/id/…).
  for (const f of (await readdir(join(content, 'equipment'), { recursive: true }).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort()) {
    const file = join(content, 'equipment', f)
    const e = await readJson<Equipment>(file)
    if (!e) continue
    files.push(file)
    if (e.hero) add(e.hero.url, true, true)
    for (const t of e.types ?? []) if (t.photo) add(t.photo.url, false, true)
  }

  // 1. The model judges photos not judged yet, leads first; `limit` sheets this run.
  const todo = [...items.values()].filter(x => !(x.url in cache) && !(x.url in rejected)).map((x, i) => ({ x, i })).sort((a, b) => Number(b.x.lead) - Number(a.x.lead) || a.i - b.i).map(({ x }) => x)
  const batch = todo.slice(0, Math.max(0, o.limit) * PER_SHEET)
  report.left = todo.length - batch.length
  const sheets = Array.from({ length: Math.ceil(batch.length / PER_SHEET) }, (_, i) => batch.slice(i * PER_SHEET, (i + 1) * PER_SHEET))
  const dir = await mkdtemp(join(tmpdir(), 'guide-photos-'))
  try {
    await pool(sheets.map((s, i) => ({ s, i })), o.parallel ?? 1, async ({ s, i }) => {
      if (report.stopped) return
      const ok: { url: string; b: Buffer }[] = []
      for (const x of s) {
        try {
          const b = Buffer.from(await d.get(x.url))
          await sharp(b).metadata() // not an image (an error page served as 200): left out, so the rest of the sheet is judged
          ok.push({ url: x.url, b })
        } catch (err) { report.failed.push(`${x.url}: ${(err as Error).message.slice(0, 120)}`) }
      }
      if (!ok.length) return
      try {
        const sheet = join(dir, `sheet-${i}.jpg`)
        await writeFile(sheet, await contactSheet(ok.map(x => x.b), 640, 480, 2, 'contain'))
        const v = await d.look(sheet, GUIDE_PHOTO_PROMPT)
        report.sheets++
        for (const p of v.photos ?? []) {
          const x = ok[p.n - 1]
          if (!x || typeof p.person !== 'boolean' || typeof p.mark !== 'boolean' || typeof p.brand !== 'boolean') continue
          cache[x.url] = { person: p.person, mark: p.mark, brand: p.brand, note: String(p.note ?? '').slice(0, 120) }
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

  // 2. Off the guides and equipment guides; a person, a mark, or a brand on a photo no equipment guide shows, onto the blocklist.
  const now = (await readJson<Record<string, string>>(state('_photo-rejected.json'))) ?? {} // re-read: entries another step added meanwhile stay
  for (const x of items.values()) {
    const why = guidePhotoOff(cache[x.url], x.equipment)
    if (!why) continue
    report.off.push(`${x.url}: ${why}`)
    now[x.url] ??= why
  }
  for (const file of files) {
    const raw = await readFile(file, 'utf8')
    const data = JSON.parse(raw) as unknown
    const removed: string[] = []
    const equipment = file.startsWith(join(content, 'equipment'))
    stripPhotos(data, url => !!guidePhotoOff(cache[url], equipment), removed, report.kept)
    if (!removed.length) continue
    report.removed.push(...removed.map(u => `${relative(root, file)}: ${u}`))
    await writeFile(file, `${JSON.stringify(data, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
  }
  await writeFile(state('_photo-guides.json'), `${JSON.stringify(Object.fromEntries(Object.entries(cache).sort()), null, 2)}\n`)
  await writeFile(state('_photo-rejected.json'), `${JSON.stringify(now, null, 2)}\n`)
  return report
}
