import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Photo } from '@aq/schema'
import { across, LARGE_PX, photosFor } from '../src/curation'
import { headsUnderBar, largePhotos, largeSize, type LargeDeps } from '../src/large-photos'

const MEDIA = 'https://media.aquatome.com/'
const sha16 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const photo = (url: string, sourceUrl: string, width: number, height: number): Photo => ({ url, width, height, licence: 'CC BY-SA 4.0', author: 'A', sourceUrl })
const commons = (name: string, w: number, h: number) => photo(`${MEDIA}commons/${sha16(name)}.webp`, `https://commons.wikimedia.org/wiki/File:${name}`, w, h)

/** Full sizes by the address they're fetched from. */
const FULL: Record<string, { width: number; height: number }> = {
  'https://upload.wikimedia.org/2400px-Betta_male.jpg': { width: 2400, height: 3200 },
  'https://upload.wikimedia.org/2400px-Betta_small.jpg': { width: 900, height: 700 },
  'https://inaturalist-open-data.s3.amazonaws.com/photos/42/original.jpeg': { width: 4000, height: 2667 },
  'https://images.unsplash.com/photo-1?ixid=x&w=2400': { width: 2400, height: 1600 },
}
function deps() {
  const put: string[] = []
  const d: LargeDeps = {
    bytes: async u => { if (!FULL[u]) throw new Error('HTTP 404'); return new TextEncoder().encode(u) },
    commons: async name => `https://upload.wikimedia.org/2400px-${name}`,
    size: async b => FULL[new TextDecoder().decode(b)]!,
    put: async (key, b, width) => { put.push(key); const f = FULL[new TextDecoder().decode(b)]!; return { url: `${MEDIA}${key}`, width, height: Math.round((f.height * width) / f.width) } },
    sleep: async () => {},
  }
  return { d, put }
}

async function store() {
  const root = await mkdtemp(join(tmpdir(), 'aq-large-'))
  const big = commons('Betta_male.jpg', 960, 1280)
  const small = commons('Betta_small.jpg', 900, 700)
  const inat = photo(`${MEDIA}inaturalist/42.webp`, 'https://www.inaturalist.org/photos/42', 640, 480)
  const unchecked = commons('Betta_other.jpg', 800, 600)
  const flickr = photo(`${MEDIA}flickr/7.webp`, 'https://www.flickr.com/photos/x/7', 800, 600)
  const unsplash = photo('https://images.unsplash.com/photo-1?ixid=x&w=1080', 'https://unsplash.com/photos/1', 1080, 720)
  await mkdir(join(root, 'content/species/betta-splendens'), { recursive: true })
  await mkdir(join(root, 'content/gallery'), { recursive: true })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'content/species/betta-splendens/entity.json'), JSON.stringify({ id: 'betta-splendens', photos: [big, small, inat, unchecked, flickr] }, null, 2))
  await writeFile(join(root, 'content/gallery/betta-splendens.json'), JSON.stringify({ id: 'betta-splendens', photos: [unsplash, big] }, null, 2))
  const ok = { ok: 'yes', typical: true }
  await writeFile(join(root, 'engine-state/_photo-subjects.json'), JSON.stringify(Object.fromEntries([big, small, inat, flickr, unsplash].map(p => [p.url, { 'betta-splendens': ok }]))))
  return root
}
const photosOf = async (root: string, file: string) => (JSON.parse(await readFile(join(root, file), 'utf8')) as { photos: Photo[] }).photos

test("large copies, 1,200 on the short side, of the photos that may lead a card: from Commons, iNaturalist's original, Unsplash; the page's copy stays", async () => {
  const root = await store()
  const { d, put } = deps()
  const r = await largePhotos(root, ['betta-splendens'], d)
  expect(r).toEqual({ added: 3, smaller: 1, skipped: 1, failed: [] })
  expect(put).toEqual([`commons/${sha16('Betta_male.jpg')}-large.webp`, 'inaturalist/42-large.webp'])
  const [big, small, inat, unchecked, flickr] = await photosOf(root, 'content/species/betta-splendens/entity.json')
  // Portrait: 1,200 across.
  expect(big).toMatchObject({ url: `${MEDIA}commons/${sha16('Betta_male.jpg')}.webp`, width: 960, large: { url: `${MEDIA}commons/${sha16('Betta_male.jpg')}-large.webp`, width: 1200, height: 1600 } })
  // Its full size is no bigger than the page's copy.
  expect(small!.large).toBeUndefined()
  // Landscape 3:2: 1,200 high, so a square crop of it still clears 1,140.
  expect(inat!.large).toEqual({ url: `${MEDIA}inaturalist/42-large.webp`, width: 1800, height: 1200 })
  // Not checked; and a Flickr copy keeps no address of its full size.
  expect(unchecked!.large).toBeUndefined()
  expect(flickr!.large).toBeUndefined()
  const [unsplash, again] = await photosOf(root, 'content/gallery/betta-splendens.json')
  // The page's photo in its gallery too: the same copy, fetched once.
  expect(again!.large).toEqual(big!.large)
  expect(unsplash!.large).toEqual({ url: 'https://images.unsplash.com/photo-1?ixid=x&w=1800', width: 1800, height: 1200 })
  // Again: nothing left to do.
  expect(await largePhotos(root, ['betta-splendens'], d)).toEqual({ added: 0, smaller: 1, skipped: 1, failed: [] })
})

