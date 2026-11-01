import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { captionSubject, checkPagePhotos, type PhotoCheckDeps, type PhotoVerdict } from '../src/photo-check'

const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#e83' } }).jpeg().toBuffer()
const url = (n: string) => `https://media.example/${n}.webp`
const photo = (n: string, caption?: string) => ({ url: url(n), thumb: url(`${n}-480`), width: 960, height: 720, licence: 'x', author: 'x', sourceUrl: 'x', ...(caption ? { caption } : {}) })
const name = (u: string) => u.split('/').pop()!.replace('.webp', '')

type Page = { kind?: 'species' | 'plants' | 'breeds'; id: string; sci?: string; vi?: object; photos?: string[]; gallery?: string[]; extra?: object }
async function root(pages: Page[], guides: Record<string, object> = {}) {
  const r = await mkdtemp(join(tmpdir(), 'aq-pc-'))
  await mkdir(join(r, 'engine-state'))
  await mkdir(join(r, 'docs/review'), { recursive: true })
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  for (const p of pages) {
    const dir = join(r, 'content', p.kind ?? 'species', p.id)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'entity.json'), `${JSON.stringify({ id: p.id, ...(p.sci === undefined ? {} : { scientificName: p.sci }), photos: (p.photos ?? []).map(n => photo(n)), ...p.extra }, null, 2)}\n`)
    await writeFile(join(dir, 'vi.json'), JSON.stringify(p.vi ?? { name: p.id }))
    if (p.gallery) await writeFile(join(r, 'content/gallery', `${p.id}.json`), `${JSON.stringify({ id: p.id, photos: p.gallery.map(n => photo(n)), seen: 0, updatedAt: '' }, null, 2)}\n`)
  }
  for (const [id, g] of Object.entries(guides)) {
    await mkdir(join(r, 'content/guides', id), { recursive: true })
    await writeFile(join(r, 'content/guides', id, 'entity.json'), `${JSON.stringify({ id, ...g }, null, 2)}\n`)
  }
  return r
}
const json = async (r: string, f: string) => JSON.parse(await readFile(join(r, f), 'utf8'))
const urls = async (r: string, f: string) => ((await json(r, f)).photos as { url: string }[]).map(p => name(p.url))

/** A model that answers from a table: photo name → verdict (unlisted: "yes"). Records each sheet's prompt and photos. */
function model(table: Record<string, Partial<PhotoVerdict>>, seen: { prompt: string; photos: string[] }[] = []): PhotoCheckDeps & { seen: typeof seen } {
  let fetched: string[] = []
  return {
    seen,
    get: async u => { fetched.push(name(u)); return new Uint8Array(await jpeg) },
    look: async (_sheet, prompt) => {
      const photos = fetched
      fetched = []
      seen.push({ prompt, photos })
      return { photos: photos.map((p, i) => ({ n: i + 1, ok: 'yes', typical: false, note: p, ...table[p] }) as { n: number } & PhotoVerdict) }
    },
  }
}

test('another fish and no photo of it leave the page and are rejected; can\'t tell stays and is listed; a typical photo leads', async () => {
  const r = await root([{ id: 'trigonostigma-heteromorpha', sci: 'Trigonostigma heteromorpha', vi: { name: 'Cá tam giác', altNames: ['Harlequin rasbora', 'Cá rasbora hề'] }, photos: ['pale', 'platy', 'typical', 'river', 'map', 'rare'] }])
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [url('old')]: 'watermark: a logo' }))
  const d = model({
    platy: { ok: 'other', note: 'a platy, Xiphophorus maculatus' }, typical: { typical: true }, river: { ok: 'habitat' },
    map: { ok: 'none', note: 'a range map' }, rare: { ok: 'unsure', note: 'too small to tell' },
  })
  const out = await checkPagePhotos(r, d, { limit: 10, today: '2026-11-02' })
  expect(d.seen[0]!.prompt).toContain('Trigonostigma heteromorpha (Cá tam giác, Harlequin rasbora)')
  expect(out.removed.map(name)).toEqual(['platy', 'map'])
  expect(await urls(r, 'content/species/trigonostigma-heteromorpha/entity.json')).toEqual(['typical', 'pale', 'rare', 'river'])
  // Added to the blocklist; what was there stays.
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({
    [url('old')]: 'watermark: a logo',
    [url('platy')]: 'not Trigonostigma heteromorpha: a platy, Xiphophorus maculatus',
    [url('map')]: 'not Trigonostigma heteromorpha: a range map',
  })
  const doc = await readFile(join(r, 'docs/review/photo-subjects.md'), 'utf8')
  expect(doc).toMatch(/## Can't tell: still shown \(1\)\n[\s\S]*species\/trigonostigma-heteromorpha \| \[photo\]\(https:\/\/media\.example\/rare\.webp\) \| too small to tell/)
  expect(doc).toMatch(/## Removed \(2\)[\s\S]*a range map[\s\S]*a platy, Xiphophorus maculatus/)
  expect(out.unsure).toBe(1)
})

