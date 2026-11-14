import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isGenerated } from '@aq/schema'
import sharp from 'sharp'
import { LlmError } from './claude'
import { ALBUM_ASK_FILE, SHEET, type AlbumAnswer, type GalleryPhoto } from './gallery'
import { galleryPlan } from './gallery-plan'
import { piece } from './pieces'
import { contactSheet } from './video-images'

/**
 * The album ask (the chief of staff, 2026-11-14): every photo an album shows, asked once, on contact sheets that show each
 * photo whole (the album check's crop each tile to fill, which hides whether the photo's own edge cuts the fish):
 * - `setup`: a photo tank, box, tray, cup or bucket, or a ruler or printed board beside it (the album check asks it of new
 *   photos since 14 Nov; the 10,237 kept before were judged by their captions);
 * - a fish's `whole`: the whole fish inside the frame, and `small`: the fish fills only a small part of it. The box step's
 *   boxes can't tell a fin touching the frame from a head cut off (by eye, 6 of 24 boxes on two sides of the frame were
 *   cut). Tried on 60 photos judged by eye (14 Nov; the set, its labels and each try's counts:
 *   scripts/album-ask-set.json, which scripts/album-ask-set.ts asks again): `whole` false on 9 of 9 cut fish and 1 of 7
 *   whole ones on its first sheet; `small` true on 12 of 13 fish too small to make out, and on 1 of 20 large ones; asked
 *   as "big enough to make out", 1 of 13.
 * The album's order reads the answers (gallery.ts isPoor), in the album step, the sweep and Tropica's photos alike. Fish
 * and breed albums are asked all three, plant albums `setup`; most popular albums first, twenty photos from any albums to
 * a sheet, each tile's fish named in the prompt. A photo waiting for the photo check is asked once it shows. Answers by
 * photo address in engine-state/_album-ask.json (mirror-photos.ts carries them to a mirrored address); a photo the model
 * passes over, or that can't be fetched or read, is tried on one more sheet, then left as it is; a sheet starts only
 * where the day's line covers one (pieces.ts). Its own step (cli.ts
 * `album-ask`), under its own line in ceilings.json: $2 a day on the Mac from 16 Nov, out of the room under
 * the backstop (the chief of staff, 14 Nov). About $0.02 a sheet, 513 sheets on 14 Nov: about five days.
 */
export type AskTile = { n: number; setup: boolean; whole?: boolean; small?: boolean }
export type AlbumAskDeps = {
  get: (url: string) => Promise<Uint8Array>
  ask: (sheet: string, prompt: string, plant: boolean) => Promise<{ tiles: AskTile[] }>
}
const tile = (plant: boolean) => ({
  type: 'object', required: plant ? ['n', 'setup'] : ['n', 'setup', 'whole', 'small'],
  properties: { n: { type: 'number' }, setup: { type: 'boolean' }, ...(plant ? {} : { whole: { type: 'boolean' }, small: { type: 'boolean' } }) },
})
export const askSchema = (plant: boolean) => ({ type: 'object', required: ['tiles'], properties: { tiles: { type: 'array', items: tile(plant) } } })
/** How many sheets a photo may go unanswered on before it is left as it is. */
export const TRIES = 2

export const askPrompt = (names: string[], plant: boolean) => `${plant
  ? `Numbered photos from the photo albums of an aquarium handbook; the plant each number shows is listed below. Each tile shows its photo whole, with grey bars where the photo is narrower than the tile. For each photo:
- setup: true if the plant lies in a tray, box or cup, or beside a ruler or a printed board, else false.`
  : `Numbered photos from the photo albums of an aquarium handbook; the fish or other animal each number shows is listed below. Each tile shows its photo whole, with grey bars where the photo is narrower than the tile. For each photo, about that animal (in a photo of several, most of them):
- setup: true if it is in a small photo tank, box, tray, cup or bucket, or beside a ruler or a printed board (a field or lab photo), else false.
- whole: false if the photo's own edge cuts off its head or tail or a large part of its body, as in a close-up of the head; true if the whole animal is inside the photo, even where a fin tip or a feeler touches the edge.
- small: true if it fills only a small part of the photo, most of the photo being water, plants, rocks or ground around it (in a photo of several, if each of them is small); false if it fills a good part of the photo.`}
Answer every photo, by its number.
${names.map((n, i) => `${i + 1}: ${n}`).join('\n')}`

type Item = { url: string; img: string; name: string; plant: boolean }