test('--limit stops after that many fetches and keeps what it stored', async () => {
  const root = await store()
  const r = await largePhotos(root, ['betta-splendens'], deps().d, { limit: 1 })
  expect(r.added).toBe(1)
  expect((await photosOf(root, 'content/species/betta-splendens/entity.json'))[0]!.large?.width).toBe(1200)
})

test("the planner leads with a photo's large copy, the address the app loads, and still knows its page copy", () => {
  const p = { ...photo(`${MEDIA}commons/a.webp`, 'x', 1200, 800), large: { url: `${MEDIA}commons/a-large.webp`, width: 1800, height: 1200 } }
  const r = photosFor([p], () => true)
  // The square card is 400:420, so 1,200 high gives 1,143 across it.
  expect(r.photo.square).toEqual({ url: p.large.url, px: 1143 })
  expect(Object.keys(r.checked)).toEqual([p.url, p.large.url])
  expect(r.checked[p.url]!.square).toBe(762)
})

test("a large copy of any shape clears the large cards' bar in both shapes", () => {
  for (const full of [{ width: 6000, height: 4000 }, { width: 3000, height: 4000 }, { width: 4000, height: 2250 }, { width: 2000, height: 2000 }]) {
    const size = largeSize(full)
    for (const slot of ['square', 'wide'] as const) expect(across(size, slot), `${full.width}x${full.height} ${slot}`).toBeGreaterThanOrEqual(LARGE_PX)
  }
  // Never bigger than it came.
  expect(largeSize({ width: 1000, height: 700 })).toEqual({ width: 1000, height: 700 })
})

test("--heads: a large copy of a fish's head photo alone, the same picture larger, so what leads doesn't change; a head that fills or doesn't pass is left", async () => {
  const root = await store()
  const { d, put } = deps()
  expect(await headsUnderBar(root)).toEqual(['betta-splendens'])
  expect(await largePhotos(root, ['betta-splendens'], d, { headsOnly: true })).toEqual({ added: 1, smaller: 0, skipped: 0, failed: [] })
  expect(put).toEqual([`commons/${sha16('Betta_male.jpg')}-large.webp`])
  const [head, , inat] = await photosOf(root, 'content/species/betta-splendens/entity.json')
  expect(head!.large?.width).toBe(1200)
  expect(inat!.large).toBeUndefined()
  for (const p of await photosOf(root, 'content/gallery/betta-splendens.json')) expect(p.large).toBeUndefined()
  expect(await headsUnderBar(root)).toEqual([])
})

test('a head whose source holds nothing larger is remembered and not fetched again each cycle', async () => {
  const root = await store()
  const file = join(root, 'content/species/betta-splendens/entity.json')
  const e = JSON.parse(await readFile(file, 'utf8')) as { photos: Photo[] }
  await writeFile(file, JSON.stringify({ ...e, photos: [e.photos[1], e.photos[0]] }))
  const first = deps()
  let fetched = 0
  const d = { ...first.d, bytes: async (u: string) => { fetched++; return first.d.bytes(u) } }
  expect(await largePhotos(root, ['betta-splendens'], d, { headsOnly: true })).toMatchObject({ added: 0, smaller: 1 })
  expect(fetched).toBe(1)
  expect(await largePhotos(root, ['betta-splendens'], d, { headsOnly: true })).toMatchObject({ added: 0, smaller: 1 })
  expect(fetched).toBe(1)
})

test("a head the check can't tell gets its large copy once a person's yes stands for the check's (the spotted snakehead)", async () => {
  const root = await store()
  const head = (await photosOf(root, 'content/species/betta-splendens/entity.json'))[0]!.url
  const subjects = JSON.parse(await readFile(join(root, 'engine-state/_photo-subjects.json'), 'utf8'))
  subjects[head] = { 'betta-splendens': { ok: 'unsure', typical: true, note: 'could be B. splendens or B. imbellis' } }
  await writeFile(join(root, 'engine-state/_photo-subjects.json'), JSON.stringify(subjects))
  expect(await headsUnderBar(root)).toEqual([])
  const yes = { proposer: 'Photo Sourcing', approvers: ['Curation', 'the chief of staff'], on: '2026-11-19', lookAlike: 'Betta imbellis', mark: 'the red ventral fins' }
  await writeFile(join(root, 'engine-state/_photo-person-yes.json'), JSON.stringify({ [head]: { 'betta-splendens': yes } }))
  expect(await headsUnderBar(root)).toEqual(['betta-splendens'])
})
