import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { SpeciesSchema } from '@aq/schema'
import { captionSubject, checkPagePhotos, deadNote, recheckCandidates, type PhotoCheckDeps, type PhotoVerdict } from '../src/photo-check'

const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#e83' } }).jpeg().toBuffer()
const url = (n: string) => `https://media.example/${n}.webp`
const photo = (n: string, caption?: string, author = 'x') => ({ url: url(n), thumb: url(`${n}-480`), width: 960, height: 720, licence: 'x', author, sourceUrl: 'x', ...(caption ? { caption } : {}) })
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

test('a transgenic line is judged by its own names, not as the species it was first made from', async () => {
  const r = await root([
    { id: 'danio-rerio', sci: 'Danio rerio' },
    { kind: 'breeds', id: 'glofish', vi: { name: 'Cá GloFish', altNames: ['GloFish Tetra'] }, photos: ['tetra'], extra: { kind: 'transgenic', parents: [{ name: 'Cá ngựa vằn (Danio rerio)', certain: true }] } },
  ])
  const d = model({})
  await checkPagePhotos(r, d, { limit: 10 })
  expect(d.seen[0]!.prompt).toContain('the breed or line Cá GloFish. What sets it apart')
  expect(d.seen[0]!.prompt).not.toContain('Danio rerio')
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
  // A photo judged only because its caption names the fish is judged against its caption: "angelfish and java fern" shows
  // java fern if the angelfish leads, and a caption about another fish ("Red tail catfish" for a page called "Red Tail")
  // is "unsure", not removed. The page's own photo needs none.
  const neon = d.seen.find(s => s.photos.includes('cardinal'))!
  expect(neon.photos).toEqual(['wrong', 'cardinal', 'food'])
  expect(neon.prompt).toContain('Some photos are from a guide, with this caption: 2: "Neon tetra school"; 3: "Neon tetra food flakes".')
  expect(neon.prompt).toContain('Judge these against their caption instead')
  expect(d.seen.flatMap(s => s.photos)).not.toContain('heater')
  const g = await json(r, 'content/guides/tetras/entity.json')
  // Another fish goes; a packshot is a guide's own business; the page's rejected photo goes with it.
  expect(g.photos.map((p: { url: string }) => name(p.url))).toEqual(['food', 'heater'])
  expect(g.video.figures[0].photo.url).toBe(url('fig'))
})

