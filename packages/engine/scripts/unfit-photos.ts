/**
 * The photos already on pages and galleries that the photo pickers now leave out (2026-11-07), found the same way:
 * 1. every Commons photo on a species, plant or breed page or its gallery, by its file's own title, description and
 *    categories (photos.ts unfitCommons: a drawing, a chart, a dead, measured or preserved specimen, food, another
 *    species). Not a guide's: a guide may show lettuce for the fish, or a diagram;
 * 2. a page's main photo from any source that the dead-fish screen (dead-screen.ts) already noted as a drawing, painting,
 *    engraving or stamp ("scientific illustration of a barb"), which it was told to leave in.
 * Prints them by page; `--apply` adds each to engine-state/_photo-rejected.json (never replacing an entry), which every
 * photo step respects, and takes it off every page and gallery. Commons is read 50 files a request, a second apart.
 *
 *   pnpm --filter @aq/engine exec tsx scripts/unfit-photos.ts [--apply]
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ARTWORK, unfitCommons } from '../src/photos'

const ROOT = join(import.meta.dirname, '../../..')
const CONTENT = join(ROOT, 'content')
const STATE = join(ROOT, 'engine-state')
const UA = 'aquatome-engine/0.1 (https://aquatome.com)'
type Photo = { url: string; sourceUrl?: string }
type Doc = { photos?: Photo[] }
const json = async <T>(f: string) => JSON.parse(await readFile(f, 'utf8')) as T
const indentOf = (raw: string) => raw.match(/^\{\n( +)/)?.[1]?.length ?? 2

const files: string[] = []
for (const kind of ['species', 'plants', 'breeds']) for (const id of (await readdir(join(CONTENT, kind))).sort()) files.push(join(CONTENT, kind, id, 'entity.json'))
for (const f of (await readdir(join(CONTENT, 'gallery'))).sort()) if (f.endsWith('.json')) files.push(join(CONTENT, 'gallery', f))
const where = new Map<string, string[]>() // photo URL → the files that show it
const commons = new Map<string, string>() // Commons file title → photo URL
const main = new Map<string, string>() // a species' or plant's main photo → its page
for (const f of files) {
  const d = await json<Doc>(f).catch(() => null)
  if (!d) continue
  const at = f.slice(CONTENT.length + 1)
  for (const p of d.photos ?? []) {
    where.set(p.url, [...(where.get(p.url) ?? []), at])
    const m = p.sourceUrl?.match(/^https:\/\/commons\.wikimedia\.org\/wiki\/(File:.+)$/)
    if (m) commons.set(decodeURIComponent(m[1]!).replaceAll('_', ' '), p.url)
  }
  if (/^(species|plants)\//.test(at) && d.photos?.[0]) main.set(d.photos[0].url, at)
}

const rejectedFile = join(STATE, '_photo-rejected.json')
const rejected = await json<Record<string, string>>(rejectedFile)
const found = new Map<string, string>() // photo URL → why
const titles = [...commons.keys()]
for (let i = 0; i < titles.length; i += 50) {
  const q = new URLSearchParams({ action: 'query', format: 'json', titles: titles.slice(i, i + 50).join('|'), prop: 'imageinfo', iiprop: 'extmetadata', iiextmetadatafilter: 'ImageDescription|Categories' })
  const r = await (await fetch(`https://commons.wikimedia.org/w/api.php?${q}`, { headers: { 'user-agent': UA } })).json() as {
    query?: { normalized?: { from: string; to: string }[]; pages?: Record<string, { title: string; imageinfo?: { extmetadata?: Record<string, { value: string }> }[] }> }
  }
  const from = new Map((r.query?.normalized ?? []).map(n => [n.to, n.from]))
  for (const p of Object.values(r.query?.pages ?? {})) {
    const m = p.imageinfo?.[0]?.extmetadata
    const url = commons.get(p.title) ?? commons.get(from.get(p.title) ?? '')
    const why = url && m ? unfitCommons({ title: p.title, description: m.ImageDescription?.value, categories: m.Categories?.value }) : undefined
    if (url && why && !(url in rejected)) found.set(url, `${why} (Commons: ${p.title})`)
  }
  await new Promise(res => setTimeout(res, 1000))
}
const dead = await json<Record<string, { dead: boolean; note: string }>>(join(STATE, '_dead-screen.json'))
for (const [url, v] of Object.entries(dead)) if (main.has(url) && !found.has(url) && !(url in rejected) && ARTWORK.test(v.note)) found.set(url, `drawing: ${v.note} (the dead-fish screen's note)`)

const byPage = new Map<string, string[]>()
for (const [url, why] of found) for (const at of where.get(url) ?? []) byPage.set(at, [...(byPage.get(at) ?? []), `${url}  ${why}`])
for (const [at, xs] of [...byPage].sort()) console.log(`${at}\n${xs.map(x => `  ${x}`).join('\n')}`)
console.log(`\n${found.size} photos on ${byPage.size} files (${titles.length} Commons files read)`)

if (process.argv.includes('--apply')) {
  for (const [url, why] of found) rejected[url] ??= why // added at the end, as the photo steps add
  await writeFile(rejectedFile, `${JSON.stringify(rejected, null, 2)}\n`)
  const left: string[] = []
  for (const at of byPage.keys()) {
    const f = join(CONTENT, at)
    const raw = await readFile(f, 'utf8')
    const d = JSON.parse(raw) as Doc
    if (d.photos) d.photos = d.photos.filter(p => !found.has(p.url))
    await writeFile(f, `${JSON.stringify(d, null, indentOf(raw))}\n`)
    if (/^(species|plants)\//.test(at) && !d.photos?.length) left.push(at)
  }
  console.log(`applied; pages left with no photo of their own: ${left.length}\n${left.map(x => `  ${x}`).join('\n')}`)
}
