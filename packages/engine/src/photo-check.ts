import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LlmError } from './claude'
import { galleryPlan } from './gallery-plan'
import { contactSheet } from './video-images'
import { stripPhotos } from './watermarks'

type Photo = { url: string; caption?: string }
/**
 * Does the photo show its page's subject: yes; another species, breed or variety (`note` says which); not a photo of the
 * subject at all (a map, chart, hands, a tank, a packshot); its wild habitat; or can't tell. `no` is the first check's
 * verdict (before 2026-11-02), which didn't tell the two apart.
 */
export type PhotoVerdict = { ok: 'yes' | 'other' | 'none' | 'habitat' | 'unsure' | 'no'; typical: boolean; note: string }
export type PhotoCheckDeps = {
  get: (url: string) => Promise<Uint8Array>
  look: (sheet: string, prompt: string) => Promise<{ photos: ({ n: number } & PhotoVerdict)[] }>
}
const VERDICTS = ['yes', 'other', 'none', 'habitat', 'unsure'] as const
export const PHOTO_CHECK_SCHEMA = {
  type: 'object', required: ['photos'],
  properties: { photos: { type: 'array', items: { type: 'object', required: ['n', 'ok', 'typical', 'note'], properties: { n: { type: 'number' }, ok: { type: 'string', enum: VERDICTS }, typical: { type: 'boolean' }, note: { type: 'string' } } } } },
}
/** Verdicts that take a photo off its page. */
const OFF = new Set<PhotoVerdict['ok']>(['other', 'none', 'no'])

/** A page whose photos show one subject: a species, a plant (a cultivar is named in its scientific name), or a breed. */
export type Subject = { id: string; kind: 'species' | 'plants' | 'breeds'; sci: string; names: string[]; breed?: string }

const PER_SHEET = 6
/** Gallery photos a species page shows itself (the site's GALLERY_STRIP, apps/site/src/lib/gallery.ts); the rest are on the gallery page. */
const STRIP = 8

export const subjectPrompt = (s: Subject) => {
  const names = s.names.length ? ` (${s.names.slice(0, 4).join(', ')})` : ''
  const what = s.kind === 'breeds'
    ? `the breed or line ${s.names[0] ?? s.id}${s.sci ? ` of ${s.sci}` : ''}. What sets it apart: ${s.breed ?? 'its name'}`
    : `${s.sci}${names}, ${s.kind === 'plants' ? 'an aquarium plant' : 'a fish or other aquatic animal'}`
  const form = s.kind === 'breeds' || /['‘’"]| (var|cv|f)\. /.test(s.sci)
    ? 'it must be this breed, line or cultivar: the plain species or another form of it is "other"'
    : 'its colour forms, sexes and young count as it'
  return `Numbered photos from the page about ${what} in an aquarium handbook.
For each photo n:
- ok: "yes" if it clearly shows the page's subject as the main subject (a group of it counts; ${form}).
  "other" if the main subject is a different species, breed or variety. Look-alikes count: tell them apart by their marks (neon tetra from green neon or cardinal tetra, cherry barb from rosy or tiger barb).
  "none" if it is not a photo of the subject at all: a map, chart, diagram or drawing, hands or people, a tank or aquascape where it can't be picked out, equipment, a product packshot.
  "habitat" if it shows the wild place it lives (a river, stream, lake, swamp or shore), with or without it.
  "unsure" if you cannot tell (a species you do not know well, a poor or distant view, a look-alike you cannot rule out).
- typical: true if it shows the ordinary look of the subject (adult, clear view; for a species, the wild type); false otherwise.
- note: a few words on what it shows (for "other": what it is instead, e.g. "neon tetra: red stripe runs only half the body").`
}

const readJson = async <T>(path: string): Promise<T | undefined> => readFile(path, 'utf8').then(s => JSON.parse(s) as T, () => undefined)
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const ascii = (n: string) => /^[\x20-\x7e]+$/.test(n)

/** Species, plant and breed pages; a breed is judged against its base species (or its parents) and what sets it apart. */
async function subjects(content: string): Promise<Subject[]> {
  const out: Subject[] = []
  const sci = new Map<string, string>()
  for (const kind of ['species', 'plants', 'breeds'] as const) {
    for (const id of (await readdir(join(content, kind)).catch(() => [] as string[])).sort()) {
      const e = await readJson<{ scientificName?: string; basedOn?: string; parents?: { name: string; species?: string }[] }>(join(content, kind, id, 'entity.json'))
      if (!e) continue
      const t = (await readJson<{ name?: string; altNames?: string[]; body?: string }>(join(content, kind, id, 'vi.json'))) ?? {}
      const names = [t.name, ...(t.altNames ?? []).filter(ascii)].filter((n): n is string => !!n)
      if (kind !== 'breeds') { sci.set(id, e.scientificName ?? id); out.push({ id, kind, sci: e.scientificName ?? id, names }); continue }
      const base = e.basedOn ? sci.get(e.basedOn) : (e.parents ?? []).map(p => (p.species && sci.get(p.species)) || p.name.match(/\(([A-Z][a-z]+ [a-z]+)\)/)?.[1]).filter(Boolean).join(' × ')
      const marks = t.body?.match(/<h3>Nhận biết[^<]*<\/h3>\s*<p>([\s\S]*?)<\/p>/)?.[1]
      out.push({ id, kind, sci: base ?? '', names, ...(marks ? { breed: text(marks).slice(0, 300) } : {}) })
    }
  }
  return out
}

/** Most-read first: breeds (the forms of the staples readers open), then the gallery plan's order (species and plants). */
async function rank(root: string, all: Subject[]): Promise<Subject[]> {
  const order = [...all.filter(s => s.kind === 'breeds').map(s => s.id), ...(await galleryPlan(root)).map(p => p.id)]
  const at = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length : i }
  return [...all].sort((a, b) => at(a.id) - at(b.id) || a.id.localeCompare(b.id))
}

