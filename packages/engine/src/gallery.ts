import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GallerySchema, hashDistance, isAllowedLicence, SAME_PICTURE, thumbOf, type Photo } from '@aq/schema'
import sharp from 'sharp'
import { LlmError } from './claude'
import { galleryPlan, TARGETS, TIER_ORDER, type PlanItem } from './gallery-plan'
import { gbifMediaPage, gbifUsageKey } from './gbif'
import { inatPage, inatTaxon, newInatCursor, type InatCursor } from './inat'
import { mirrorPlan } from './mirror-photos'
import { openversePage } from './openverse'
import { contactSheet } from './video-images'
import { authorText } from './wiki-author'

/** A photo found for a species or plant, before screening: `key` identifies it across runs (Commons title, iNaturalist photo id…). */
export type Candidate = Photo & { key: string }
type Http = (url: string) => Promise<unknown>

/** Titles and categories that are about the species but aren't photos of a living fish or plant. */
const SKIP = /\b(map|range|distribution|drawing|illustration|plate|specimen|preserved|museum|stamp|logo|diagram|skeleton|x-ray|radiograph|chart|holotype|paratype|lectotype|skull|line art|svg|herbarium)\b/i
const SKIP_CAT = /in art|anatomy|stamps|maps|specimens|illustrations|drawings|museum|diseases|disorders|herbari/i
const text = (html = '') => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

type Members = { query?: { categorymembers?: { ns: number; title: string }[] }; continue?: { cmcontinue?: string } }
type Info = { query?: { pages?: Record<string, { title: string; imageinfo?: { width: number; mime: string; thumburl: string; thumbwidth: number; thumbheight: number; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] }> } }

/**
 * Commons photos of a species: its category and two levels of subcategories, then a search; open licences, ≥ 800 px.
 * `loose`: search the name's words rather than the exact phrase (a breed: few files carry "Crowntail betta" as such).
 */