test('a re-run costs nothing: every verdict is cached per photo and page', async () => {
  const r = await root([{ id: 'danio-rerio', sci: 'Danio rerio', photos: ['a', 'b'], gallery: ['c', 'd', 'e', 'f', 'g', 'h', 'i'] }])
  const first = model({})
  await checkPagePhotos(r, first, { limit: 10 })
  expect(first.seen.map(s => s.photos)).toEqual([['a', 'b', 'c', 'd', 'e', 'f'], ['g', 'h', 'i']])
  const again = await checkPagePhotos(r, { ...first, look: async () => { throw new Error('judged twice') } }, { limit: 10 })
  expect(again.sheets).toBe(0)
  expect(Object.keys(await json(r, 'engine-state/_photo-subjects.json'))).toHaveLength(9)
})

test('the first check\'s verdicts count where a photo is on one page; its "can\'t tell" is asked again', async () => {
  const r = await root([{ id: 'danio-rerio', sci: 'Danio rerio', photos: ['sure', 'unsure', 'new'] }])
  await writeFile(join(r, 'engine-state/_photo-check.json'), JSON.stringify({ [url('sure')]: { ok: 'yes', typical: true, note: '' }, [url('unsure')]: { ok: 'unsure', typical: false, note: '' } }))
  const d = model({})
  await checkPagePhotos(r, d, { limit: 10 })
  expect(d.seen.map(s => s.photos)).toEqual([['unsure', 'new']])
})

test('most-read pages first, each page\'s own photos and gallery strip before the rest of the galleries', async () => {
  const gallery = Array.from({ length: 10 }, (_, i) => `n${i}`)
  const r = await root([{ id: 'abramites-hypselonotus', sci: 'Abramites hypselonotus', photos: ['abr'] }, { id: 'paracheirodon-innesi', sci: 'Paracheirodon innesi', photos: ['neon'], gallery }])
  const d = model({})
  await checkPagePhotos(r, d, { limit: 1 })
  expect(d.seen.map(s => s.photos)).toEqual([['neon', 'n0', 'n1', 'n2', 'n3', 'n4']])
  await checkPagePhotos(r, d, { limit: 10 })
  expect(d.seen.map(s => s.photos).slice(1)).toEqual([['n5', 'n6', 'n7'], ['abr'], ['n8', 'n9']])
})

test('a breed is judged against its base species and what sets it apart; the plain species is another fish there', async () => {
  const r = await root([
    { id: 'betta-splendens', sci: 'Betta splendens', vi: { name: 'Cá betta' } },
    { kind: 'breeds', id: 'koi-betta', vi: { name: 'Betta Koi (Koi betta)', body: '<h3>Nguồn gốc</h3><p>Từ Thái Lan.</p><h3>Nhận biết và các dòng</h3><p>Thân nền <strong>nhạt</strong>, mảng đỏ, cam và đen như cá chép koi.</p>' }, photos: ['koi', 'plain'], extra: { kind: 'variety', basedOn: 'betta-splendens', parents: [] } },
  ])
  const d = model({ plain: { ok: 'other', note: 'a plain red betta, no koi marks' } })
  await checkPagePhotos(r, d, { limit: 10 })
  expect(d.seen[0]!.prompt).toContain('the breed or line Betta Koi (Koi betta) of Betta splendens. What sets it apart: Thân nền nhạt, mảng đỏ, cam và đen như cá chép koi.')
  expect(d.seen[0]!.prompt).toContain('the plain species or another form of it is "other"')
  expect(await urls(r, 'content/breeds/koi-betta/entity.json')).toEqual(['koi'])
})

