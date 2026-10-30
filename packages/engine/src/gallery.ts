import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GallerySchema, isAllowedLicence, STAPLE_SPECIES, thumbOf, type Photo } from '@aq/schema'
import sharp from 'sharp'
import { LlmError, type Llm } from './claude'
import { contactSheet } from './video-images'

/** A photo found for a species, before screening: `key` identifies it across runs (Commons title, iNaturalist photo id). */
export type Candidate = Photo & { key: string }
type Http = (url: string) => Promise<unknown>

/** Titles and categories that are about the species but aren't photos of a living fish. */
const SKIP = /\b(map|range|distribution|drawing|illustration|plate|specimen|preserved|museum|stamp|logo|diagram|skeleton|x-ray|radiograph|chart|holotype|paratype|lectotype|skull|line art|svg)\b/i
const SKIP_CAT = /in art|anatomy|stamps|maps|specimens|illustrations|drawings|museum|diseases|disorders/i
const text = (html = '') => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

type Members = { query?: { categorymembers?: { ns: number; title: string }[] }; continue?: { cmcontinue?: string } }
type Info = { query?: { pages?: Record<string, { title: string; imageinfo?: { width: number; mime: string; thumburl: string; thumbwidth: number; thumbheight: number; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] }> } }

/** Commons photos of a species: its category and two levels of subcategories, then a search; open licences, ≥ 800 px. */
export async function commonsCandidates(name: string, http: Http, max = 450): Promise<Candidate[]> {
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
  const s = (await api({ action: 'query', list: 'search', srsearch: `filetype:bitmap "${name}"`, srnamespace: '6', srlimit: '100' })) as { query?: { search?: { title: string }[] } }
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
        author: text(ii.extmetadata?.Artist?.value) || 'Wikimedia Commons', sourceUrl: ii.descriptionurl,
      })
    }
  }
  return out
}

type Obs = { results: { id: number; user?: { login: string; name?: string }; photos?: { id: number; url: string; license_code: string | null; original_dimensions?: { width: number; height: number } }[] }[] }
const INAT_LICENCE: Record<string, string> = { 'cc-by': 'CC BY', 'cc-by-sa': 'CC BY-SA', cc0: 'CC0' }

/** iNaturalist observation photos under open licences (CC0, BY, BY-SA; most are non-commercial and never used), ≥ 800 px. */
export async function inatCandidates(name: string, http: Http, sleep: (ms: number) => Promise<void>, max = 200): Promise<Candidate[]> {
  const t = (await http(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(name)}&per_page=10`)) as { results: { id: number; name: string }[] }
  const taxon = t.results.find(x => x.name.toLowerCase() === name.toLowerCase())
  if (!taxon) return []
  const out: Candidate[] = []
  for (let page = 1; page <= 3 && out.length < max; page++) {
    await sleep(1100) // iNaturalist asks for about one request a second
    const r = (await http(`https://api.inaturalist.org/v1/observations?taxon_id=${taxon.id}&photo_license=cc-by,cc-by-sa,cc0&order_by=votes&per_page=200&page=${page}`)) as Obs
    for (const o of r.results) {
      for (const ph of (o.photos ?? []).slice(0, 2)) {
        const licence = INAT_LICENCE[ph.license_code ?? '']
        const dim = ph.original_dimensions
        if (!licence || !dim || Math.max(dim.width, dim.height) < 800) continue
        const k = Math.min(1, 1024 / Math.max(dim.width, dim.height))
        out.push({
          key: `inat:${ph.id}`, url: ph.url.replace('/square.', '/large.'), thumb: ph.url.replace('/square.', '/medium.'),
          width: Math.round(dim.width * k), height: Math.round(dim.height * k), licence,
          author: o.user?.name || o.user?.login || 'iNaturalist', sourceUrl: `https://www.inaturalist.org/photos/${ph.id}`,
        })
      }
    }
    if (r.results.length < 200) break
  }
  return out.slice(0, max)
}

const SHEET = 20
export const VET_SCHEMA = {
  type: 'object', required: ['keep', 'best'],
  properties: { keep: { type: 'array', items: { type: 'object', required: ['n', 'caption'], properties: { n: { type: 'number' }, caption: { type: 'string' } } } }, best: { type: 'array', items: { type: 'number' } } },
}
const vetPrompt = (name: string, viName: string, strict?: boolean) => `Numbered photos that may show ${name} (${viName}), for a photo gallery in an aquarium handbook.
${strict ? `${name} is a man-made line or hybrid: keep only photos of it, not other varieties, colour forms or hybrids of the same fish.\n` : ''}Keep a photo only if it clearly shows a living ${name}: in an aquarium or in the wild, the fish the main subject, sharp enough to enjoy.
Reject: dead, preserved or in a jar; held in a hand or with any person or body part; drawings, diagrams, maps, collages, screenshots, text overlays or banners; another species as the main subject; very blurry, or the fish tiny in the frame; a near-copy of a photo you keep (keep the better one).
For each kept photo give n and a caption: Vietnamese, at most 12 words, saying what the photo shows (sex, colour form, where), e.g. "Cá betta đực đuôi dài màu đỏ trong bể thủy sinh".
best: up to 3 numbers of the most beautiful, clearest photos on this sheet.`

export type GalleryDeps = { http: Http; get: (url: string) => Promise<Uint8Array>; faces: (files: string[]) => Promise<number[]>; look: (file: string, prompt: string) => Promise<{ keep: { n: number; caption: string }[]; best: number[] }>; sleep: (ms: number) => Promise<void>; now: () => Date }

