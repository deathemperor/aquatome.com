import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { LlmError } from './claude'
import { galleryPlan } from './gallery-plan'
import { contactSheet } from './video-images'
import { LOGO_FOLDERS, stripPhotos } from './watermarks'

type Photo = { url: string; caption?: string; author?: string }
/**
 * Does the photo show its page's subject: yes; another species, breed or variety (`note` says which); not a photo of the
 * subject at all (a map, chart, hands, a tank, a packshot); its wild habitat; a dead fish or fish as food (`dead`: a
 * market, a plate, a catch landed or held, a preserved or museum specimen); or can't tell. `no` is the first check's
 * verdict (before 2026-11-02), which didn't tell the two apart. `logo`: a stamp, logo or mark added on the photo, which
 * the watermark step's text reader can miss; every verdict since 2026-11-05 has it, so one without it is from before the
 * check asked about dead fish and logos. `guide`: judged against a guide photo's caption, which lets other fish into the
 * shot, so it doesn't stand for the page's own stricter look.
 */
export type PhotoVerdict = { ok: 'yes' | 'other' | 'none' | 'habitat' | 'unsure' | 'dead' | 'no'; typical: boolean; note: string; logo?: boolean; guide?: boolean }
export type PhotoCheckDeps = {
  get: (url: string) => Promise<Uint8Array>
  look: (sheet: string, prompt: string) => Promise<{ photos: ({ n: number } & PhotoVerdict)[] }>
}
const VERDICTS = ['yes', 'other', 'none', 'habitat', 'unsure', 'dead'] as const
export const PHOTO_CHECK_SCHEMA = {
  type: 'object', required: ['photos'],
  properties: { photos: { type: 'array', items: { type: 'object', required: ['n', 'ok', 'typical', 'note', 'logo'], properties: { n: { type: 'number' }, ok: { type: 'string', enum: VERDICTS }, typical: { type: 'boolean' }, note: { type: 'string' }, logo: { type: 'boolean' } } } } },
}
/** Verdicts that take a photo off its page. */
const OFF = new Set<PhotoVerdict['ok']>(['other', 'none', 'dead', 'no'])
/** Why a photo leaves every page, whatever another page's verdict: it shows a dead fish or fish as food, or a logo. */
const blockedFor = (by: Record<string, PhotoVerdict> = {}) => {
  const vs = Object.values(by)
  const dead = vs.find(v => v.ok === 'dead')
  const logo = vs.find(v => v.logo)
  return dead ? `dead: ${dead.note}` : logo ? `watermark: ${logo.note}` : undefined
}

/** A page whose photos show one subject: a species, a plant (a cultivar is named in its scientific name), or a breed. */
export type Subject = { id: string; kind: 'species' | 'plants' | 'breeds'; sci: string; names: string[]; breed?: string }

const PER_SHEET = 6
/** Gallery photos a species page shows itself (the site's GALLERY_STRIP, apps/site/src/lib/gallery.ts); the rest are on the gallery page. */
const STRIP = 8

