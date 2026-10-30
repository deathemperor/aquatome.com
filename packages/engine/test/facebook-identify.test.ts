import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { FB } from '../src/facebook/config'
import { identifyPhotos, type FbIdDeps, type FbVerdict } from '../src/facebook/identify'
import { saveFbState, type FbState } from '../src/facebook/collect'
import { SOURCE_PHOTO_LICENCE } from '../src/source-photos'

const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#0a6' } }).jpeg().toBuffer()
const raw = (id: string) => `https://media.aquatome.com/facebook/${id}.jpg`

async function root() {
  const r = await mkdtemp(join(tmpdir(), 'aq-fbid-'))
  for (const [id, sci, vi] of [['betta-splendens', 'Betta splendens', 'Cá betta'], ['paracheirodon-innesi', 'Paracheirodon innesi', 'Cá neon']]) {
    await mkdir(join(r, 'content/species', id!), { recursive: true })
    await writeFile(join(r, 'content/species', id!, 'entity.json'), JSON.stringify({ scientificName: sci, photos: [] }))
    await writeFile(join(r, 'content/species', id!, 'vi.json'), JSON.stringify({ name: vi }))
  }
  const s: FbState = {
    posts: { 7: { id: '7', url: `${FB.profile}posts/7`, text: 'My new wild pair, Thailand', photoIds: ['1', '2'], more: false, reshare: false, seenAt: '2026-10-30' } },
    albums: { 100: { id: '100', url: 'https://www.facebook.com/media/set/?set=a.100&type=3', title: 'Bettas of Thailand', photoIds: ['1'], listedAt: '2026-10-30', done: true } },
    photos: Object.fromEntries(['1', '2', '3', '4', '5'].map(id => [id, { status: 'stored' as const, attempts: 1, raw: raw(id), ...(id === '1' ? { caption: 'Male in the morning light' } : {}) }])),
    timelineDone: true,
  }
  await saveFbState(r, s)
  return r
}

const VERDICTS: Record<string, FbVerdict> = {
  1: { species: 'betta-splendens', confidence: 'high', ok: true, caption: 'Cá betta đực màu đỏ trong bể' },
  2: { species: 'betta-splendens', confidence: 'medium', ok: true, caption: 'Cá betta' },
  3: { species: 'pterophyllum-scalare', confidence: 'high', ok: true, caption: 'Cá thần tiên' },
}

function deps(over: Partial<FbIdDeps> = {}) {
  const calls = { sheet: 0, look: [] as string[], prompts: [] as string[], put: [] as string[] }
  const d: FbIdDeps = {
    get: async () => jpeg,
    faces: async files => files.map(f => (basename(f) === '4.jpg' ? 1 : 0)),
    // Sheet numbers follow photo id order among the photos still in play (1, 2, 3, 5): 5 is not a fish.
    sheet: async () => { calls.sheet++; return { fish: [1, 2, 3] } },
    look: async (file, prompt) => { const id = basename(file, '.jpg'); calls.look.push(id); calls.prompts.push(prompt); return VERDICTS[id]! },
    media: { urlFor: k => `https://media.aquatome.com/${k}`, put: async k => { calls.put.push(k); return { url: `https://media.aquatome.com/${k}`, thumb: `https://media.aquatome.com/${k.replace('.webp', '-480.webp')}`, width: 1200, height: 800 } } },
    now: () => new Date('2026-10-30T10:00:00Z'),
    ...over,
  }
  return { d, calls }
}
const gallery = async (r: string, id: string) => JSON.parse(await readFile(join(r, 'content/gallery', `${id}.json`), 'utf8').catch(() => 'null'))
const decisions = async (r: string) => JSON.parse(await readFile(join(r, FB.decisionsFile), 'utf8'))

