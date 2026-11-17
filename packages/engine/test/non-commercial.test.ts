import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IMAGE_SWITCHES, isAllowedLicence, type Photo } from '@aq/schema'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { galleries, rankGallery, type GalleryDeps, type GalleryPhoto, type Vet } from '../src/gallery'
import { inatLicence, inatNcPage } from '../src/inat'
import { leadChoice } from '../src/lead-photo'
import { mirrorPhotos, type MirrorDeps } from '../src/mirror-photos'
import { openverseLicence } from '../src/openverse'
import { searchCommons } from '../src/photos'
import { sweep } from '../src/sweep'

/**
 * iNaturalist album photos under CC BY-NC or CC BY-NC-SA (the owner's yes, 10 Nov), behind IMAGE_SWITCHES.inatNonCommercial,
 * on since 17 Nov. Fixtures only: no request leaves the test.
 */
const ON = { ...IMAGE_SWITCHES, inatNonCommercial: true }
const OFF = { ...IMAGE_SWITCHES, inatNonCommercial: false }
const ID = 'testus-sampletownensis', SCI = 'Testus sampletownensis'

// iNaturalist, answering every observation whatever the request's licence and grade: the engine must sort them itself.
type Obs = { id: number; quality_grade: string; community_taxon_id: number; num_identification_agreements: number; taxon: { id: number }; user: { login: string }; photos: { id: number; url: string; license_code: string | null; original_dimensions: { width: number; height: number } }[] }
const obs = (id: number, licence: string | null, grade = 'research'): Obs => ({
  id, quality_grade: grade, community_taxon_id: 7, num_identification_agreements: 1, taxon: { id: 7 }, user: { login: 'sampletown' },
  photos: [{ id, url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/square.jpg`, license_code: licence, original_dimensions: { width: 2048, height: 1536 } }],
})
const OBS = [obs(1, 'cc-by'), obs(2, 'cc-by-nc'), obs(3, 'cc-by-nc-sa'), obs(4, 'cc-by-nd'), obs(5, 'cc-by-nc-nd'), obs(6, null), obs(8, 'cc-by-nc', 'casual')]
const inatPage = (u: string) => ({ results: OBS.filter(o => o.id > Number(new URL(u).searchParams.get('id_above'))) })

// Commons: file A open, file B CC BY-NC. Openverse: Flickr photo 111 open, 222 CC BY-NC.
const info = (title: string, licence: string) => ({
  title, imageinfo: [{ width: 2000, mime: 'image/jpeg', thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${title.slice(5)}/1280px-${title.slice(5)}`, thumbwidth: 1280, thumbheight: 960, descriptionurl: `https://commons.wikimedia.org/wiki/${title}`, extmetadata: { LicenseShortName: { value: licence }, Artist: { value: 'Sampletown' } } }],
})
const COMMONS: Record<string, ReturnType<typeof info>> = { 'File:A.jpg': info('File:A.jpg', 'CC BY-SA 4.0'), 'File:B.jpg': info('File:B.jpg', 'CC BY-NC 2.0') }
const commons = (u: string) => {
  const q = new URL(u).searchParams
  if (q.get('list') === 'categorymembers') return { query: { categorymembers: q.get('cmtitle') === `Category:${SCI}` ? [{ ns: 6, title: 'File:A.jpg' }, { ns: 6, title: 'File:B.jpg' }] : [] } }
  if (q.get('list') === 'search') return { query: { search: [] } }
  return { query: { pages: Object.fromEntries(q.get('titles')!.split('|').filter(t => COMMONS[t]).map((t, i) => [String(i), COMMONS[t]])) } }
}
const flickr = (id: string, license: string) => ({ id, url: `https://live.staticflickr.com/1/${id}_abc.jpg`, creator: 'Sampletown', license, license_version: '2.0', foreign_landing_url: `https://www.flickr.com/photos/sampletown/${id}`, width: 1600, height: 1200, source: 'flickr' })