/** `captions`: per photo on the sheet, the caption of a guide photo judged here because the caption names the subject. */
export const subjectPrompt = (s: Subject, captions: (string | undefined)[] = []) => {
  const names = s.names.length ? ` (${s.names.slice(0, 4).join(', ')})` : ''
  const what = s.kind === 'breeds'
    ? `the breed or line ${s.names[0] ?? s.id}${s.sci ? ` of ${s.sci}` : ''}. What sets it apart: ${s.breed ?? 'its name'}`
    : `${s.sci}${names}, ${s.kind === 'plants' ? 'an aquarium plant' : 'a fish or other aquatic animal'}`
  const form = s.kind === 'breeds' || /['‘’"]| (var|cv|f)\. /.test(s.sci)
    ? 'it must be this breed, line or cultivar: the plain species or another form of it is "other"'
    : 'its colour forms, sexes and young count as it'
  return `Numbered photos from the page about ${what} in an aquarium handbook.
For each photo n:
- ok: "dead" if it shows a dead fish or other animal, or fish as food, whatever the species: at a market or fishmonger's, on ice; on a plate, cooked, fillets; a catch landed or held up, a fish lying on a tray, a board or the floor; a preserved, mounted, museum or lab specimen (for a snail, an empty museum shell; for a plant, a pressed herbarium sheet). When you can't tell whether it is alive, it is "dead". Not "dead": a drawing, painting or engraved plate (that is "none"; a photo of a preserved specimen is "dead", however old); a live fish held briefly in a net or a bag.
  "yes" if it clearly shows the page's subject as the main subject (a group of it counts; ${form}).
  "other" if the main subject is a different species, breed or variety. Look-alikes count: tell them apart by their marks (neon tetra from green neon or cardinal tetra, cherry barb from rosy or tiger barb).
  "none" if it is not a photo of the subject at all: a map, chart, diagram or drawing, hands or people, a tank or aquascape where it can't be picked out, equipment, a product packshot.
  "habitat" if it shows the wild place it lives (a river, stream, lake, swamp or shore), with or without it.
  "unsure" if you cannot tell (a species you do not know well, a poor or distant view, a look-alike you cannot rule out).
- typical: true if it shows the ordinary look of the subject (adult, clear view; for a species, the wild type); false otherwise, and for "dead".
- logo: true if a logo, stamp, watermark, signature or text was added on top of the photo after it was taken, even small or faint, round, in a corner, with or without readable letters; false if not. Text in the scene (a label on a tank, a specimen tag) is not added.
- note: a few words on what it shows (for "other": what it is instead, e.g. "neon tetra: red stripe runs only half the body"; for "dead": what makes it so, e.g. "dead fish on ice at a market"; with a logo, what and where, e.g. "round logo bottom left").${captions.some(Boolean) ? `
Some photos are from a guide, with this caption: ${captions.flatMap((c, i) => (c ? [`${i + 1}: "${c.slice(0, 160)}"`] : [])).join('; ')}. Judge these against their caption instead: "yes" if the photo shows what the caption says about the page's subject (any form of it counts, other fish or plants may be in the shot too); "other" only if it shows a different fish or plant where the caption names the subject; "unsure" if the caption is about something else. "dead" and logo hold for these as for any photo.` : ''}`
}

const readJson = async <T>(path: string): Promise<T | undefined> => readFile(path, 'utf8').then(s => JSON.parse(s) as T, () => undefined)
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const ascii = (n: string) => /^[\x20-\x7e]+$/.test(n)

/**
 * Species, plant and breed pages. A breed is judged against what sets it apart and its base species, or a hybrid's
 * parents; a transgenic line (GloFish: danios, tetras, barbs, bettas) against its own names only.
 */
async function subjects(content: string): Promise<Subject[]> {
  const out: Subject[] = []
  const sci = new Map<string, string>()
  for (const kind of ['species', 'plants', 'breeds'] as const) {
    for (const id of (await readdir(join(content, kind)).catch(() => [] as string[])).sort()) {
      const e = await readJson<{ scientificName?: string; kind?: string; basedOn?: string; parents?: { name: string; species?: string }[] }>(join(content, kind, id, 'entity.json'))
      if (!e) continue
      const t = (await readJson<{ name?: string; altNames?: string[]; body?: string }>(join(content, kind, id, 'vi.json'))) ?? {}
      const names = [t.name, ...(t.altNames ?? []).filter(ascii)].filter((n): n is string => !!n)
      if (kind !== 'breeds') { sci.set(id, e.scientificName ?? id); out.push({ id, kind, sci: e.scientificName ?? id, names }); continue }
      const base = e.basedOn ? sci.get(e.basedOn) : e.kind === 'hybrid' ? (e.parents ?? []).map(p => (p.species && sci.get(p.species)) || p.name.match(/\(([A-Z][a-z]+ [a-z]+)\)/)?.[1]).filter(Boolean).join(' × ') : undefined
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
 * more (a one-word name, "Molly", names a group), plural or not. A name inside a longer one gives way ("Cá neon" in "Cá neon xanh lục");
 * a caption naming two pages, or another genus ("How to plant Anubias or Java Fern"), names neither. `genera`: each
 * genus (lower case) and the pages in it.
 */
export function captionSubject(caption: string, index: Map<string, string>, genera = new Map<string, Set<string>>()): string | undefined {
  const c = norm(caption)
  const hits: { id: string; from: number; to: number }[] = []
  for (const [name, id] of index) {
    let i = c.indexOf(name)
    while (i >= 0) {
      const edge = (j: number) => j < 0 || j >= c.length || !/[\p{L}\p{N}]/u.test(c[j]!)
      const end = i + name.length + (c.startsWith('es', i + name.length) && edge(i + name.length + 2) ? 2 : c[i + name.length] === 's' ? 1 : 0) // "cherry barbs"
      if (edge(i - 1) && edge(end)) hits.push({ id, from: i, to: end })
      i = c.indexOf(name, i + 1)
    }
  }
  const kept = hits.filter(h => !hits.some(o => o !== h && o.from <= h.from && o.to >= h.to && o.to - o.from > h.to - h.from))
  const ids = [...new Set(kept.map(h => h.id))]
  if (ids.length !== 1) return undefined
  return c.split(/[^\p{L}]+/u).some(w => genera.get(w) && !genera.get(w)!.has(ids[0]!)) ? undefined : ids[0]
}

function nameIndex(all: Subject[]) {
  const owners = new Map<string, Set<string>>()
  const genera = new Map<string, Set<string>>()
  for (const s of all) if (s.kind !== 'breeds') {
    for (const n of [s.sci.split(/\s+/).slice(0, 2).join(' '), ...s.names].map(norm)) if (n.split(' ').length >= 2) owners.set(n, (owners.get(n) ?? new Set()).add(s.id))
    const g = norm(s.sci.split(/\s+/)[0]!)
    genera.set(g, (genera.get(g) ?? new Set()).add(s.id))
  }
  return { names: new Map([...owners].filter(([, ids]) => ids.size === 1).map(([n, ids]) => [n, [...ids][0]!])), genera }
}

async function pool<T>(items: T[], n: number, f: (x: T) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (next < items.length) await f(items[next++]!) }))
}

/**
 * Words in an earlier look's note that say the photo may show a dead fish or fish as food: the subject checks' and the
 * watermark step's notes (English) and the gallery step's captions (Vietnamese). Not a drawing or painting: the check
 * already calls one "not a photo of it".
 */
const DEAD_NOTE = /\b(?:dead(?! (?:leaf|leaves|wood|plants?|twigs?|branch(?:es)?|stems?|vegetation|grass|reeds?|algae|coral|trees?|logs?))|died|carcass(?:es)?|markets?|fishmonger|preserved|museum|mounted|taxiderm\w*|fillets?|cooked|fried|grilled|on ice|on a plate|catch(?:es)?|caught|landed|trays?|nets?|formalin|pickled|herbarium|pressed)\b|(?<!(?:lá|cành|gỗ|cây) )chết|chợ|bày bán|mẫu ngâm|mẫu vật|bảo tàng|tiêu bản|phi lê/i
const ARTWORK = /drawing|illustrat|engrav|painting|lithograph|watercolou?r/i
export const deadNote = (note: string) => DEAD_NOTE.test(note) && !ARTWORK.test(note)

/**
 * The photos to judge again (`checkPagePhotos`' `recheck`): shown on a species, plant or breed page or its gallery, judged
 * only before the check asked about dead fish and logos (no verdict of it has `logo`), and a note of an earlier look says
 * it may show a dead fish or fish as food (`deadNote`). Each is judged once: a re-run finds none. Found by the owner
 * (2026-11-05): dead peacock bass at a market leading their page, judged "yes" with a note that said so. URL → that note.
 */
export async function recheckCandidates(root: string): Promise<Map<string, string>> {
  const state = async <T>(f: string) => (await readJson<Record<string, T>>(join(root, 'engine-state', f))) ?? {}
  const legacy = await state<PhotoVerdict>('_photo-check.json')
  const cache = await state<Record<string, PhotoVerdict>>('_photo-subjects.json')
  const marks = await state<{ what?: string }>('_photo-watermarks.json')
  const rejected = await state<string>('_photo-rejected.json')
  const content = join(root, 'content')
  const notes = new Map<string, (string | undefined)[]>()
  for (const s of await subjects(content)) {
    for (const file of [join(content, s.kind, s.id, 'entity.json'), join(content, 'gallery', `${s.id}.json`)]) {
      for (const p of (await readJson<{ photos?: Photo[] }>(file))?.photos ?? []) {
        notes.set(p.url, [...(notes.get(p.url) ?? []), ...(file.includes('/gallery/') ? [p.caption] : [])])
      }
    }
  }
  const out = new Map<string, string>()
  for (const [url, captions] of notes) {
    const by = Object.values(cache[url] ?? {})
    if (url in rejected || by.some(v => v.logo !== undefined)) continue
    const note = [legacy[url]?.note, ...by.map(v => v.note), marks[url]?.what, ...captions].find(n => !!n && deadNote(n))
    if (note) out.set(url, note)
  }
  return out
}

/** Where a photo is shown: a page's own photos or gallery (`page`), or a guide (`page`: the fish its caption names, if any). */
type Shown = { file: string; url: string; page?: string; guide?: boolean; caption?: string; galleryOnly?: boolean; author?: string }

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
 * - "dead" (a dead fish or fish as food) and a logo are the photo's, not the page's: one such verdict takes it off every
 *   page, guide and gallery and onto `_photo-rejected.json` ("dead: …", "watermark: …"). A logo found, the same
 *   photographer's photos judged before the check asked about logos are judged in the same run (they may carry it too).
 * - "unsure" stays and is listed for review with the removals (docs/review/photo-subjects.md). A page left without a
 *   photo shows none.
 * - A typical photo leads a species or plant page, its habitat goes last.
 *
 * Most-read pages first (`rank`), the photos a page shows itself before the rest of its gallery. `limit`: model calls this run; stops on a model failure (usage limit), and the rest wait.
 * `recheck`: photos judged again although a verdict is cached (`recheckCandidates`), where it is from before the check
 * asked about dead fish and logos; with it, only those are judged.
 */
export async function checkPagePhotos(root: string, d: PhotoCheckDeps, o: { limit: number; parallel?: number; only?: string; today?: string; recheck?: Set<string> }) {
  const content = join(root, 'content')
  const cacheFile = join(root, 'engine-state/_photo-subjects.json')
  const rejectedFile = join(root, 'engine-state/_photo-rejected.json')
  const cache = (await readJson<Record<string, Record<string, PhotoVerdict>>>(cacheFile)) ?? {}
  const legacy = (await readJson<Record<string, PhotoVerdict>>(join(root, 'engine-state/_photo-check.json'))) ?? {}
  const rejected = (await readJson<Record<string, string>>(rejectedFile)) ?? {}
  const report = { photos: 0, sheets: 0, judged: 0, removed: [] as string[], rejected: 0, blocked: [] as string[], unsure: 0, failed: [] as string[], stopped: '' }

  const all = await rank(root, await subjects(content))
  const byId = new Map(all.map(s => [s.id, s]))
  const shown: Shown[] = []
  for (const s of all) {
    for (const file of [join(content, s.kind, s.id, 'entity.json'), join(content, 'gallery', `${s.id}.json`)]) {
      for (const [i, p] of ((await readJson<{ photos?: Photo[] }>(file))?.photos ?? []).entries()) shown.push({ file, url: p.url, page: s.id, ...(p.author ? { author: p.author } : {}), ...(file.includes('/gallery/') && i >= STRIP ? { galleryOnly: true } : {}) })
    }
  }
  const index = nameIndex(all)
  for (const id of (await readdir(join(content, 'guides')).catch(() => [] as string[])).sort()) {
    const file = join(content, 'guides', id, 'entity.json')
    const g = await readJson<{ photos?: Photo[]; video?: { figures?: { photo?: Photo }[] } }>(file)
    for (const p of [...(g?.photos ?? []), ...(g?.video?.figures ?? []).flatMap(f => (f.photo ? [f.photo] : []))]) {
      const page = p.caption ? captionSubject(p.caption, index.names, index.genera) : undefined
      shown.push({ file, url: p.url, guide: true, ...(page ? { page, caption: p.caption } : {}) })
    }
  }
  // The first check judged a page's own photos one page at a time: its verdict holds where the photo is on one page only.
  const pagesOf = new Map<string, Set<string>>()
  for (const x of shown) if (x.page) pagesOf.set(x.url, (pagesOf.get(x.url) ?? new Set()).add(x.page))
  const verdict = (url: string, page: string, strict = true): PhotoVerdict | undefined => {
    const v = cache[url]?.[page]
    return (v && !(strict && v.guide) ? v : undefined) ?? (legacy[url] && legacy[url].ok !== 'unsure' && pagesOf.get(url)?.size === 1 ? legacy[url] : undefined)
  }

  // 1. The model judges photos not judged yet (or, with `recheck`, those named there whose verdict is from before the check
  // asked about dead fish and logos), most-read pages first: what each page shows itself (its photos, its gallery strip,
  // guide photos naming it), then the rest of each gallery.
  const stale = (x: Shown) => verdict(x.url, x.page!, !x.guide)?.logo === undefined
  const due = (x: Shown) => (o.recheck ? o.recheck.has(x.url) && stale(x) : !verdict(x.url, x.page!, !x.guide))
  const sheets: { s: Subject; urls: string[] }[] = []
  const queued = new Set<string>()
  const queue = (want: (x: Shown) => boolean) => {
    const from = sheets.length
    for (const later of [false, true]) for (const s of all) {
      if (sheets.length >= o.limit) break
      if (o.only && s.id !== o.only) continue
      const todo = [...new Set(shown.filter(x => x.page === s.id && !!x.galleryOnly === later && !(x.url in rejected) && want(x) && !queued.has(`${s.id}\n${x.url}`)).map(x => x.url))]
      for (const u of todo) queued.add(`${s.id}\n${u}`)
      for (let i = 0; i < todo.length && sheets.length < o.limit; i += PER_SHEET) sheets.push({ s, urls: todo.slice(i, i + PER_SHEET) })
    }
    return sheets.slice(from).map((x, i) => ({ ...x, i: from + i }))
  }
  const logos = new Set<string>() // photos this run found a logo on
  const dir = await mkdtemp(join(tmpdir(), 'photo-check-'))
  const judge = (batch: { s: Subject; urls: string[]; i: number }[]) =>
    pool(batch, o.parallel ?? 1, async ({ s, urls, i }) => {
      if (report.stopped) return
      const ok: { url: string; b: Buffer }[] = []
      for (const url of urls) {
        try {
          const b = Buffer.from(await d.get(url))
          await sharp(b).metadata() // not an image (an error page served as 200): left out, so the rest of the sheet is judged
          ok.push({ url, b })
        } catch (err) { report.failed.push(`${s.id}: ${url}: ${(err as Error).message.slice(0, 120)}`) }
      }
      if (!ok.length) return
      // A guide's caption goes with a photo judged here only because of it (a photo on the page itself is the page's).
      const caption = (url: string) => (shown.some(x => x.url === url && x.page === s.id && !x.guide) ? undefined : shown.find(x => x.url === url && x.page === s.id)?.caption)
      const captions = ok.map(x => caption(x.url))
      try {
        const sheet = join(dir, `sheet-${i}.jpg`)
        await writeFile(sheet, await contactSheet(ok.map(x => x.b), 640, 480, 2, 'contain'))
        const v = await d.look(sheet, subjectPrompt(s, captions))
        report.sheets++
        for (const p of v.photos ?? []) {
          const x = ok[p.n - 1]
          if (!x || !(VERDICTS as readonly string[]).includes(p.ok)) continue
          cache[x.url] = { ...cache[x.url], [s.id]: { ok: p.ok, typical: !!p.typical && p.ok !== 'dead', note: String(p.note ?? '').slice(0, 120), logo: !!p.logo, ...(captions[p.n - 1] ? { guide: true } : {}) } }
          if (p.logo) logos.add(x.url)
          report.judged++
        }
      } catch (err) {
        if (err instanceof LlmError) report.stopped ||= `${s.id}: ${err.message}`
        else report.failed.push(`${s.id}: ${(err as Error).message.slice(0, 120)}`)
      }
    })
  try {
    await judge(queue(due))
    // A photographer who stamps one photo may stamp others (a round logo in a corner, which the watermark step's text
    // reader missed: 2026-11-05). Not the sources whose every photo the watermark step's model has looked at.
    const stamped = new Set(shown.filter(x => logos.has(x.url) && x.author).map(x => x.author!))
    if (stamped.size && !report.stopped) await judge(queue(x => !!x.author && stamped.has(x.author) && stale(x) && !LOGO_FOLDERS.some(f => x.url.includes(`/${f}/`))))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  // 2. Rejected photos leave their pages; a photo everywhere it is shown rejects is rejected for good, and one that shows
  // a dead fish or a logo wherever it was judged.
  const onPages = new Map<string, Shown[]>()
  const everywhere = new Map<string, Shown[]>()
  for (const x of shown) {
    everywhere.set(x.url, [...(everywhere.get(x.url) ?? []), x])
    if (x.page) onPages.set(x.url, [...(onPages.get(x.url) ?? []), x])
  }
  const off = (x: Shown): boolean => {
    if (!x.page) {
      // A guide photo that is a page's photo goes with it where it shows another fish (a map or a tank may be the guide's point).
      const xs = onPages.get(x.url) ?? []
      return xs.length > 0 && xs.every(off) && xs.some(p => verdict(p.url, p.page!, !p.guide)!.ok !== 'none')
    }
    const v = verdict(x.url, x.page, !x.guide)
    return !!v && (x.guide ? v.ok === 'other' : OFF.has(v.ok))
  }
  const label = (id: string) => { const s = byId.get(id)!; return s.kind === 'breeds' ? (s.names[0] ?? id) : s.sci }
  const added: Record<string, string> = {}
  for (const url of everywhere.keys()) {
    const why = url in rejected ? undefined : blockedFor(cache[url])
    if (why) { added[url] = why; report.blocked.push(`${url}: ${why}`) }
  }
  for (const [url, xs] of onPages) if (!(url in rejected) && !(url in added) && everywhere.get(url)!.every(off)) added[url] = `not ${label(xs[0]!.page!)}: ${verdict(url, xs[0]!.page!, !xs[0]!.guide)!.note}`
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
  // A page verdict is about the page's own photos and gallery; a guide verdict about guide photos naming the page.
  const shown = new Set(still.filter(x => x.page).map(x => `${x.page}\n${x.url}\n${!!x.guide}`))
  const on = (r: (typeof rows)[number]) => shown.has(`${r.id}\n${r.url}\n${!!r.v.guide}`)
  const removed = sort(rows.filter(r => (r.v.ok === 'other' || r.v.ok === 'none' || r.v.ok === 'dead' || r.v.logo) && !on(r)))
  const unsure = sort(rows.filter(r => r.v.ok === 'unsure' && on(r)))
  const emptied = all.filter(s => left.get(s.id) === 0 && removed.some(r => r.id === s.id && !r.v.guide))
  const why = (v: PhotoVerdict) => (v.ok === 'dead' ? 'dead: ' : v.logo ? 'logo: ' : '')
  const table = (xs: typeof rows) => xs.map(r => `| ${page.get(r.id)}${r.v.guide ? ' (a guide photo)' : ''} | [photo](${r.url}) | ${cell(why(r.v) + r.v.note)} |`).join('\n')
  const doc = `# Photos that don't show their page's subject

Written by \`pnpm engine check-photos\` (${today}), most-read pages first. Rules: docs/governance.md, "Photos".
${rows.length} verdicts. Shows it: ${rows.filter(r => r.v.ok === 'yes' && !r.v.logo).length}; its habitat: ${rows.filter(r => r.v.ok === 'habitat' && !r.v.logo).length}; something else: ${removed.filter(r => r.v.ok === 'other').length}; not a photo of it: ${removed.filter(r => r.v.ok === 'none').length}; dead or as food: ${removed.filter(r => r.v.ok === 'dead').length}; a logo on it: ${removed.filter(r => r.v.logo && r.v.ok !== 'dead').length}; can't tell: ${unsure.length}.

## Left with no photo (${emptied.length})

${emptied.length ? emptied.map(s => `- ${page.get(s.id)}`).join('\n') : 'None.'}

## Can't tell: still shown (${unsure.length})

| Page | Photo | What the model saw |
| --- | --- | --- |
${table(unsure)}

## Removed (${removed.length})

"Something else" names what the photo shows instead; "dead" a dead fish or fish as food (a market, a catch, a preserved specimen), and "logo" a mark added on the photo, both off every page; the rest are maps, hands, tanks, packshots and the like.

| Page | Photo | What it shows |
| --- | --- | --- |
${table(removed)}
`
  return { doc, photos: rows.length, unsure: unsure.length }
}
