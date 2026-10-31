import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'node-html-parser'
import sharp from 'sharp'
import { GuideSchema, type GuideEntity, type Photo, type Translation } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import type { Media } from './source-photos'
import { throttled } from './youtube'

/** YouTube's scrub-preview frames: sheets of rows × columns tiles, one tile every 1/fps seconds. */
export type Storyboard = { fps: number; rows: number; columns: number; width: number; height: number; fragments: { url: string }[] }
export type ImageDeps = {
  llm: Llm
  /** Claude looking at one image file (a numbered contact sheet). */
  look: <T>(file: string, prompt: string, schema: object) => Promise<T>
  /** Faces per image file (macOS Vision). */
  faces: (files: string[]) => Promise<number[]>
  storyboard: (youtubeId: string) => Promise<Storyboard | null>
  transcript: (youtubeId: string, lang?: string) => Promise<string | null>
  commons: (search: string) => Promise<Photo[]>
  get: (url: string) => Promise<Uint8Array>
  media: Media
}
type Figure = NonNullable<NonNullable<GuideEntity['video']>['figures']>[number]

const PLAN_SCHEMA = {
  type: 'object', required: ['sections'],
  properties: { sections: { type: 'array', items: { type: 'object', required: ['times', 'query'], properties: { times: { type: 'array', items: { type: 'number' } }, query: { type: 'string' } } } } },
}
const PICK_SCHEMA = { type: 'object', required: ['picks'], properties: { picks: { type: 'array', items: { type: 'object', required: ['n', 'caption'], properties: { n: { type: 'number' }, caption: { type: 'string' } } } } } }

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

/** The guide's h3 sections: heading and the text under it. */
export function sections(body: string): { heading: string; text: string }[] {
  const root = parse(body)
  return root.querySelectorAll('h3').map(h => {
    let text = ''
    for (let n = h.nextElementSibling; n && n.tagName !== 'H3'; n = n.nextElementSibling) text += ` ${n.textContent}`
    return { heading: h.textContent.replace(/\s+/g, ' ').trim(), text: text.replace(/\s+/g, ' ').trim() }
  }).filter(s => s.heading)
}

/** Numbered contact sheet of equal tiles (the number in a corner), so the model can say which one. `contain`: whole photos, corners and all. */
export async function contactSheet(tiles: Buffer[], w: number, h: number, cols: number, fit: 'cover' | 'contain' = 'cover'): Promise<Buffer> {
  const rows = Math.ceil(tiles.length / cols)
  const label = (n: number) => Buffer.from(`<svg width="44" height="30"><rect width="44" height="30" fill="#000" opacity="0.8"/><text x="22" y="22" font-size="20" font-family="Arial" font-weight="bold" fill="#fff" text-anchor="middle">${n}</text></svg>`)
  const parts = await Promise.all(tiles.map(async (t, i) => [
    { input: await sharp(t).resize(w, h, { fit, background: '#888' }).toBuffer(), left: (i % cols) * (w + 6), top: Math.floor(i / cols) * (h + 6) },
    { input: label(i + 1), left: (i % cols) * (w + 6), top: Math.floor(i / cols) * (h + 6) },
  ]))
  return sharp({ create: { width: cols * (w + 6), height: rows * (h + 6), channels: 3, background: '#fff' } }).composite(parts.flat()).jpeg({ quality: 85 }).toBuffer()
}

/** One storyboard frame at second t (nearest tile), as JPEG. Sheets are fetched once each. */
function frames(sb: Storyboard, get: (url: string) => Promise<Uint8Array>) {
  const sheets = new Map<number, Promise<Uint8Array>>()
  const per = sb.rows * sb.columns
  const total = sb.fragments.length * per
  return async (t: number) => {
    const k = Math.min(total - 1, Math.max(0, Math.round(t * sb.fps)))
    const s = Math.floor(k / per)
    if (!sb.fragments[s]) return null
    if (!sheets.has(s)) sheets.set(s, get(sb.fragments[s]!.url))
    const sheet = await sheets.get(s)!
    const tile = k % per
    const left = (tile % sb.columns) * sb.width
    const top = Math.floor(tile / sb.columns) * sb.height
    const meta = await sharp(sheet).metadata()
    if (left + sb.width > (meta.width ?? 0) || top + sb.height > (meta.height ?? 0)) return null // last sheet is partly empty
    return { t: Math.round(k / sb.fps), jpg: await sharp(sheet).extract({ left, top, width: sb.width, height: sb.height }).jpeg({ quality: 90 }).toBuffer() }
  }
}