export async function askAlbums(root: string, d: AlbumAskDeps, o: { sheets: number }) {
  const file = join(root, 'engine-state', ALBUM_ASK_FILE)
  const state = JSON.parse(await readFile(file, 'utf8').catch(() => '{}')) as Record<string, AlbumAnswer>
  const report = { sheets: 0, answered: 0, setup: 0, cut: 0, small: 0, left: 0, failed: [] as string[], stopped: '' }
  const read = async <T>(f: string) => JSON.parse(await readFile(join(root, 'content', f), 'utf8').catch(() => 'null')) as T | null
  const answered = (a: AlbumAnswer | undefined, plant: boolean) => !!a && (typeof (plant ? a.setup : a.whole) === 'boolean' || (a.tries ?? 0) >= TRIES)
  const queues: Record<'fish' | 'plant', Item[]> = { fish: [], plant: [] }
  const seen = new Set<string>()
  for (const t of await galleryPlan(root)) {
    const g = await read<{ photos?: GalleryPhoto[] }>(`gallery/${t.id}.json`)
    if (!g?.photos?.length) continue
    const plant = t.kind === 'plants'
    const e = await read<{ scientificName?: string }>(`${t.kind}/${t.id}/entity.json`)
    const vi = (await read<{ name?: string }>(`${t.kind}/${t.id}/vi.json`))?.name
    const sci = e?.scientificName ?? t.id.replace(/-/g, ' ')
    const name = vi && vi !== sci ? `${sci} (${vi})` : sci
    for (const p of g.photos) {
      if (p.unchecked || isGenerated(p) || seen.has(p.url) || answered(state[p.url], plant)) continue
      seen.add(p.url)
      queues[plant ? 'plant' : 'fish'].push({ url: p.url, img: p.thumb ?? p.url, name, plant })
    }
  }
  const sheets: Item[][] = []
  for (const q of [queues.fish, queues.plant]) for (let i = 0; i < q.length; i += SHEET) sheets.push(q.slice(i, i + SHEET))
  const now = sheets.slice(0, Math.max(0, o.sheets))
  report.left = sheets.slice(now.length).reduce((n, s) => n + s.length, 0)
  const tried = (it: Item) => { const a = state[it.url] ?? {}; state[it.url] = { ...a, tries: (a.tries ?? 0) + 1 } }

  const dir = await mkdtemp(join(tmpdir(), 'album-ask-'))
  const save = () => writeFile(file, `${JSON.stringify(state, null, 1)}\n`)
  try {
    for (const [i, items] of now.entries()) {
      try {
        // A sheet starts only where the day's line covers one (pieces.ts): with none left, nothing is fetched or marked.
        await piece(`album-ask/${items[0]!.url}`, async () => {
          // Each photo drawn as its tile on its own: one that can't be fetched or read counts a try against itself alone.
          const got: { it: Item; tile: Buffer }[] = []
          for (const it of items) {
            try {
              const tile = await sharp(Buffer.from(await d.get(it.img))).resize(240, 180, { fit: 'contain', background: '#888' }).jpeg().toBuffer()
              got.push({ it, tile })
            } catch (err) { tried(it); report.failed.push(`${it.url}: ${(err as Error).message.slice(0, 80)}`) }
          }
          if (!got.length) return
          const plant = got[0]!.it.plant
          const sheet = join(dir, `sheet-${i}.jpg`)
          await writeFile(sheet, await contactSheet(got.map(g => g.tile), 240, 180, 5, 'contain'))
          let v: { tiles: AskTile[] }
          try {
            v = await d.ask(sheet, askPrompt(got.map(g => g.it.name), plant), plant)
          } catch (err) {
            if (err instanceof LlmError) throw err
            // A call that came back with no answer (it may have been paid for): a try for each photo on the sheet.
            got.forEach(g => tried(g.it))
            report.failed.push(`sheet ${i}: ${(err as Error).message.slice(0, 120)}`)
            return
          }
          report.sheets++
          const done = new Set<string>()
          for (const t of v.tiles ?? []) {
            const g = got[t.n - 1]
            if (!g || done.has(g.it.url) || typeof t.setup !== 'boolean' || (!plant && (typeof t.whole !== 'boolean' || typeof t.small !== 'boolean'))) continue
            done.add(g.it.url)
            state[g.it.url] = plant ? { setup: t.setup } : { setup: t.setup, whole: t.whole, small: t.small }
            report.answered++
            if (t.setup) report.setup++
            if (t.whole === false) report.cut++
            if (t.small === true) report.small++
          }
          got.filter(g => !done.has(g.it.url)).forEach(g => tried(g.it))
        })
      } catch (err) {
        if (err instanceof LlmError) { report.stopped = err.message.slice(0, 160); break }
        // The sheet itself couldn't be drawn: no photo's fault, none marked; tried again next run.
        report.failed.push(`sheet ${i}: ${(err as Error).message.slice(0, 120)}`)
      } finally {
        await save()
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  return report
}
