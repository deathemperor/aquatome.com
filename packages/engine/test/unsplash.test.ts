import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import type { GalleryDeps } from '../src/gallery'
import { mirrorPlan } from '../src/mirror-photos'
import { unsplashPhotos, type UnsplashApi } from '../src/unsplash'

const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#0a6' } }).jpeg().toBuffer()
const hit = (id: string, width = 4000) => ({ id, width, height: width * 0.75, urls: { raw: `https://images.unsplash.com/photo-${id}?ixid=x` }, links: { html: `https://unsplash.com/photos/${id}`, download_location: `https://api.unsplash.com/photos/${id}/download?ixid=x` }, user: { name: `Ann ${id}` } })
const old = { url: 'https://media.aquatome.com/commons/a.webp', width: 1280, height: 960, licence: 'CC BY 4.0', author: 'Bo', sourceUrl: 'https://commons.wikimedia.org/wiki/File:A.jpg' }

async function site() {
  const r = await mkdtemp(join(tmpdir(), 'aq-unsplash-'))
  for (const [kind, id, e] of [['species', 'paracheirodon-innesi', { scientificName: 'Paracheirodon innesi' }], ['species', 'danio-rerio', { scientificName: 'Danio rerio' }], ['breeds', 'koi', {}]] as const) {
    await mkdir(join(r, 'content', kind, id), { recursive: true })
    await writeFile(join(r, 'content', kind, id, 'entity.json'), JSON.stringify({ ...e, photos: kind === 'breeds' ? [old] : [] }))
    await writeFile(join(r, 'content', kind, id, 'vi.json'), JSON.stringify({ name: `vi ${id}` }))
  }
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  await mkdir(join(r, 'engine-state'), { recursive: true })
  // Danio rerio has no gallery yet: the gallery step makes it first.
  for (const id of ['paracheirodon-innesi', 'koi']) await writeFile(join(r, 'content/gallery', `${id}.json`), JSON.stringify({ id, photos: [old], seen: 10, updatedAt: '2026-10-01' }))
  return r
}

const deps = (prompts: string[]): GalleryDeps => ({
  http: async (u: string) => (u.includes('Paracheirodon') ? { query: { pages: { 1: { title: 'Neon tetra' } } } } : {}),
  get: async () => new Uint8Array(await jpeg),
  faces: async files => files.map((_, i) => (i === 2 ? 1 : 0)), // the third photo has a face
  look: async (_f, prompt) => { prompts.push(prompt); return { keep: [{ n: 1, caption: 'Cá đẹp' }, { n: 2, caption: 'Đàn cá' }], best: [2] } },
  sleep: async () => {},
  now: () => new Date('2026-10-30T12:00:00Z'),
})

test('searches by common name, screens, reports each kept photo, appends it to the gallery hot-linked and credited', async () => {
  const root = await site()
  const calls: string[] = []
  const api: UnsplashApi = async u => {
    calls.push(u)
    if (u.includes('/search/photos')) return { json: { results: [hit('a'), hit('b'), hit('c'), hit('small', 600)] }, remaining: 40 }
    if (u.includes('/photos/a/download')) throw new Error('Unsplash HTTP 403') // a report that fails: photo left out
    return { json: {}, remaining: 30 }
  }
  const prompts: string[] = []
  const r = await unsplashPhotos(root, api, deps(prompts), { limit: 5 })
  expect(r.failed).toEqual([])
  expect(calls.filter(u => u.includes('/search/')).map(u => new URL(u).searchParams.get('query'))).toEqual(['Neon tetra', 'koi'])
  expect(prompts[0]).toContain('Neon tetra (Paracheirodon innesi)')
  expect(prompts[1]).toContain('man-made line') // a breed: strict screening
  const g = JSON.parse(await readFile(join(root, 'content/gallery/paracheirodon-innesi.json'), 'utf8'))
  expect(g.photos).toHaveLength(2) // the old one + b (best first among kept: b, a; a's report failed; c had a face; "small" < 800 px)
  expect(g.photos[1]).toEqual({
    url: 'https://images.unsplash.com/photo-b?ixid=x&w=1280&q=80&fm=jpg&fit=max', thumb: 'https://images.unsplash.com/photo-b?ixid=x&w=480&q=80&fm=jpg&fit=max',
    width: 1280, height: 960, licence: 'Unsplash License', author: 'Ann b', sourceUrl: 'https://unsplash.com/photos/b?utm_source=aquatome&utm_medium=referral', caption: 'Đàn cá',
  })
  expect(g).toMatchObject({ seen: 13, updatedAt: '2026-10-01' }) // its refresh date stays the gallery step's
  expect(mirrorPlan(g.photos[1].url)).toBeUndefined() // never copied to our bucket
  // Tried today: not searched again for half a year.
  calls.length = 0
  await unsplashPhotos(root, api, deps([]), { limit: 5 })
  expect(calls).toEqual([])
})

test('stops before a gallery could run out of requests', async () => {
  const root = await site()
  const calls: string[] = []
  const r = await unsplashPhotos(root, async u => { calls.push(u); return { json: { results: [hit('a')] }, remaining: u.includes('/search/') ? 8 : 7 } }, deps([]), { limit: 5 })
  expect(calls.filter(u => u.includes('/search/'))).toHaveLength(1)
  expect(r.stopped).toMatch(/rate limit/)
})

test('a breed with no photo comes first and takes the best 4 as its own; the rest start its gallery', async () => {
  const root = await site()
  await mkdir(join(root, 'content/breeds/koi-betta'), { recursive: true })
  await writeFile(join(root, 'content/breeds/koi-betta/entity.json'), JSON.stringify({ id: 'koi-betta', photos: [] }))
  const queries: string[] = []
  const hits = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => hit(id))
  const api: UnsplashApi = async u => {
    if (u.includes('/search/')) { queries.push(new URL(u).searchParams.get('query')!); return { json: { results: hits }, remaining: 40 } }
    return { json: {}, remaining: 30 }
  }
  const d = { ...deps([]), faces: async (files: string[]) => files.map(() => 0), look: async () => ({ keep: hits.map((_, i) => ({ n: i + 1, caption: `c${i + 1}` })), best: [6] }) }
  await unsplashPhotos(root, api, d, { limit: 1 })
  expect(queries).toEqual(['koi betta'])
  const e = JSON.parse(await readFile(join(root, 'content/breeds/koi-betta/entity.json'), 'utf8'))
  expect(e.photos.map((p: { author: string }) => p.author)).toEqual(['Ann f', 'Ann a', 'Ann b', 'Ann c']) // the best leads
  expect(e.photos[0].caption).toBe('c6')
  const g = JSON.parse(await readFile(join(root, 'content/gallery/koi-betta.json'), 'utf8'))
  expect(g).toMatchObject({ id: 'koi-betta', seen: 6, updatedAt: '2026-10-30' })
  expect(g.photos.map((p: { author: string }) => p.author)).toEqual(['Ann d', 'Ann e'])
})