const picture = (url: string) => {
  let x = [...url].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
  const px = Buffer.alloc(64 * 48 * 3)
  for (let i = 0; i < px.length; i++) { x = (x * 1103515245 + 12345) >>> 0; px[i] = x >>> 24 }
  return sharp(px, { raw: { width: 64, height: 48, channels: 3 } }).jpeg().toBuffer()
}
const keepAll = async (): Promise<Vet> => ({ keep: Array.from({ length: 20 }, (_, i) => ({ n: i + 1, caption: `ảnh ${i + 1}`, kind: 'male' })), best: [] })
function deps(calls: string[], now = '2026-11-16T00:00:00Z'): GalleryDeps {
  return {
    http: async u => {
      calls.push(u)
      if (u.includes('inaturalist')) return u.includes('/taxa?') ? { results: [{ id: 7, name: SCI, rank: 'species' }] } : inatPage(u)
      if (u.includes('gbif.org')) return u.includes('/species/match') ? { matchType: 'NONE' } : { results: [], endOfRecords: true }
      return commons(u)
    },
    openverse: async u => { calls.push(u); return { json: { results: [flickr('111', 'by'), flickr('222', 'by-nc')], page_count: 1 }, remaining: 100 } },
    get: async u => new Uint8Array(await picture(u)),
    faces: async files => files.map(() => 0),
    look: keepAll,
    sleep: async () => {},
    now: () => new Date(now),
  }
}
async function root() {
  const r = await mkdtemp(join(tmpdir(), 'aq-nc-'))
  await mkdir(join(r, `content/species/${ID}`), { recursive: true })
  await mkdir(join(r, 'engine-state'), { recursive: true })
  await writeFile(join(r, `content/species/${ID}/entity.json`), JSON.stringify({ scientificName: SCI, photos: [] }))
  await writeFile(join(r, `content/species/${ID}/vi.json`), JSON.stringify({ name: 'Cá Sampletown' }))
  return r
}
const read = async (r: string, f: string) => JSON.parse(await readFile(join(r, f), 'utf8'))
const album = async (r: string) => (await read(r, `content/gallery/${ID}.json`)).photos as GalleryPhoto[]
const INAT = (id: number) => `https://www.inaturalist.org/photos/${id}`

test('iNaturalist\'s non-commercial page: research grade only, CC BY-NC and CC BY-NC-SA only, credited with the licence; the open map is unchanged', async () => {
  const calls: string[] = []
  const p = await inatNcPage(7, { after: 0 }, async u => { calls.push(u); return inatPage(u) })
  expect(calls).toHaveLength(1)
  const q = new URL(calls[0]!).searchParams
  expect(q.get('photo_license')).toBe('cc-by-nc,cc-by-nc-sa')
  expect(q.get('quality_grade')).toBe('research')
  // 1: open (the open pass has it); 4: ND; 5: NC-ND; 6: all rights reserved; 8: casual.
  expect(p.cands.map(c => [c.key, c.licence, c.sourceUrl])).toEqual([['inat:2', 'CC BY-NC', INAT(2)], ['inat:3', 'CC BY-NC-SA', INAT(3)]])
  expect(p.cursor).toEqual({ after: 8, done: true })
  expect((await inatNcPage(7, p.cursor, async () => { throw new Error('read again') })).cands).toEqual([])
  expect((await inatNcPage(null, { after: 0 }, async () => { throw new Error('no taxon') })).cursor.done).toBe(true)
  expect(['cc-by-nc', 'cc-by-nc-sa', 'cc-by-nd', 'cc-by-nc-nd', null].map(inatLicence)).toEqual(Array(5).fill(undefined))
})