/** Screened photos, best first: faces dropped (macOS Vision), then contact sheets of 20 judged by Claude. */
export async function screen(cands: Candidate[], name: string, viName: string, d: GalleryDeps, strict?: boolean): Promise<Photo[]> {
  const dir = await mkdtemp(join(tmpdir(), 'aq-gal-'))
  try {
    const got: { c: Candidate; file: string; b: Buffer }[] = []
    for (let i = 0; i < cands.length; i += 6) {
      await Promise.all(cands.slice(i, i + 6).map(async (c, j) => {
        try {
          const b = Buffer.from(await d.get(c.thumb ?? c.url))
          await sharp(b).resize(8).toBuffer() // a corrupt image would break the whole contact sheet: skip it
          const file = join(dir, `${i + j}.jpg`)
          await writeFile(file, b)
          got.push({ c, file, b })
        } catch { /* unreachable thumb: skip */ }
      }))
    }
    got.sort((a, b) => cands.indexOf(a.c) - cands.indexOf(b.c))
    const faces = got.length ? await d.faces(got.map(g => g.file)) : []
    const clean = got.filter((_, i) => faces[i] === 0)
    const best: Photo[] = []
    const rest: Photo[] = []
    for (let i = 0; i < clean.length; i += SHEET) {
      const part = clean.slice(i, i + SHEET)
      const sheet = join(dir, `sheet-${i}.jpg`)
      await writeFile(sheet, await contactSheet(part.map(g => g.b), 240, 180, 5))
      const v = await d.look(sheet, vetPrompt(name, viName, strict))
      const top = new Set(v.best ?? [])
      for (const k of v.keep ?? []) {
        const g = part[k.n - 1]
        if (!g) continue
        const { key: _k, ...photo } = g.c
        ;(top.has(k.n) ? best : rest).push({ ...photo, caption: k.caption.trim().slice(0, 120) })
      }
    }
    return [...best, ...rest]
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Galleries for species that have none (or one older than `maxAgeDays`), popular species first (the staples, then the
 * species most sources write about): Commons + iNaturalist candidates, minus photos the owner rejected, screened, at most `max` per species.
 * Stops on a model failure (usage limit). content/gallery/<id>.json.
 */
export async function galleries(root: string, d: GalleryDeps, o: { limit: number; max?: number; only?: string; maxAgeDays?: number }) {
  const content = join(root, 'content')
  const report = { done: [] as string[], failed: [] as string[], stopped: '' }
  const rejected = JSON.parse(await readFile(join(root, 'engine-state/_photo-rejected.json'), 'utf8').catch(() => '{}')) as Record<string, string>
  const all = (await readdir(join(content, 'species')).catch(() => [] as string[])).filter(id => !o.only || id === o.only)
  const sources = new Map(await Promise.all(all.map(async id => {
    const e = JSON.parse(await readFile(join(content, 'species', id, 'entity.json'), 'utf8').catch(() => '{}')) as { sections?: { source: string }[] }
    return [id, new Set((e.sections ?? []).map(s => s.source)).size] as const
  })))
  const rank = (id: string) => { const i = STAPLE_SPECIES.indexOf(id); return i < 0 ? STAPLE_SPECIES.length : i }
  const ids = all.sort((a, b) => rank(a) - rank(b) || sources.get(b)! - sources.get(a)! || a.localeCompare(b))
  const today = d.now().toISOString().slice(0, 10)
  for (const id of ids) {
    if (report.done.length + report.failed.length >= o.limit) break
    const file = join(content, 'gallery', `${id}.json`)
    const prev = JSON.parse(await readFile(file, 'utf8').catch(() => 'null')) as { updatedAt: string } | null
    if (prev && !o.only && (d.now().getTime() - Date.parse(prev.updatedAt)) / 86_400_000 < (o.maxAgeDays ?? 180)) continue
    const e = JSON.parse(await readFile(join(content, 'species', id, 'entity.json'), 'utf8')) as { scientificName: string; photos: Photo[] }
    const vi = JSON.parse(await readFile(join(content, 'species', id, 'vi.json'), 'utf8').catch(() => '{}')) as { name?: string }
    try {
      // A page photo by its URL or its source page (the same photo after it moved to our bucket).
      const seen = new Set(e.photos.flatMap(p => [p.url, p.sourceUrl]))
      const cands = [...await commonsCandidates(e.scientificName, d.http), ...await inatCandidates(e.scientificName, d.http, d.sleep)]
        .filter(c => !rejected[c.url] && !seen.has(c.url) && !seen.has(c.sourceUrl) && !seen.has(c.key) && (seen.add(c.key), true))
      const photos = (await screen(cands.slice(0, Math.round((o.max ?? 300) * 1.5)), e.scientificName, vi.name ?? e.scientificName, d)).slice(0, o.max ?? 300)
      await mkdir(join(content, 'gallery'), { recursive: true })
      await writeFile(file, `${JSON.stringify(GallerySchema.parse({ id, photos, seen: cands.length, updatedAt: today }), null, 2)}\n`)
      report.done.push(`${id}: ${photos.length} of ${cands.length}`)
    } catch (err) {
      if (err instanceof LlmError) { report.stopped = `${id}: ${err.message}`; break }
      report.failed.push(`${id}: ${(err as Error).message}`)
    }
  }
  return report
}
