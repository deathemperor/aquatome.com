import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Photo } from '@aq/schema'
import sharp from 'sharp'
import { LlmError } from './claude'
import { across, cardWorthy, LARGE_PX, readCalendar, readVerdicts, SLOT_RATIO } from './curation'
import { contactSheet } from './video-images'

/**
 * A fish's head photo: the page's first, which its cards show too (curation.ts). `check-photos` ranks a page's own photos
 * by its verdict and never looks at size, and a page's own photos are mostly its sources' (Seriously Fish at 600-800 px),
 * so a photo too small for the card led while a bigger one sat in the gallery (the chief of staff, 2026-11-10: the Altum's
 * head was 608 px across and its card another photo).
 *
 * A head under the card's size gives way to a photo that passes (right fish, typical, no person, logo or face, not on
 * the calendar's `avoid`, big enough) and shows the fish as well. Passing isn't enough: of 81 fish looked at by eye, many
 * that passed showed the fish smaller, dimmer, or beside a ruler. So the model is shown the two side by side, and the
 * head stays unless it says the other is as good; no answer is no change. Each pair is asked once
 * (`engine-state/_photo-leads.json`, photo → head → answer), at most `TRIES` photos a fish, the page's own photos, then the
 * gallery's `best`, then the rest. A page with no photo of its own takes the first that passes: nothing to compare.
 * The head that gives way stays on the page, second; a gallery photo that leads stays in its gallery.
 *
 * A long fish filling a wide frame can lose its head to the card's crop, and both the site's cards and the app's centre
 * the picture (the chief of staff, 2026-11-10: five of 43 replacements looked at had the head outside it). So the model
 * also sees the second photo as the card crops it, and a photo whose crop leaves the fish's head out doesn't lead.
 *
 * A change of head goes back with no model call when the reason for it has gone (the old head now fills the card, a large
 * copy having arrived, as the Altum's did) or a look has since said no (the sebae): `_photo-leads.json` says which.
 */
export type LeadDeps = {
  get: (url: string) => Promise<Uint8Array>
  look: (sheet: string, prompt: string) => Promise<{ pairs: { n: number; asWell: boolean; headInCrop?: boolean; why?: string }[] }>
}
export type Compared = Record<string, Record<string, boolean>>
type GalleryPhoto = Photo & { best?: boolean; kind?: string }
type Entity = { photos?: Photo[] }

export const LEAD_SCHEMA = {
  type: 'object', required: ['pairs'],
  properties: { pairs: { type: 'array', items: { type: 'object', required: ['n', 'asWell', 'headInCrop'], properties: { n: { type: 'number' }, asWell: { type: 'boolean' }, headInCrop: { type: 'boolean' }, why: { type: 'string' } } } } },
}
/** The guard's question: the whole head, since a card with the eye in and the snout cut still shows a fish with no face (the Devario, 2026-11-10). */
export const HEAD_IN_CROP = `headInCrop: true only if the third picture holds the main fish's whole head, from the tip of its snout to its gill cover (for a shrimp or snail, its head end), with a little room between the head and the picture's edge. False if the snout, the mouth or the gill cover is cut off by the edge or touches it: an eye inside the picture is not enough. If unsure, false.`
const leadPrompt = (pairs: number) => `Numbered photos of aquarium fish, three to a row: photos 1 to 3 are pair 1${pairs > 1 ? ', 4 to 6 pair 2' : ''}${pairs > 2 ? ', 7 to 9 pair 3' : ''}. In each pair the first two show the same kind of fish. The first is the photo a page about that fish leads with today, the second a photo that could lead instead, and the third is that second photo as the page's card crops it. The sheet shows them at one size, so don't judge resolution.
For each pair, asWell: true only if the second shows the fish at least as well as the first, as the picture a reader would want at the top of the page: the fish about as large in the frame, as sharp and as well lit, with its colours and pattern as clear, whole, and not blocked. False if the fish is smaller in the frame, blurred, dim, washed out, seen from an odd angle or lost in clutter, or if a ruler, a label, a logo, a box or any text is in the picture. If unsure, false.
${HEAD_IN_CROP}
Answer every pair, by its number: n is the pair, 1 to ${pairs}; why is a few words.`

const PAIRS = 3
export const TRIES = 3
const fills = (p: Photo) => across(p.large ?? p, 'square') >= LARGE_PX
/** The picture as the narrowest card crops it, from the middle: neither the site's cards nor the app's place the crop. */
export const cardCrop = (bytes: Uint8Array) => sharp(bytes).rotate().resize(640, Math.round(640 / SLOT_RATIO.square), { fit: 'cover', position: 'centre' }).jpeg({ quality: 85 }).toBuffer()

/** What a fish's head should do: lead with this photo, or ask about this pair first; nothing if it stays. */
export function leadChoice(own: Photo[], gallery: GalleryPhoto[], passes: (p: Photo) => boolean, compared: Compared): { lead: Photo } | { ask: { head: Photo; photo: Photo } } | undefined {
  const head = own[0]
  const back = head && own.slice(1).find(o => { const said = compared[head.url]?.[o.url]; return passes(o) && (said === false || (said === true && fills(o))) })
  if (back) return { lead: back }
  if (head && fills(head)) return undefined
  const seen = new Set<string>()
  const candidates = [...own.slice(1), ...gallery.filter(p => p.best), ...gallery.filter(p => !p.best)].filter(p => {
    if (seen.has(p.url) || !fills(p) || !passes(p)) return false
    seen.add(p.url)
    return true
  })
  if (!head) return candidates[0] ? { lead: candidates[0] } : undefined
  for (const photo of candidates.slice(0, TRIES)) {
    const said = compared[photo.url]?.[head.url]
    if (said === undefined) return { ask: { head, photo } }
    if (said) return { lead: photo }
  }
  return undefined
}