test('switch off: no non-commercial photo is asked for or taken; on: iNaturalist\'s BY-NC and BY-NC-SA come in last and rank after the open ones, while Commons\', Openverse\'s, ND, NC-ND, all-rights-reserved and casual ones stay out', async () => {
  const r = await root()
  const calls: string[] = []
  await galleries(r, deps(calls), { sheets: 5, switches: OFF })
  expect((await album(r)).map(p => p.sourceUrl).sort()).toEqual([INAT(1), 'https://commons.wikimedia.org/wiki/File:A.jpg', 'https://www.flickr.com/photos/sampletown/111'].sort())
  expect(calls.some(u => u.includes('cc-by-nc'))).toBe(false)
  const st = await read(r, `engine-state/gallery/${ID}.json`)
  expect(st.inatNc).toBeUndefined()
  expect(st.exhausted).toBe('2026-11-16') // every source read: dry

  // The switch on, but iNaturalist's requests for the run spent: the page stays dry from the same day, the pass to come.
  await galleries(r, deps([], '2026-11-17T00:00:00Z'), { sheets: 5, switches: ON, budget: { inat: 0 } })
  const spent = await read(r, `engine-state/gallery/${ID}.json`)
  expect(spent.exhausted).toBe('2026-11-16')
  expect(spent.inatNc).toBeUndefined()
  // On the next day: a page dry before the switch went on has never read the non-commercial pass, so it is read now.
  calls.length = 0
  const report = await galleries(r, deps(calls, '2026-11-17T00:00:00Z'), { sheets: 5, switches: ON })
  expect(report.added).toEqual({ iNaturalist: 2 })
  expect(calls.filter(u => u.includes('/observations?'))).toHaveLength(1)
  expect(new URL(calls.find(u => u.includes('/observations?'))!).searchParams.get('quality_grade')).toBe('research')
  const photos = await album(r)
  expect(photos.map(p => [p.sourceUrl, p.licence]).slice(-2)).toEqual([[INAT(2), 'CC BY-NC'], [INAT(3), 'CC BY-NC-SA']])
  expect(photos.slice(0, -2).every(p => isAllowedLicence(p.licence))).toBe(true)
  // Waiting for the photo check, like any album photo.
  expect(photos.slice(-2).every(p => p.unchecked)).toBe(true)
  // Dry again, from the day the open sources ran dry: their month to the next read isn't put back.
  expect(await read(r, `engine-state/gallery/${ID}.json`)).toMatchObject({ inatNc: { after: 8, done: true }, exhausted: '2026-11-16' })

  // A page read from the start with the switch on takes the same, in one run.
  const fresh = await root()
  await galleries(fresh, deps([]), { sheets: 5, switches: ON })
  const all = await album(fresh)
  expect(all.map(p => p.sourceUrl).slice(-2)).toEqual([INAT(2), INAT(3)])
  expect(all.map(p => p.sourceUrl)).not.toContain('https://commons.wikimedia.org/wiki/File:B.jpg')
  expect(all.map(p => p.sourceUrl)).not.toContain('https://www.flickr.com/photos/sampletown/222')
  for (const id of [4, 5, 6, 8]) expect(all.map(p => p.sourceUrl)).not.toContain(INAT(id))

  // The other paths keep refusing NC, whatever the switch says: Commons' search for a page's photos, Openverse's licences.
  const nc = { query: { pages: { 0: { index: 1, ...info('File:B.jpg', 'CC BY-NC 2.0') }, 1: { index: 2, ...info('File:A.jpg', 'CC BY-SA 4.0') } } } }
  expect((await searchCommons('"Testus sampletownensis"', async () => nc, 6)).map(p => p.licence)).toEqual(['CC BY-SA 4.0'])
  expect(['by-nc', 'by-nc-sa', 'by-nd', 'by-nc-nd'].map(l => openverseLicence(l, '4.0'))).toEqual(Array(4).fill(undefined))
})