const planPrompt = (title: string, secs: { heading: string; text: string }[], transcript: string) => `A Vietnamese guide was written from the YouTube video "${title}". For each guide section below, plan its pictures.

- times: up to 3 moments (seconds) where the video most likely SHOWS what the section is about: a close-up of the algae, plant, fish or equipment, a technique being done, a before/after. Use the transcript's timestamps; pick moments where the creator says "look", "here you can see", "this is", or shows a tank, not where he only talks to the camera. Empty if nothing visual.
- query: 2–4 English words to find a photo of the section's main subject on Wikimedia Commons (e.g. "black beard algae", "aquarium CO2 drop checker", "Otocinclus"). Empty if a photo wouldn't help (abstract advice).

Return one entry per section, in order (${secs.length} sections).

SECTIONS:
${secs.map((s, i) => `${i + 1}. ${s.heading}\n${s.text.slice(0, 500)}`).join('\n\n')}

TRANSCRIPT:
${transcript.slice(0, 100_000)}`

const momentPrompt = (heading: string, text: string, n: number) => `These are ${n} numbered stills from an aquarium video. They illustrate a guide section:
"${heading}": ${text.slice(0, 400)}

Pick at most 2 stills that SHOW the section's subject clearly (the algae, plants, fish, equipment or technique). Skip stills that are mostly a person or face, have on-screen text, credits or logos, are split screens, title cards, blurry or transition frames, and near-duplicates of a pick.
For each pick give n and a caption: one short Vietnamese sentence (≤ 14 words) saying what the still shows, in natural hobbyist Vietnamese ("rêu hại" for algae). Return no picks if none fits.`

const photoPrompt = (heading: string, text: string, n: number) => `These are ${n} numbered photos from Wikimedia Commons. Which one best illustrates this aquarium guide section for a hobbyist?
"${heading}": ${text.slice(0, 400)}

Pick at most 1. Skip photos showing people, diagrams or charts with English text, photos of a different subject (e.g. sea algae for an aquarium algae section), and poor-quality photos.
Give n and a caption: one short Vietnamese sentence (≤ 14 words) saying what the photo shows, in natural hobbyist Vietnamese. Return no picks if none fits.`