test('only a high-confidence match to a species on the site goes into its gallery, credited to Jim with the photo\'s link', async () => {
  const r = await root()
  const { d, calls } = deps()
  const rep = await identifyPhotos(r, d, { limit: 50 })
  expect(rep.added).toEqual(['betta-splendens: 1'])
  const g = await gallery(r, 'betta-splendens')
  expect(g).toMatchObject({ id: 'betta-splendens', seen: 0, updatedAt: '2026-10-30' })
  expect(g.builtAt).toBeUndefined()
  expect(g.photos).toEqual([{ url: 'https://media.aquatome.com/facebook-jim/1.webp', thumb: 'https://media.aquatome.com/facebook-jim/1-480.webp', width: 1200, height: 800, licence: SOURCE_PHOTO_LICENCE, author: 'Jim Cumming', sourceUrl: 'https://www.facebook.com/photo/?fbid=1', caption: 'Cá betta đực màu đỏ trong bể', source: 'facebook-jim' }])
  expect(calls.put).toEqual(['facebook-jim/1.webp'])
  expect(await gallery(r, 'pterophyllum-scalare')).toBeNull()
  expect(await decisions(r)).toMatchObject({ 1: { status: 'added', species: 'betta-splendens' }, 2: { status: 'unsure' }, 3: { status: 'off-list' }, 4: { status: 'face' }, 5: { status: 'no-fish' } })
})

test('a face never reaches the model, and a photo the sheet says has no fish is never looked at alone', async () => {
  const r = await root()
  const { d, calls } = deps()
  await identifyPhotos(r, d, { limit: 50 })
  expect(calls.look.sort()).toEqual(['1', '2', '3'])
  expect(calls.sheet).toBe(1)
})

test('the model sees the closed species list and the photo\'s words: album title, caption, post text', async () => {
  const r = await root()
  const { d, calls } = deps()
  await identifyPhotos(r, d, { limit: 50 })
  const p = calls.prompts[calls.look.indexOf('1')]!
  for (const s of ['betta-splendens — Betta splendens — Cá betta', 'paracheirodon-innesi — Paracheirodon innesi — Cá neon', 'Bettas of Thailand', 'Male in the morning light', 'My new wild pair, Thailand']) expect(p).toContain(s)
})

test('each photo is judged once: a second run makes no model calls', async () => {
  const r = await root()
  await identifyPhotos(r, deps().d, { limit: 50 })
  const { d, calls } = deps()
  const rep = await identifyPhotos(r, d, { limit: 50 })
  expect(calls.sheet + calls.look.length).toBe(0)
  expect(rep.added).toEqual([])
})

test('a usage-limit failure stops the run; decided photos keep their decision, the rest wait', async () => {
  const r = await root()
  const { d } = deps({ look: async file => { if (basename(file) === '2.jpg') throw new LlmError('usage limit'); return VERDICTS[basename(file, '.jpg')]! } })
  const rep = await identifyPhotos(r, d, { limit: 50 })
  expect(rep.stopped).toContain('usage limit')
  const dec = await decisions(r)
  expect(dec['1']).toMatchObject({ status: 'added' })
  expect(dec['2']).toBeUndefined()
  expect(dec['3']).toBeUndefined()
})

test('the call budget: no more model calls than the limit; the rest wait for the next run', async () => {
  const r = await root()
  const { d, calls } = deps()
  await identifyPhotos(r, d, { limit: 2 })
  expect(calls.sheet + calls.look.length).toBe(2)
  expect((await decisions(r))['3']).toBeUndefined()
})

test('the owner\'s rejections: a rejected photo is not added, and one already in a gallery is removed on the next run', async () => {
  const r = await root()
  await identifyPhotos(r, deps().d, { limit: 50 })
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ 'https://media.aquatome.com/facebook-jim/1.webp': 'not a splendens' }))
  await identifyPhotos(r, deps().d, { limit: 50 })
  expect((await gallery(r, 'betta-splendens')).photos).toEqual([])
  expect((await decisions(r))['1']).toMatchObject({ status: 'rejected' })
})

test('Jim\'s photo joins an existing gallery after the photos already there, and only once', async () => {
  const r = await root()
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  const commons = { url: 'https://media.aquatome.com/commons/a.webp', width: 1200, height: 800, licence: 'CC BY 4.0', author: 'Ann', sourceUrl: 'https://commons.wikimedia.org/wiki/File:A.jpg' }
  await writeFile(join(r, 'content/gallery/betta-splendens.json'), JSON.stringify({ id: 'betta-splendens', photos: [commons], seen: 10, updatedAt: '2026-01-01', builtAt: '2026-01-01' }))
  await identifyPhotos(r, deps().d, { limit: 50 })
  const g = await gallery(r, 'betta-splendens')
  expect(g.photos.map((p: { url: string }) => p.url)).toEqual([commons.url, 'https://media.aquatome.com/facebook-jim/1.webp'])
  expect(g).toMatchObject({ seen: 10, builtAt: '2026-01-01', updatedAt: '2026-10-30' })
})