test('switch off after on: a non-commercial candidate still queued is never screened or added', async () => {
  const r = await root()
  await mkdir(join(r, 'engine-state/gallery'), { recursive: true })
  const queued = { key: 'inat:2', url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/2/large.jpg', thumb: 'https://inaturalist-open-data.s3.amazonaws.com/photos/2/medium.jpg', width: 1024, height: 768, licence: 'CC BY-NC', author: 'sampletown', sourceUrl: INAT(2) }
  await writeFile(join(r, `engine-state/gallery/${ID}.json`), JSON.stringify({ queue: [queued], judged: [], hashes: {}, inatNc: { after: 2 } }))
  await galleries(r, deps([]), { sheets: 5, switches: OFF })
  expect((await album(r)).map(p => p.sourceUrl)).not.toContain(INAT(2))
  const st = await read(r, `engine-state/gallery/${ID}.json`)
  expect(st.judged).not.toContain('inat:2')
  expect(st.queue.map((c: { key: string }) => c.key)).not.toContain('inat:2')
})

test('album order: non-commercial photos after every open one, AI pictures last; a second pass changes nothing', () => {
  const p = (n: string, licence: string, extra: Partial<GalleryPhoto> = {}): GalleryPhoto => ({ url: `https://media.aquatome.com/g/${n}.webp`, width: 1024, height: 768, licence, author: 'Sampletown', sourceUrl: `https://example.org/${n}`, kind: 'male', ...extra })
  const ai = p('ai', 'AI-generated', { generated: { model: 'm', driverModel: 'd', date: '2026-11-16', prompt: 'fish', referenceHash: 'a'.repeat(64) } })
  const photos = [p('nc1', 'CC BY-NC', { best: true }), p('open1', 'CC BY'), ai, p('nc2', 'CC BY-NC-SA'), p('open2', 'CC0', { best: true })]
  const once = rankGallery(photos)
  expect(once.map(x => x.url.split('/').pop())).toEqual(['open2.webp', 'open1.webp', 'nc1.webp', 'nc2.webp', 'ai.webp'])
  expect(rankGallery(once)).toEqual(once)
})

test('a non-commercial album photo never leads a page', () => {
  const p = (n: string, licence: string, width = 1600): Photo => ({ url: `https://media.aquatome.com/g/${n}.webp`, width, height: 1400, licence, author: 'Sampletown', sourceUrl: INAT(1) })
  expect(leadChoice([], [p('nc', 'CC BY-NC'), p('open', 'CC BY', 900)], () => true, {})).toEqual({ lead: p('open', 'CC BY', 900) })
  expect(leadChoice([], [p('nc', 'CC BY-NC')], () => true, {})).toBeUndefined()
})

const photo = (id: number, licence: string, o: Partial<Photo> = {}): Photo => ({ url: `https://media.aquatome.com/inaturalist/${id}.webp`, width: 1024, height: 768, licence, author: 'Sampletown', sourceUrl: INAT(id), caption: SCI, ...o })
async function swept() {
  const r = await mkdtemp(join(tmpdir(), 'aq-nc-sweep-'))
  const c = join(r, 'content')
  const put = async (path: string, data: unknown) => { await mkdir(join(c, path, '..'), { recursive: true }); await writeFile(join(c, path), `${JSON.stringify(data, null, 2)}\n`) }
  await mkdir(join(r, 'engine-state'), { recursive: true })
  await mkdir(c, { recursive: true })
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(c, 'sources.json'))
  const sections = [{ key: 'distribution', source: 'seriouslyfish', sourceUrl: 'https://www.seriouslyfish.com/x', html: '<p>Rivers.</p>' }]
  await put(`species/${ID}/entity.json`, { id: ID, scientificName: SCI, order: 'O', family: 'F', genus: 'Testus', group: 'g', places: [], dataCard: {}, sections, photos: [photo(10, 'CC BY'), photo(11, 'CC BY-NC')], videos: [], productSlots: [], updatedAt: '2026-11-16' })
  await put(`species/${ID}/vi.json`, { slug: 'ca-sampletown', name: 'Cá Sampletown', altNames: [], sections: { 'distribution:seriouslyfish': '<p>Sông.</p>' }, quality: { score: 0.9, indexable: true } })
  await put(`gallery/${ID}.json`, { id: ID, photos: [photo(1, 'CC BY'), photo(2, 'CC BY-NC'), photo(3, 'CC BY-NC-SA 4.0'), photo(9, 'CC BY-NC 2.0', { sourceUrl: 'https://commons.wikimedia.org/wiki/File:B.jpg' })], seen: 4, updatedAt: '2026-11-16' })
  return r
}

