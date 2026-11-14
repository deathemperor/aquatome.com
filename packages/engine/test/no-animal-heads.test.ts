import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { checkPagePhotos, EMPTY_CAP, type PhotoCheckDeps, type PhotoVerdict } from '../src/photo-check'

// A head the box step found no animal in (a river, a lake) is judged before anything else, and a run that would leave more
// than EMPTY_CAP pages with no photo of their own takes none off (the chief of staff, 2026-11-12).
const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#e83' } }).jpeg().toBuffer()
const url = (n: string) => `https://media.example/${n}.webp`
const photo = (n: string) => ({ url: url(n), thumb: url(`${n}-480`), width: 960, height: 720, licence: 'x', author: 'x', sourceUrl: 'x' })
const name = (u: string) => u.split('/').pop()!.replace('.webp', '')

type Page = { kind?: 'species' | 'plants' | 'breeds'; id: string; photos?: string[]; gallery?: { n: string; source?: string }[] }
async function root(pages: Page[], boxes: Record<string, unknown> = {}) {
  const r = await mkdtemp(join(tmpdir(), 'aq-noanimal-'))
  await mkdir(join(r, 'engine-state'))
  await mkdir(join(r, 'docs/review'), { recursive: true })
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  for (const p of pages) {
    const dir = join(r, 'content', p.kind ?? 'species', p.id)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'entity.json'), `${JSON.stringify({ id: p.id, scientificName: `${p.id} fish`, photos: (p.photos ?? []).map(photo) }, null, 2)}\n`)
    await writeFile(join(dir, 'vi.json'), JSON.stringify({ name: p.id }))
    if (p.gallery) await writeFile(join(r, 'content/gallery', `${p.id}.json`), `${JSON.stringify({ id: p.id, photos: p.gallery.map(g => ({ ...photo(g.n), ...(g.source ? { source: g.source } : {}) })), seen: 0, updatedAt: '' }, null, 2)}\n`)
  }
  await writeFile(join(r, 'engine-state/_photo-boxes.json'), JSON.stringify(Object.fromEntries(Object.entries(boxes).map(([n, b]) => [url(n), b]))))
  return r
}
const json = async (r: string, f: string) => JSON.parse(await readFile(join(r, f), 'utf8'))
const photosOf = async (r: string, id: string) => ((await json(r, `content/species/${id}/entity.json`)).photos as { url: string }[]).map(p => name(p.url))

/** A model that answers from a table: photo name → verdict (unlisted: a typical "yes"). Records each sheet's photos. */
function model(table: Record<string, Partial<PhotoVerdict>>): PhotoCheckDeps & { seen: string[][] } {
  let fetched: string[] = []
  const seen: string[][] = []
  return {
    seen,
    get: async u => { fetched.push(name(u)); return new Uint8Array(await jpeg) },
    look: async () => {
      const photos = fetched
      fetched = []
      seen.push(photos)
      return { photos: photos.map((p, i) => ({ n: i + 1, ok: 'yes', typical: true, note: p, person: false, ...table[p] }) as { n: number } & PhotoVerdict) }
    },
  }
}
const none = { ok: 'none', typical: false, note: 'a river, no fish in it' } as const

