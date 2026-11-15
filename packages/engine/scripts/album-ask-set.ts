// The album ask's test set asked again (scripts/album-ask-set.json: 60 photos judged by eye, three sheets of 20), and
// how often each answer matches the eye: run it after changing the ask's prompt or its tiles. Three model calls.
// pnpm --filter @aq/engine exec tsx scripts/album-ask-set.ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { askPrompt, askSchema, type AskTile } from '../src/album-ask'
import { claudeVision } from '../src/claude'
import { contactSheet } from '../src/video-images'

type Item = { sheet: number; album: string; photo: string; cut?: 'cut' | 'partly' | 'whole'; small?: boolean | 'clear'; setup?: boolean }
const here = new URL('.', import.meta.url).pathname
const set = JSON.parse(await readFile(join(here, 'album-ask-set.json'), 'utf8')) as { photos: Item[] }
const content = join(here, '../../../content')
const nameOf = async (id: string) => {
  for (const k of ['species', 'breeds', 'plants']) {
    const e = JSON.parse(await readFile(join(content, k, id, 'entity.json'), 'utf8').catch(() => 'null')) as { scientificName?: string } | null
    if (!e) continue
    const vi = (JSON.parse(await readFile(join(content, k, id, 'vi.json'), 'utf8').catch(() => '{}')) as { name?: string }).name
    const sci = e.scientificName ?? id.replace(/-/g, ' ')
    return vi && vi !== sci ? `${sci} (${vi})` : sci
  }
  return id.replace(/-/g, ' ')
}
const count = new Map<string, [number, number]>()
const tally = (k: string, hit: boolean) => { const c = count.get(k) ?? [0, 0]; count.set(k, [c[0] + (hit ? 1 : 0), c[1] + 1]) }
const dir = await mkdtemp(join(tmpdir(), 'album-ask-set-'))
try {
  for (const n of [...new Set(set.photos.map(p => p.sheet))]) {
    const items = set.photos.filter(p => p.sheet === n)
    const bufs = await Promise.all(items.map(async p => Buffer.from(await (await fetch(p.photo)).arrayBuffer())))
    const sheet = join(dir, `sheet-${n}.jpg`)
    await writeFile(sheet, await contactSheet(bufs, 240, 180, 5, 'contain'))
    const v = await claudeVision<{ tiles: AskTile[] }>({ system: 'You look at photos for the photo albums of an aquarium handbook. Reply only with JSON.', prompt: askPrompt(await Promise.all(items.map(p => nameOf(p.album))), false), schema: askSchema(false), file: sheet })
    for (const [i, p] of items.entries()) {
      const t = v.tiles.find(x => x.n === i + 1)
      if (!t) { tally('unanswered', true); continue }
      if (p.cut) tally(`whole false, ${p.cut}`, t.whole === false)
      if (p.small !== undefined) tally(`small true, ${p.small === true ? 'too small' : p.small === 'clear' ? 'clear' : 'large'}`, t.small === true)
      if (p.setup !== undefined) tally(`setup true, ${p.setup ? 'photo tank or tray' : 'other'}`, t.setup === true)
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true })
}
for (const [k, [hit, all]] of [...count].sort()) console.log(`${k}: ${hit} of ${all}`)
