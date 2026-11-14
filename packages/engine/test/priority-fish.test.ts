import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { galleryPlan } from '../src/gallery-plan'
import { checkPagePhotos, type PhotoCheckDeps, type PhotoVerdict } from '../src/photo-check'
import { PRIORITY_UNTIL, priorityFish } from '../src/priority-fish'

const url = (n: string) => `https://media.example/${n}.webp`
const photo = (n: string, o: object = {}) => ({ url: url(n), thumb: url(`${n}-480`), width: 960, height: 720, licence: 'CC BY 4.0', author: 'x', sourceUrl: 'x', ...o })

/** Two staples and a fish no list names, each with one photo of its own; `album` photos for the last. */
async function root(album: object[] = [], list: Record<string, unknown> = { 'species/zzz-liked': '2026-11-14' }) {
  const r = await mkdtemp(join(tmpdir(), 'aq-priority-'))
  for (const id of ['betta-splendens', 'danio-rerio', 'zzz-liked']) {
    await mkdir(join(r, 'content/species', id), { recursive: true })
    await writeFile(join(r, 'content/species', id, 'entity.json'), JSON.stringify({ id, scientificName: id.replace('-', ' '), photos: [photo(id)], sections: [{ source: 'seriouslyfish' }] }))
    await writeFile(join(r, 'content/species', id, 'vi.json'), JSON.stringify({ name: id }))
  }
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  await writeFile(join(r, 'content/gallery/zzz-liked.json'), JSON.stringify({ id: 'zzz-liked', photos: album, seen: 0, updatedAt: '' }))
  await mkdir(join(r, 'engine-state'))
  await mkdir(join(r, 'docs/review'), { recursive: true })
  await writeFile(join(r, 'engine-state/_priority-fish.json'), JSON.stringify(list))
  return r
}
const ids = async (r: string) => (await galleryPlan(r)).map(p => p.id)
const checked = (n: number) => Array.from({ length: n }, (_, i) => photo(`a${i}`))

test('the album step takes a priority fish first, ahead of the staples, until its album holds six checked photos', async () => {
  expect(await ids(await root())).toEqual(['zzz-liked', 'betta-splendens', 'danio-rerio'])
  expect(await ids(await root(checked(PRIORITY_UNTIL - 1)))).toEqual(['zzz-liked', 'betta-splendens', 'danio-rerio'])
  // Photos waiting for the photo check and AI pictures don't count.
  expect(await ids(await root([...checked(PRIORITY_UNTIL - 1), photo('waits', { unchecked: true }), photo('ai', { generated: { by: 'x', on: '2026-11-15' } })]))).toEqual(['zzz-liked', 'betta-splendens', 'danio-rerio'])
  // Six checked: back in its own place.
  expect(await ids(await root(checked(PRIORITY_UNTIL)))).toEqual(['betta-splendens', 'danio-rerio', 'zzz-liked'])
})