test('a head with no animal in it is judged first, before a more-read page\'s lead and the share that fills pages with none', async () => {
  const r = await root([
    { id: 'aaa', photos: ['a-head'] },
    { id: 'bbb', photos: ['b-river', 'b-fish'] },
    { id: 'ccc', gallery: [{ n: 'c-source', source: 'tropica' }] }, // no photo of its own: a source's photo would fill it
    { id: 'ddd', photos: ['d-boxed'] },
    { kind: 'plants', id: 'eee', photos: ['e-plant'] },
  ], { 'b-river': null, 'd-boxed': { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 'e-plant': null })
  const d = model({})
  await checkPagePhotos(r, d, { limit: 10, fill: 1 })
  // The river's sheet first, filled from its page; then the source's share and the rest as before. A head with a box, or
  // a plant's (no animal is the point), waits its turn.
  expect(d.seen[0]).toEqual(['b-river', 'b-fish'])
  expect(d.seen[1]).toEqual(['c-source'])
  expect(d.seen.slice(2).flat()).toEqual(expect.arrayContaining(['a-head', 'd-boxed', 'e-plant']))
})

test('a head the check calls "none" comes off; the photo after it leads; the run counts the head moved', async () => {
  const r = await root([{ id: 'aaa', photos: ['a-river', 'a-fish'] }], { 'a-river': null })
  const out = await checkPagePhotos(r, model({ 'a-river': none }), { limit: 10 })
  expect(await photosOf(r, 'aaa')).toEqual(['a-fish'])
  expect(out.heads).toEqual({ moved: [`species/aaa: ${url('a-river')} -> ${url('a-fish')}`], emptied: [], held: [], named: [] })
  expect(Object.keys(await json(r, 'engine-state/_photo-rejected.json'))).toEqual([url('a-river')])
})

test('a page\'s only photo stays on the check\'s word alone, whatever the verdict: held, off the never-again list, and waiting for a second look', async () => {
  // The chief of staff, 2026-11-14: one night's runs took every photo off 27 fish pages, each run within the old cap of 10.
  const verdicts = { 'b-river': none, 'c-dead': { ok: 'dead', typical: false, note: 'dead' }, 'd-hand': { person: true, note: 'held in a hand' } } as Record<string, Partial<PhotoVerdict>>
  const r = await root([{ id: 'bbb', photos: ['b-river'] }, { id: 'ccc', photos: ['c-dead'] }, { id: 'ddd', photos: ['d-hand'] }], { 'b-river': null })
  const out = await checkPagePhotos(r, model(verdicts), { limit: 10 })
  const stay = async () => { for (const [id, n] of [['bbb', 'b-river'], ['ccc', 'c-dead'], ['ddd', 'd-hand']] as const) expect(await photosOf(r, id)).toEqual([n]) }
  await stay()
  expect(out.heads.emptied).toEqual([])
  expect(out.heads.held.sort()).toEqual([`species/bbb: ${url('b-river')}`, `species/ccc: ${url('c-dead')}`, `species/ddd: ${url('d-hand')}`])
  expect(await json(r, 'engine-state/_photo-rejected.json').catch(() => ({}))).toEqual({})
  expect(await json(r, 'engine-state/_photo-held.json')).toEqual({ 'species/bbb': true, 'species/ccc': true, 'species/ddd': true })
  // Each waits for a second look (last-photo.ts), its reason kept as a category and a hash, as the never-again list keeps it.
  const sl = await json(r, 'engine-state/_photo-second-look.json')
  expect(Object.keys(sl).sort()).toEqual([url('b-river'), url('c-dead'), url('d-hand')])
  expect(sl[url('c-dead')]).toMatchObject({ step: 'the photo check', pages: ['species/ccc'] })
  expect(sl[url('c-dead')].why).toMatch(/^dead: withheld \[sha256:[0-9a-f]{64}\]$/)
  expect(sl[url('d-hand')].why).toMatch(/^people: withheld \[sha256:[0-9a-f]{64}\]$/)
  // A later run takes none off, and a run released with --empty-cap doesn't either: each waits for its own look.
  expect((await checkPagePhotos(r, model({}), { limit: 10 })).heads.emptied).toEqual([])
  expect((await checkPagePhotos(r, model({}), { limit: 10, emptyCap: 3 })).heads.emptied).toEqual([])
  await stay()
  expect(Object.keys(await json(r, 'engine-state/_photo-second-look.json'))).toHaveLength(3)
})

test('a page with none of its own photos keeps its album\'s last photo on the check\'s word alone, held for a second look', async () => {
  // The chief of staff, 2026-11-14: "fish pages with no photo at all" counts the album too.
  const r = await root([{ id: 'alb', gallery: [{ n: 'g-other' }] }, { id: 'two', gallery: [{ n: 'g2-other' }, { n: 'g2-fish' }] }])
  const out = await checkPagePhotos(r, model({ 'g-other': { ok: 'other', note: 'another fish' }, 'g2-other': { ok: 'other', note: 'another fish' } }), { limit: 10 })
  const album = async (id: string) => ((await json(r, `content/gallery/${id}.json`)).photos as { url: string }[]).map(p => name(p.url))
  expect(await album('alb')).toEqual(['g-other'])
  expect(await album('two')).toEqual(['g2-fish'])
  expect(out.heads.held).toEqual([`species/alb: ${url('g-other')}`])
  expect(Object.keys(await json(r, 'engine-state/_photo-second-look.json'))).toEqual([url('g-other')])
})

test(`a run that would leave more than ${EMPTY_CAP} pages with no photo takes none of theirs off, nor onto the never-again list, and lists them`, async () => {
  const pages = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${String(i).padStart(2, '0')}`, photos: [`r${i}`] }))
  const rivers = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`r${i}`, none]))
  // One more page whose river leads a fish photo: its head moves, which no cap holds.
  const moving = { id: 'zzz', photos: ['z-river', 'z-fish'] }
  const over = await root([...pages(EMPTY_CAP + 1), moving])
  const out = await checkPagePhotos(over, model({ ...rivers(EMPTY_CAP + 1), 'z-river': none }), { limit: 20 })
  expect(out.heads.held).toHaveLength(EMPTY_CAP + 1)
  expect(out.heads.emptied).toEqual([])
  for (const p of pages(EMPTY_CAP + 1)) expect(await photosOf(over, p.id)).toEqual(p.photos)
  expect(Object.keys(await json(over, 'engine-state/_photo-rejected.json'))).toEqual([url('z-river')])
  expect(await photosOf(over, 'zzz')).toEqual(['z-fish'])
  // A later run, its verdicts cached, takes none off: nothing reached the never-again list to take them off unseen, and
  // each waits for its second look (last-photo.ts; the sweep's tests follow one through to its answer).
  await checkPagePhotos(over, model({}), { limit: 20 })
  for (const p of pages(EMPTY_CAP + 1)) expect(await photosOf(over, p.id)).toEqual(p.photos)
  expect(Object.keys(await json(over, 'engine-state/_photo-second-look.json'))).toHaveLength(EMPTY_CAP + 1)
})

test('the sweep lists each head with no animal in it that the check hasn\'t passed as the fish, from the day it first leads', async () => {
  const { noAnimalHeads, NO_ANIMAL_FILE } = await import('../src/sweep')
  const r = await root([
    { id: 'river', photos: ['river'] }, // no animal, never judged: listed
    { id: 'missed', photos: ['missed'] }, // no animal found, but the check passed it as the fish: not listed
    { id: 'old', photos: ['old'] }, // the first check's "yes" counts too
    { id: 'unsure', photos: ['unsure', 'fish'] }, // can't tell: listed
    { id: 'boxed', photos: ['boxed'] }, // a box: an animal is there
    { kind: 'breeds', id: 'lake', photos: ['lake'] },
    { kind: 'plants', id: 'moss', photos: ['moss'] }, // a plant's head has no animal by nature
  ], { river: null, missed: null, old: null, unsure: null, boxed: { x: 0, y: 0, w: 1, h: 1 }, lake: null, moss: null })
  const verdict = (ok: string) => ({ ok, typical: false, note: '', person: false })
  await writeFile(join(r, 'engine-state/_photo-subjects.json'), JSON.stringify({ [url('missed')]: { missed: verdict('yes') }, [url('unsure')]: { unsure: verdict('unsure') } }))
  await writeFile(join(r, 'engine-state/_photo-check.json'), JSON.stringify({ [url('old')]: verdict('yes') }))
  expect(await noAnimalHeads(r, '2026-11-13')).toEqual([
    `species/river: ${url('river')} (since 2026-11-13)`, `species/unsure: ${url('unsure')} (since 2026-11-13)`, `breeds/lake: ${url('lake')} (since 2026-11-13)`,
  ])
  // The next day: still the same photos, so the same days; a page whose head changed is new again; one passed drops off.
  const entity = join(r, 'content/species/unsure/entity.json')
  await writeFile(entity, JSON.stringify({ ...(await json(r, 'content/species/unsure/entity.json')), photos: [photo('fish'), photo('unsure')] }))
  await writeFile(join(r, 'engine-state/_photo-boxes.json'), JSON.stringify({ [url('river')]: null, [url('lake')]: null, [url('fish')]: null }))
  await writeFile(join(r, 'engine-state/_photo-subjects.json'), JSON.stringify({ [url('lake')]: { lake: verdict('yes') } }))
  expect(await noAnimalHeads(r, '2026-11-14')).toEqual([`species/river: ${url('river')} (since 2026-11-13)`, `species/unsure: ${url('fish')} (since 2026-11-14)`])
  expect(await json(r, NO_ANIMAL_FILE)).toEqual({ 'species/river': { url: url('river'), since: '2026-11-13' }, 'species/unsure': { url: url('fish'), since: '2026-11-14' } })
})

test('a head a person picked that the check calls "none" stays first on its page and off the never-again list, and is listed; another page\'s "none" head comes off', async () => {
  const r = await root([{ id: 'picked', photos: ['fish-far', 'fish-near'] }, { id: 'other', photos: ['river', 'fish'] }], { 'fish-far': null, river: null })
  await writeFile(join(r, 'engine-state/_photo-head-picks.json'), JSON.stringify({ 'species/picked': url('fish-far') }))
  const out = await checkPagePhotos(r, model({ 'fish-far': none, river: none, 'fish-near': { ok: 'yes', typical: true } }), { limit: 10 })
  expect(await photosOf(r, 'picked')).toEqual(['fish-far', 'fish-near'])
  expect(await photosOf(r, 'other')).toEqual(['fish'])
  expect(Object.keys(await json(r, 'engine-state/_photo-rejected.json'))).toEqual([url('river')])
  expect(out.picked).toEqual([`species/picked: ${url('fish-far')} (the check says not a photo of it; a head a person picked, so it stays)`])
  expect(out.heads.moved).toEqual([`species/other: ${url('river')} -> ${url('fish')}`])
})

test('a held page keeps its album too, nothing of it goes on the never-again list, and a cap that isn\'t a whole number holds as the usual one', async () => {
  const n = EMPTY_CAP + 1
  const pages = Array.from({ length: n }, (_, i) => ({ id: `p${String(i).padStart(2, '0')}`, photos: [`r${i}`], gallery: [{ n: `g${i}` }] }))
  const verdicts = Object.fromEntries(pages.flatMap((_, i) => [[`r${i}`, none], [`g${i}`, none]]))
  const r = await root(pages)
  const out = await checkPagePhotos(r, model(verdicts), { limit: 40, emptyCap: Number('1O') })
  expect(out.heads.held).toHaveLength(n)
  for (const [i, p] of pages.entries()) {
    expect(await photosOf(r, p.id)).toEqual([`r${i}`])
    expect(((await json(r, `content/gallery/${p.id}.json`)).photos as { url: string }[]).map(x => name(x.url))).toEqual([`g${i}`])
  }
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({})
})

test('the first check\'s "yes" passes a head only where the photo is on one page, as the photo check reads it', async () => {
  const { noAnimalHeads } = await import('../src/sweep')
  const r = await root([{ id: 'one', photos: ['shared'] }, { id: 'two', photos: ['shared'] }, { id: 'alone', photos: ['solo'] }], { shared: null, solo: null })
  const yes = { ok: 'yes', typical: true, note: '', person: false }
  await writeFile(join(r, 'engine-state/_photo-check.json'), JSON.stringify({ [url('shared')]: yes, [url('solo')]: yes }))
  expect(await noAnimalHeads(r, '2026-11-13')).toEqual([`species/one: ${url('shared')} (since 2026-11-13)`, `species/two: ${url('shared')} (since 2026-11-13)`])
})
