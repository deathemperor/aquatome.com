import { denied } from './piece-admission'
import { expectControlledRejections } from './photo-privacy-assertions'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { SpeciesSchema } from '@aq/schema'
import { rankGallery } from '../src/gallery'
import { cantTellOn, captionSubject, checkPagePhotos, deadNote, peopleNote, recheckCandidates, type PhotoCheckDeps, type PhotoVerdict } from '../src/photo-check'

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
    platy: { ok: 'other', note: 'a platy, Xiphophorus maculatus' }, typical: { typical: true }, river: { note: 'a school in a wild stream' },
    map: { ok: 'none', note: 'a range map' }, rare: { ok: 'unsure', note: 'too small to tell' },
  })
  const out = await checkPagePhotos(r, d, { limit: 10, today: '2026-11-02' })
  expect(d.seen[0]!.prompt).toContain('Trigonostigma heteromorpha (Cá tam giác, Harlequin rasbora)')
  expect(out.removed.map(name)).toEqual(['platy', 'map'])
  // "pale" led the page and the check passed it, though not as typical: the typical photo leads.
  expect(await urls(r, 'content/species/trigonostigma-heteromorpha/entity.json')).toEqual(['typical', 'pale', 'river', 'rare'])
  // Added to the blocklist; what was there stays.
  expectControlledRejections(await json(r, 'engine-state/_photo-rejected.json'), {
    [url('old')]: "watermark",
    [url('platy')]: "rejected",
    [url('map')]: "rejected",
  })
  const doc = await readFile(join(r, 'docs/review/photo-subjects.md'), 'utf8')
  expect(doc).toMatch(/## Can't tell: still shown \(1\)\n[\s\S]*species\/trigonostigma-heteromorpha \| \[photo\]\(https:\/\/media\.example\/rare\.webp\) \| subject unsure/)
  expect(doc).toMatch(/## Removed \(2\)[\s\S]*subject none[\s\S]*subject other/)
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

test('the first check\'s verdicts count where a photo is on one page until it is asked again, as every verdict from before the check asked about people is', async () => {
  const r = await root([{ id: 'danio-rerio', sci: 'Danio rerio', photos: ['unsure', 'map', 'sure', 'new'] }])
  await writeFile(join(r, 'engine-state/_photo-check.json'), JSON.stringify({ [url('sure')]: { ok: 'yes', typical: true, note: '' }, [url('unsure')]: { ok: 'unsure', typical: false, note: '' }, [url('map')]: { ok: 'no', typical: false, note: 'a map' } }))
  const d = model({})
  // With no model calls to spend, its "no" still takes the map off and its typical photo still leads.
  await checkPagePhotos(r, d, { limit: 0 })
  expect(d.seen).toEqual([])
  expect(await urls(r, 'content/species/danio-rerio/entity.json')).toEqual(['sure', 'unsure', 'new'])
  await checkPagePhotos(r, d, { limit: 10 })
  expect(d.seen.map(s => s.photos)).toEqual([['sure', 'unsure', 'new']])
})

test('most-read pages first, each page\'s own photos and gallery strip before the rest of the galleries, and no sheet part empty while its page has more to judge', async () => {
  const gallery = Array.from({ length: 16 }, (_, i) => `n${i}`)
  const r = await root([{ id: 'abramites-hypselonotus', sci: 'Abramites hypselonotus', photos: ['abr'] }, { id: 'paracheirodon-innesi', sci: 'Paracheirodon innesi', photos: ['neon'], gallery }])
  const d = model({})
  await checkPagePhotos(r, d, { limit: 1 })
  expect(d.seen.map(s => s.photos)).toEqual([['neon', 'n0', 'n1', 'n2', 'n3', 'n4']])
  await checkPagePhotos(r, d, { limit: 10 })
  // The next page's lead, which nothing has looked at, comes before what is left of the neon's strip (n5 to n7), whose
  // half sheet is filled from the rest of its gallery; then what is left of that.
  expect(d.seen.map(s => s.photos).slice(1)).toEqual([['abr'], ['n5', 'n6', 'n7', 'n8', 'n9', 'n10'], ['n11', 'n12', 'n13', 'n14', 'n15']])
})

test("the leads nothing has looked at first, each sheet filled from its page; then the page with no photo of its own; then the rest that wait", async () => {
  const from = (n: string, sourceUrl: string, more: object = {}) => ({ ...photo(n), sourceUrl, ...more })
  const inat = (n: string, more?: object) => from(n, `https://www.inaturalist.org/photos/${n}`, more)
  const commons = (n: string, more?: object) => from(n, `https://commons.wikimedia.org/wiki/File:${n}.jpg`, more)
  // In page order: a page with iNaturalist photos, one with Commons and Flickr photos, one with no photo of its own, one whose new photos wait.
  const r = await root([{ id: 'aaa-fish', sci: 'Aaa fish', photos: ['a-own'] }, { id: 'bbb-fish', sci: 'Bbb fish', photos: ['b-own'] }, { id: 'ccc-fish', sci: 'Ccc fish' }, { id: 'ddd-fish', sci: 'Ddd fish', photos: ['d-own'] }, { id: 'eee-fish', sci: 'Eee fish', photos: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'] }])
  const gallery = (id: string, photos: object[]) => writeFile(join(r, 'content/gallery', `${id}.json`), `${JSON.stringify({ id, photos, seen: 0, updatedAt: '' }, null, 2)}\n`)
  await gallery('aaa-fish', [inat('a1'), inat('a2')])
  await gallery('bbb-fish', [commons('b1'), from('b2', 'https://www.flickr.com/photos/x/2'), inat('b3')])
  await gallery('ccc-fish', [commons('c1', { unchecked: true }), inat('c2', { unchecked: true })])
  await gallery('ddd-fish', [commons('d1', { unchecked: true })])
  await gallery('eee-fish', [commons('e7', { unchecked: true })])
  const d = model({})
  await checkPagePhotos(r, d, { limit: 10 })
  expect(d.seen.map(s => s.photos)).toEqual([
    ['a-own', 'a1', 'a2'], // each page's lead, by page (none is Commons' or Flickr's here), the sheet filled from the page's other photos
    ['b-own', 'b1', 'b2', 'b3'],
    ['d-own', 'd1'], // a waiting photo rides on its page's sheet where there is room
    ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'],
    ['c1', 'c2'], // then the waiting photos of the page with none
    ['e7'], // then the rest that wait
  ])
})

test("a share of the run goes first to a source's photos that fill a page with none", async () => {
  const sourced = (n: string) => ({ ...photo(n), sourceUrl: 'https://tropica.com/en/plants/plantdetails/x/1', source: 'tropica' })
  const commons = (n: string) => ({ ...photo(n), sourceUrl: `https://commons.wikimedia.org/wiki/File:${n}.jpg` })
  const r = await root([
    { id: 'aaa-fish', sci: 'Aaa fish', photos: ['a-own'] },
    { kind: 'plants', id: 'bbb-plant', sci: 'Bbb plant' }, { kind: 'plants', id: 'ccc-plant', sci: 'Ccc plant' }, { kind: 'plants', id: 'ddd-plant', sci: 'Ddd plant', photos: ['d-own'] },
  ])
  const gallery = (id: string, photos: object[]) => writeFile(join(r, 'content/gallery', `${id}.json`), `${JSON.stringify({ id, photos, seen: 0, updatedAt: '' }, null, 2)}\n`)
  await gallery('aaa-fish', [commons('a1')])
  await gallery('bbb-plant', [sourced('b1'), sourced('b2'), commons('b3')]) // no photo of its own: Tropica's would be its first
  await gallery('ccc-plant', [commons('c1')]) // no photo of its own, but no source's photo: it comes with the pages that have none, after the leads
  await gallery('ddd-plant', [sourced('d1')]) // has a photo: nothing to fill
  // With no share, the usual order: the first page's lead.
  const usual = model({})
  await checkPagePhotos(r, usual, { limit: 1 })
  expect(usual.seen.map(s => s.photos)).toEqual([['a-own', 'a1']])
  // With one, the page with none gets its source's photos judged first, the sheet filled from the rest of its gallery.
  const r2 = await root([{ id: 'aaa-fish', sci: 'Aaa fish', photos: ['a-own'] }, { kind: 'plants', id: 'bbb-plant', sci: 'Bbb plant' }, { kind: 'plants', id: 'ccc-plant', sci: 'Ccc plant' }])
  const gallery2 = (id: string, photos: object[]) => writeFile(join(r2, 'content/gallery', `${id}.json`), `${JSON.stringify({ id, photos, seen: 0, updatedAt: '' }, null, 2)}\n`)
  await gallery2('aaa-fish', [commons('a1')])
  await gallery2('bbb-plant', [sourced('b1'), sourced('b2'), commons('b3')])
  await gallery2('ccc-plant', [commons('c1')])
  const d = model({})
  await checkPagePhotos(r2, d, { limit: 10, fill: 1 })
  expect(d.seen.map(s => s.photos)).toEqual([['b1', 'b2', 'b3'], ['a-own', 'a1'], ['c1']])
  // The share is a ceiling on that pass, not on the run: once the one page is filled, the other sheets go in the usual
  // order (the first root again, where the first sheet above is already judged): the lead nothing has looked at, then
  // the page with no photo. A source's photo on a page that has a photo is nothing to fill: it rides on its page's sheet.
  const rest = model({})
  await checkPagePhotos(r, rest, { limit: 10, fill: 5 })
  expect(rest.seen.map(s => s.photos)).toEqual([['b1', 'b2', 'b3'], ['d-own', 'd1'], ['c1']])
})

test("a page's lead is judged no later than its other photos, so none of them goes ahead of a lead that passes", async () => {
  // Found in review, 2026-11-10: Commons' photos have an earlier turn than a lead from elsewhere. Six of them filled a
  // sheet, were judged typical and went ahead of the lead, which stayed behind once it was judged typical too.
  const commons = (n: string) => ({ ...photo(n), sourceUrl: `https://commons.wikimedia.org/wiki/File:${n}.jpg` })
  const r = await root([{ id: 'aaa-fish', sci: 'Aaa fish', extra: { photos: [{ ...photo('lead'), sourceUrl: 'https://www.inaturalist.org/photos/1' }, commons('o1'), commons('o2'), commons('o3')] } }])
  await writeFile(join(r, 'content/gallery/aaa-fish.json'), `${JSON.stringify({ id: 'aaa-fish', photos: [commons('g1'), commons('g2'), commons('g3')], seen: 0, updatedAt: '' }, null, 2)}\n`)
  const d = model(Object.fromEntries(['lead', 'o1', 'o2', 'o3', 'g1', 'g2', 'g3'].map(n => [n, { typical: true }])))
  await checkPagePhotos(r, d, { limit: 1 })
  expect(d.seen.map(s => s.photos)).toEqual([['lead', 'o1', 'o2', 'o3', 'g1', 'g2']])
  expect(await urls(r, 'content/species/aaa-fish/entity.json')).toEqual(['lead', 'o1', 'o2', 'o3'])
  await checkPagePhotos(r, d, { limit: 1 })
  expect(d.seen.map(s => s.photos).slice(1)).toEqual([['g3']])
  expect(await urls(r, 'content/species/aaa-fish/entity.json')).toEqual(['lead', 'o1', 'o2', 'o3'])
})

test("the photos a page shows itself are the first eight of its gallery that readers see: a photo that waits takes none of those places, and a typical lead stays first", async () => {
  // Four photos that wait sit at the head of the gallery file, as the gallery's ranking can put them. The site leaves
  // them out, so its strip is s0 to s7. Counted by their place in the file, s4 to s7 were "the rest of its gallery" and
  // waited for every other page's own photos.
  const commons = (n: string, more: object = {}) => ({ ...photo(n), sourceUrl: `https://commons.wikimedia.org/wiki/File:${n}.jpg`, ...more })
  const r = await root([
    { id: 'aaa-fish', sci: 'Aaa fish', extra: { photos: [{ ...photo('lead'), sourceUrl: 'https://www.inaturalist.org/photos/1' }, commons('o1')] } },
    { id: 'bbb-fish', sci: 'Bbb fish', extra: { photos: [commons('b-own')] } },
  ])
  const waits = ['w0', 'w1', 'w2', 'w3'], strip = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7']
  await writeFile(join(r, 'content/gallery/aaa-fish.json'), `${JSON.stringify({ id: 'aaa-fish', photos: [...waits.map(n => commons(n, { unchecked: true })), ...strip.map(n => commons(n))], seen: 0, updatedAt: '' }, null, 2)}\n`)
  const d = model(Object.fromEntries(['lead', 'o1', 'b-own', ...waits, ...strip].map(n => [n, { typical: true }])))
  await checkPagePhotos(r, d, { limit: 3 })
  // The other page's lead is Commons' and nothing has looked at it, so it goes first. Then this page's lead, its other
  // photo and its whole strip, s0 to s7; the second sheet's last two places go to photos that wait.
  expect(d.seen.map(s => s.photos)).toEqual([['b-own'], ['lead', 'o1', 's0', 's1', 's2', 's3'], ['s4', 's5', 's6', 's7', 'w0', 'w1']])
  // Every photo judged is typical, the lead among them: it stays first.
  expect(await urls(r, 'content/species/aaa-fish/entity.json')).toEqual(['lead', 'o1'])
  await checkPagePhotos(r, d, { limit: 10 })
  expect(d.seen.map(s => s.photos).slice(3)).toEqual([['w2', 'w3']])
  expect(await urls(r, 'content/species/aaa-fish/entity.json')).toEqual(['lead', 'o1'])
})

test("a fish whose source's caption names a split fin counts as not typical, whatever the model said: a typical photo leads; a plant's caption is not asked", async () => {
  const split = (n: string) => photo(n, 'Adult specimen with slight caudal-fin damage.')
  const r = await root([
    { id: 'aaa-fish', sci: 'Aaa fish', extra: { photos: [split('a-split'), photo('a-typical')] } },
    // Nothing typical to lead instead: it stays the lead.
    { id: 'bbb-fish', sci: 'Bbb fish', extra: { photos: [split('b-split'), photo('b-plain')] } },
    { kind: 'plants', id: 'ccc-plant', sci: 'Ccc plant', extra: { photos: [split('c-split'), photo('c-typical')] } },
    // Behind a lead the check can't tell, the first photo it passed goes ahead, not the one with the split fin.
    { id: 'ddd-fish', sci: 'Ddd fish', extra: { photos: [photo('d-hazy'), photo('d-plain'), split('d-split')] } },
    // A breed's page too, the one place the check orders a breed's photos.
    { kind: 'breeds', id: 'eee-breed', vi: { name: 'Eee' }, extra: { photos: [photo('e-hazy'), photo('e-plain'), split('e-split')] } },
  ])
  const d = model({ 'a-split': { typical: true }, 'a-typical': { typical: true }, 'b-split': { typical: true }, 'c-split': { typical: true }, 'c-typical': { typical: true }, 'd-hazy': { ok: 'unsure', note: 'too small to tell' }, 'd-split': { typical: true }, 'e-hazy': { ok: 'unsure', note: 'too small to tell' }, 'e-split': { typical: true } })
  await checkPagePhotos(r, d, { limit: 10 })
  expect(await urls(r, 'content/species/aaa-fish/entity.json')).toEqual(['a-typical', 'a-split'])
  expect(await urls(r, 'content/species/bbb-fish/entity.json')).toEqual(['b-split', 'b-plain'])
  expect(await urls(r, 'content/plants/ccc-plant/entity.json')).toEqual(['c-split', 'c-typical'])
  expect(await urls(r, 'content/species/ddd-fish/entity.json')).toEqual(['d-plain', 'd-hazy', 'd-split'])
  expect(await urls(r, 'content/breeds/eee-breed/entity.json')).toEqual(['e-plain', 'e-hazy', 'e-split'])
})

test("a lead nothing has looked at is judged first, Flickr's and Commons' before the rest; then the page with no photo of its own; then each photo in its turn (the chief of staff, 2026-11-11)", async () => {
  // The owner found a parasite paper's plate as a page's only photo: it had come in from Commons three days before and
  // the check had not reached it, behind every more-read page's gallery.
  const from = (n: string, sourceUrl: string, more: object = {}) => ({ ...photo(n), sourceUrl, ...more })
  const inat = (n: string, more?: object) => from(n, `https://www.inaturalist.org/photos/${n}`, more)
  const commons = (n: string, more?: object) => from(n, `https://commons.wikimedia.org/wiki/File:${n}.jpg`, more)
  // In page order: two pages whose lead the check has passed, one with a lead from iNaturalist and one with a lead
  // from Commons that nothing has looked at, and one with no photo of its own.
  const r = await root([
    { id: 'aaa-fish', sci: 'Aaa fish', extra: { photos: [inat('a-own')] } },
    { id: 'bbb-fish', sci: 'Bbb fish', extra: { photos: [inat('b-own')] } },
    { id: 'ccc-fish', sci: 'Ccc fish', extra: { photos: [inat('c-own'), inat('c-two')] } },
    { id: 'ddd-fish', sci: 'Ddd fish', extra: { photos: [commons('d-own')] } },
    { id: 'eee-fish', sci: 'Eee fish' },
  ])
  const gallery = (id: string, photos: object[]) => writeFile(join(r, 'content/gallery', `${id}.json`), `${JSON.stringify({ id, photos, seen: 0, updatedAt: '' }, null, 2)}\n`)
  await gallery('aaa-fish', [inat('a1')])
  await gallery('bbb-fish', [commons('b1'), inat('b2')])
  await gallery('ddd-fish', [commons('d1')])
  await gallery('eee-fish', [inat('e1'), commons('e2', { unchecked: true })])
  const seen = { ok: 'yes', typical: true, note: '', logo: false, person: false }
  await writeFile(join(r, 'engine-state/_photo-subjects.json'), JSON.stringify({ [url('a-own')]: { 'aaa-fish': seen }, [url('b-own')]: { 'bbb-fish': seen } }))
  const d = model({})
  await checkPagePhotos(r, d, { limit: 10 })
  expect(d.seen.map(s => s.photos)).toEqual([
    ['d-own', 'd1'], // Commons' lead that nothing has looked at, its sheet filled from its page
    ['c-own', 'c-two'], // then the other leads nothing has looked at
    ['e1', 'e2'], // then the page with no photo of its own, what it shows and what waits
    ['b1', 'b2'], // then the turns as before: Commons' photos readers see, the sheet filled from the page's later turn
    ['a1'],
  ])
})

test("the lead a page shows stays where the check passes it as typical, and gives way to a typical photo where it passes as less, can't be told, is taken off, or has not been judged", async () => {
  const pages = ['aaa', 'bbb', 'ccc', 'ddd', 'eee'].map(p => ({ id: `${p}-fish`, sci: `${p} fish`, photos: [`${p}-lead`, `${p}-typical`] }))
  const r = await root(pages)
  // The lead of the last page was judged "can't tell" in an earlier run, with nothing else on the page judged yet.
  await writeFile(join(r, 'engine-state/_photo-subjects.json'), JSON.stringify({ [url('ddd-lead')]: { 'ddd-fish': { ok: 'unsure', typical: false, note: 'too small to tell', logo: false, person: false } } }))
  const d = model({
    'aaa-typical': { typical: true }, // its lead passes, not as typical
    'bbb-lead': { ok: 'unsure', note: 'too small to tell' }, 'bbb-typical': { typical: true },
    'ccc-lead': { ok: 'other', note: 'another fish' }, 'ccc-typical': { typical: true },
    'ddd-typical': { typical: true },
    'eee-lead': { typical: true }, 'eee-typical': { typical: true },
  })
  await checkPagePhotos(r, d, { limit: 10 })
  expect(await urls(r, 'content/species/aaa-fish/entity.json')).toEqual(['aaa-typical', 'aaa-lead'])
  expect(await urls(r, 'content/species/bbb-fish/entity.json')).toEqual(['bbb-typical', 'bbb-lead'])
  expect(await urls(r, 'content/species/ccc-fish/entity.json')).toEqual(['ccc-typical'])
  expect(await urls(r, 'content/species/ddd-fish/entity.json')).toEqual(['ddd-typical', 'ddd-lead'])
  // Both typical: the lead stays the lead.
  expect(await urls(r, 'content/species/eee-fish/entity.json')).toEqual(['eee-lead', 'eee-typical'])
  // A second run finds nothing to judge and moves nothing.
  await checkPagePhotos(r, d, { limit: 10 })
  expect(await urls(r, 'content/species/aaa-fish/entity.json')).toEqual(['aaa-typical', 'aaa-lead'])
  expect(await urls(r, 'content/species/eee-fish/entity.json')).toEqual(['eee-lead', 'eee-typical'])
})

test("a lead's sheet takes the page's own photos before its gallery's, so a photo that takes a removed lead's place was judged beside it", async () => {
  const r = await root([{ id: 'aaa-fish', sci: 'Aaa fish', photos: ['lead', 'second'] }])
  // Commons' photos have the first turn, the page's own (another source's) the second: by turn alone they would fill the sheet.
  const commons = ['g1', 'g2', 'g3', 'g4', 'g5'].map(n => ({ ...photo(n), sourceUrl: `https://commons.wikimedia.org/wiki/File:${n}.jpg` }))
  await writeFile(join(r, 'content/gallery/aaa-fish.json'), `${JSON.stringify({ id: 'aaa-fish', photos: commons, seen: 0, updatedAt: '' }, null, 2)}\n`)
  const d = model({ lead: { ok: 'other', note: 'another fish' } })
  await checkPagePhotos(r, d, { limit: 1 })
  expect(d.seen.map(s => s.photos)).toEqual([['lead', 'second', 'g1', 'g2', 'g3', 'g4']])
  expect(await urls(r, 'content/species/aaa-fish/entity.json')).toEqual(['second'])
  expect((await json(r, 'engine-state/_photo-subjects.json'))[url('second')]['aaa-fish'].ok).toBe('yes')
})

test('a typical photo judged in a later run goes ahead of a lead that passed as less, and behind a lead that passed as typical; a generated picture goes last', async () => {
  // One sheet a run: the lead with five of its page's photos, then the seventh, which is typical.
  const seven = (p: string) => [`${p}-lead`, ...[1, 2, 3, 4, 5].map(n => `${p}-o${n}`), `${p}-late`]
  const less = await root([{ id: 'aaa-fish', sci: 'Aaa fish', photos: seven('a') }])
  const d = model({ 'a-late': { typical: true }, 'b-lead': { typical: true }, 'b-late': { typical: true }, real: { typical: true }, typical: { typical: true } })
  await checkPagePhotos(less, d, { limit: 1 })
  // The lead passed, not as typical, and nothing typical has been judged yet: it leads.
  expect(await urls(less, 'content/species/aaa-fish/entity.json')).toEqual(seven('a'))
  await checkPagePhotos(less, d, { limit: 1 })
  expect(d.seen.map(s => s.photos)).toEqual([seven('a').slice(0, 6), ['a-late']])
  // From the run that judges the typical photo, that photo leads (the chief of staff, 2026-11-11).
  expect(await urls(less, 'content/species/aaa-fish/entity.json')).toEqual(['a-late', ...seven('a').slice(0, 6)])
  // A lead that passed as typical stays ahead of a typical photo judged later.
  const typical = await root([{ id: 'bbb-fish', sci: 'Bbb fish', photos: seven('b') }])
  await checkPagePhotos(typical, d, { limit: 1 })
  await checkPagePhotos(typical, d, { limit: 1 })
  expect(await urls(typical, 'content/species/bbb-fish/entity.json')).toEqual(['b-lead', 'b-late', ...seven('b').slice(1, 6)])
  // A generated picture first in the file is not the lead: the first real photo is, and the generated one goes last.
  const g = await root([{ id: 'ccc-fish', sci: 'Ccc fish', extra: { photos: [{ ...photo('made'), generated: { model: 'x' } }, photo('real'), photo('typical')] } }])
  await checkPagePhotos(g, d, { limit: 1 })
  expect(d.seen.at(-1)!.photos).toEqual(['real', 'typical'])
  expect(await urls(g, 'content/species/ccc-fish/entity.json')).toEqual(['real', 'typical', 'made'])
})

test("a photo the check can't tell never leads a page that has one it passed, a breed's too; with nothing passed it stays", async () => {
  const hazy = { ok: 'unsure' as const, note: 'too small to tell' }
  const r = await root([
    { id: 'aaa-fish', sci: 'Aaa fish', photos: ['a-hazy', 'a-dim', 'a-passed', 'a-also'] },
    { id: 'bbb-fish', sci: 'Bbb fish', photos: ['b-hazy', 'b-dim'] },
    // The check leaves a breed's order as it is, but for this.
    { kind: 'breeds', id: 'ccc-breed', vi: { name: 'Ccc' }, photos: ['c-hazy', 'c-passed', 'c-typical'] },
    { kind: 'breeds', id: 'ddd-breed', vi: { name: 'Ddd' }, photos: ['d-passed', 'd-typical'] },
  ])
  const d = model({ 'a-hazy': hazy, 'a-dim': hazy, 'b-hazy': hazy, 'b-dim': hazy, 'c-hazy': hazy, 'c-typical': { typical: true }, 'd-typical': { typical: true } })
  await checkPagePhotos(r, d, { limit: 10 })
  // The first passed photo goes ahead of the lead, and nothing else moves.
  expect(await urls(r, 'content/species/aaa-fish/entity.json')).toEqual(['a-passed', 'a-hazy', 'a-dim', 'a-also'])
  expect(await urls(r, 'content/species/bbb-fish/entity.json')).toEqual(['b-hazy', 'b-dim'])
  // A typical photo before another that passed.
  expect(await urls(r, 'content/breeds/ccc-breed/entity.json')).toEqual(['c-typical', 'c-hazy', 'c-passed'])
  expect(await urls(r, 'content/breeds/ddd-breed/entity.json')).toEqual(['d-passed', 'd-typical'])
  // A second run moves nothing.
  await checkPagePhotos(r, d, { limit: 10 })
  expect(await urls(r, 'content/species/aaa-fish/entity.json')).toEqual(['a-passed', 'a-hazy', 'a-dim', 'a-also'])
  expect(await urls(r, 'content/breeds/ccc-breed/entity.json')).toEqual(['c-typical', 'c-hazy', 'c-passed'])
})

test("in an album a photo the check can't tell comes after those it passed or has not reached, and the album step's ranking keeps it there", async () => {
  const r = await root([{ id: 'aaa-fish', sci: 'Aaa fish', photos: ['own'] }])
  const file = 'content/gallery/aaa-fish.json'
  const album = [
    { ...photo('hazy-best'), best: true, kind: 'male' }, { ...photo('best'), best: true, kind: 'female' },
    { ...photo('old') }, { ...photo('hazy'), kind: 'other' }, { ...photo('later'), kind: 'other' }, { ...photo('waits'), kind: 'other', unchecked: true },
  ]
  await writeFile(join(r, file), `${JSON.stringify({ id: 'aaa-fish', photos: album, seen: 0, updatedAt: '' }, null, 2)}
`)
  // One sheet: the page's photo and the first five album photos. The sixth still waits, unjudged.
  const d = model({ 'hazy-best': { ok: 'unsure', note: 'too small to tell' }, hazy: { ok: 'unsure', note: 'a blur' } })
  await checkPagePhotos(r, d, { limit: 1 })
  expect(d.seen.map(s => s.photos)).toEqual([['own', 'hazy-best', 'best', 'old', 'hazy', 'later']])
  const after = ['best', 'old', 'later', 'waits', 'hazy-best', 'hazy']
  expect(await urls(r, file)).toEqual(after)
  // The album step re-ranks an album it adds to. With the check's record it puts them last too, so neither undoes the other.
  const subjects = await json(r, 'engine-state/_photo-subjects.json')
  const ranked = rankGallery((await json(r, file)).photos, cantTellOn(subjects, 'aaa-fish'))
  expect(ranked.map(p => name(p.url))).toEqual(after)
  // Without the record the album step would put its best pick back first.
  expect(name(rankGallery((await json(r, file)).photos)[0]!.url)).toBe('hazy-best')
  await writeFile(join(r, file), `${JSON.stringify({ id: 'aaa-fish', photos: ranked, seen: 0, updatedAt: '' }, null, 2)}
`)
  const before = await readFile(join(r, file), 'utf8')
  await checkPagePhotos(r, d, { limit: 0 })
  expect(await readFile(join(r, file), 'utf8')).toBe(before)
})

test('a gallery photo that waits shows once the check has judged it and left it on; one it rejects goes; one not judged yet still waits', async () => {
  const r = await root([{ id: 'danio-rerio', sci: 'Danio rerio', photos: ['own'] }])
  const file = join(r, 'content/gallery/danio-rerio.json')
  const write = (photos: object[]) => writeFile(file, `${JSON.stringify({ id: 'danio-rerio', photos, seen: 0, updatedAt: '' }, null, 2)}\n`)
  await write([photo('old'), { ...photo('good'), unchecked: true }, { ...photo('barb'), unchecked: true }, { ...photo('hazy'), unchecked: true }])
  const d = model({ barb: { ok: 'other', note: 'a tiger barb' }, hazy: { ok: 'unsure', note: 'too small to tell' } })
  // With no model call to spend, nothing is judged and all three still wait.
  await checkPagePhotos(r, d, { limit: 0 })
  expect(((await json(r, 'content/gallery/danio-rerio.json')).photos as { unchecked?: boolean }[]).map(p => !!p.unchecked)).toEqual([false, true, true, true])
  await checkPagePhotos(r, d, { limit: 10 })
  const after = (await json(r, 'content/gallery/danio-rerio.json')).photos as { url: string; unchecked?: boolean }[]
  // The barb is off; "can't tell" stays and is listed, as for any photo, and no longer waits.
  expect(after.map(p => [name(p.url), 'unchecked' in p])).toEqual([['old', false], ['good', false], ['hazy', false]])
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
  // Released by a person who has looked: a page's last photo doesn't come off on the check's word alone (EMPTY_CAP).
  const r = await root([{ id: 'paracheirodon-simulans', sci: 'Paracheirodon simulans', photos: ['p1'], gallery: ['g1'] }, { id: 'paracheirodon-innesi', sci: 'Paracheirodon innesi', photos: ['ok'] }])
  await checkPagePhotos(r, model({ p1: { ok: 'other', note: 'neon tetra' }, g1: { ok: 'other', note: 'neon tetra' } }), { limit: 10, emptyCap: 99 })
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
  expectControlledRejections(await json(r, 'engine-state/_photo-rejected.json'), {})
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
  // Released by a person who has looked: a page's last photo doesn't come off on the check's word alone (EMPTY_CAP).
  const r = await root([{ id: 'danio-rerio', sci: 'Danio rerio', photos: ['x'] }])
  const file = join(r, 'engine-state/_photo-rejected.json')
  await writeFile(file, JSON.stringify({ [url('a')]: 'by hand' }))
  const d = model({ x: { ok: 'other', note: 'a guppy' } })
  await checkPagePhotos(r, { ...d, look: async (s, p) => { await writeFile(file, JSON.stringify({ [url('a')]: 'by hand', [url('b')]: 'watermark' })); return d.look(s, p) } }, { limit: 10, emptyCap: 99 })
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
  // Released by a person who has looked: a page's last photo doesn't come off on the check's word alone (EMPTY_CAP).
  const r = await root([{ id: 'danio-rerio', sci: 'Danio rerio', photos: ['map', 'guppy'] }], { biotope: { photos: [photo('map'), photo('guppy')] } })
  await checkPagePhotos(r, model({ map: { ok: 'none', note: 'a range map' }, guppy: { ok: 'other', note: 'a guppy' } }), { limit: 10, emptyCap: 99 })
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
  // Released by a person who has looked: a page's last photo doesn't come off on the check's word alone (EMPTY_CAP).
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
  const out = await checkPagePhotos(r, d, { limit: 10, emptyCap: 99 })
  expect(d.seen[0]!.prompt).toMatch(/"dead" if it shows a dead fish or other animal, or fish as food, whatever the species: at a market or fishmonger's, on ice; on a plate, cooked, fillets; a catch landed or held up/)
  expect(await urls(r, 'content/species/cichla-temensis/entity.json')).toEqual(['live'])
  expect(await urls(r, 'content/gallery/cichla-temensis.json')).toEqual([])
  expect(await urls(r, 'content/species/cichla-ocellaris/entity.json')).toEqual([])
  expect(await urls(r, 'content/guides/peacocks/entity.json')).toEqual([])
  expectControlledRejections(await json(r, 'engine-state/_photo-rejected.json'), { [url('market')]: "dead" })
  expect(out.blocked).toEqual([`${url('market')}: dead: subject dead`])
  // A dead fish is never the page's typical photo, and the review lists it.
  expect((await json(r, 'engine-state/_photo-subjects.json'))[url('market')]['cichla-temensis']).toMatchObject({ ok: 'dead', typical: false, logo: false })
  expect(await readFile(join(r, 'docs/review/photo-subjects.md'), 'utf8')).toMatch(/dead or as food: 1;[\s\S]*species\/cichla-temensis \| \[photo\]\(https:\/\/media\.example\/market\.webp\) \| subject dead/)
})

test('a logo the text reader missed is a watermark: off every page, onto the blocklist; the same photographer\'s other photos are asked again', async () => {
  // Released by a person who has looked: a page's last photo doesn't come off on the check's word alone (EMPTY_CAP).
  const r = await root([
    { id: 'cichla-temensis', sci: 'Cichla temensis', photos: ['stamped'], gallery: ['clean'] },
    { id: 'phractocephalus-hemioliopterus', sci: 'Phractocephalus hemioliopterus', photos: ['redtail', 'other-author'] },
  ])
  for (const [f, photos] of [['content/species/cichla-temensis/entity.json', [photo('stamped', undefined, 'Fixture contributor')]], ['content/species/phractocephalus-hemioliopterus/entity.json', [photo('redtail', undefined, 'Fixture contributor'), photo('other-author')]]] as const) {
    await writeFile(join(r, f), JSON.stringify({ ...(await json(r, f)), photos }))
  }
  // Both pages judged before the check asked about logos: only the stamped photo's page is asked again (as `recheck` does)…
  await writeFile(join(r, 'engine-state/_photo-subjects.json'), JSON.stringify({
    [url('redtail')]: { 'phractocephalus-hemioliopterus': { ok: 'yes', typical: true, note: 'redtail catfish' } },
    [url('other-author')]: { 'phractocephalus-hemioliopterus': { ok: 'yes', typical: true, note: 'redtail catfish' } },
  }))
  const d = model({ stamped: { logo: true, note: 'peacock bass; round added logo bottom left' }, redtail: { logo: true, note: 'redtail catfish; round logo bottom left' } })
  await checkPagePhotos(r, d, { limit: 10, emptyCap: 99, recheck: new Set([url('stamped')]) })
  expect(d.seen[0]!.prompt).toContain('- logo: true if a logo, stamp, watermark, signature or text was added on top of the photo after it was taken, even small or faint, round, in a corner')
  // …then the same photographer's: their redtail photo on another page, not the other author's photo there.
  expect(d.seen.map(s => s.photos)).toEqual([['stamped'], ['redtail']])
  expect(await urls(r, 'content/species/cichla-temensis/entity.json')).toEqual([])
  expect(await urls(r, 'content/species/phractocephalus-hemioliopterus/entity.json')).toEqual(['other-author'])
  expect(await urls(r, 'content/gallery/cichla-temensis.json')).toEqual(['clean'])
  expectControlledRejections(await json(r, 'engine-state/_photo-rejected.json'), {
    [url('stamped')]: "watermark",
    [url('redtail')]: "watermark",
  })
})

test('an engraved plate or an old drawing is "not a photo of it" as before, not "dead": it leaves its page with that reason', async () => {
  // Released by a person who has looked: a page's last photo doesn't come off on the check's word alone (EMPTY_CAP).
  const r = await root([{ id: 'bagrus-bajad', sci: 'Bagrus bajad', photos: ['plate'] }])
  const d = model({ plate: { ok: 'none', typical: false, note: 'old engraved plate of two Bagrus catfish' } })
  await checkPagePhotos(r, d, { limit: 10, emptyCap: 99 })
  expect(d.seen[0]!.prompt).toContain('Not "dead": a drawing, painting or engraved plate (that is "none"; a photo of a preserved specimen is "dead", however old); a live fish held briefly in a net or a bag.')
  expect(d.seen[0]!.prompt).toContain('"none" if it is not a photo of the subject at all: a map, chart, diagram or drawing, hands or people')
  expect(await urls(r, 'content/species/bagrus-bajad/entity.json')).toEqual([])
  expectControlledRejections(await json(r, 'engine-state/_photo-rejected.json'), { [url('plate')]: "rejected" })
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
    // Judged since the check asks about dead fish, logos and people: not asked again.
    [url('new')]: { 'cichla-temensis': v('dead fish on ice', { ok: 'dead', logo: false, person: false }) },
  }))
  await writeFile(join(r, 'engine-state/_photo-watermarks.json'), JSON.stringify({ [url('tag')]: { ocr: [], watermark: false, kind: 'none', what: 'preserved specimen photo, no text' } }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [url('gone')]: 'dead: already off' }))
  const g = join(r, 'content/gallery/cichla-temensis.json')
  await writeFile(g, JSON.stringify({ ...(await json(r, 'content/gallery/cichla-temensis.json')), photos: [photo('cho', 'Cá hoàng đế sao chết bày bán ở chợ'), photo('swim', 'Cá hoàng đế sao bơi trong bể')] }))
  expect(Object.fromEntries([...await recheckCandidates(r)].map(([u, n]) => [name(u), n]))).toEqual({
    market: 'possible dead subject',
    tag: 'possible dead subject',
    cho: 'possible dead subject',
    shell: 'possible dead subject',
    landed: 'possible dead subject',
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
  // Released by a person who has looked: a page's last photo doesn't come off on the check's word alone (EMPTY_CAP).
  const r = await root([{ id: 'cichla-temensis', sci: 'Cichla temensis', photos: ['market'], gallery: ['market'] }])
  const file = join(r, 'content/species/cichla-temensis/entity.json')
  const real = JSON.parse(await readFile(new URL('../../../apps/site/test/fixture-content/species/paracheirodon-innesi/entity.json', import.meta.url), 'utf8'))
  await writeFile(file, `${JSON.stringify({ ...real, id: 'cichla-temensis', scientificName: 'Cichla temensis', photos: [photo('market')] }, null, 2)}\n`)
  await checkPagePhotos(r, model({ market: { ok: 'dead', note: 'dead fish at a market' } }), { limit: 10, emptyCap: 99 })
  const e = await json(r, 'content/species/cichla-temensis/entity.json')
  expect(e.photos).toEqual([])
  expect(SpeciesSchema.safeParse(e).success).toBe(true)
  expect(await urls(r, 'content/gallery/cichla-temensis.json')).toEqual([])
  expect(await readFile(join(r, 'docs/review/photo-subjects.md'), 'utf8')).toMatch(/## Left with no photo \(1\)\n\n- species\/cichla-temensis\n/)
})

test('a lake with no fish is "not a photo of it": an old "habitat" verdict is asked again and the page loses it; the fish seen in the wild stays', async () => {
  // Released by a person who has looked: a page's last photo doesn't come off on the check's word alone (EMPTY_CAP).
  // Found by a design review (2026-11-07): the firemouth's only photo, a lake with a park and a tower, was judged
  // "habitat" (its wild place, with or without it) and kept, so it led the page, its index card and tank-mates blocks.
  const r = await root([{ id: 'thorichthys-meeki', sci: 'Thorichthys meeki', photos: ['lake'], gallery: ['wild'] }])
  await writeFile(join(r, 'engine-state/_photo-subjects.json'), JSON.stringify({
    [url('lake')]: { 'thorichthys-meeki': { ok: 'habitat', typical: false, note: 'lake with a park and a tower', logo: false } },
    [url('wild')]: { 'thorichthys-meeki': { ok: 'habitat', typical: false, note: 'two firemouths over sand in a clear river', logo: false } },
  }))
  const d = model({ lake: { ok: 'none', note: 'lake with a park and a tower, no fish' } })
  await checkPagePhotos(r, d, { limit: 10, emptyCap: 99 })
  expect(d.seen.map(s => s.photos)).toEqual([['lake', 'wild']])
  expect(d.seen[0]!.prompt).toContain('a landscape or wild place (a river, stream, lake, swamp or shore) where it can\'t be picked out')
  expect(d.seen[0]!.prompt).toContain('and so does it in the wild where it is clearly seen')
  expect(d.seen[0]!.prompt).not.toContain('"habitat"')
  expect(await urls(r, 'content/species/thorichthys-meeki/entity.json')).toEqual([])
  expect(await urls(r, 'content/gallery/thorichthys-meeki.json')).toEqual(['wild'])
  expectControlledRejections(await json(r, 'engine-state/_photo-rejected.json'), { [url('lake')]: "rejected" })
})

test('a person or a hand in the shot takes a photo off every page, gallery and guide, though the fish is what it shows', async () => {
  // PRODUCT.md: "Photos never show people (hands count)". The check called a fish held in a hand "yes": on 2026-11-07,
  // 97 photos still shown had a note saying hands or people.
  const r = await root([{ id: 'hypancistrus-zebra', sci: 'Hypancistrus zebra', photos: ['inhand', 'tank'], gallery: ['inhand'] }], { plecos: { photos: [photo('inhand')] } })
  const d = model({ inhand: { typical: true, person: true, note: 'adult held in a hand over a river' } })
  const out = await checkPagePhotos(r, d, { limit: 10 })
  expect(d.seen[0]!.prompt).toContain('- person: true if a person or any part of one is in the photo: a hand or fingers')
  expect(await urls(r, 'content/species/hypancistrus-zebra/entity.json')).toEqual(['tank'])
  expect(await urls(r, 'content/gallery/hypancistrus-zebra.json')).toEqual([])
  expect(await urls(r, 'content/guides/plecos/entity.json')).toEqual([])
  expectControlledRejections(await json(r, 'engine-state/_photo-rejected.json'), { [url('inhand')]: "people" })
  expect(out.blocked).toEqual([`${url('inhand')}: people: subject yes; person`])
  expect((await json(r, 'engine-state/_photo-subjects.json'))[url('tank')]['hypancistrus-zebra']).toMatchObject({ ok: 'yes', person: false, logo: false })
  expect(await readFile(join(r, 'docs/review/photo-subjects.md'), 'utf8')).toMatch(/a person in it: 1;[\s\S]*species\/hypancistrus-zebra \| \[photo\]\(https:\/\/media\.example\/inhand\.webp\) \| subject yes; person/)
})

test('a photo only the first check judged, before it asked about logos, is asked again: a faint signature the text reader missed takes it off', async () => {
  // Found by a design review (2026-11-07): Boraras urophthalmoides led with a photo signed faintly in Thai at the bottom.
  // macOS Vision read no text on it, Commons isn't a logo source, and the first check's "yes" stood for it.
  const r = await root([{ id: 'boraras-urophthalmoides', sci: 'Boraras urophthalmoides', photos: ['signed', 'clean'] }])
  await writeFile(join(r, 'engine-state/_photo-check.json'), JSON.stringify({ [url('signed')]: { ok: 'yes', typical: true, note: 'adult among plants' }, [url('clean')]: { ok: 'yes', typical: true, note: 'adult' } }))
  const d = model({ signed: { typical: true, logo: true, note: 'adult among plants; faint Thai signature, bottom centre' } })
  await checkPagePhotos(r, d, { limit: 10 })
  expect(d.seen.map(s => s.photos)).toEqual([['signed', 'clean']])
  expect(d.seen[0]!.prompt).toContain('in any script, with or without readable letters')
  expect(await urls(r, 'content/species/boraras-urophthalmoides/entity.json')).toEqual(['clean'])
  expectControlledRejections(await json(r, 'engine-state/_photo-rejected.json'), { [url('signed')]: "watermark" })
})

test('photos to judge first also come from notes saying a hand or a person, and from the old "habitat" verdict', async () => {
  const r = await root([{ id: 'hypostomus-plecostomus', sci: 'Hypostomus plecostomus', photos: ['hand', 'river', 'tank', 'asked'], gallery: ['tay'] }])
  await writeFile(join(r, 'engine-state/_photo-check.json'), JSON.stringify({
    [url('hand')]: { ok: 'yes', typical: true, note: 'Adult held in a hand by a river' },
    [url('river')]: { ok: 'habitat', typical: false, note: 'Wide brown river, no fish' },
  }))
  await writeFile(join(r, 'engine-state/_photo-subjects.json'), JSON.stringify({
    [url('tank')]: { 'hypostomus-plecostomus': { ok: 'yes', typical: true, note: 'adult on driftwood in a tank', logo: false } },
    [url('asked')]: { 'hypostomus-plecostomus': { ok: 'yes', typical: true, note: 'adult held in a hand', logo: false, person: false } },
  }))
  const g = join(r, 'content/gallery/hypostomus-plecostomus.json')
  await writeFile(g, JSON.stringify({ ...(await json(r, 'content/gallery/hypostomus-plecostomus.json')), photos: [photo('tay', 'Cá tỳ bà cầm trên tay')] }))
  expect(Object.fromEntries([...await recheckCandidates(r)].map(([u, n]) => [name(u), n]))).toEqual({
    hand: 'possible person',
    river: 'habitat needs recheck',
    tay: 'possible person',
  })
  expect(peopleNote('Adult among dead leaves on the bottom')).toBe(false)
})

// The v2 Lab (2026-11-08): the model took a Dario dario male for a Badis badis, and a Channa andrao was "can't tell" on
// two snakehead pages; the gallery's Vietnamese captions had dropped the species the Commons file name gave.
test('a Commons photo whose file name names another species with a page leaves that page, whatever the model said', async () => {
  const r = await root([
    { id: 'badis-badis', sci: 'Badis badis', gallery: ['dario', 'blue', 'both', 'andrao'] },
    { id: 'channa-andrao', sci: 'Channa andrao' },
    { id: 'dario-dario', sci: 'Dario dario', gallery: ['dario'] },
    { kind: 'plants', id: 'anubias-barteri', sci: 'Anubias barteri' },
    { kind: 'plants', id: 'anubias-barteri-var-glabra', sci: 'Anubias barteri var. glabra', gallery: ['glabra'] },
    { id: 'neocaridina-davidi', sci: 'Neocaridina davidi', extra: { synonyms: ['Neocaridina heteropoda'] }, gallery: ['cherry', 'tenellus'] },
    { id: 'danio-margaritatus', sci: 'Danio margaritatus' },
    { kind: 'plants', id: 'helanthium-tenellum', sci: 'Helanthium tenellum', extra: { synonyms: ['Echinodorus tenellus'] } },
  ])
  const files: Record<string, string> = {
    dario: 'Dario_dario_male.jpg', andrao: 'Channa_andrao_im_Aquarium.jpg', blue: 'Blauwe_badis_(man).jpg', both: 'Badis_badis_and_Dario_dario.jpg',
    glabra: 'Anubias_barteri_var._glabra-Jardin_botanique_de_Berlin_(2).jpg', cherry: 'Neocaridina_heteropoda,_Danio_margaritatus.jpg',
    tenellus: 'Red_cherry_shrimp_on_Echinodorus_tenellus.jpg',
  }
  for (const id of ['badis-badis', 'dario-dario', 'anubias-barteri-var-glabra', 'neocaridina-davidi']) {
    const f = join(r, 'content/gallery', `${id}.json`)
    const g = JSON.parse(await readFile(f, 'utf8'))
    for (const p of g.photos) p.sourceUrl = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(files[name(p.url)]!)}`
    await writeFile(f, `${JSON.stringify(g, null, 2)}\n`)
  }
  // The model's earlier look: a Badis badis male.
  await writeFile(join(r, 'engine-state/_photo-subjects.json'), JSON.stringify({ [url('dario')]: { 'badis-badis': { ok: 'yes', typical: true, note: 'a Badis badis male', logo: false, person: false } } }))
  const d = model({})
  const out = await checkPagePhotos(r, d, { limit: 10 })
  expect(out.removed).toEqual([`gallery/badis-badis.json: ${url('dario')}`, `gallery/badis-badis.json: ${url('andrao')}`])
  expect(await urls(r, 'content/gallery/badis-badis.json')).toEqual(['blue', 'both'])
  expect(await urls(r, 'content/gallery/dario-dario.json')).toEqual(['dario'])
  // A variety's photo filed under its species, a synonym with another fish in the shot, and a plant in the tank, stay.
  expect(await urls(r, 'content/gallery/anubias-barteri-var-glabra.json')).toEqual(['glabra'])
  expect(await urls(r, 'content/gallery/neocaridina-davidi.json')).toEqual(['cherry', 'tenellus'])
  expect((await json(r, 'engine-state/_photo-subjects.json'))[url('dario')]['badis-badis']).toMatchObject({ ok: 'other', typical: false, note: 'subject other', noteHash: expect.stringMatching(/^[a-f0-9]{64}$/), logo: false, person: false, file: true })
  // Not sent to the model for Badis badis, and not rejected for good: Dario dario's page keeps it, and Channa andrao's may take it.
  expect(d.seen.filter(s => s.prompt.includes('Badis badis')).flatMap(s => s.photos)).toEqual(['blue', 'both'])
  expectControlledRejections(await json(r, 'engine-state/_photo-rejected.json'), {})
})

test('--only takes several pages, comma-separated, and judges those alone', async () => {
  // The Curation & Media Lead's 36 pages with unchecked gallery photos (2026-11-08): a list judged nothing.
  const r = await root([{ id: 'a-fish', sci: 'A fish', gallery: ['a1'] }, { id: 'b-fish', sci: 'B fish', gallery: ['b1'] }, { id: 'c-fish', sci: 'C fish', gallery: ['c1'] }])
  const d = model({})
  await checkPagePhotos(r, d, { limit: 10, only: 'a-fish, b-fish', today: '2026-11-08' })
  expect(d.seen.flatMap(x => x.photos).sort()).toEqual(['a1', 'b1'])
})

test.each(['usage limit', 'invalid model answer'])('a species-check failure retains only the controlled stop kind: %s',async kind=>{
 const r=await root([{id:'danio-rerio',sci:'Danio rerio',photos:['a','b']}]),trip=['TEST','ONLY','FAILED','MODEL','WORDS'].join('_')
 const report=await checkPagePhotos(r,{get:async()=>new Uint8Array(await jpeg),look:async()=>{throw new LlmError(kind+' '+trip)}},{limit:10})
 expect(report.stopped).toBe('danio-rerio: '+(kind==='usage limit'?'usage limit':'photo model unavailable'))
 expect(JSON.stringify(report)).not.toContain(trip)
 expect(await urls(r,'content/species/danio-rerio/entity.json')).toEqual(['a','b'])
})

test("a head a person picked stays first though the check can't tell it and passed another photo, so the steps before the sweep see the head a person chose", async () => {
  const r = await root([{ id: 'channa-maculata', sci: 'Channa maculata', photos: ['night', 'pond'] }])
  await writeFile(join(r, 'engine-state/_photo-head-picks.json'), JSON.stringify({ 'species/channa-maculata': url('pond') }))
  const d = model({ night: { typical: true }, pond: { ok: 'unsure', typical: true, note: 'could be C. maculata or C. argus' } })
  await checkPagePhotos(r, d, { limit: 5 })
  expect(await urls(r, 'content/species/channa-maculata/entity.json')).toEqual(['pond', 'night'])
  // With no pick, the photo the check can't tell goes behind the one it passed, as before.
  const r2 = await root([{ id: 'channa-maculata', sci: 'Channa maculata', photos: ['pond', 'night'] }])
  await checkPagePhotos(r2, model({ night: { typical: true }, pond: { ok: 'unsure', typical: true } }), { limit: 5 })
  expect(await urls(r2, 'content/species/channa-maculata/entity.json')).toEqual(['night', 'pond'])
})

test("a pick that rests on a person's yes lapses with it in the same pass: once the check says anything but \"can't tell\", or the yes doesn't count, the order above holds", async () => {
  const yes = { proposer: 'Photo Sourcing', approvers: ['the chief of staff', 'Curation'], on: '2026-11-19', lookAlike: 'Channa argus', mark: 'the rows of round dark blotches along the flank' }
  const page = async (pond: object, y: object = yes) => {
    const r = await root([{ id: 'channa-maculata', sci: 'Channa maculata', photos: ['night', 'pond'] }])
    await writeFile(join(r, 'engine-state/_photo-head-picks.json'), JSON.stringify({ 'species/channa-maculata': url('pond') }))
    await writeFile(join(r, 'engine-state/_photo-person-yes.json'), JSON.stringify({ [url('pond')]: { 'channa-maculata': y } }))
    await checkPagePhotos(r, model({ night: { typical: true }, pond }), { limit: 5 })
    return urls(r, 'content/species/channa-maculata/entity.json')
  }
  expect(await page({ ok: 'unsure', typical: true })).toEqual(['pond', 'night']) // the yes stands, and its pick with it
  expect(await page({ typical: false })).toEqual(['night', 'pond']) // the right fish, not typical: the typical one leads
  expect(await page({ ok: 'unsure', typical: true }, { ...yes, approvers: ['Curation'] })).toEqual(['night', 'pond']) // a yes that doesn't count
})

test('item admission stops without model calls or content changes', async () => {
  const r = await root([{ id: 'betta', sci: 'Betta splendens', photos: ['fish'] }])
  const d = model({})
  await denied('check-photos', r, async () => {
    const out = await checkPagePhotos(r, d, { limit: 10, today: '2026-11-13' })
    expect(out.stopped).toBeTruthy()
    expect(out.failed).toEqual([])
    expect(d.seen).toEqual([])
  })
})

test("a photo its source names only to the genus doesn't lead while one named to the species passes as a head; a \"cf.\" one that's all a page has leads and is listed (photo-named.ts)", async () => {
  const r = await root([
    { id: 'aaa-fish', sci: 'Aaa fish', extra: { photos: [photo('genus', 'Aaa sp.'), photo('own', 'Aaa fish')] } },
    { id: 'bbb-fish', sci: 'Bbb fish', extra: { photos: [photo('cf', 'Bbb cf. fish'), photo('plain')] } },
  ])
  const d = model({ genus: { typical: true }, own: { typical: true }, cf: { typical: true } })
  const rep = await checkPagePhotos(r, d, { limit: 5 })
  expect(await urls(r, 'content/species/aaa-fish/entity.json')).toEqual(['own', 'genus'])
  expect(await urls(r, 'content/species/bbb-fish/entity.json')).toEqual(['cf', 'plain'])
  expect(rep?.heads.named).toEqual([`species/bbb-fish: ${url('cf')} (cf.)`])
})