/** Pictures for one guide's sections; [] when nothing fitted (the guide is then done). */
async function figuresFor(e: GuideEntity, vi: Translation, d: ImageDeps, dir: string): Promise<Figure[]> {
  const v = e.video!
  const secs = sections(vi.body ?? '')
  if (!secs.length) return []
  const transcript = await d.transcript(v.youtubeId, v.lang ?? 'en')
  if (!transcript) throw new Error('no transcript')
  const plan = (await d.llm<{ sections: { times: number[]; query: string }[] }>({ system: 'You plan pictures for a guide. Reply only with JSON.', prompt: planPrompt(v.title, secs, transcript), schema: PLAN_SCHEMA })).sections
  const sb = await d.storyboard(v.youtubeId)
  const frameAt = sb ? frames(sb, d.get) : null
  const out: Figure[] = []
  const seen = new Set<number>()
  for (const [i, s] of secs.entries()) {
    const p = plan[i]
    if (!p) continue
    const fig: Figure = { heading: s.heading, moments: [] }

    // Video moments: stills around each planned time, the model picks, no faces.
    const times = [...new Set((p.times ?? []).filter(t => t >= 0 && t <= v.durationSec).slice(0, 3).flatMap(t => [t - 5, t, t + 5, t + 10]))]
    const cands = frameAt ? (await Promise.all(times.map(frameAt))).filter((f): f is { t: number; jpg: Buffer } => !!f && !seen.has(f.t)) : []
    const uniq = [...new Map(cands.map(c => [c.t, c])).values()].slice(0, 12)
    if (uniq.length) {
      const sheet = join(dir, `${v.youtubeId}-${i}-m.jpg`)
      await writeFile(sheet, await contactSheet(uniq.map(c => c.jpg), 320, 180, 4))
      const picks = (await d.look<{ picks: { n: number; caption: string }[] }>(sheet, momentPrompt(s.heading, s.text, uniq.length), PICK_SCHEMA)).picks.slice(0, 2)
      for (const pk of picks) {
        const c = uniq[pk.n - 1]
        if (!c || !pk.caption?.trim()) continue
        const f = join(dir, `${v.youtubeId}-${c.t}.jpg`)
        await writeFile(f, c.jpg)
        if ((await d.faces([f]))[0]) continue // no people in our pictures
        const m = await d.media.put(`video/${v.youtubeId}/t${c.t}.webp`, c.jpg)
        fig.moments.push({ t: c.t, url: m.url, width: m.width, height: m.height, caption: pk.caption.trim() })
        seen.add(c.t)
      }
      fig.moments.sort((a, b) => a.t - b.t)
    }

    // One open-licence photo of the section's subject.
    if (p.query?.trim()) {
      const photos = (await d.commons(p.query.trim()).catch(() => [] as Photo[])).slice(0, 6)
      const bytes = await Promise.all(photos.map(ph => d.get(ph.url).catch(() => null)))
      const ok = photos.flatMap((ph, j) => (bytes[j] ? [{ ph, b: bytes[j]! }] : []))
      if (ok.length) {
        const sheet = join(dir, `${v.youtubeId}-${i}-p.jpg`)
        await writeFile(sheet, await contactSheet(ok.map(x => Buffer.from(x.b)), 360, 270, 3))
        const pk = (await d.look<{ picks: { n: number; caption: string }[] }>(sheet, photoPrompt(s.heading, s.text, ok.length), PICK_SCHEMA)).picks[0]
        const c = pk && ok[pk.n - 1]
        if (c && pk.caption?.trim()) {
          const f = join(dir, `${v.youtubeId}-${i}-photo.jpg`)
          await writeFile(f, c.b)
          if (!(await d.faces([f]))[0]) {
            const key = `video/${v.youtubeId}/p${i}-${Buffer.from(c.ph.sourceUrl).toString('base64url').slice(-16)}.webp`
            const m = await d.media.put(key, c.b)
            fig.photo = { ...c.ph, url: m.url, thumb: m.thumb, width: m.width, height: m.height, caption: pk.caption.trim() }
          }
        }
      }
    }
    if (fig.moments.length || fig.photo) out.push(fig)
  }
  return out
}

/** Pictures for video guides that have none yet (entity.video.figures absent). */
export async function videoImages(contentRoot: string, d: ImageDeps, opts: { limit?: number } = {}): Promise<{ done: string[]; failed: string[]; stoppedEarly: boolean }> {
  const done: string[] = []
  const failed: string[] = []
  const dir = await mkdtemp(join(tmpdir(), 'aq-vimg-'))
  try {
    for (const id of (await readdir(join(contentRoot, 'guides')).catch(() => [] as string[])).filter(x => x.startsWith('youtube-')).sort()) {
      if (opts.limit !== undefined && done.length >= opts.limit) break
      const file = join(contentRoot, 'guides', id, 'entity.json')
      const e = JSON.parse(await readFile(file, 'utf8')) as GuideEntity
      if (!e.video || e.video.figures) continue
      const vi = JSON.parse(await readFile(join(contentRoot, 'guides', id, 'vi.json'), 'utf8')) as Translation
      try {
        const figures = await figuresFor(e, vi, d, dir)
        await writeFile(file, `${JSON.stringify(GuideSchema.parse({ ...e, video: { ...e.video, figures } }), null, 2)}\n`)
        done.push(`${id}: ${figures.length} sections, ${figures.reduce((n, f) => n + f.moments.length, 0)} stills, ${figures.filter(f => f.photo).length} photos`)
      } catch (err) {
        if (err instanceof LlmError || throttled(err)) { failed.push(`${id}: ${(err as Error).message}`); return { done, failed, stoppedEarly: true } }
        failed.push(`${id}: ${(err as Error).message}`)
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  return { done, failed, stoppedEarly: false }
}