test('the count is under the album row\'s or equal: a picture with a copy doesn\'t count, nor anything the build still holds back, and a breed counts its album alone', async () => {
  // Two files of one photo (hashes a bit apart): neither counts, so four.
  const r = await root(checked(PRIORITY_UNTIL))
  await writeFile(join(r, 'content/picture-hashes.json'), JSON.stringify({ [url('a0')]: 'ffffffffffffffff', [url('a1')]: 'fffffffffffffffe' }))
  expect(await priorityFish(r)).toEqual(['species/zzz-liked'])
  // Six pictures, one the watermark screen still owes a look (its text read, no verdict yet): five on the row.
  const s = await root(checked(PRIORITY_UNTIL))
  await writeFile(join(s, 'engine-state/_photo-watermarks.json'), JSON.stringify(Object.fromEntries(checked(PRIORITY_UNTIL).map((p, i) => [p.url, i ? { ocr: [], watermark: false } : { ocr: [{ t: 'www.shop.example', c: 1 }] }]))))
  expect(await priorityFish(s)).toEqual(['species/zzz-liked'])
  await writeFile(join(s, 'engine-state/_photo-watermarks.json'), JSON.stringify(Object.fromEntries(checked(PRIORITY_UNTIL).map(p => [p.url, { ocr: [], watermark: false }]))))
  expect(await priorityFish(s)).toEqual([])
  // A video's two thumbnails are copies of one picture, and so are a photo and its thumb (its hash stored under the photo):
  // neither copy counts.
  const yt = (q: string) => ({ ...photo('x'), url: `https://i.ytimg.com/vi/abcdefghijk/${q}.jpg`, thumb: `https://i.ytimg.com/vi/abcdefghijk/${q}.jpg` })
  const v = await root([yt('hqdefault'), yt('maxresdefault'), ...checked(PRIORITY_UNTIL - 2)])
  expect(await priorityFish(v)).toEqual(['species/zzz-liked'])
  const t = await root([photo('a0'), { ...photo('a0'), url: url('a0-480') }, ...checked(PRIORITY_UNTIL).slice(1, -1)])
  await writeFile(join(t, 'content/picture-hashes.json'), JSON.stringify({ [url('a0')]: 'ffffffffffffffff' }))
  expect(await priorityFish(t)).toEqual(['species/zzz-liked'])
  // A breed counts its album alone: which of its own photos the site leads with rests on the build's own steps. Here its
  // file leads with an AI picture the build leaves out, then six photos: the row shows five of them, and the breed stays.
  const b = await root([], { 'breeds/blue-fish': '2026-11-14' })
  await mkdir(join(b, 'content/breeds/blue-fish'), { recursive: true })
  await writeFile(join(b, 'content/breeds/blue-fish/entity.json'), JSON.stringify({ id: 'blue-fish', kind: 'variety', photos: [photo('ai', { generated: { by: 'x', on: '2026-11-15' } }), ...checked(PRIORITY_UNTIL)], sources: [] }))
  expect(await priorityFish(b)).toEqual(['breeds/blue-fish'])
  await writeFile(join(b, 'content/gallery/blue-fish.json'), JSON.stringify({ id: 'blue-fish', photos: checked(PRIORITY_UNTIL).map(p => photo(`g${p.url.slice(-6, -5)}`)), seen: 0, updatedAt: '' }))
  expect(await priorityFish(b)).toEqual([])
})

test('a photo kept with a shop\'s mark doesn\'t count: the fish stays first until six photos with no mark', async () => {
  // Betta mahachai's album once BW's five land: Glaser's photo and BW's five, kept with the shops' own marks, and one with
  // no mark. Seven on the row, one that counts.
  const kept = (shop: string, n: string, page: string) => [photo(n, { url: `https://media.aquatome.com/${shop}/${n}.webp`, source: shop }), { ocr: [], watermark: true, retainedOwnMark: { source: shop, sourceUrl: page, owner: 'source' } }] as const
  const marked = [kept('glaser', 'g0', 'https://www.aquariumglaser.de/en/x/'), ...['b0', 'b1', 'b2', 'b3', 'b4'].map(n => kept('bwaquatics', n, 'https://bwaquatics.com/products/x'))]
  const clean = (n: number) => checked(n).map(p => [p, { ocr: [], watermark: false }] as const)
  const r = await root([...marked, ...clean(1)].map(([p]) => p))
  // Both shops may show photos, so only the marks keep them out of the count.
  await writeFile(join(r, 'content/sources.json'), JSON.stringify({ glaser: { publish: 'photos' }, bwaquatics: { publish: 'photos' } }))
  const screen = async (all: (readonly [{ url: string }, object])[]) => writeFile(join(r, 'engine-state/_photo-watermarks.json'), JSON.stringify(Object.fromEntries(all.map(([p, e]) => [p.url, e]))))
  await screen([...marked, ...clean(1)])
  expect(await priorityFish(r)).toEqual(['species/zzz-liked'])
  // Glaser's banner alone (the site's rule) keeps a photo out, with no record of a mark.
  await screen([[marked[0]![0], { ocr: [], watermark: false }], ...marked.slice(1), ...clean(1)])
  expect(await priorityFish(r)).toEqual(['species/zzz-liked'])
  // Six with no mark beside the six marked: it leaves the list.
  await writeFile(join(r, 'content/gallery/zzz-liked.json'), JSON.stringify({ id: 'zzz-liked', photos: [...marked, ...clean(PRIORITY_UNTIL)].map(([p]) => p), seen: 0, updatedAt: '' }))
  await screen([...marked, ...clean(PRIORITY_UNTIL)])
  expect(await priorityFish(r)).toEqual([])
})