const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/['‘’"]/g, '').replace(/\s+/g, ' ').trim()

/**
 * The species or plant a guide photo's caption names: a scientific name or another name of exactly one page, two words or
 * more (a one-word name, "Molly", names a group). A name inside a longer one gives way ("Cá neon" in "Cá neon xanh lục");
 * a caption naming two pages names neither.
 */
export function captionSubject(caption: string, index: Map<string, string>): string | undefined {
  const c = norm(caption)
  const hits: { id: string; from: number; to: number }[] = []
  for (const [name, id] of index) {
    let i = c.indexOf(name)
    while (i >= 0) {
      const edge = (j: number) => j < 0 || j >= c.length || !/[\p{L}\p{N}]/u.test(c[j]!)
      if (edge(i - 1) && edge(i + name.length)) hits.push({ id, from: i, to: i + name.length })
      i = c.indexOf(name, i + 1)
    }
  }
  const kept = hits.filter(h => !hits.some(o => o !== h && o.from <= h.from && o.to >= h.to && o.to - o.from > h.to - h.from))
  const ids = new Set(kept.map(h => h.id))
  return ids.size === 1 ? [...ids][0] : undefined
}

function nameIndex(all: Subject[]): Map<string, string> {
  const owners = new Map<string, Set<string>>()
  for (const s of all) if (s.kind !== 'breeds') {
    for (const n of [s.sci.split(/\s+/).slice(0, 2).join(' '), ...s.names].map(norm)) if (n.split(' ').length >= 2) owners.set(n, (owners.get(n) ?? new Set()).add(s.id))
  }
  return new Map([...owners].filter(([, ids]) => ids.size === 1).map(([n, ids]) => [n, [...ids][0]!]))
}

async function pool<T>(items: T[], n: number, f: (x: T) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (next < items.length) await f(items[next++]!) }))
}

/** Where a photo is shown: a page's own photos or gallery (`page`), or a guide (`page`: the fish its caption names, if any). */
type Shown = { file: string; url: string; page?: string; guide?: boolean; galleryOnly?: boolean }