test('switch off after on: the sweep takes every non-commercial photo off every album and page in one step; on, it keeps only iNaturalist\'s album ones', async () => {
  const on = await swept()
  const kept = await sweep(on, { switches: ON })
  expect((await read(on, `content/gallery/${ID}.json`)).photos.map((p: Photo) => p.sourceUrl)).toEqual([INAT(1), INAT(2), INAT(3)])
  expect((await read(on, `content/species/${ID}/entity.json`)).photos.map((p: Photo) => p.sourceUrl)).toEqual([INAT(10)])
  expect(kept.nonCommercial.sort()).toEqual([`gallery/${ID}.json: ${photo(9, '').url}`, `species/${ID}/entity.json: ${photo(11, '').url}`].sort())

  const r = await swept()
  const report = await sweep(r)
  expect((await read(r, `content/gallery/${ID}.json`)).photos.map((p: Photo) => p.sourceUrl)).toEqual([INAT(1)])
  expect((await read(r, `content/species/${ID}/entity.json`)).photos.map((p: Photo) => p.sourceUrl)).toEqual([INAT(10)])
  expect(report.nonCommercial).toHaveLength(4)
  expect(report.files).toEqual(expect.arrayContaining([`gallery/${ID}.json`, `species/${ID}/entity.json`]))
  expect((await sweep(r)).nonCommercial).toEqual([])
})

test('the mirror copies a non-commercial photo only where the site shows it: an iNaturalist album photo, the switch on', async () => {
  const hot = (id: number) => `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/large.jpg`
  const make = async () => {
    const r = await mkdtemp(join(tmpdir(), 'aq-nc-mirror-'))
    await mkdir(join(r, `content/species/${ID}`), { recursive: true })
    await mkdir(join(r, 'content/gallery'), { recursive: true })
    await mkdir(join(r, 'engine-state'), { recursive: true })
    await writeFile(join(r, `content/species/${ID}/entity.json`), JSON.stringify({ id: ID, photos: [photo(11, 'CC BY-NC', { url: hot(11) })] }, null, 2))
    await writeFile(join(r, `content/gallery/${ID}.json`), JSON.stringify({ id: ID, photos: [photo(1, 'CC BY', { url: hot(1) }), photo(2, 'CC BY-NC', { url: hot(2) }), photo(9, 'CC BY-NC', { url: hot(9), sourceUrl: 'https://commons.wikimedia.org/wiki/File:B.jpg' })] }, null, 2))
    return r
  }
  const deps = (put: string[]): MirrorDeps => ({
    bytes: async () => new Uint8Array([1]),
    media: { urlFor: k => `https://media.aquatome.com/${k}`, put: async k => { put.push(k); return { url: `https://media.aquatome.com/${k}`, thumb: `https://media.aquatome.com/${k.replace('.webp', '-480.webp')}`, width: 1024, height: 768 } } },
    sleep: async () => {},
  })
  const off: string[] = []
  await mirrorPhotos(await make(), deps(off), { switches: OFF })
  expect(off).toEqual(['inaturalist/1.webp'])
  const on: string[] = [], r = await make()
  await mirrorPhotos(r, deps(on), { switches: ON })
  expect(on.sort()).toEqual(['inaturalist/1.webp', 'inaturalist/2.webp'])
  const g = (await read(r, `content/gallery/${ID}.json`)).photos as Photo[]
  expect(g[1]).toMatchObject({ url: 'https://media.aquatome.com/inaturalist/2.webp', licence: 'CC BY-NC', sourceUrl: INAT(2) })
  expect(g[2]!.url).toBe(hot(9))
})