test('gallery photos are judged with their page, and a page left with no photo shows none and is listed', async () => {
  const r = await root([{ id: 'paracheirodon-simulans', sci: 'Paracheirodon simulans', photos: ['p1'], gallery: ['g1'] }, { id: 'paracheirodon-innesi', sci: 'Paracheirodon innesi', photos: ['ok'] }])
  await checkPagePhotos(r, model({ p1: { ok: 'other', note: 'neon tetra' }, g1: { ok: 'other', note: 'neon tetra' } }), { limit: 10 })
  expect(await urls(r, 'content/species/paracheirodon-simulans/entity.json')).toEqual([])
  expect(await urls(r, 'content/gallery/paracheirodon-simulans.json')).toEqual([])
  expect(await readFile(join(r, 'docs/review/photo-subjects.md'), 'utf8')).toMatch(/## Left with no photo \(1\)\n\n- species\/paracheirodon-simulans\n/)
})

test('a photo shown on two pages leaves only the page it is wrong for, and is not blocked everywhere', async () => {
  const r = await root([{ id: 'corydoras-adolfoi', sci: 'Corydoras adolfoi', photos: ['cory'] }, { id: 'gymnocorymbus-ternetzi', sci: 'Gymnocorymbus ternetzi', photos: ['cory', 'tetra'] }])
  const d: PhotoCheckDeps = {
    get: async () => new Uint8Array(await jpeg),
    look: async (_s, prompt) => (prompt.includes('Corydoras adolfoi')
      ? { photos: [{ n: 1, ok: 'yes', typical: true, note: '' }] }
      : { photos: [{ n: 1, ok: 'other', typical: false, note: 'Corydoras adolfoi' }, { n: 2, ok: 'yes', typical: true, note: '' }] }),
  }
  await checkPagePhotos(r, d, { limit: 10 })
  expect(await urls(r, 'content/species/corydoras-adolfoi/entity.json')).toEqual(['cory'])
  expect(await urls(r, 'content/species/gymnocorymbus-ternetzi/entity.json')).toEqual(['tetra'])
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({})
})

test('guides: a photo captioned with a fish is judged against it; one that is a page\'s photo goes with that page\'s verdict', async () => {
  const r = await root([
    { id: 'paracheirodon-innesi', sci: 'Paracheirodon innesi', vi: { name: 'Cá neon', altNames: ['Neon tetra'] }, photos: ['wrong'] },
    { id: 'paracheirodon-simulans', sci: 'Paracheirodon simulans', vi: { name: 'Cá neon xanh lục', altNames: ['Green neon tetra'] } },
  ], {
    tetras: {
      photos: [photo('cardinal', 'Neon tetra school'), photo('food', 'Neon tetra food flakes'), photo('heater', 'A heater'), photo('wrong')],
      video: { figures: [{ heading: 'x', photo: photo('fig', 'Đàn cá neon xanh lục trong bể') }] },
    },
  })
  const d = model({ cardinal: { ok: 'other', note: 'cardinal tetra' }, food: { ok: 'none', note: 'a packshot' }, wrong: { ok: 'other', note: 'a cardinal tetra' } })
  await checkPagePhotos(r, d, { limit: 10 })
  expect(d.seen.find(s => s.photos.includes('fig'))!.prompt).toContain('Paracheirodon simulans')
  // A photo judged only because its caption names the fish goes with its caption: a caption about another fish ("Red Tail",
  // a page's other name, in "Red tail catfish") is then "unsure", not removed. The page's own photo needs none.
  const neon = d.seen.find(s => s.photos.includes('cardinal'))!
  expect(neon.photos).toEqual(['wrong', 'cardinal', 'food'])
  expect(neon.prompt).toContain('Some photos are from a guide, with this caption: 2: "Neon tetra school"; 3: "Neon tetra food flakes".')
  expect(d.seen.flatMap(s => s.photos)).not.toContain('heater')
  const g = await json(r, 'content/guides/tetras/entity.json')
  // Another fish goes; a packshot is a guide's own business; the page's rejected photo goes with it.
  expect(g.photos.map((p: { url: string }) => name(p.url))).toEqual(['food', 'heater'])
  expect(g.video.figures[0].photo.url).toBe(url('fig'))
})

test('names a guide caption resolves to: the longest name wins, a one-word or shared name means nothing, two fish mean neither', () => {
  const index = new Map([['cá neon', 'innesi'], ['neon tetra', 'innesi'], ['cá neon xanh lục', 'simulans'], ['puntius titteya', 'titteya'], ['cherry barb', 'titteya']])
  expect(captionSubject('Đàn cá neon xanh lục', index)).toBe('simulans')
  expect(captionSubject('Một đàn Cá Neon', index)).toBe('innesi')
  expect(captionSubject('Male Cherry Barb (Puntius titteya)', index)).toBe('titteya')
  expect(captionSubject('Neon tetras and cherry barbs', index)).toBeUndefined()
  expect(captionSubject('Neon tetra and a cherry barb', index)).toBeUndefined()
  expect(captionSubject('A neonate', index)).toBeUndefined()
})

test('the blocklist is only added to: entries another step writes during the run stay', async () => {
  const r = await root([{ id: 'danio-rerio', sci: 'Danio rerio', photos: ['x'] }])
  const file = join(r, 'engine-state/_photo-rejected.json')
  await writeFile(file, JSON.stringify({ [url('a')]: 'by hand' }))
  const d = model({ x: { ok: 'other', note: 'a guppy' } })
  await checkPagePhotos(r, { ...d, look: async (s, p) => { await writeFile(file, JSON.stringify({ [url('a')]: 'by hand', [url('b')]: 'watermark' })); return d.look(s, p) } }, { limit: 10 })
  expect(Object.keys(await json(r, 'engine-state/_photo-rejected.json')).map(name)).toEqual(['a', 'b', 'x'])
})

test('a usage limit stops the run with nothing lost', async () => {
  const r = await root([{ id: 'danio-rerio', sci: 'Danio rerio', photos: ['a', 'b'] }])
  const out = await checkPagePhotos(r, { get: async () => new Uint8Array(await jpeg), look: async () => { throw new LlmError('usage limit') } }, { limit: 10 })
  expect(out.stopped).toMatch(/usage limit/)
  expect(await urls(r, 'content/species/danio-rerio/entity.json')).toEqual(['a', 'b'])
})