export async function commonsCandidates(name: string, http: Http, max = 450, loose = false): Promise<Candidate[]> {
  const api = (q: Record<string, string>) => http(`https://commons.wikimedia.org/w/api.php?${new URLSearchParams({ format: 'json', ...q }).toString().replace(/\+/g, '%20')}`)
  const titles = new Set<string>()
  const walk = async (cat: string, depth: number) => {
    let cont: string | undefined
    do {
      const r = (await api({ action: 'query', list: 'categorymembers', cmtitle: cat, cmtype: 'file|subcat', cmlimit: '500', ...(cont ? { cmcontinue: cont } : {}) })) as Members
      for (const m of r.query?.categorymembers ?? []) {
        if (m.ns === 6) titles.add(m.title)
        else if (m.ns === 14 && depth < 2 && !SKIP_CAT.test(m.title)) await walk(m.title, depth + 1)
      }
      cont = r.continue?.cmcontinue
    } while (cont && titles.size < max)
  }
  await walk(`Category:${name}`, 0)
  const s = (await api({ action: 'query', list: 'search', srsearch: loose ? `filetype:bitmap ${name}` : `filetype:bitmap "${name}"`, srnamespace: '6', srlimit: '100' })) as { query?: { search?: { title: string }[] } }
  for (const x of s.query?.search ?? []) titles.add(x.title)
  const list = [...titles].filter(t => !SKIP.test(t)).slice(0, max)
  const out: Candidate[] = []
  for (let i = 0; i < list.length; i += 50) {
    const r = (await api({ action: 'query', titles: list.slice(i, i + 50).join('|'), prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280', iiextmetadatafilter: 'LicenseShortName|Artist|ImageDescription' })) as Info
    for (const p of Object.values(r.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0]
      const licence = ii?.extmetadata?.LicenseShortName?.value ?? ''
      if (!ii || ii.width < 800 || !/jpeg|png|webp/.test(ii.mime) || !isAllowedLicence(licence)) continue
      const url = ii.thumburl.replace(/\?.*$/, '') // without Commons' utm tracking query
      out.push({
        key: p.title, url, thumb: thumbOf(url) ?? url, width: ii.thumbwidth, height: ii.thumbheight, licence,
        author: authorText(ii.extmetadata?.Artist?.value) || 'Wikimedia Commons', sourceUrl: ii.descriptionurl,
      })
    }
  }
  return out
}

export const SHEET = 20
/** What a kept photo shows, so a gallery mixes them (a plant's list differs from an animal's). */
export const FISH_KINDS = ['male', 'female', 'form', 'pair', 'juvenile', 'group', 'habitat', 'other'] as const
export const PLANT_KINDS = ['submersed', 'scape', 'emersed', 'flower', 'detail', 'habitat', 'other'] as const
export const VET_SCHEMA = {
  type: 'object', required: ['keep', 'best'],
  properties: { keep: { type: 'array', items: { type: 'object', required: ['n', 'caption', 'kind'], properties: { n: { type: 'number' }, caption: { type: 'string' }, kind: { type: 'string', enum: [...new Set([...FISH_KINDS, ...PLANT_KINDS])] } } } }, best: { type: 'array', items: { type: 'number' } } },
}
const vetPrompt = (name: string, viName: string, strict?: boolean, plant?: boolean) => plant
  ? `Numbered photos that may show the aquarium plant ${name} (${viName}), for a photo gallery in an aquarium handbook.
${strict ? `${name} is a cultivar or trade form: keep only photos of it, not the plain species or its other forms.\n` : ''}Keep a photo only if it clearly shows living ${name}: in an aquarium, grown emersed, in a pot or in the wild, the plant the main subject, sharp enough to enjoy.
Reject: herbarium sheets, dried or pressed plants; held in a hand or with any person or body part; drawings, diagrams, maps, collages, screenshots, text overlays or banners; another plant as the main subject; a shop packshot (a pot or cup with a label); very blurry, or the plant tiny in the frame; a near-copy of a photo you keep (keep the better one).
For each kept photo give n, kind and a caption. kind: "submersed" (growing under water), "scape" (one plant among others in a planted tank), "emersed" (growing above water or in a pot), "flower", "detail" (leaves or stem up close), "habitat" (in the wild), else "other". caption: Vietnamese, at most 12 words, saying what the photo shows, e.g. "Bụi ${viName} mọc dưới nước trong bể thủy sinh".
best: up to 3 numbers of the most beautiful, clearest photos on this sheet.`
  : `Numbered photos that may show ${name} (${viName}), for a photo gallery in an aquarium handbook.
${strict ? `${name} is a man-made line or hybrid: keep only photos of it, not other varieties, colour forms or hybrids of the same fish.\n` : ''}Keep a photo only if it clearly shows a living ${name}: in an aquarium or in the wild, the fish the main subject, sharp enough to enjoy.
Reject: dead, preserved or in a jar; held in a hand or with any person or body part; drawings, diagrams, maps, collages, screenshots, text overlays or banners; another species as the main subject; very blurry, or the fish tiny in the frame; a near-copy of a photo you keep (keep the better one).
For each kept photo give n, kind and a caption. kind: "male", "female", "pair", "juvenile", "group" (several together), "form" (a bred colour or fin form), "habitat" (in its wild place), else "other". caption: Vietnamese, at most 12 words, saying what the photo shows (sex, colour form, where), e.g. "Cá betta đực đuôi dài màu đỏ trong bể thủy sinh".
best: up to 3 numbers of the most beautiful, clearest photos on this sheet.`

export type Vet = { keep: { n: number; caption: string; kind?: string }[]; best: number[] }
export type GalleryDeps = {
  http: Http; get: (url: string) => Promise<Uint8Array>; faces: (files: string[]) => Promise<number[]>; look: (file: string, prompt: string) => Promise<Vet>; sleep: (ms: number) => Promise<void>; now: () => Date
  /** Openverse's API with the requests left today (no client: the source is skipped). */
  openverse?: (url: string) => Promise<{ json: unknown; remaining: number }>
}

/** A 64-bit difference hash of an image (hex): near-copies (resized, re-encoded, imported from one site to another) differ in a few bits. */
export async function dhash(bytes: Uint8Array): Promise<string> {
  const px = await sharp(bytes).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer()
  let bits = ''
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += px[y * 9 + x]! > px[y * 9 + x + 1]! ? '1' : '0'
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0')
}
export const isNearCopy = (h: string, known: Iterable<string>) => { for (const k of known) if (hashDistance(h, k) <= SAME_PICTURE) return true; return false }

export type Screened = { key: string; photo: Photo; best: boolean; kind?: string; hash: string }

/**
 * The shared photo screening, for every gallery photo: each candidate downloaded (one that doesn't decode is skipped),
 * near-copies of a photo already shown (`hashes`) or of an earlier candidate dropped, human faces dropped (macOS
 * Vision), then contact sheets of 20 judged by Claude (the right species, alive, no people, no text, sharp).
 * Returns the kept photos in candidate order and how many sheets (model calls) it took.
 */
export async function screenTagged(cands: Candidate[], name: string, viName: string, d: GalleryDeps, o: { strict?: boolean; plant?: boolean; hashes?: Iterable<string> } = {}): Promise<{ kept: Screened[]; sheets: number }> {
  const dir = await mkdtemp(join(tmpdir(), 'aq-gal-'))
  try {
    const got: { c: Candidate; file: string; b: Buffer; hash: string }[] = []
    for (let i = 0; i < cands.length; i += 6) {
      await Promise.all(cands.slice(i, i + 6).map(async (c, j) => {
        try {
          const b = Buffer.from(await d.get(c.thumb ?? c.url))
          const hash = await dhash(b) // a corrupt image would break the whole contact sheet: skip it
          const file = join(dir, `${i + j}.jpg`)
          await writeFile(file, b)
          got.push({ c, file, b, hash })
        } catch { /* unreachable or corrupt thumb: skip */ }
      }))
    }
    got.sort((a, b) => cands.indexOf(a.c) - cands.indexOf(b.c))
    // With `hashes` (galleries): near-copies of a photo shown, or of an earlier candidate, are dropped.
    const known = o.hashes ? [...o.hashes] : undefined
    const unique = known ? got.filter(g => !isNearCopy(g.hash, known) && (known.push(g.hash), true)) : got
    const faces = unique.length ? await d.faces(unique.map(g => g.file)) : []
    const clean = unique.filter((_, i) => faces[i] === 0)
    const kept: Screened[] = []
    let sheets = 0
    for (let i = 0; i < clean.length; i += SHEET) {
      const part = clean.slice(i, i + SHEET)
      const sheet = join(dir, `sheet-${i}.jpg`)
      await writeFile(sheet, await contactSheet(part.map(g => g.b), 240, 180, 5))
      const v = await d.look(sheet, vetPrompt(name, viName, o.strict, o.plant))
      sheets++
      const top = new Set(v.best ?? [])
      for (const k of v.keep ?? []) {
        const g = part[k.n - 1]
        if (!g || kept.some(x => x.key === g.c.key)) continue
        const { key, ...photo } = g.c
        kept.push({ key, photo: { ...photo, caption: k.caption.trim().slice(0, 120) }, best: top.has(k.n), ...(k.kind ? { kind: k.kind } : {}), hash: g.hash })
      }
    }
    kept.sort((a, b) => cands.findIndex(c => c.key === a.key) - cands.findIndex(c => c.key === b.key))
    return { kept, sheets }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Screened photos, best first (breed pages, Unsplash): `screenTagged` without the tags. */
export async function screen(cands: Candidate[], name: string, viName: string, d: GalleryDeps, strict?: boolean): Promise<Photo[]> {
  const { kept } = await screenTagged(cands, name, viName, d, { strict })
  return [...kept.filter(k => k.best), ...kept.filter(k => !k.best)].map(k => k.photo)
}

export type GalleryPhoto = Photo & { best?: boolean; kind?: string }
const KIND_ORDER: string[] = [...FISH_KINDS, ...PLANT_KINDS]

/** Round robin across kinds (male, female, colour form… in that order), each kind's largest photos first. */
function mix(photos: GalleryPhoto[]): GalleryPhoto[] {
  const groups = new Map<string, GalleryPhoto[]>()
  for (const p of photos) groups.set(p.kind!, [...(groups.get(p.kind!) ?? []), p])
  const lists = [...groups.entries()].sort(([a], [b]) => (KIND_ORDER.indexOf(a) + 1 || 99) - (KIND_ORDER.indexOf(b) + 1 || 99))
    .map(([, ps]) => ps.map((p, i) => ({ p, i })).sort((a, b) => b.p.width * b.p.height - a.p.width * a.p.height || a.i - b.i).map(x => x.p))
  const out: GalleryPhoto[] = []
  while (lists.some(l => l.length)) for (const l of lists) if (l.length) out.push(l.shift()!)
  return out
}

/**
 * A gallery's order: the model's best picks first, mixed so the first screen shows the range (male, female, colour
 * forms, young, the wild fish; a plant under water, emersed, in flower), the largest of each first; then photos screened
 * before kinds were recorded, in their order; then the other kept photos, mixed the same way.
 */
export function rankGallery(photos: GalleryPhoto[]): GalleryPhoto[] {
  const tagged = (best: boolean) => photos.filter(p => p.kind !== undefined && !!p.best === best)
  return [...mix(tagged(true)), ...photos.filter(p => p.kind === undefined), ...mix(tagged(false))]
}

/**
 * Where each source stands for one species or plant (engine-state/gallery/<id>.json), so each run continues where the
 * last stopped: iNaturalist's cursor, when Commons was read, GBIF's and Openverse's next page; candidates found but not
 * screened yet (`queue`); every candidate screened, kept or not (`judged`), never screened again; the image hash of
 * every photo shown, against near-copies; `exhausted`: the day every source ran dry below target (tried again later).
 */
export type GalleryState = {
  inat?: InatCursor
  commons?: string
  gbif?: { key: number | null; next: number | null }
  openverse?: { next: number | null }
  queue: Candidate[]
  judged: string[]
  hashes: Record<string, string>
  exhausted?: string
}
/** Requests a run may make to each source (iNaturalist asks for about one a second and under 10,000 a day; Openverse lets anonymous clients make 200 a day). */
export type SourceBudget = { inat: number; gbif: number; openverse: number }
const RETRY_DAYS = 30
const UNSPLASH = 'Unsplash License'
/** The source a candidate key came from, for the report. */
export const sourceOfKey = (key: string) => (key.startsWith('inat:') ? 'iNaturalist' : key.startsWith('flickr:') ? 'Openverse (Flickr)' : key.startsWith('gbif:') ? 'GBIF' : 'Wikimedia Commons')
class OutOfBudget extends Error {}

type Page = { scientificName: string; photos: Photo[] }

/**
 * Tops up the galleries of species and plants below their tier's target (gallery-plan.ts), most popular first, until
 * `sheets` contact sheets (model calls) are spent. Candidates come from iNaturalist first (every observation with an
 * open-licence photo, research grade, then a community ID that agrees), then Wikimedia Commons, GBIF and Openverse;
 * photos the owner rejected or the page already shows are left out; the rest go through the shared screening
 * (`screenTagged`), and only the photos it keeps are added. A page whose sources run dry below target is reported as
 * short and tried again after 30 days. Photos the owner rejected leave every gallery. Stops on a model failure (usage
 * limit). content/gallery/<id>.json; engine-state/gallery/<id>.json; docs/review/galleries.md.
 */
export async function galleries(root: string, d: GalleryDeps, o: { sheets: number; only?: string; budget?: Partial<SourceBudget>; shard?: [number, number] }) {
  const content = join(root, 'content')
  const report = { done: [] as string[], failed: [] as string[], stopped: '', sheets: 0, added: {} as Record<string, number>, short: [] as string[] }
  const rejected = JSON.parse(await readFile(join(root, 'engine-state/_photo-rejected.json'), 'utf8').catch(() => '{}')) as Record<string, string>
  // A Commons, iNaturalist, Flickr or GBIF photo rejected after it moved to our bucket is known there by its key (mirror-photos.ts).
  const rejectedKeys = new Set(Object.keys(rejected).map(u => u.replace(/^https?:\/\/[^/]+\//, '')))
  const isRejected = (url: string) => !!rejected[url] || rejectedKeys.has(mirrorPlan(url)?.key ?? '')
  const gbifNames = JSON.parse(await readFile(join(root, 'engine-state/_gbif-names.json'), 'utf8').catch(() => '{}')) as Record<string, { canonicalName: string } | null>
  const left: SourceBudget & { sheets: number } = { inat: 150, gbif: 60, openverse: 20, ...o.budget, sheets: o.sheets }
  // Openverse is slow (20 s or more a query) and sometimes stalls: after 3 failures it rests until the next run.
  let openverseFailures = 0
  const today = d.now().toISOString().slice(0, 10)
  const days = (date: string) => (d.now().getTime() - Date.parse(date)) / 86_400_000
  await dropRejected(content, isRejected)
  // `shard` [i, n]: every n-th page from the i-th, so n runs can share the work (each still most popular first).
  const plan = (await galleryPlan(root)).filter((t, i) => (!o.only || t.id === o.only) && (!o.shard || i % o.shard[1] === o.shard[0]))
  // Each source's requests: counted against the run's budget, at the pace the source asks for (shared by n shards).
  const runs = o.shard?.[1] ?? 1
  const paced = (name: keyof SourceBudget, gap: number) => async (url: string) => {
    if (left[name] <= 0) throw new OutOfBudget(name)
    left[name]--
    await d.sleep(gap * runs)
    return d.http(url)
  }
  const inat = paced('inat', 1100)
  const gbif = paced('gbif', 300)
  const size = async (url: string) => { const m = await sharp(Buffer.from(await d.get(url))).metadata(); return m.width && m.height ? { width: m.width, height: m.height } : null }

  for (const t of plan) {
    if (left.sheets <= 0) break
    const gfile = join(content, 'gallery', `${t.id}.json`)
    const g = JSON.parse(await readFile(gfile, 'utf8').catch(() => 'null')) as { photos: GalleryPhoto[]; seen: number; updatedAt: string; builtAt?: string } | null
    let gallery = g?.photos ?? []
    if (gallery.length >= t.target) continue
    const sfile = join(root, 'engine-state/gallery', `${t.id}.json`)
    const saved = JSON.parse(await readFile(sfile, 'utf8').catch(() => 'null')) as GalleryState | null
    const st: GalleryState = saved ?? { queue: [], judged: [], hashes: {} }
    if (st.exhausted && !o.only && days(st.exhausted) < RETRY_DAYS) continue
    if (st.exhausted) {
      // A month on: new observations are past iNaturalist's cursor; the other sources are read again (what was judged stays judged).
      delete st.exhausted
      if (st.inat?.taxon) st.inat.pass = 'research'
      delete st.commons
      if (st.gbif?.key) st.gbif.next = 0
      delete st.openverse
    }
    // A gallery the old step built screened every Commons candidate it found then: those count as judged.
    const legacy = !saved && gallery.some(p => !p.source && p.licence !== UNSPLASH)
    const before = gallery.length
    let seenCount = g?.seen ?? 0
    let page: Page | undefined
    const save = async () => {
      // Hashes of photos still shown only (a photo moved to our bucket has a new address).
      const shown = new Set([...page?.photos ?? [], ...gallery].map(p => p.url))
      st.hashes = Object.fromEntries(Object.entries(st.hashes).filter(([u]) => shown.has(u)))
      await mkdir(join(root, 'engine-state/gallery'), { recursive: true })
      await writeFile(sfile, `${JSON.stringify(st, null, 1)}\n`)
    }
    try {
      const e = JSON.parse(await readFile(join(content, t.kind, t.id, 'entity.json'), 'utf8')) as Page
      page = e
      const vi = JSON.parse(await readFile(join(content, t.kind, t.id, 'vi.json'), 'utf8').catch(() => '{}')) as { name?: string }
      const sci = e.scientificName
      // A cultivar or trade form ("Anubias barteri 'Mini Coin'", "Eriocaulon sp. 'Vietnam'"): only its own name, never its
      // species' photos, and screened for that form alone. A variety's name also as iNaturalist writes it ("Anubias barteri nana").
      const line = /['‘’"]|\bsp\./.test(sci)
      const names = line ? [sci] : [sci, sci.replace(/\s(?:var|subsp|ssp|f)\.\s/, ' '), gbifNames[sci]?.canonicalName ?? '']
      const seen = new Set([...e.photos, ...gallery].flatMap(p => [p.url, p.sourceUrl]))
      const judged = new Set(st.judged)
      const isNew = (c: Candidate) => !isRejected(c.url) && !seen.has(c.url) && !seen.has(c.sourceUrl) && !judged.has(c.key) && !st.queue.some(q => q.key === c.key)
      for (const p of [...e.photos, ...gallery]) {
        if (!st.hashes[p.url]) st.hashes[p.url] = await d.get(p.thumb ?? p.url).then(dhash).catch(() => '')
      }
      const skip = new Set<string>() // sources that failed or ran out of budget for this page this run
      /** The next batch of candidates from the first source with more to give; null when none has (this run). */
      const more = async (): Promise<Candidate[] | null> => {
        const attempt = async (name: string, f: () => Promise<Candidate[]>) => {
          try { return await f() } catch (err) {
            skip.add(name)
            if (name === 'openverse' && !(err instanceof OutOfBudget) && ++openverseFailures >= 3) left.openverse = 0
            if (!(err instanceof OutOfBudget)) report.failed.push(`${t.id} ${name}: ${(err as Error).message.slice(0, 120)}`)
            return undefined
          }
        }
        if (!skip.has('inat') && st.inat?.pass !== 'done') {
          const r = await attempt('inat', async () => {
            st.inat ??= newInatCursor(await inatTaxon(names, inat))
            const p = await inatPage(st.inat, inat)
            st.inat = p.cursor
            return p.cands
          })
          if (r) return r
        }
        if (!skip.has('commons') && !st.commons) {
          const r = await attempt('commons', () => commonsCandidates(sci, d.http))
          if (r) {
            st.commons = today
            if (!legacy) return r
            st.judged.push(...r.map(c => c.key)); r.forEach(c => judged.add(c.key))
            return []
          }
        }
        if (!skip.has('gbif') && (!st.gbif || (st.gbif.key && st.gbif.next !== null))) {
          const r = await attempt('gbif', async () => {
            st.gbif ??= { key: line ? null : await gbifUsageKey(gbifNames[sci]?.canonicalName ?? sci, gbif), next: 0 }
            if (!st.gbif.key || st.gbif.next === null) return []
            const p = await gbifMediaPage(st.gbif.key, st.gbif.next, gbif, size)
            st.gbif.next = p.next
            return p.cands
          })
          if (r) return r
        }
        if (d.openverse && !skip.has('openverse') && st.openverse?.next !== null) {
          const api = d.openverse
          const r = await attempt('openverse', async () => {
            if (left.openverse <= 0) throw new OutOfBudget('openverse')
            left.openverse--
            await d.sleep(3100 * runs) // 20 a minute
            const p = await openversePage(sci, st.openverse?.next ?? 1, api)
            st.openverse = { next: p.next }
            if (p.remaining < 10) left.openverse = 0 // leave the day's last requests alone
            return p.cands
          })
          if (r) return r
        }
        return null
      }
      const dry = () => st.inat?.pass === 'done' && !!st.commons && !!st.gbif && (!st.gbif.key || st.gbif.next === null) && (!d.openverse || st.openverse?.next === null)

      while (gallery.length < t.target && left.sheets > 0) {
        const want = Math.max(SHEET, (t.target - gallery.length) * 2)
        while (st.queue.length < want) {
          const got = await more()
          if (got === null) break
          st.queue.push(...got.filter(isNew))
        }
        if (!st.queue.length) break
        const chunk = st.queue.slice(0, SHEET)
        const r = await screenTagged(chunk, sci, vi.name ?? sci, d, { plant: t.kind === 'plants', strict: line, hashes: Object.values(st.hashes).filter(Boolean) })
        st.queue = st.queue.slice(chunk.length)
        st.judged.push(...chunk.map(c => c.key))
        chunk.forEach(c => judged.add(c.key))
        left.sheets -= r.sheets
        report.sheets += r.sheets
        seenCount += chunk.length
        for (const k of r.kept) {
          st.hashes[k.photo.url] = k.hash
          report.added[sourceOfKey(k.key)] = (report.added[sourceOfKey(k.key)] ?? 0) + 1
        }
        gallery = rankGallery([...gallery, ...r.kept.map(k => ({ ...k.photo, best: k.best, kind: k.kind ?? 'other' }))])
        if (r.kept.length) {
          await mkdir(join(content, 'gallery'), { recursive: true })
          await writeFile(gfile, `${JSON.stringify(GallerySchema.parse({ id: t.id, photos: gallery, seen: seenCount, updatedAt: today, builtAt: today }), null, 2)}\n`)
        }
        await save()
      }
      if (gallery.length < t.target && !st.queue.length && dry()) st.exhausted = today
      await save()
      report.done.push(`${t.id}: ${gallery.length}/${t.target} (+${gallery.length - before})`)
    } catch (err) {
      await save()
      if (err instanceof LlmError) { report.stopped = `${t.id}: ${err.message}`; break }
      report.failed.push(`${t.id}: ${(err as Error).message.slice(0, 160)}`)
    }
  }
  report.short = await galleryReview(root, await galleryPlan(root), today)
  return report
}

/** Photos the owner rejected (engine-state/_photo-rejected.json) leave every gallery, the next run after they are listed. */
async function dropRejected(content: string, isRejected: (url: string) => boolean) {
  for (const f of (await readdir(join(content, 'gallery')).catch(() => [] as string[])).filter(f => f.endsWith('.json'))) {
    const file = join(content, 'gallery', f)
    const g = JSON.parse(await readFile(file, 'utf8')) as { photos: Photo[] }
    const keep = g.photos.filter(p => !isRejected(p.url))
    if (keep.length < g.photos.length) await writeFile(file, `${JSON.stringify({ ...g, photos: keep }, null, 2)}\n`)
  }
}

/**
 * docs/review/galleries.md: per tier, how many pages are at their target and how many below; then the pages whose
 * sources ran dry below target (the shortfall), most popular first. Returns that list.
 */
export async function galleryReview(root: string, plan: PlanItem[], today: string): Promise<string[]> {
  const rows = await Promise.all(plan.map(async t => {
    const g = JSON.parse(await readFile(join(root, 'content/gallery', `${t.id}.json`), 'utf8').catch(() => 'null')) as { photos: Photo[] } | null
    const st = JSON.parse(await readFile(join(root, 'engine-state/gallery', `${t.id}.json`), 'utf8').catch(() => 'null')) as GalleryState | null
    return { ...t, have: g?.photos.length ?? 0, exhausted: st?.exhausted }
  }))
  const short = rows.filter(r => r.exhausted && r.have < r.target)
  const lines = [
    '# Photo galleries', '',
    `Written by \`pnpm engine gallery\` (${today}). Targets: packages/engine/src/gallery-plan.ts; rules: docs/governance.md, "Photos".`, '',
    '| Tier | Target | Species | Plants | At target | Below |', '| --- | --- | --- | --- | --- | --- |',
    ...TIER_ORDER.map(tier => {
      const r = rows.filter(x => x.tier === tier)
      return `| ${tier} | ${TARGETS[tier]} | ${r.filter(x => x.kind === 'species').length} | ${r.filter(x => x.kind === 'plants').length} | ${r.filter(x => x.have >= x.target).length} | ${r.filter(x => x.have < x.target).length} |`
    }),
    '', `## Short of target: every source read (${short.length})`, '',
    'Open-licence photos run out for these; each is read again 30 days after it ran dry.', '',
    '| Page | Tier | Photos | Target |', '| --- | --- | --- | --- |',
    ...short.map(r => `| ${r.kind}/${r.id} | ${r.tier} | ${r.have} | ${r.target} |`), '',
  ]
  await mkdir(join(root, 'docs/review'), { recursive: true })
  await writeFile(join(root, 'docs/review/galleries.md'), lines.join('\n'))
  return short.map(r => `${r.id}: ${r.have}/${r.target}`)
}