test('a picture with a copy anywhere on the page or in the album doesn\'t count: near copies chain, and the row may show another of them', async () => {
  // A breed: the row shows its own photo O after the head, then the album. Six album photos each 4 bits from O, 8 from one
  // another: the row shows O once and none of the six (Grok's second read). None counts.
  const b = await root([], { 'breeds/blue-fish': '2026-11-14' })
  await mkdir(join(b, 'content/breeds/blue-fish'), { recursive: true })
  await writeFile(join(b, 'content/breeds/blue-fish/entity.json'), JSON.stringify({ id: 'blue-fish', kind: 'variety', photos: [photo('h'), photo('o')], sources: [] }))
  const near = ['f', 'f0', 'f00', 'f000', 'f0000', 'f00000'].map(x => x.padStart(16, '0'))
  await writeFile(join(b, 'content/gallery/blue-fish.json'), JSON.stringify({ id: 'blue-fish', photos: near.map((_, i) => photo(`n${i}`)), seen: 0, updatedAt: '' }))
  await writeFile(join(b, 'content/picture-hashes.json'), JSON.stringify({ [url('h')]: 'ffffffffffffffff', [url('o')]: '0000000000000000', ...Object.fromEntries(near.map((h, i) => [url(`n${i}`), h])) }))
  expect(await priorityFish(b)).toEqual(['breeds/blue-fish'])
  // A Glaser photo the build shows at its original's address (an upscale it falls back from), banner and all, and a clean
  // copy of that original: the copy doesn't count, and five clean photos are five.
  const g = await root([photo('up', { source: 'glaser', altered: [{ method: 'lanczos3-upscale' }], original: { url: url('orig'), width: 600, height: 450 } }), photo('copy'), ...checked(PRIORITY_UNTIL - 1)])
  await writeFile(join(g, 'content/sources.json'), JSON.stringify({ glaser: { publish: 'photos' } }))
  await writeFile(join(g, 'content/picture-hashes.json'), JSON.stringify({ [url('orig')]: '00000000000000ff', [url('copy')]: '00000000000000fe' }))
  expect(await priorityFish(g)).toEqual(['species/zzz-liked'])
})

test('a list that isn\'t JSON reads as no list: the album step and the photo check go on as before', async () => {
  const r = await root()
  await writeFile(join(r, 'engine-state/_priority-fish.json'), '{ "species/zzz-liked": "2026-11-14", }')
  expect(await ids(r)).toEqual(['betta-splendens', 'danio-rerio', 'zzz-liked'])
})

test('oldest day first; a malformed line is left out; no list, no change', async () => {
  const r = await root([], { 'species/zzz-liked': '2026-11-14', 'species/danio-rerio': '2026-11-10', 'species/Bad Id': '2026-11-01', 'species/betta-splendens': 'yesterday' })
  expect(await priorityFish(r)).toEqual(['species/danio-rerio', 'species/zzz-liked'])
  expect(await ids(r)).toEqual(['danio-rerio', 'zzz-liked', 'betta-splendens'])
  expect(await ids(await root([], {}))).toEqual(['betta-splendens', 'danio-rerio', 'zzz-liked'])
})

test('the photo check judges a priority fish first, ahead of the breeds', async () => {
  const r = await root()
  await mkdir(join(r, 'content/breeds/blue-fish'), { recursive: true })
  await writeFile(join(r, 'content/breeds/blue-fish/entity.json'), JSON.stringify({ id: 'blue-fish', kind: 'variety', photos: [photo('blue-fish')], sources: [] }))
  await writeFile(join(r, 'content/breeds/blue-fish/vi.json'), JSON.stringify({ name: 'Blue fish' }))
  const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#e83' } }).jpeg().toBuffer()
  const sheets: string[][] = []
  let fetched: string[] = []
  const d: PhotoCheckDeps = {
    get: async u => { fetched.push(u.split('/').pop()!.replace('.webp', '')); return new Uint8Array(jpeg) },
    look: async () => { sheets.push(fetched); const photos = fetched.map((_, i) => ({ n: i + 1, ok: 'yes', typical: true, note: 'x' }) as { n: number } & PhotoVerdict); fetched = []; return { photos } },
  }
  await checkPagePhotos(r, d, { limit: 1, emptyCap: 99 })
  expect(sheets[0]![0]).toBe('zzz-liked')
})

test('the committed list holds only pages that exist, each with a day', async () => {
  const list = JSON.parse(await readFile(new URL('../../../engine-state/_priority-fish.json', import.meta.url), 'utf8')) as Record<string, string>
  for (const [ref, day] of Object.entries(list)) {
    expect(ref).toMatch(/^(species|plants|breeds)\/[a-z0-9-]+$/)
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await access(new URL(`../../../content/${ref}/entity.json`, import.meta.url))
  }
})
