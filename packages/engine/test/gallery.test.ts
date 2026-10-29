import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { commonsCandidates, galleries, inatCandidates, type GalleryDeps } from '../src/gallery'

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

const obs = (id: number, licence: string | null, w = 2048) => ({ id, user: { login: 'bob' }, photos: [{ id, url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/square.jpg`, license_code: licence, original_dimensions: { width: w, height: w / 2 } }] })
const inat = async (u: string) => u.includes('/taxa?')
  ? { results: [{ id: 9, name: 'Betta splendens complex' }, { id: 7, name: 'Betta splendens' }] }
  : { results: [obs(1, 'cc-by'), obs(2, 'cc-by-nc'), obs(3, null), obs(4, 'cc0', 600), obs(5, 'cc-by-sa')] }

test('iNaturalist: exact taxon, open licences only, ≥ 800 px, large photo + medium thumb, about one request a second', async () => {
  const calls: string[] = []
  const waits: number[] = []
  const c = await inatCandidates('Betta splendens', async u => { calls.push(u); return inat(u) }, async ms => { waits.push(ms) })
  expect(calls[1]).toContain('taxon_id=7')
  expect(waits[0]).toBeGreaterThanOrEqual(1000)
  expect(c.map(x => [x.key, x.licence])).toEqual([['inat:1', 'CC BY'], ['inat:5', 'CC BY-SA']])
  expect(c[0]).toMatchObject({ url: expect.stringMatching(/\/large\.jpg$/), thumb: expect.stringMatching(/\/medium\.jpg$/), width: 1024, height: 512, author: 'bob', sourceUrl: 'https://www.inaturalist.org/photos/1' })
})

const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#0a6' } }).jpeg().toBuffer()

async function root() {
  const r = await mkdtemp(join(tmpdir(), 'aq-gallery-'))
  await mkdir(join(r, 'content/species/betta-splendens'), { recursive: true })
  await mkdir(join(r, 'engine-state'), { recursive: true })
  await writeFile(join(r, 'content/species/betta-splendens/entity.json'), JSON.stringify({ scientificName: 'Betta splendens', photos: [{ url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/5/large.jpg' }] }))
  await writeFile(join(r, 'content/species/betta-splendens/vi.json'), JSON.stringify({ name: 'Cá betta' }))
  return r
}

/** Candidates: Commons A, iNat 1 and 5 (5 is already the page's main photo, so dropped before screening). */
const deps = (over: Partial<GalleryDeps> = {}): GalleryDeps => ({
  http: async u => (u.includes('inaturalist') ? inat(u) : commons(u)),
  get: async () => new Uint8Array(await jpeg),
  faces: async files => files.map((_, i) => (i === 1 ? 1 : 0)), // the second photo has a person in it
  look: async () => ({ keep: [{ n: 1, caption: ' Cá betta đực màu đỏ ' }, { n: 2, caption: 'Cá betta cái' }], best: [2] }),
  sleep: async () => {},
  now: () => new Date('2026-10-30T00:00:00Z'),
  ...over,
})

test('gallery: photos with a face or already on the page are out; screened by contact sheet; best first; no keys stored', async () => {
  const r = await root()
  const sheets: string[] = []
  const report = await galleries(r, deps({ look: async (file, prompt) => { sheets.push(prompt); return { keep: [{ n: 1, caption: ' Cá betta đực màu đỏ ' }, { n: 2, caption: 'Cá betta cái' }], best: [2] } } }), { limit: 5 })
  expect(report.done).toEqual(['betta-splendens: 1 of 2'])
  expect(sheets).toHaveLength(1)
  expect(sheets[0]).toContain('Cá betta')
  const g = JSON.parse(await readFile(join(r, 'content/gallery/betta-splendens.json'), 'utf8'))
  // Commons A (kept as n=1) and iNat 1 (has a face, so the sheet's n=2 doesn't exist): only A survives.
  expect(g.photos.map((p: { sourceUrl: string; caption: string }) => [p.sourceUrl, p.caption])).toEqual([['https://commons.wikimedia.org/wiki/File:A.jpg', 'Cá betta đực màu đỏ']])
  expect(g.photos[0].key).toBeUndefined()
  expect(g).toMatchObject({ id: 'betta-splendens', seen: 2, updatedAt: '2026-10-30' })
})

test('gallery: a recent gallery is left alone; rejected photos never come back; a usage limit stops the run', async () => {
  const r = await root()
  await mkdir(join(r, 'content/gallery'))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/large.jpg': 'person' }))
  const fresh = { id: 'betta-splendens', photos: [], seen: 0, updatedAt: '2026-10-01' }
  await writeFile(join(r, 'content/gallery/betta-splendens.json'), JSON.stringify(fresh))
  expect((await galleries(r, deps(), { limit: 5 })).done).toEqual([])

  const report = await galleries(r, deps({ faces: async f => f.map(() => 0), look: async () => ({ keep: [{ n: 1, caption: 'x' }, { n: 2, caption: 'y' }], best: [] }) }), { limit: 5, only: 'betta-splendens' })
  expect(report.done).toEqual(['betta-splendens: 1 of 1'])

  const stopped = await galleries(r, deps({ look: async () => { throw new LlmError('usage limit') } }), { limit: 5, only: 'betta-splendens' })
  expect(stopped.stopped).toMatch(/usage limit/)
})

test('gallery order: the staples first, then the species most sources write about', async () => {
  const r = await root()
  const add = async (id: string, sources: string[]) => {
    await mkdir(join(r, 'content/species', id), { recursive: true })
    await writeFile(join(r, 'content/species', id, 'entity.json'), JSON.stringify({ scientificName: 'Betta splendens', photos: [], sections: sources.map(source => ({ source })) }))
  }
  await add('aaa-one-source', ['seriouslyfish'])
  await add('zzz-three-sources', ['seriouslyfish', 'glaser', 'sprucepets'])
  const report = await galleries(r, deps(), { limit: 2 })
  expect(report.done.map(d => d.split(':')[0])).toEqual(['betta-splendens', 'zzz-three-sources'])
})

test('a photo that does not decode is skipped instead of breaking the contact sheet', async () => {
  const r = await root()
  let n = 0
  const report = await galleries(r, deps({ get: async () => (n++ === 0 ? new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01]) : new Uint8Array(await jpeg)), faces: async f => f.map(() => 0), look: async () => ({ keep: [{ n: 1, caption: 'x' }], best: [] }) }), { limit: 5 })
  expect(report.done).toEqual(['betta-splendens: 1 of 2'])
})
