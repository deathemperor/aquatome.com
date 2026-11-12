import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GallerySchema, loadAll } from '@aq/schema'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { mirrorPlan } from '../src/mirror-photos'
import { breedNames, commonsCandidates, dhash, galleries, rankGallery, screenTagged, type GalleryDeps, type GalleryPhoto, type Vet } from '../src/gallery'

const meta = (licence: string, artist = '<a href="x">Ann</a>, [[User:Bo K|Bo]]') => ({ LicenseShortName: { value: licence }, Artist: { value: artist } })
const info = (title: string, licence: string, width = 2000) => ({
  title, imageinfo: [{ width, mime: 'image/jpeg', thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${title.slice(5)}/1280px-${title.slice(5)}`, thumbwidth: 1280, thumbheight: 960, descriptionurl: `https://commons.wikimedia.org/wiki/${title}`, extmetadata: meta(licence) }],
})

/** Commons: Category:Betta splendens holds one file and a subcategory (one more file); a range map is skipped by title. */
const commons = async (u: string) => {
  const q = new URL(u).searchParams
  if (q.get('list') === 'categorymembers') {
    if (q.get('cmtitle') === 'Category:Betta splendens') return { query: { categorymembers: [{ ns: 6, title: 'File:A.jpg' }, { ns: 14, title: 'Category:Betta splendens (aquarium)' }, { ns: 14, title: 'Category:Betta splendens in art' }, { ns: 6, title: 'File:Betta range map.png' }] } }
    if (q.get('cmtitle') === 'Category:Betta splendens (aquarium)') return { query: { categorymembers: [{ ns: 6, title: 'File:B.jpg' }] } }
    throw new Error(`walked into ${q.get('cmtitle')}`)
  }
  if (q.get('list') === 'search') return { query: { search: [{ title: 'File:C.jpg' }, { title: 'File:A.jpg' }] } }
  const titles = q.get('titles')!.split('|')
  const all: Record<string, unknown> = { 'File:A.jpg': info('File:A.jpg', 'CC BY-SA 4.0'), 'File:B.jpg': info('File:B.jpg', 'CC BY-NC 2.0'), 'File:C.jpg': info('File:C.jpg', 'CC0', 600) }
  return { query: { pages: Object.fromEntries(titles.filter(t => all[t]).map((t, i) => [String(i), all[t]])) } }
}

test('commons: category and subcategories (not "in art"), then search; open licences, ≥ 800 px, plain-text author', async () => {
  const c = await commonsCandidates('Betta splendens', commons)
  expect(c.map(x => x.key)).toEqual(['File:A.jpg'])
  expect(c[0]).toMatchObject({ licence: 'CC BY-SA 4.0', author: 'Ann, Bo', width: 1280, sourceUrl: 'https://commons.wikimedia.org/wiki/File:A.jpg' })
  expect(c[0]!.thumb).toMatch(/\/500px-A\.jpg$/)
})


test("commons: a file whose own categories or description say it is a drawing, food or another species is no candidate", async () => {
  const withMeta = (title: string, extra: Record<string, { value: string }>) => { const x = info(title, 'CC BY 4.0'); Object.assign(x.imageinfo[0]!.extmetadata, extra); return x }
  const all: Record<string, unknown> = {
    'File:A.jpg': withMeta('File:A.jpg', { Categories: { value: 'Barbonymus gonionotus|Media from iNaturalist' } }),
    'File:Barbonymus gonionotus Bleeker.jpg': withMeta('File:Barbonymus gonionotus Bleeker.jpg', { Categories: { value: 'Barbonymus gonionotus|Cyprinidae illustrations' } }),
    'File:Pla som.jpg': withMeta('File:Pla som.jpg', { Categories: { value: 'Fried fish in Thailand|Pickled fish' } }),
    'File:Barb gonio 080525 9625 ltn.jpg': withMeta('File:Barb gonio 080525 9625 ltn.jpg', { ImageDescription: { value: 'Barbonymus gonionotus (122mm SL). <b>errata</b>: Misidentified, it should be Mystacoleucus marginatus' } }),
  }
  let asked = ''
  const c = await commonsCandidates('Barbonymus gonionotus', async (u: string) => {
    const q = new URL(u).searchParams
    if (q.get('list') === 'categorymembers') return { query: { categorymembers: Object.keys(all).map(title => ({ ns: 6, title })) } }
    if (q.get('list') === 'search') return { query: { search: [] } }
    asked = q.get('iiextmetadatafilter')!
    return { query: { pages: Object.fromEntries(q.get('titles')!.split('|').map((t, i) => [String(i), all[t]])) } }
  })
  expect(asked).toBe('LicenseShortName|Artist|ImageDescription|Categories')
  expect(c.map(x => x.key)).toEqual(['File:A.jpg'])
})

test('commons: files with long names are asked for in addresses the server takes, each file once', async () => {
  // Found 2026-11-10 in the photos log: "vittina-waigiensis commons: HTTP 414" every cycle (72 times on 6 pages), so those
  // pages' Commons photos were never read. Museum shell series name each file in a sentence.
  const long = (i: number) => `File:Vittina waigiensis (Lesson, 1831) – shell ${i}, ${'Naturalis Biodiversity Center, Leiden, the Netherlands; '.repeat(4)}.jpg`
  const titles = Array.from({ length: 120 }, (_, i) => long(i))
  const lengths: number[] = []
  const asked: string[] = []
  const c = await commonsCandidates('Vittina waigiensis', async (u: string) => {
    const q = new URL(u).searchParams
    if (q.get('list') === 'categorymembers') return { query: { categorymembers: titles.map(title => ({ ns: 6, title })) } }
    if (q.get('list') === 'search') return { query: { search: [] } }
    lengths.push(u.length)
    const batch = q.get('titles')!.split('|')
    asked.push(...batch)
    expect(batch.length).toBeLessThanOrEqual(50)
    return { query: { pages: Object.fromEntries(batch.map((t, i) => [String(i), info(t, 'CC BY 4.0')])) } }
  })
  expect(Math.max(...lengths)).toBeLessThan(8000)
  expect(asked).toEqual(titles)
  expect(c).toHaveLength(120)
})

/** A different picture for every address (seeded noise), so near-copy detection tells them apart; `same` makes two addresses one picture. */
const same = new Map<string, string>()
const picture = (url: string) => {
  let x = [...(same.get(url) ?? url)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
  const px = Buffer.alloc(64 * 48 * 3)
  for (let i = 0; i < px.length; i++) { x = (x * 1103515245 + 12345) >>> 0; px[i] = x >>> 24 }
  return sharp(px, { raw: { width: 64, height: 48, channels: 3 } }).jpeg().toBuffer()
}

const obs = (id: number, licence: string | null, o: { w?: number; grade?: string; community?: number | null; agree?: number } = {}) => ({
  id, quality_grade: o.grade ?? 'research', community_taxon_id: o.community === undefined ? 7 : o.community, num_identification_agreements: o.agree ?? 1, taxon: { id: 7 }, user: { login: 'bob' },
  photos: [{ id, url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/square.jpg`, license_code: licence, original_dimensions: { width: o.w ?? 2048, height: (o.w ?? 2048) / 2 } }],
})
/** iNaturalist: Betta splendens is taxon 7; research grade 1 (open) and 2 (NC); "casual" 5 (agreed). */
let inatObs: Record<string, ReturnType<typeof obs>[]> = { research: [obs(1, 'cc-by'), obs(2, 'cc-by-nc')], 'needs_id,casual': [obs(5, 'cc-by-sa', { grade: 'casual' })] }
const inat = async (u: string) => {
  if (u.includes('/taxa?')) return { results: [{ id: 9, name: 'Betta splendens complex', rank: 'complex' }, { id: 7, name: 'Betta splendens', rank: 'species' }] }
  const q = new URL(u).searchParams
  return { results: (inatObs[q.get('quality_grade')!] ?? []).filter(o => o.id > Number(q.get('id_above'))) }
}
const gbif = async (u: string) => (u.includes('/species/match') ? { matchType: 'NONE' } : { results: [], endOfRecords: true })

async function root() {
  inatObs = { research: [obs(1, 'cc-by'), obs(2, 'cc-by-nc')], 'needs_id,casual': [obs(5, 'cc-by-sa', { grade: 'casual' })] }
  same.clear()
  const r = await mkdtemp(join(tmpdir(), 'aq-gallery-'))
  await mkdir(join(r, 'content/species/betta-splendens'), { recursive: true })
  await mkdir(join(r, 'engine-state'), { recursive: true })
  await writeFile(join(r, 'content/species/betta-splendens/entity.json'), JSON.stringify({ scientificName: 'Betta splendens', photos: [{ url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/5/large.jpg', sourceUrl: 'https://www.inaturalist.org/photos/5' }] }))
  await writeFile(join(r, 'content/species/betta-splendens/vi.json'), JSON.stringify({ name: 'Cá betta' }))
  return r
}

const keepAll = async (_f: string, _p: string, n = 20): Promise<Vet> => ({ keep: Array.from({ length: n }, (_, i) => ({ n: i + 1, caption: `ảnh ${i + 1}`, kind: 'male' })), best: [] })
/** Candidates for Betta splendens: iNat 1 (research), then Commons A; iNat 5 is the page's photo. */
const deps = (over: Partial<GalleryDeps> = {}): GalleryDeps => ({
  http: async u => (u.includes('inaturalist') ? inat(u) : u.includes('gbif.org') ? gbif(u) : commons(u)),
  get: async u => new Uint8Array(await picture(u)),
  faces: async files => files.map(() => 0),
  look: keepAll,
  sleep: async () => {},
  now: () => new Date('2026-10-30T00:00:00Z'),
  ...over,
})
const read = async (r: string, f: string) => JSON.parse(await readFile(join(r, f), 'utf8'))
const urls = (g: { photos: { sourceUrl: string }[] }) => g.photos.map(p => p.sourceUrl)

test('gallery: iNaturalist first, then Commons; open licences only; the page\'s photo and faces are out; no keys stored', async () => {
  const r = await root()
  const prompts: string[] = []
  const report = await galleries(r, deps({
    faces: async files => files.map((_, i) => (i === 1 ? 1 : 0)), // the second candidate (Commons A) has a face
    look: async (f, p) => { prompts.push(p); return { keep: [{ n: 1, caption: ' Cá betta đực màu đỏ ', kind: 'male' }], best: [1] } },
  }), { sheets: 5 })
  expect(report.done).toEqual(['betta-splendens: 1/100 (+1)'])
  expect(prompts[0]).toContain('Cá betta')
  const g = await read(r, 'content/gallery/betta-splendens.json')
  expect(g.photos).toEqual([expect.objectContaining({ sourceUrl: 'https://www.inaturalist.org/photos/1', licence: 'CC BY', caption: 'Cá betta đực màu đỏ', best: true, kind: 'male' })])
  expect(g.photos[0].key).toBeUndefined()
  expect(report.added).toEqual({ iNaturalist: 1 })
  // Every source read and the target not reached: short, listed in the review.
  const st = await read(r, 'engine-state/gallery/betta-splendens.json')
  expect(st).toMatchObject({ exhausted: '2026-10-30', inat: { taxon: 7, pass: 'done' }, commons: '2026-10-30', queue: [] })
  expect(st.judged.sort()).toEqual(['File:A.jpg', 'inat:1'])
  expect(report.short).toEqual(['betta-splendens: 1/100'])
  expect(await readFile(join(r, 'docs/review/galleries.md'), 'utf8')).toContain('| species/betta-splendens | staple | 1 | 100 |')
})

test('gallery: a casual (aquarium) observation counts only when the community ID agrees', async () => {
  const r = await root()
  await writeFile(join(r, 'content/species/betta-splendens/entity.json'), JSON.stringify({ scientificName: 'Betta splendens', photos: [] }))
  inatObs = { research: [], 'needs_id,casual': [obs(5, 'cc-by-sa', { grade: 'casual' }), obs(6, 'cc0', { grade: 'casual', community: null, agree: 0 }), obs(8, 'cc0', { grade: 'needs_id', community: 3 })] }
  await galleries(r, deps(), { sheets: 5 })
  expect(urls(await read(r, 'content/gallery/betta-splendens.json')).sort()).toEqual(['https://commons.wikimedia.org/wiki/File:A.jpg', 'https://www.inaturalist.org/photos/5'])
})

test('gallery: never pads — only photos the screening kept are added; a page at its target is left alone', async () => {
  const r = await root()
  await galleries(r, deps({ look: async () => ({ keep: [], best: [] }) }), { sheets: 5 })
  expect(await readFile(join(r, 'content/gallery/betta-splendens.json'), 'utf8').catch(() => 'none')).toBe('none')
  // At target (a staple's 100): not even read.
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  const full = Array.from({ length: 100 }, (_, i) => ({ url: `https://media.aquatome.com/x/${i}.webp`, width: 1200, height: 800, licence: 'CC BY', author: 'a', sourceUrl: `https://x/${i}` }))
  await writeFile(join(r, 'content/gallery/betta-splendens.json'), JSON.stringify({ id: 'betta-splendens', photos: full, seen: 100, updatedAt: '2026-10-01' }))
  await rm(join(r, 'engine-state/gallery'), { recursive: true, force: true })
  let calls = 0
  expect((await galleries(r, deps({ http: async u => { calls++; return deps().http(u) } }), { sheets: 5 })).done).toEqual([])
  expect(calls).toBe(0)
})

test('gallery: a full album is read again for the candidates a person seeded alone, and grows at most three past its target', async () => {
  const r = await root()
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  await mkdir(join(r, 'engine-state/gallery'), { recursive: true })
  const full = Array.from({ length: 100 }, (_, i) => ({ url: `https://media.aquatome.com/x/${i}.webp`, width: 1200, height: 800, licence: 'CC BY', author: 'a', sourceUrl: `https://x/${i}` }))
  await writeFile(join(r, 'content/gallery/betta-splendens.json'), JSON.stringify({ id: 'betta-splendens', photos: full, seen: 100, updatedAt: '2026-10-01' }))
  const cand = (n: number) => ({ key: `inat:${900 + n}`, url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${900 + n}/large.jpg`, width: 1024, height: 768, licence: 'CC BY', author: 'a', sourceUrl: `https://www.inaturalist.org/photos/${900 + n}` })
  // Five seeded, one the step queued itself: only the five are screened, and three of the kept go in.
  const queue = [1, 2, 3, 4, 5].map(cand)
  await writeFile(join(r, 'engine-state/gallery/betta-splendens.json'), JSON.stringify({ queue: [...queue, cand(6)], judged: [], hashes: {}, seeded: queue.map(c => c.key) }))
  let calls = 0
  const report = await galleries(r, deps({ http: async u => { calls++; return deps().http(u) } }), { sheets: 5 })
  expect(calls).toBe(0) // its sources aren't read
  const g = await read(r, 'content/gallery/betta-splendens.json')
  expect(g.photos).toHaveLength(103)
  expect(g.photos.filter((p: { unchecked?: boolean }) => p.unchecked)).toHaveLength(3) // waiting for the photo check
  expect(report.done).toEqual(['betta-splendens: 103/100 (+3)'])
  const st = await read(r, 'engine-state/gallery/betta-splendens.json')
  expect(st.queue.map((c: { key: string }) => c.key)).toEqual(['inat:906'])
  expect(st.seeded).toBeUndefined()
  // Nothing seeded is left: the next run leaves the full album alone.
  calls = 0
  expect((await galleries(r, deps({ http: async u => { calls++; return deps().http(u) } }), { sheets: 5 })).done).toEqual([])
  expect(calls).toBe(0)
})

test('gallery: rejected photos never come back and leave galleries; a usage limit stops the run', async () => {
  const r = await root()
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  const old = { url: 'https://media.aquatome.com/commons/old.webp', width: 1200, height: 800, licence: 'CC BY', author: 'a', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Old.jpg' }
  await writeFile(join(r, 'content/gallery/betta-splendens.json'), JSON.stringify({ id: 'betta-splendens', photos: [old], seen: 1, updatedAt: '2026-10-01' }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/large.jpg': 'person', [old.url]: 'not this fish' }))
  const stopped = await galleries(r, deps({ look: async () => { throw new LlmError('usage limit') } }), { sheets: 5 })
  expect(stopped.stopped).toMatch(/usage limit/)
  expect((await read(r, 'content/gallery/betta-splendens.json')).photos).toEqual([])
  // The run stopped mid-way: what it found waits in the queue for the next run; iNat 1 was never a candidate.
  const st = await read(r, 'engine-state/gallery/betta-splendens.json')
  expect(st.queue.map((c: { key: string }) => c.key)).toEqual(['File:A.jpg'])
  expect(st.judged).toEqual([])
})

test('gallery: a photo blocked after it moved to our bucket (a watermark) is known by its key there: never a candidate, out of the gallery', async () => {
  const r = await root()
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  const commons = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/A.jpg/1280px-A.jpg'
  const inat1 = 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/large.jpg'
  const hot = { url: 'https://live.staticflickr.com/1/99_abc_b.jpg', width: 1024, height: 683, licence: 'CC BY 2.0', author: 'a', sourceUrl: 'https://www.flickr.com/photos/x/99' }
  await writeFile(join(r, 'content/gallery/betta-splendens.json'), JSON.stringify({ id: 'betta-splendens', photos: [hot], seen: 1, updatedAt: '2026-10-01' }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify(Object.fromEntries([commons, inat1, hot.url].map(u => [`https://media.aquatome.com/${mirrorPlan(u)!.key}`, 'watermark: credit, bottom left']))))
  const looked: number[] = []
  await galleries(r, deps({ faces: async f => (looked.push(f.length), f.map(() => 0)) }), { sheets: 5 })
  expect(looked).toEqual([])
  expect(await readFile(join(r, 'content/gallery/betta-splendens.json'), 'utf8').then(t => JSON.parse(t).photos)).toEqual([])
})

test("gallery: a photo the photo check took off this page is never put back, from the queue or a search; another page's verdict doesn't count", async () => {
  const r = await root()
  const inat1 = 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/large.jpg'
  const commonsA = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/A.jpg/1280px-A.jpg'
  const queued = { url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/77/original.jpg', thumb: 'https://inaturalist-open-data.s3.amazonaws.com/photos/77/medium.jpg', width: 1332, height: 1776, licence: 'CC BY', author: 'a', sourceUrl: 'https://www.inaturalist.org/photos/77', key: 'inat:77' }
  await mkdir(join(r, 'engine-state/gallery'), { recursive: true })
  await writeFile(join(r, 'engine-state/gallery/betta-splendens.json'), JSON.stringify({ queue: [queued], judged: [], hashes: {} }))
  const verdict = (ok: string) => ({ ok, typical: false, note: 'looked at by eye' })
  await writeFile(join(r, 'engine-state/_photo-subjects.json'), JSON.stringify({
    [`https://media.aquatome.com/${mirrorPlan(queued.url)!.key}`]: { 'betta-splendens': verdict('other') },
    [`https://media.aquatome.com/${mirrorPlan(inat1)!.key}`]: { 'betta-splendens': verdict('none') },
    // Off another page only: fine here.
    [`https://media.aquatome.com/${mirrorPlan(commonsA)!.key}`]: { 'betta-imbellis': verdict('other') },
  }))
  await galleries(r, deps(), { sheets: 5 })
  const shown = urls(await read(r, 'content/gallery/betta-splendens.json'))
  expect(shown).not.toContain(queued.sourceUrl)
  expect(shown).not.toContain('https://www.inaturalist.org/photos/1')
  expect(shown.some(u => u.includes('commons.wikimedia.org'))).toBe(true)
})

test('gallery: the sheet budget stops the run; the next run continues from the queue and the cursor', async () => {
  const r = await root()
  await writeFile(join(r, 'content/species/betta-splendens/entity.json'), JSON.stringify({ scientificName: 'Betta splendens', photos: [] }))
  inatObs = { research: Array.from({ length: 30 }, (_, i) => obs(100 + i, 'cc-by')), 'needs_id,casual': [] }
  const pages: string[] = []
  const d = deps({ http: async u => { if (u.includes('/observations')) pages.push(new URL(u).searchParams.get('id_above')!); return deps().http(u) } })
  const first = await galleries(r, d, { sheets: 1 })
  expect(first.sheets).toBe(1)
  expect((await read(r, 'content/gallery/betta-splendens.json')).photos).toHaveLength(20)
  const st = await read(r, 'engine-state/gallery/betta-splendens.json')
  expect(st.queue.length).toBeGreaterThan(0)
  expect(st.exhausted).toBeUndefined()
  await galleries(r, d, { sheets: 1 })
  const g = await read(r, 'content/gallery/betta-splendens.json')
  expect(new Set(urls(g)).size).toBe(g.photos.length)
  expect(g.photos.length).toBeGreaterThanOrEqual(30)
  // iNaturalist was read from its cursor, not from the start.
  expect(pages.filter(p => p === '0').length).toBe(2) // research and agree passes, once each
}, 30_000)

test('gallery: a page short of target is read again only after 30 days; then iNaturalist continues past its cursor', async () => {
  const r = await root()
  await galleries(r, deps(), { sheets: 5 })
  let calls = 0
  const counting = deps({ http: async u => { calls++; return deps().http(u) } })
  expect((await galleries(r, counting, { sheets: 5 })).done).toEqual([])
  expect(calls).toBe(0)
  inatObs.research!.push(obs(40, 'cc0'))
  const later = await galleries(r, { ...counting, now: () => new Date('2026-12-05T00:00:00Z') }, { sheets: 5 })
  expect(later.added).toEqual({ iNaturalist: 1 })
  expect(urls(await read(r, 'content/gallery/betta-splendens.json'))).toContain('https://www.inaturalist.org/photos/40')
})

test('gallery: a page is not called dry while iNaturalist is unread (its requests ran out this run)', async () => {
  const r = await root()
  await galleries(r, deps(), { sheets: 5, budget: { inat: 0 } })
  const st = await read(r, 'engine-state/gallery/betta-splendens.json')
  expect(st.inat).toBeUndefined()
  expect(st.commons).toBe('2026-10-30')
  expect(st.exhausted).toBeUndefined()
  expect((await galleries(r, deps(), { sheets: 5 })).added).toEqual({ iNaturalist: 1 })
})

test('gallery: Openverse rests for the run after 3 failures (it stalls at times); the pages are not called dry', async () => {
  const r = await root()
  for (const id of ['aaa-one', 'bbb-two', 'ccc-three', 'ddd-four']) {
    await mkdir(join(r, 'content/species', id), { recursive: true })
    await writeFile(join(r, 'content/species', id, 'entity.json'), JSON.stringify({ scientificName: 'Betta splendens', photos: [], sections: [] }))
  }
  let calls = 0
  await galleries(r, { ...deps(), openverse: async () => { calls++; throw new Error('The operation was aborted due to timeout') } }, { sheets: 50 })
  expect(calls).toBe(3)
  expect((await read(r, 'engine-state/gallery/ddd-four.json')).exhausted).toBeUndefined()
})

test('gallery: a near-copy of a photo already shown (same picture, another address) is dropped before screening', async () => {
  const r = await root()
  await writeFile(join(r, 'content/species/betta-splendens/entity.json'), JSON.stringify({ scientificName: 'Betta splendens', photos: [{ url: 'https://media.aquatome.com/seriouslyfish/a.webp', sourceUrl: 'https://sf/a' }] }))
  same.set('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/A.jpg/500px-A.jpg', 'https://media.aquatome.com/seriouslyfish/a.webp')
  const sheets: number[] = []
  await galleries(r, deps({ look: async (f, p) => { const v = await keepAll(f, p, 1); sheets.push(1); return v } }), { sheets: 5 })
  expect(urls(await read(r, 'content/gallery/betta-splendens.json'))).toEqual(['https://www.inaturalist.org/photos/1'])
})

test('gallery: an old gallery\'s Commons photos count as judged (the old step screened them all)', async () => {
  const r = await root()
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  const old = { url: 'https://media.aquatome.com/commons/b.webp', width: 1200, height: 800, licence: 'CC BY-SA 4.0', author: 'a', sourceUrl: 'https://commons.wikimedia.org/wiki/File:B.jpg' }
  await writeFile(join(r, 'content/gallery/betta-splendens.json'), JSON.stringify({ id: 'betta-splendens', photos: [old], seen: 3, updatedAt: '2026-10-01', builtAt: '2026-10-01' }))
  const looked: number[] = []
  await galleries(r, deps({ look: async (f, p) => { looked.push(1); return keepAll(f, p, 1) } }), { sheets: 5 })
  const g = await read(r, 'content/gallery/betta-splendens.json')
  // iNat 1 screened and added (best-less, tagged); Commons A judged without a sheet; the old photo kept.
  expect(urls(g)).toEqual([old.sourceUrl, 'https://www.inaturalist.org/photos/1'])
  expect(looked).toHaveLength(1)
  expect((await read(r, 'engine-state/gallery/betta-splendens.json')).judged).toContain('File:A.jpg')
})

test('gallery: a plant gets the plant prompt and its tier\'s target', async () => {
  const r = await root()
  await rm(join(r, 'content/species'), { recursive: true })
  await mkdir(join(r, 'content/plants/anubias-barteri'), { recursive: true })
  await writeFile(join(r, 'content/plants/anubias-barteri/entity.json'), JSON.stringify({ scientificName: 'Betta splendens', photos: [], sections: [{ source: 'tropica' }] }))
  await writeFile(join(r, 'content/plants/anubias-barteri/vi.json'), JSON.stringify({ name: 'Cây ráy' }))
  const prompts: string[] = []
  const report = await galleries(r, deps({ look: async (f, p) => { prompts.push(p); return keepAll(f, p) } }), { sheets: 5 })
  expect(prompts[0]).toMatch(/aquarium plant .*Cây ráy/)
  expect(prompts[0]).toMatch(/herbarium/)
  expect(report.done).toEqual(['anubias-barteri: 3/20 (+3)'])
})

test('gallery: a plant cultivar keeps to its own name (no species fallback, no GBIF) and is screened as that form; a variety is found as iNaturalist writes it', async () => {
  const r = await root()
  await rm(join(r, 'content/species'), { recursive: true })
  const plant = async (id: string, sci: string) => {
    await mkdir(join(r, 'content/plants', id), { recursive: true })
    await writeFile(join(r, 'content/plants', id, 'entity.json'), JSON.stringify({ scientificName: sci, photos: [], sections: [] }))
  }
  await plant('anubias-mini-coin', "Anubias barteri 'Mini Coin'")
  await plant('anubias-nana', 'Anubias barteri var. nana')
  await writeFile(join(r, 'engine-state/_gbif-names.json'), JSON.stringify({ "Anubias barteri 'Mini Coin'": { canonicalName: 'Anubias barteri' } }))
  const asked: string[] = []
  const prompts: string[] = []
  await galleries(r, deps({
    http: async u => {
      const q = new URL(u).searchParams
      if (u.includes('/taxa?')) { asked.push(q.get('q')!); return { results: q.get('q') === 'Anubias barteri nana' ? [{ id: 604733, name: 'Anubias barteri nana', rank: 'variety' }] : [] } }
      if (u.includes('gbif.org')) { asked.push(`gbif:${q.get('name') ?? q.get('taxonKey')}`); return gbif(u) }
      return deps().http(u)
    },
    look: async (f, p) => { prompts.push(p); return keepAll(f, p, 1) },
  }), { sheets: 5 })
  expect(asked).toEqual(["Anubias barteri 'Mini Coin'", 'Anubias barteri var. nana', 'Anubias barteri nana', 'gbif:Anubias barteri var. nana'])
  expect((await read(r, 'engine-state/gallery/anubias-mini-coin.json')).gbif).toEqual({ key: null, next: 0 })
  expect((await read(r, 'engine-state/gallery/anubias-nana.json')).inat.taxon).toBe(604733)
  // Screened as that form alone.
  const cand = { key: 'x', url: 'https://x/1.jpg', width: 1000, height: 800, licence: 'CC BY', author: 'a', sourceUrl: 'https://x/1' }
  await screenTagged([cand], "Anubias barteri 'Mini Coin'", 'Ráy Mini Coin', deps({ look: async (f, p) => { prompts.push(p); return keepAll(f, p, 1) } }), { plant: true, strict: true })
  expect(prompts.at(-1)).toMatch(/Mini Coin' is a cultivar or trade form: keep only photos of it/)
})

test('a photo that does not decode is skipped instead of breaking the contact sheet', async () => {
  const r = await root()
  let n = 0
  const report = await galleries(r, deps({ get: async u => (n++ === 0 ? new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01]) : new Uint8Array(await picture(u))), look: async (f, p) => keepAll(f, p, 1) }), { sheets: 5 })
  expect(report.done).toEqual(['betta-splendens: 1/100 (+1)'])
})

test('gallery order: the best picks first, mixed by kind, largest first; then older photos; then the rest, mixed', () => {
  const p = (id: string, o: Partial<GalleryPhoto> = {}): GalleryPhoto => ({ url: id, width: 1000, height: 800, licence: 'CC BY', author: 'a', sourceUrl: id, ...o })
  const ranked = rankGallery([
    p('old1'), p('m1', { kind: 'male' }), p('f-best', { kind: 'female', best: true }), p('m-best', { kind: 'male', best: true }),
    p('m-best-big', { kind: 'male', best: true, width: 1200 }), p('old2'), p('hab', { kind: 'habitat' }), p('f1', { kind: 'female' }),
  ])
  expect(ranked.map(x => x.url)).toEqual(['m-best-big', 'f-best', 'm-best', 'old1', 'old2', 'm1', 'f1', 'hab'])
})

test('dhash: the same picture resized or re-encoded hashes alike; another picture does not', async () => {
  const shapes = (cx: number) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#246"/><circle cx="${cx}" cy="150" r="90" fill="#fc6"/><rect x="${400 - cx}" y="40" width="60" height="200" fill="#9cf"/></svg>`)).jpeg().toBuffer()
  const a = await shapes(120)
  const small = await sharp(a).resize(160).png().toBuffer()
  const b = await shapes(300)
  const bits = (x: string, y: string) => [...(BigInt(`0x${x}`) ^ BigInt(`0x${y}`)).toString(2)].filter(c => c === '1').length
  expect(bits(await dhash(a), await dhash(small))).toBeLessThanOrEqual(6)
  expect(bits(await dhash(a), await dhash(b))).toBeGreaterThan(6)
})

test('commons author: the "(talk)" link beside a user name is not part of the name', async () => {
  const { authorText } = await import('../src/wiki-author')
  expect(authorText('<a href="//vi.wikipedia.org/wiki/User:Duyphuong">Duyphuong</a> (<a href="//vi.wikipedia.org/wiki/User_talk:Duyphuong">thảo luận</a>)')).toBe('Duyphuong')
  expect(authorText('Hasemania_4.jpg: Filtropat derivative work: <a>Kyknos</a> (<a>talk</a>)')).toBe('Hasemania_4.jpg: Filtropat derivative work: Kyknos')
  expect(authorText('--<a>Nightflyer</a> (<a>talk</a>) 19:58, 7 October 2019 (UTC)')).toBe('Nightflyer')
  expect(authorText('<a>Neale_Monks</a> (<a>talk</a>) (<a>Uploads</a>)')).toBe('Neale_Monks')
  expect(authorText('Ann (photographer)')).toBe('Ann (photographer)')
})

/** A breed's page: no scientific name; its research's English and trade names (engine-state/breeds), as makeBreed keeps them. */
async function breedPage(r: string, id: string, o: { enNames?: string[]; photos?: { url: string; sourceUrl: string }[]; vi?: string } = {}) {
  await mkdir(join(r, 'content/breeds', id), { recursive: true })
  const photos = (o.photos ?? []).map(p => ({ width: 1280, height: 960, licence: 'CC BY-SA 4.0', author: 'a', ...p }))
  await writeFile(join(r, 'content/breeds', id, 'entity.json'), JSON.stringify({ id, kind: 'variety', parents: [], care: {}, photos, sources: [{ url: 'https://a.example/x', title: 'A', kind: 'article', at: '2026-10-01' }, { url: 'https://b.example/y', title: 'B', kind: 'shop', at: '2026-10-01' }], updatedAt: '2026-10-01' }))
  await writeFile(join(r, 'content/breeds', id, 'vi.json'), JSON.stringify({ slug: `ca-${id}`, name: o.vi ?? id, altNames: [], sections: {}, quality: { score: 0.9, indexable: true } }))
  if (o.enNames) {
    await mkdir(join(r, 'engine-state/breeds'), { recursive: true })
    await writeFile(join(r, 'engine-state/breeds', `${id}.json`), JSON.stringify({ found: true, enNames: o.enNames }))
  }
}
const molly = (r: string) => breedPage(r, 'balloon-molly', {
  enNames: ['Balloon molly', 'Balloon belly molly', 'Belly molly', 'Molly'], vi: 'Cá bình tích balloon (Balloon molly)',
  photos: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Page.jpg/1280px-Page.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Page.jpg' }],
})
/** Commons for the balloon molly: no category of its own; a search for its first name's words finds two files (one NC), each phrase one more. */
const breedCommons = (asked: string[]) => async (u: string) => {
  const q = new URL(u).searchParams
  if (q.get('list') === 'categorymembers') { asked.push(q.get('cmtitle')!); return { query: { categorymembers: [] } } }
  if (q.get('list') === 'search') {
    asked.push(q.get('srsearch')!)
    const hits: Record<string, string[]> = { 'filetype:bitmap Balloon molly': ['File:BM1.jpg', 'File:BM-nc.jpg', 'File:Page.jpg'], 'filetype:bitmap "Balloon belly molly"': ['File:BM2.jpg'], 'filetype:bitmap "Belly molly"': ['File:BM2.jpg', 'File:BM3.jpg'] }
    return { query: { search: (hits[q.get('srsearch')!] ?? []).map(title => ({ title })) } }
  }
  const all: Record<string, unknown> = Object.fromEntries(['File:BM1.jpg', 'File:BM2.jpg', 'File:BM3.jpg', 'File:Page.jpg'].map(t => [t, info(t, 'CC BY-SA 4.0')]))
  all['File:BM-nc.jpg'] = info('File:BM-nc.jpg', 'CC BY-NC 2.0')
  return { query: { pages: Object.fromEntries(q.get('titles')!.split('|').filter(t => all[t]).map((t, i) => [String(i), all[t]])) } }
}
/** Openverse: one Flickr photo for any query. */
const flickr = (queries: string[]): GalleryDeps['openverse'] => async u => {
  queries.push(new URL(u).searchParams.get('q')!)
  return { json: { page_count: 1, results: [{ id: 'f1', url: 'https://live.staticflickr.com/65535/4242_abcdef.jpg', creator: 'Ann', license: 'by', license_version: '2.0', foreign_landing_url: 'https://www.flickr.com/photos/ann/4242', width: 2000, height: 1500, source: 'flickr' }] }, remaining: 100 }
}
const breedDeps = (asked: string[], queries: string[], over: Partial<GalleryDeps> = {}) => deps({
  http: async u => { asked.push(u); if (/inaturalist|gbif/.test(u)) throw new Error(`asked a species source: ${u}`); return breedCommons(asked)(u) },
  openverse: flickr(queries), ...over,
})

test('breed names: its English and trade names, a bracketed note dropped; not a single word but its own, nor another breed\'s name; its id\'s words without research', async () => {
  const r = await mkdtemp(join(tmpdir(), 'aq-breed-names-'))
  await molly(r)
  await breedPage(r, 'koi', { enNames: ['Koi', 'Nishikigoi', 'Japanese koi', 'Butterfly koi (long-finned form)', 'japanese KOI'] })
  await breedPage(r, 'butterfly-koi', { enNames: ['Butterfly koi', 'Longfin koi'] })
  await breedPage(r, 'mickey-mouse-platy')
  expect(await breedNames(r, 'balloon-molly')).toEqual(['Balloon molly', 'Balloon belly molly', 'Belly molly'])
  expect(await breedNames(r, 'koi')).toEqual(['Koi', 'Japanese koi'])
  expect(await breedNames(r, 'mickey-mouse-platy')).toEqual(['mickey mouse platy'])
})

test('a breed: candidates from its English and trade names on Commons and Openverse, never iNaturalist or GBIF; screened as that line alone; its gallery and state written', async () => {
  const r = await mkdtemp(join(tmpdir(), 'aq-breed-gallery-'))
  await mkdir(join(r, 'engine-state'), { recursive: true })
  await molly(r)
  const asked: string[] = []
  const queries: string[] = []
  const prompts: string[] = []
  const report = await galleries(r, breedDeps(asked, queries, { look: async (f, p) => { prompts.push(p); return keepAll(f, p, 4) } }), { sheets: 5 })
  expect(asked.filter(u => /inaturalist|gbif/.test(u))).toEqual([])
  // Its first name's words (no category of its own), then each name as a phrase; never "Molly" alone, never the Vietnamese name.
  expect(asked.filter(a => a.startsWith('filetype:'))).toEqual(['filetype:bitmap Balloon molly', 'filetype:bitmap "Balloon belly molly"', 'filetype:bitmap "Belly molly"'])
  expect(asked.filter(a => a.startsWith('Category:'))).toEqual(['Category:Balloon molly', 'Category:Balloon belly molly', 'Category:Belly molly'])
  expect(queries).toEqual(['"Balloon molly"'])
  // Screened as that line, by its English name and its Vietnamese one without the English in brackets.
  expect(prompts[0]).toContain('Numbered photos that may show Balloon molly (Cá bình tích balloon), for a photo gallery')
  expect(prompts[0]).toContain('Balloon molly is a man-made line or hybrid: keep only photos of it, not the plain species or other varieties')
  // Open licences only, the page's own photo left out; the Commons finds, then Flickr.
  const g = GallerySchema.parse(await read(r, 'content/gallery/balloon-molly.json'))
  expect(g.photos.map(p => p.sourceUrl).sort()).toEqual(['https://commons.wikimedia.org/wiki/File:BM1.jpg', 'https://commons.wikimedia.org/wiki/File:BM2.jpg', 'https://commons.wikimedia.org/wiki/File:BM3.jpg', 'https://www.flickr.com/photos/ann/4242'])
  expect(report.added).toEqual({ 'Wikimedia Commons': 3, 'Openverse (Flickr)': 1 })
  // A popular breed's target (POPULAR_BREEDS: a shop's 60); every source read short of it, so it rests a month.
  expect(report.done).toEqual(['balloon-molly: 4/60 (+4)'])
  const st = await read(r, 'engine-state/gallery/balloon-molly.json')
  expect(st).toMatchObject({ commons: '2026-10-30', openverse: { next: null }, queue: [], exhausted: '2026-10-30' })
  expect(st.inat).toBeUndefined()
  expect(st.gbif).toBeUndefined()
  const review = await readFile(join(r, 'docs/review/galleries.md'), 'utf8')
  expect(review).toContain('| Tier | Target | Species | Plants | Breeds | At target | Below |')
  expect(review).toContain('| shop | 60 | 0 | 0 | 1 | 0 | 1 |')
  expect(review).toContain('| breeds/balloon-molly | shop | 4 | 60 |')
})

test('a breed: a photo another breed\'s page shows is not a candidate; its old gallery\'s Commons finds are screened, not counted as judged', async () => {
  const r = await mkdtemp(join(tmpdir(), 'aq-breed-gallery-'))
  await mkdir(join(r, 'engine-state'), { recursive: true })
  await molly(r)
  // The platy's page shows BM2 already; the molly has a gallery the breed step made (no state yet).
  await breedPage(r, 'mickey-mouse-platy', { photos: [{ url: 'https://media.aquatome.com/commons/bm2.webp', sourceUrl: 'https://commons.wikimedia.org/wiki/File:BM2.jpg' }] })
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  const old = { url: 'https://media.aquatome.com/commons/old.webp', width: 1200, height: 800, licence: 'CC BY-SA 4.0', author: 'a', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Old.jpg' }
  await writeFile(join(r, 'content/gallery/balloon-molly.json'), JSON.stringify({ id: 'balloon-molly', photos: [old], seen: 5, updatedAt: '2026-10-01' }))
  const screened: string[] = []
  await galleries(r, breedDeps([], [], { get: async u => { screened.push(u); return new Uint8Array(await picture(u)) } }), { sheets: 5, only: 'balloon-molly' })
  expect(screened.some(u => u.includes('BM2.jpg'))).toBe(false)
  const g = await read(r, 'content/gallery/balloon-molly.json')
  expect(urls(g)).toEqual(expect.arrayContaining([old.sourceUrl, 'https://commons.wikimedia.org/wiki/File:BM1.jpg', 'https://commons.wikimedia.org/wiki/File:BM3.jpg']))
  expect(urls(g)).not.toContain('https://commons.wikimedia.org/wiki/File:BM2.jpg')
})

test('a breed\'s gallery as the step writes it is the one the site loads for that breed', async () => {
  const r = await mkdtemp(join(tmpdir(), 'aq-breed-gallery-'))
  await cp(new URL('../../../apps/site/test/fixture-content', import.meta.url), join(r, 'content'), { recursive: true })
  await mkdir(join(r, 'engine-state'), { recursive: true })
  await molly(r)
  await galleries(r, breedDeps([], []), { sheets: 5, only: 'balloon-molly' })
  const written = await read(r, 'content/gallery/balloon-molly.json')
  const c = await loadAll({ root: join(r, 'content'), lang: 'vi', publicBuild: false })
  expect(c.breeds.map(b => b.id)).toContain('balloon-molly')
  // What the step just added waits for the photo check, so no page shows it yet.
  const photos = written.photos as { sourceUrl: string; unchecked?: boolean }[]
  expect(photos.map(p => !!p.unchecked)).toEqual([true, true, true, true])
  expect(c.galleries['balloon-molly']).toBeUndefined()
  // Judged and left on, a photo loses the mark (photo-check.ts), and the site loads the gallery as the step wrote it.
  await writeFile(join(r, 'content/gallery/balloon-molly.json'), JSON.stringify({ ...written, photos: photos.map(({ unchecked: _, ...p }) => p) }))
  const after = await loadAll({ root: join(r, 'content'), lang: 'vi', publicBuild: false })
  expect(after.galleries['balloon-molly']!.map(p => p.sourceUrl)).toEqual(urls(written))
  expect(after.galleries['balloon-molly']).toHaveLength(4)
})