/**
 * Every photo on a species, plant or breed page (its own photos and its gallery) must show that page's subject, judged
 * by the model on numbered sheets of 6 against the scientific name, the page's names and, for a breed, what sets it apart.
 * Guide photos whose caption names one species or plant are judged against it; a guide photo that is a page's photo goes
 * with that page's verdict. Verdicts are cached per photo and page (`engine-state/_photo-subjects.json`; the first check's
 * `_photo-check.json` still counts for a photo on one page only), so a re-run makes no model call for them.
 *
 * - "other" and "none" leave the page (in a guide, only "other": a guide may show a packshot or a tank on purpose). A
 *   photo every page that shows it rejects joins `_photo-rejected.json` (added to, never rewritten), which the photo steps
 *   respect, so a source re-read or a gallery rebuild doesn't bring it back. One some page keeps leaves only the others.
 * - "unsure" stays and is listed for review with the removals (docs/review/photo-subjects.md). A page left without a
 *   photo shows none.
 * - A typical photo leads a species or plant page, its habitat goes last.
 *
 * Most-read pages first (`rank`), the photos a page shows itself before the rest of its gallery. `limit`: model calls this run; stops on a model failure (usage limit), and the rest wait.
 */
export async function checkPagePhotos(root: string, d: PhotoCheckDeps, o: { limit: number; parallel?: number; only?: string; today?: string }) {
  const content = join(root, 'content')
  const cacheFile = join(root, 'engine-state/_photo-subjects.json')
  const rejectedFile = join(root, 'engine-state/_photo-rejected.json')
  const cache = (await readJson<Record<string, Record<string, PhotoVerdict>>>(cacheFile)) ?? {}
  const legacy = (await readJson<Record<string, PhotoVerdict>>(join(root, 'engine-state/_photo-check.json'))) ?? {}
  const rejected = (await readJson<Record<string, string>>(rejectedFile)) ?? {}
  const report = { photos: 0, sheets: 0, judged: 0, removed: [] as string[], rejected: 0, unsure: 0, failed: [] as string[], stopped: '' }

  const all = await rank(root, await subjects(content))
  const byId = new Map(all.map(s => [s.id, s]))
  const shown: Shown[] = []
  for (const s of all) {
    for (const file of [join(content, s.kind, s.id, 'entity.json'), join(content, 'gallery', `${s.id}.json`)]) {
      for (const [i, p] of ((await readJson<{ photos?: Photo[] }>(file))?.photos ?? []).entries()) shown.push({ file, url: p.url, page: s.id, ...(file.includes('/gallery/') && i >= STRIP ? { galleryOnly: true } : {}) })
    }
  }
  const index = nameIndex(all)
  for (const id of (await readdir(join(content, 'guides')).catch(() => [] as string[])).sort()) {
    const file = join(content, 'guides', id, 'entity.json')
    const g = await readJson<{ photos?: Photo[]; video?: { figures?: { photo?: Photo }[] } }>(file)
    for (const p of [...(g?.photos ?? []), ...(g?.video?.figures ?? []).flatMap(f => (f.photo ? [f.photo] : []))]) {
      const page = p.caption ? captionSubject(p.caption, index) : undefined
      shown.push({ file, url: p.url, guide: true, ...(page ? { page } : {}) })
    }
  }
  // The first check judged a page's own photos one page at a time: its verdict holds where the photo is on one page only.
  const pagesOf = new Map<string, Set<string>>()
  for (const x of shown) if (x.page) pagesOf.set(x.url, (pagesOf.get(x.url) ?? new Set()).add(x.page))
  const verdict = (url: string, page: string): PhotoVerdict | undefined => cache[url]?.[page]
    ?? (legacy[url] && legacy[url].ok !== 'unsure' && pagesOf.get(url)?.size === 1 ? legacy[url] : undefined)

  // 1. The model judges photos not judged yet, most-read pages first: what each page shows itself (its photos, its gallery
  // strip, guide photos naming it), then the rest of each gallery.
  const sheets: { s: Subject; urls: string[] }[] = []
  const queued = new Set<string>()
  for (const later of [false, true]) for (const s of all) {
    if (sheets.length >= o.limit) break
    if (o.only && s.id !== o.only) continue
    const todo = [...new Set(shown.filter(x => x.page === s.id && !!x.galleryOnly === later && !(x.url in rejected) && !verdict(x.url, s.id) && !queued.has(`${s.id}\n${x.url}`)).map(x => x.url))]
    for (const u of todo) queued.add(`${s.id}\n${u}`)
    for (let i = 0; i < todo.length && sheets.length < o.limit; i += PER_SHEET) sheets.push({ s, urls: todo.slice(i, i + PER_SHEET) })
  }
  const dir = await mkdtemp(join(tmpdir(), 'photo-check-'))
  try {
    await pool(sheets.map((x, i) => ({ ...x, i })), o.parallel ?? 1, async ({ s, urls, i }) => {
      if (report.stopped) return
      const ok: { url: string; b: Buffer }[] = []
      for (const url of urls) {
        try { ok.push({ url, b: Buffer.from(await d.get(url)) }) } catch (err) { report.failed.push(`${s.id}: ${url}: ${(err as Error).message.slice(0, 120)}`) }
      }
      if (!ok.length) return
      try {
        const sheet = join(dir, `sheet-${i}.jpg`)
        await writeFile(sheet, await contactSheet(ok.map(x => x.b), 640, 480, 2, 'contain'))
        const v = await d.look(sheet, subjectPrompt(s))
        report.sheets++
        for (const p of v.photos ?? []) {
          const x = ok[p.n - 1]
          if (!x || !(VERDICTS as readonly string[]).includes(p.ok)) continue
          cache[x.url] = { ...cache[x.url], [s.id]: { ok: p.ok, typical: !!p.typical, note: String(p.note ?? '').slice(0, 120) } }
          report.judged++
        }
      } catch (err) {
        if (err instanceof LlmError) report.stopped ||= `${s.id}: ${err.message}`
        else report.failed.push(`${s.id}: ${(err as Error).message.slice(0, 120)}`)
      }
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  // 2. Rejected photos leave their pages; a photo every page showing it rejects is rejected for good.
  const off = (x: Shown) => {
    const v = x.page ? verdict(x.url, x.page) : undefined
    return !!v && (x.guide ? v.ok === 'other' : OFF.has(v.ok))
  }
  const label = (id: string) => { const s = byId.get(id)!; return s.kind === 'breeds' ? (s.names[0] ?? id) : s.sci }
  const onPages = new Map<string, Shown[]>()
  for (const x of shown) if (x.page) onPages.set(x.url, [...(onPages.get(x.url) ?? []), x])
  const added: Record<string, string> = {}
  for (const [url, xs] of onPages) if (!(url in rejected) && xs.every(off)) added[url] = `not ${label(xs[0]!.page!)}: ${verdict(url, xs[0]!.page!)!.note}`
  const offAt = new Set(shown.filter(off).map(x => `${x.file}\n${x.url}`))
  const blocked = (file: string) => (url: string) => url in rejected || url in added || offAt.has(`${file}\n${url}`)
  for (const file of [...new Set(shown.map(x => x.file))]) {
    const raw = await readFile(file, 'utf8')
    const data = JSON.parse(raw) as { photos?: Photo[] }
    const removed: string[] = []
    stripPhotos(data, blocked(file), removed, [])
    const s = byId.get(file.split('/').at(-2)!)
    if (s && s.kind !== 'breeds' && file.endsWith('entity.json') && data.photos) {
      // A typical photo first, other photos of it next, its habitat last.
      const r = (x: Photo) => { const v = verdict(x.url, s.id); return v?.ok === 'yes' && v.typical ? 0 : v?.ok === 'habitat' ? 2 : 1 }
      data.photos = data.photos.map((x, i) => ({ x, i })).sort((a, b) => r(a.x) - r(b.x) || a.i - b.i).map(({ x }) => x)
    }
    const out = `${JSON.stringify(data, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`
    if (out === raw) continue
    report.removed.push(...removed.map(u => `${file.slice(content.length + 1)}: ${u}`))
    await writeFile(file, out)
  }

  // 3. Verdicts, the blocklist (re-read, so entries another step added meanwhile stay) and the review file.
  await writeFile(cacheFile, `${JSON.stringify(Object.fromEntries(Object.entries(cache).sort()), null, 2)}\n`)
  const now = (await readJson<Record<string, string>>(rejectedFile)) ?? {}
  for (const [u, why] of Object.entries(added)) if (!(u in now)) { now[u] = why; report.rejected++ }
  await writeFile(rejectedFile, `${JSON.stringify(now, null, 2)}\n`)
  const left = new Map<string, number>()
  for (const s of all) left.set(s.id, 0)
  for (const f of [...new Set(shown.filter(x => !x.guide).map(x => x.file))]) {
    const id = f.endsWith('entity.json') ? f.split('/').at(-2)! : f.split('/').at(-1)!.replace(/\.json$/, '')
    left.set(id, (left.get(id) ?? 0) + ((await readJson<{ photos?: Photo[] }>(f))?.photos?.length ?? 0))
  }
  const review = reviewDoc(all, cache, shown.filter(x => !blocked(x.file)(x.url)), left, o.today ?? new Date().toISOString().slice(0, 10))
  await writeFile(join(root, 'docs/review/photo-subjects.md'), review.doc).catch(() => undefined)
  report.photos = review.photos
  report.unsure = review.unsure
  return report
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ')

/** docs/review/photo-subjects.md: what the check took off each page, what it couldn't tell, and pages it left with no photo. */
export function reviewDoc(all: Subject[], cache: Record<string, Record<string, PhotoVerdict>>, still: Shown[], left: Map<string, number>, today: string) {
  const page = new Map(all.map(s => [s.id, `${s.kind}/${s.id}`]))
  const rows = Object.entries(cache).flatMap(([url, by]) => Object.entries(by).filter(([id]) => page.has(id)).map(([id, v]) => ({ url, id, v })))
  const order = new Map(all.map((s, i) => [s.id, i]))
  const sort = <T extends { id: string; url: string }>(xs: T[]) => xs.sort((a, b) => order.get(a.id)! - order.get(b.id)! || a.url.localeCompare(b.url))
  const shown = new Set(still.map(x => `${x.page}\n${x.url}`))
  const removed = sort(rows.filter(r => (r.v.ok === 'other' || r.v.ok === 'none') && !shown.has(`${r.id}\n${r.url}`)))
  const unsure = sort(rows.filter(r => r.v.ok === 'unsure' && shown.has(`${r.id}\n${r.url}`)))
  const emptied = all.filter(s => left.get(s.id) === 0 && removed.some(r => r.id === s.id))
  const table = (xs: typeof rows) => xs.map(r => `| ${page.get(r.id)} | [photo](${r.url}) | ${cell(r.v.note)} |`).join('\n')
  const doc = `# Photos that don't show their page's subject

Written by \`pnpm engine check-photos\` (${today}), most-read pages first. Rules: docs/governance.md, "Photos".
${rows.length} verdicts. Shows it: ${rows.filter(r => r.v.ok === 'yes').length}; its habitat: ${rows.filter(r => r.v.ok === 'habitat').length}; something else: ${removed.filter(r => r.v.ok === 'other').length}; not a photo of it: ${removed.filter(r => r.v.ok === 'none').length}; can't tell: ${unsure.length}.

## Left with no photo (${emptied.length})

${emptied.length ? emptied.map(s => `- ${page.get(s.id)}`).join('\n') : 'None.'}

## Can't tell: still shown (${unsure.length})

| Page | Photo | What the model saw |
| --- | --- | --- |
${table(unsure)}

## Removed (${removed.length})

"Something else" names what the photo shows instead; the rest are maps, hands, tanks, packshots and the like.

| Page | Photo | What it shows |
| --- | --- | --- |
${table(removed)}
`
  return { doc, photos: rows.length, unsure: unsure.length }
}