test('names a guide caption resolves to: the longest name wins, plurals count, a one-word or shared name means nothing, two fish mean neither', () => {
  const index = new Map([['cá neon', 'innesi'], ['neon tetra', 'innesi'], ['cá neon xanh lục', 'simulans'], ['puntius titteya', 'titteya'], ['cherry barb', 'titteya']])
  expect(captionSubject('Đàn cá neon xanh lục', index)).toBe('simulans')
  expect(captionSubject('Một đàn Cá Neon', index)).toBe('innesi')
  expect(captionSubject('Male Cherry Barb (Puntius titteya)', index)).toBe('titteya')
  expect(captionSubject('Neon tetras and cherry barbs', index)).toBeUndefined()
  expect(captionSubject('Neon tetra and a cherry barb', index)).toBeUndefined()
  expect(captionSubject('A neonate', index)).toBeUndefined()
  expect(captionSubject('Male and female cherry barbs', index)).toBe('titteya')
  const genera = new Map([['microsorum', new Set(['pteropus'])], ['anubias', new Set(['barteri'])], ['paracheirodon', new Set(['innesi', 'simulans'])]])
  const plants = new Map([['java fern', 'pteropus']])
  expect(captionSubject('Java fern on lava rock', plants, genera)).toBe('pteropus')
  expect(captionSubject('How to Plant Anubias or Java Fern on Rocks', plants, genera)).toBeUndefined()
  expect(captionSubject('Neon tetra (Paracheirodon innesi)', index, genera)).toBe('innesi')
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

test('a download that is not an image is left out, and the rest of its sheet is judged', async () => {
  const r = await root([{ id: 'danio-rerio', sci: 'Danio rerio', photos: ['a', 'html', 'b'] }])
  const d = model({})
  const out = await checkPagePhotos(r, { ...d, get: async u => (u.includes('html') ? new TextEncoder().encode('<html>gone</html>') : d.get(u)) }, { limit: 10 })
  expect(d.seen.map(s => s.photos)).toEqual([['a', 'b']])
  expect(out.failed).toHaveLength(1)
  expect(await urls(r, 'content/species/danio-rerio/entity.json')).toEqual(['a', 'html', 'b'])
})

test('a guide keeps a page\'s photo that is not of the fish (a map, a tank), but not one of another fish', async () => {
  const r = await root([{ id: 'danio-rerio', sci: 'Danio rerio', photos: ['map', 'guppy'] }], { biotope: { photos: [photo('map'), photo('guppy')] } })
  await checkPagePhotos(r, model({ map: { ok: 'none', note: 'a range map' }, guppy: { ok: 'other', note: 'a guppy' } }), { limit: 10 })
  expect(await urls(r, 'content/species/danio-rerio/entity.json')).toEqual([])
  expect(await urls(r, 'content/guides/biotope/entity.json')).toEqual(['map'])
  expect(Object.keys(await json(r, 'engine-state/_photo-rejected.json')).map(name)).toEqual(['guppy'])
  const doc = await readFile(join(r, 'docs/review/photo-subjects.md'), 'utf8')
  expect(doc).toContain('## Removed (2)')
  expect(doc).toMatch(/## Left with no photo \(1\)\n\n- species\/danio-rerio\n/)
})

test('a verdict against a guide caption doesn\'t stand for the page: the same photo on the page is looked at again', async () => {
  const r = await root([{ id: 'paracheirodon-innesi', sci: 'Paracheirodon innesi', vi: { name: 'Cá neon', altNames: ['Neon tetra'] } }], { tetras: { photos: [photo('mixed', 'Neon tetra school with rummynose tetras')] } })
  const d = model({})
  await checkPagePhotos(r, d, { limit: 10 })
  expect((await json(r, 'engine-state/_photo-subjects.json'))[url('mixed')]['paracheirodon-innesi'].guide).toBe(true)
  const file = join(r, 'content/species/paracheirodon-innesi/entity.json')
  await writeFile(file, JSON.stringify({ id: 'paracheirodon-innesi', scientificName: 'Paracheirodon innesi', photos: [photo('mixed')] }))
  await checkPagePhotos(r, d, { limit: 10 })
  expect(d.seen.map(s => s.photos)).toEqual([['mixed'], ['mixed']])
  expect(d.seen[1]!.prompt).not.toContain('from a guide')
})

test('a dead fish at a market leaves every page, gallery and guide that shows it and joins the blocklist, though another page passed it', async () => {
  // Found by the owner (2026-11-05): the speckled peacock bass page led with dead fish piled at a market, judged "yes".
  const r = await root([
    { id: 'cichla-temensis', sci: 'Cichla temensis', photos: ['market', 'live'], gallery: ['market'] },
    { id: 'cichla-ocellaris', sci: 'Cichla ocellaris', photos: ['market'] },
  ], { peacocks: { photos: [photo('market')] } })
  const d = model({})
  const look = d.look
  d.look = async (s, prompt) => {
    const v = await look(s, prompt)
    return prompt.includes('Cichla temensis') ? { photos: v.photos.map(p => (p.note === 'market' ? { ...p, ok: 'dead', typical: true, note: 'dead peacock bass piled at a market' } : p)) } : v
  }
  const out = await checkPagePhotos(r, d, { limit: 10 })
  expect(d.seen[0]!.prompt).toMatch(/"dead" if it shows a dead fish or other animal, or fish as food, whatever the species: at a market or fishmonger's, on ice; on a plate, cooked, fillets; a catch landed or held up/)
  expect(await urls(r, 'content/species/cichla-temensis/entity.json')).toEqual(['live'])
  expect(await urls(r, 'content/gallery/cichla-temensis.json')).toEqual([])
  expect(await urls(r, 'content/species/cichla-ocellaris/entity.json')).toEqual([])
  expect(await urls(r, 'content/guides/peacocks/entity.json')).toEqual([])
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({ [url('market')]: 'dead: dead peacock bass piled at a market' })
  expect(out.blocked).toEqual([`${url('market')}: dead: dead peacock bass piled at a market`])
  // A dead fish is never the page's typical photo, and the review lists it.
  expect((await json(r, 'engine-state/_photo-subjects.json'))[url('market')]['cichla-temensis']).toMatchObject({ ok: 'dead', typical: false, logo: false })
  expect(await readFile(join(r, 'docs/review/photo-subjects.md'), 'utf8')).toMatch(/dead or as food: 1;[\s\S]*species\/cichla-temensis \| \[photo\]\(https:\/\/media\.example\/market\.webp\) \| dead: dead peacock bass piled at a market/)
})

test('a logo the text reader missed is a watermark: off every page, onto the blocklist; the same photographer\'s other photos are asked again', async () => {
  const r = await root([
    { id: 'cichla-temensis', sci: 'Cichla temensis', photos: ['stamped'], gallery: ['clean'] },
    { id: 'phractocephalus-hemioliopterus', sci: 'Phractocephalus hemioliopterus', photos: ['redtail', 'other-author'] },
  ])
  for (const [f, photos] of [['content/species/cichla-temensis/entity.json', [photo('stamped', undefined, 'Diogo Luiz')]], ['content/species/phractocephalus-hemioliopterus/entity.json', [photo('redtail', undefined, 'Diogo Luiz'), photo('other-author')]]] as const) {
    await writeFile(join(r, f), JSON.stringify({ ...(await json(r, f)), photos }))
  }
  // Both pages judged before the check asked about logos: only the stamped photo's page is asked again (as `recheck` does)…
  await writeFile(join(r, 'engine-state/_photo-subjects.json'), JSON.stringify({
    [url('redtail')]: { 'phractocephalus-hemioliopterus': { ok: 'yes', typical: true, note: 'redtail catfish' } },
    [url('other-author')]: { 'phractocephalus-hemioliopterus': { ok: 'yes', typical: true, note: 'redtail catfish' } },
  }))
  const d = model({ stamped: { logo: true, note: 'peacock bass; round "Repertório Animal" logo bottom left' }, redtail: { logo: true, note: 'redtail catfish; round logo bottom left' } })
  await checkPagePhotos(r, d, { limit: 10, recheck: new Set([url('stamped')]) })
  expect(d.seen[0]!.prompt).toContain('- logo: true if a logo, stamp, watermark, signature or text was added on top of the photo after it was taken, even small or faint, round, in a corner')
  // …then the same photographer's: their redtail photo on another page, not the other author's photo there.
  expect(d.seen.map(s => s.photos)).toEqual([['stamped'], ['redtail']])
  expect(await urls(r, 'content/species/cichla-temensis/entity.json')).toEqual([])
  expect(await urls(r, 'content/species/phractocephalus-hemioliopterus/entity.json')).toEqual(['other-author'])
  expect(await urls(r, 'content/gallery/cichla-temensis.json')).toEqual(['clean'])
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({
    [url('stamped')]: 'watermark: peacock bass; round "Repertório Animal" logo bottom left',
    [url('redtail')]: 'watermark: redtail catfish; round logo bottom left',
  })
})

test('an engraved plate or an old drawing is "not a photo of it" as before, not "dead": it leaves its page with that reason', async () => {
  const r = await root([{ id: 'bagrus-bajad', sci: 'Bagrus bajad', photos: ['plate'] }])
  const d = model({ plate: { ok: 'none', typical: false, note: 'old engraved plate of two Bagrus catfish' } })
  await checkPagePhotos(r, d, { limit: 10 })
  expect(d.seen[0]!.prompt).toContain('Not "dead": a drawing, painting or engraved plate (that is "none"; a photo of a preserved specimen is "dead", however old); a live fish held briefly in a net or a bag.')
  expect(d.seen[0]!.prompt).toContain('"none" if it is not a photo of the subject at all: a map, chart, diagram or drawing, hands or people')
  expect(await urls(r, 'content/species/bagrus-bajad/entity.json')).toEqual([])
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({ [url('plate')]: 'not Bagrus bajad: old engraved plate of two Bagrus catfish' })
  // Nor is a note about one a reason to ask again.
  expect(deadNote('Old plate showing two Bagrus catfish from a museum collection, engraved')).toBe(false)
  expect(deadNote('Old black-and-white plate of a preserved specimen and head close-up')).toBe(true)
})

test('photos to judge again are picked from the notes of earlier looks: the checks\', the watermark step\'s and the gallery\'s captions', async () => {
  const r = await root([
    { id: 'cichla-temensis', sci: 'Cichla temensis', photos: ['market', 'leaves', 'drawing', 'new', 'gone', 'tag', 'never', 'landed'], gallery: ['cho', 'swim'] },
    { id: 'sulcospira-testudinaria', sci: 'Sulcospira testudinaria', photos: ['shell'] },
  ])
  const v = (note: string, extra: Partial<PhotoVerdict> = {}): PhotoVerdict => ({ ok: 'yes', typical: true, note, ...extra })
  await writeFile(join(r, 'engine-state/_photo-check.json'), JSON.stringify({
    [url('market')]: v('Several dead speckled-phase peacock bass in a market'),
    [url('leaves')]: v('Adult among dead leaves'),
    [url('drawing')]: v('Old book drawing of the fish, from a museum library'),
    [url('gone')]: v('Dead fish on a tray'),
    [url('landed')]: v('Large adult just caught, landed on a boat deck'),
  }))
  await writeFile(join(r, 'engine-state/_photo-subjects.json'), JSON.stringify({
    [url('shell')]: { 'sulcospira-testudinaria': v('Naturalis museum shell specimens labelled Brotia testudinaria') },
    // Judged since the check asks about dead fish and logos: not asked again.
    [url('new')]: { 'cichla-temensis': v('dead fish on ice', { ok: 'dead', logo: false }) },
  }))
  await writeFile(join(r, 'engine-state/_photo-watermarks.json'), JSON.stringify({ [url('tag')]: { ocr: [], watermark: false, kind: 'none', what: 'preserved specimen photo, no text' } }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [url('gone')]: 'dead: already off' }))
  const g = join(r, 'content/gallery/cichla-temensis.json')
  await writeFile(g, JSON.stringify({ ...(await json(r, 'content/gallery/cichla-temensis.json')), photos: [photo('cho', 'Cá hoàng đế sao chết bày bán ở chợ'), photo('swim', 'Cá hoàng đế sao bơi trong bể')] }))
  expect(Object.fromEntries([...await recheckCandidates(r)].map(([u, n]) => [name(u), n]))).toEqual({
    market: 'Several dead speckled-phase peacock bass in a market',
    tag: 'preserved specimen photo, no text',
    cho: 'Cá hoàng đế sao chết bày bán ở chợ',
    shell: 'Naturalis museum shell specimens labelled Brotia testudinaria',
    landed: 'Large adult just caught, landed on a boat deck',
  })
})

test('the repair judges each photo once: a second run finds nothing to ask and changes nothing', async () => {
  const r = await root([{ id: 'cichla-temensis', sci: 'Cichla temensis', photos: ['market', 'aquarium'] }])
  await writeFile(join(r, 'engine-state/_photo-check.json'), JSON.stringify({
    [url('market')]: { ok: 'yes', typical: true, note: 'Several dead peacock bass in a market' },
    [url('aquarium')]: { ok: 'yes', typical: true, note: 'Adult in a public aquarium' },
  }))
  const d = model({ market: { ok: 'dead', note: 'dead fish at a market' } })
  const first = await checkPagePhotos(r, d, { limit: 10, recheck: new Set((await recheckCandidates(r)).keys()) })
  expect(d.seen.map(s => s.photos)).toEqual([['market']])
  expect(first.blocked).toHaveLength(1)
  const files = async () => Promise.all(['content/species/cichla-temensis/entity.json', 'engine-state/_photo-rejected.json', 'engine-state/_photo-subjects.json'].map(f => readFile(join(r, f), 'utf8')))
  const before = await files()
  expect((await recheckCandidates(r)).size).toBe(0)
  // Even given the first run's photos again.
  const again = await checkPagePhotos(r, { ...d, look: async () => { throw new Error('judged twice') } }, { limit: 10, recheck: new Set([url('market')]) })
  expect(again).toMatchObject({ sheets: 0, blocked: [], rejected: 0, removed: [] })
  expect(await files()).toEqual(before)
})

test('a page that loses its last photo keeps a valid page file, with no photo, and is listed', async () => {
  const r = await root([{ id: 'cichla-temensis', sci: 'Cichla temensis', photos: ['market'], gallery: ['market'] }])
  const file = join(r, 'content/species/cichla-temensis/entity.json')
  const real = JSON.parse(await readFile(new URL('../../../apps/site/test/fixture-content/species/paracheirodon-innesi/entity.json', import.meta.url), 'utf8'))
  await writeFile(file, `${JSON.stringify({ ...real, id: 'cichla-temensis', scientificName: 'Cichla temensis', photos: [photo('market')] }, null, 2)}\n`)
  await checkPagePhotos(r, model({ market: { ok: 'dead', note: 'dead fish at a market' } }), { limit: 10 })
  const e = await json(r, 'content/species/cichla-temensis/entity.json')
  expect(e.photos).toEqual([])
  expect(SpeciesSchema.safeParse(e).success).toBe(true)
  expect(await urls(r, 'content/gallery/cichla-temensis.json')).toEqual([])
  expect(await readFile(join(r, 'docs/review/photo-subjects.md'), 'utf8')).toMatch(/## Left with no photo \(1\)\n\n- species\/cichla-temensis\n/)
})