/** `calendar`: only the fish on the days to come. `only`: these fish. The calendar's fish are asked about first. */
export async function screenLeads(root: string, d: LeadDeps, o: { limit: number; parallel?: number; only?: string[]; calendar?: boolean }) {
  const content = join(root, 'content')
  const file = join(root, 'engine-state', '_photo-leads.json')
  const compared: Compared = JSON.parse(await readFile(file, 'utf8').catch(() => '{}'))
  const verdicts = await readVerdicts(root)
  const cur = await readCalendar(root)
  const report = { sheets: 0, compared: 0, changed: [] as string[], gained: [] as string[], failed: [] as string[], waiting: 0, stopped: '' }
  const today = new Date().toISOString().slice(0, 10)
  const coming = new Set(cur.days.filter(x => x.date >= today && x.fish).map(x => x.fish!))

  type Fish = { ref: string; id: string; path: string; raw: string; entity: Entity; gallery: GalleryPhoto[] }
  const all: Fish[] = []
  for (const kind of ['species', 'breeds']) {
    for (const id of (await readdir(join(content, kind)).catch(() => [] as string[])).sort()) {
      const ref = `${kind}/${id}`
      if (o.only ? !o.only.includes(id) : o.calendar && !coming.has(ref)) continue
      const path = join(content, kind, id, 'entity.json')
      const raw = await readFile(path, 'utf8').catch(() => null)
      if (!raw) continue
      const g = JSON.parse(await readFile(join(content, 'gallery', `${id}.json`), 'utf8').catch(() => '{}')) as { photos?: GalleryPhoto[] }
      all.push({ ref, id, path, raw, entity: JSON.parse(raw) as Entity, gallery: g.photos ?? [] })
    }
  }
  all.sort((a, b) => Number(coming.has(b.ref)) - Number(coming.has(a.ref)))
  const choose = (f: Fish) => leadChoice(f.entity.photos ?? [], f.gallery, p => cardWorthy(p.url, f.id, verdicts, cur.avoid), compared)

  // Asked in rounds, since a pair answered no sends its fish on to the next photo.
  const dir = await mkdtemp(join(tmpdir(), 'lead-photos-'))
  let left = Math.max(0, o.limit)
  try {
    for (let round = 0; round < TRIES && left > 0 && !report.stopped; round++) {
      const asks = all.flatMap(f => { const c = choose(f); return c && 'ask' in c ? [c.ask] : [] }).slice(0, left * PAIRS)
      if (!asks.length) break
      const sheets = Array.from({ length: Math.ceil(asks.length / PAIRS) }, (_, i) => asks.slice(i * PAIRS, (i + 1) * PAIRS))
      left -= sheets.length
      let next = 0
      const work = async () => {
        while (next < sheets.length && !report.stopped) {
          const i = next++
          const ok: typeof asks = []
          const images: Buffer[] = []
          for (const pair of sheets[i]!) {
            try {
              const both = await Promise.all([d.get(pair.head.url), d.get(pair.photo.url)])
              images.push(...both.map(b => Buffer.from(b)), await cardCrop(both[1]))
              ok.push(pair)
            } catch (err) { report.failed.push(`${pair.photo.url}: ${(err as Error).message.slice(0, 120)}`) }
          }
          if (!ok.length) continue
          try {
            const sheet = join(dir, `round-${round}-${i}.jpg`)
            await writeFile(sheet, await contactSheet(images, 640, 480, 3, 'contain'))
            const { pairs } = await d.look(sheet, leadPrompt(ok.length))
            report.sheets++
            for (const p of pairs ?? []) {
              const pair = ok[p.n - 1]
              if (!pair || typeof p.asWell !== 'boolean') continue
              compared[pair.photo.url] = { ...compared[pair.photo.url], [pair.head.url]: p.asWell && p.headInCrop === true }
              report.compared++
            }
          } catch (err) {
            if (err instanceof LlmError) report.stopped ||= err.message
            else report.failed.push(`sheet ${i}: ${(err as Error).message.slice(0, 120)}`)
          }
        }
      }
      await Promise.all(Array.from({ length: Math.max(1, o.parallel ?? 1) }, work))
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  for (const f of all) {
    const c = choose(f)
    if (!c) continue
    if ('ask' in c) { report.waiting++; continue }
    const own = f.entity.photos ?? []
    const { best: _b, kind: _k, ...photo } = c.lead as GalleryPhoto
    const had = own.find(p => p.url === photo.url)
    const photos = [had ?? photo, ...own.filter(p => p.url !== photo.url)]
    ;(own.length ? report.changed : report.gained).push(`${f.ref}: ${own[0]?.url ?? 'none'} -> ${photo.url}`)
    await writeFile(f.path, `${JSON.stringify({ ...f.entity, photos }, null, f.raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
  }
  await writeFile(file, `${JSON.stringify(Object.fromEntries(Object.entries(compared).sort()), null, 2)}\n`)
  return report
}
