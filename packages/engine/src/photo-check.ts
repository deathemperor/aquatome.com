import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LlmError } from './claude'
import { contactSheet } from './video-images'

type Photo = { url: string; thumb?: string }
export type PhotoVerdict = { ok: 'yes' | 'no' | 'unsure' | 'habitat'; typical: boolean; note: string }
export type PhotoCheckDeps = {
  get: (url: string) => Promise<Uint8Array>
  look: (sheet: string, prompt: string) => Promise<{ photos: ({ n: number } & PhotoVerdict)[] }>
}
export const PHOTO_CHECK_SCHEMA = {
  type: 'object', required: ['photos'],
  properties: { photos: { type: 'array', items: { type: 'object', required: ['n', 'ok', 'typical', 'note'], properties: { n: { type: 'number' }, ok: { type: 'string', enum: ['yes', 'no', 'unsure', 'habitat'] }, typical: { type: 'boolean' }, note: { type: 'string' } } } } },
}

const prompt = (sci: string, names: string[], plant: boolean) => `Numbered photos from the page about ${sci}${names.length ? ` (${names.slice(0, 4).join(', ')})` : ''} in an aquarium handbook; it is ${plant ? 'an aquarium plant' : 'a fish or other aquatic animal'}.
For each photo n:
- ok: "yes" if ${sci} is clearly the main subject (a group of it counts). "habitat" if it shows the wild place it lives (a river, stream, lake, swamp or shore), with or without the fish. "no" only if you are sure the main subject is a different species, or it is not about this species at all (an aquarium full of other fish, equipment, a diagram, a skeleton, a map). "unsure" if you cannot tell (a rare species you do not know well, a poor view).
- typical: true if it shows the ordinary look of the species (wild type, adult, clear view); false for a shop colour form, albino, long-fin or other bred variety, a juvenile, or a poor view.
- note: a few words on what it shows (for "no": what it shows instead).`

/**
 * Every photo on a species or plant page must show that species: a source article's photos include its tankmates
 * (a platy on the harlequin rasbora page) and shop sources lead with colour forms. A page's photos go on one numbered
 * contact sheet judged against its scientific name, once per photo (verdicts cached by URL). Each run, on every page:
 * photos judged another species, or not about it at all, are rejected (its wild habitat is kept, last) (`rejectedFile`, which the faces step also
 * applies), and photos of the species' ordinary look move to the front, so the main photo is a typical fish.
 * `limit`: pages judged this run (each is one vision call). Stops on a model failure (usage limit).
 */
export async function checkPagePhotos(contentRoot: string, cacheFile: string, rejectedFile: string, d: PhotoCheckDeps, o: { limit: number; only?: string }) {
  const cache: Record<string, PhotoVerdict> = JSON.parse(await readFile(cacheFile, 'utf8').catch(() => '{}'))
  const rejected: Record<string, string> = JSON.parse(await readFile(rejectedFile, 'utf8').catch(() => '{}'))
  const report = { judged: [] as string[], removed: [] as string[], reordered: [] as string[], failed: [] as string[], stopped: '' }
  const pages: { id: string; file: string; plant: boolean; e: { scientificName: string; photos: Photo[] }; names: string[] }[] = []
  for (const kind of ['species', 'plants']) {
    for (const id of (await readdir(join(contentRoot, kind)).catch(() => [] as string[])).filter(x => !o.only || x === o.only)) {
      const file = join(contentRoot, kind, id, 'entity.json')
      const raw = await readFile(file, 'utf8').catch(() => null)
      if (!raw) continue
      const t = JSON.parse(await readFile(join(contentRoot, kind, id, 'vi.json'), 'utf8').catch(() => '{}')) as { name?: string; altNames?: string[] }
      pages.push({ id, file, plant: kind === 'plants', e: JSON.parse(raw), names: [t.name, ...(t.altNames ?? []).filter(n => /^[\x20-\x7e]+$/.test(n))].filter((n): n is string => !!n) })
    }
  }

  const dir = await mkdtemp(join(tmpdir(), 'photo-check-'))
  try {
    for (const p of pages) {
      if (report.judged.length + report.failed.length >= o.limit) break
      const photos = p.e.photos.filter(x => !(x.url in rejected))
      if (!photos.some(x => !(x.url in cache))) continue
      try {
        const bufs = await Promise.all(photos.map(async x => Buffer.from(await d.get(x.thumb ?? x.url))))
        const sheet = join(dir, `${p.id}.jpg`)
        await writeFile(sheet, await contactSheet(bufs, 320, 240, 4))
        const v = await d.look(sheet, prompt(p.e.scientificName, p.names, p.plant))
        for (const x of v.photos ?? []) {
          const photo = photos[x.n - 1]
          if (photo && ['yes', 'no', 'unsure', 'habitat'].includes(x.ok)) cache[photo.url] = { ok: x.ok, typical: !!x.typical, note: String(x.note ?? '').slice(0, 120) }
        }
        report.judged.push(p.id)
      } catch (err) {
        if (err instanceof LlmError) { report.stopped = `${p.id}: ${err.message}`; break }
        report.failed.push(`${p.id}: ${(err as Error).message.slice(0, 120)}`)
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  for (const p of pages) {
    const before = p.e.photos.map(x => x.url).join('\n')
    for (const x of p.e.photos) {
      const v = cache[x.url]
      if (v?.ok === 'no' && !(x.url in rejected)) { rejected[x.url] = `not ${p.e.scientificName}: ${v.note}`; report.removed.push(`${p.id}: ${x.url} (${v.note})`) }
    }
    // A typical fish first, other photos of it next, its habitat last.
    const rank = (x: Photo) => (cache[x.url]?.ok === 'yes' && cache[x.url]?.typical ? 0 : cache[x.url]?.ok === 'habitat' ? 2 : 1)
    p.e.photos = p.e.photos.filter(x => !(x.url in rejected)).map((x, i) => ({ x, i })).sort((a, b) => rank(a.x) - rank(b.x) || a.i - b.i).map(({ x }) => x)
    if (p.e.photos.map(x => x.url).join('\n') === before) continue
    if (p.e.photos.length === before.split('\n').length) report.reordered.push(p.id)
    await writeFile(p.file, `${JSON.stringify(p.e, null, 2)}\n`)
  }
  await writeFile(cacheFile, `${JSON.stringify(Object.fromEntries(Object.entries(cache).sort()), null, 2)}\n`)
  await writeFile(rejectedFile, `${JSON.stringify(rejected, null, 2)}\n`)
  return report
}
