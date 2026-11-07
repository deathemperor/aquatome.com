import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { screenGuidePhotos, type GuidePhotoDeps, type GuidePhotoVerdict } from '../src/guide-photos'

const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#468' } }).jpeg().toBuffer()
const url = (n: string) => `https://media.example/${n}.webp`
const name = (u: string) => u.split('/').pop()!.replace('.webp', '')
const photo = (n: string) => ({ url: url(n), width: 1000, height: 667, licence: 'x', author: 'Aquarium Co-op', sourceUrl: 'x' })

async function store(guides: Record<string, object>, equipment: Record<string, object> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'guide-photos-'))
  const put = async (path: string, data: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), `${JSON.stringify(data, null, 2)}\n`) }
  await mkdir(join(root, 'engine-state'))
  for (const [id, g] of Object.entries(guides)) await put(`content/guides/${id}/entity.json`, { id, ...g })
  for (const [f, e] of Object.entries(equipment)) await put(`content/equipment/${f}.json`, e)
  return root
}
const json = async (root: string, path: string) => JSON.parse(await readFile(join(root, path), 'utf8'))
const urls = (xs: { url: string }[] = []) => xs.map(p => name(p.url))

/** The model, as a fake: answers from a table, photo name → verdict (unlisted: nothing found). Records each sheet's photos. */
function model(table: Record<string, Partial<GuidePhotoVerdict>>, o: { stop?: boolean } = {}) {
  const seen: { prompt: string; photos: string[] }[] = []
  let sheet: string[] = []
  const d: GuidePhotoDeps = {
    get: async u => {
      sheet.push(name(u))
      return u.includes('html') ? new TextEncoder().encode('<html>gone</html>') : new Uint8Array(await jpeg)
    },
    look: async (_file, prompt) => {
      if (o.stop) throw new LlmError('usage limit')
      const photos = sheet.filter(p => !p.includes('html'))
      sheet = []
      seen.push({ prompt, photos })
      return { photos: photos.map((p, i) => ({ n: i + 1, person: false, mark: false, brand: false, note: p, ...table[p] })) }
    },
  }
  return { d, seen }
}

test('hands or a person on a guide\'s photos, a mark on a video section\'s photo and a brand on a packshot take them off the guides and onto the blocklist; a brand stays on an equipment guide', async () => {
  // Found by a design review (2026-11-07): hands planting led "Cách trồng cây…", a person siphoning led "Bao lâu phải
  // vệ sinh…", and the betta setup guide showed an Aquarium Co-op test-strip bottle. None had had a model look.
  const root = await store({
    'how-to-plant': { photos: [photo('hands'), photo('carpet')] },
    'water-change': { photos: [photo('siphon')] },
    'betta-setup': { photos: [photo('betta'), photo('strips')] },
    'algae-video': { video: { figures: [{ heading: 'a', moments: [{ t: 1, url: url('still') }], photo: photo('signed') }, { heading: 'b', moments: [], photo: photo('stamped') }] } },
  }, { 'test-nuoc': { hero: photo('kit'), types: [{ photo: photo('kit') }, { photo: photo('strips') }] } })
  const { d, seen } = model({
    hands: { person: true, note: 'hands planting a sword plant in gravel' },
    siphon: { person: true, note: 'a person siphoning the tank, from behind' },
    strips: { brand: true, note: 'Aquarium Co-op logo on a test-strip bottle' },
    kit: { brand: true, note: 'API test kit box' },
    signed: { mark: true, note: 'faint signature, bottom right' },
    stamped: { mark: true, note: 'round logo, top left' },
  })
  const r = await screenGuidePhotos(root, d, { limit: 10 })
  // Leads first (a guide's first photo, an equipment guide's hero), then the rest in order; a video's stills aren't judged here.
  expect(seen.map(s => s.photos)).toEqual([['betta', 'hands', 'siphon', 'kit', 'signed', 'stamped'], ['strips', 'carpet']])
  expect(seen[0]!.prompt).toContain('- person: true if a person or any part of one is in it: a hand or fingers')
  expect(seen[0]!.prompt).toContain('- brand: true if a shop\'s or maker\'s logo or brand name can be read or recognised on a product')
  expect(r).toMatchObject({ sheets: 2, judged: 8, left: 0, failed: [], stopped: '' })
  expect(urls((await json(root, 'content/guides/how-to-plant/entity.json')).photos)).toEqual(['carpet'])
  expect(urls((await json(root, 'content/guides/water-change/entity.json')).photos)).toEqual([])
  expect(urls((await json(root, 'content/guides/betta-setup/entity.json')).photos)).toEqual(['betta'])
  // A figure keeps its stills without its photo; one left with neither goes.
  expect((await json(root, 'content/guides/algae-video/entity.json')).video.figures).toEqual([{ heading: 'a', moments: [{ t: 1, url: url('still') }] }])
  // The equipment guide keeps its products, brand and all.
  const e = await json(root, 'content/equipment/test-nuoc.json')
  expect([name(e.hero.url), ...e.types.map((t: { photo: { url: string } }) => name(t.photo.url))]).toEqual(['kit', 'kit', 'strips'])
  // The blocklist: a person or a mark everywhere; a brand only where no equipment guide shows the photo (the strips are on one).
  expect(Object.fromEntries(Object.entries(await json(root, 'engine-state/_photo-rejected.json')).map(([u, w]) => [name(u), w]))).toEqual({
    hands: 'people: hands planting a sword plant in gravel',
    siphon: 'people: a person siphoning the tank, from behind',
    signed: 'watermark: faint signature, bottom right',
    stamped: 'watermark: round logo, top left',
  })
  // Each photo is judged once: a second run asks nothing and changes nothing.
  const before = await json(root, 'engine-state/_photo-guides.json')
  expect(Object.keys(before)).toHaveLength(8)
  const again = await screenGuidePhotos(root, { ...d, look: async () => { throw new Error('judged twice') } }, { limit: 10 })
  expect(again).toMatchObject({ sheets: 0, judged: 0, removed: [] })
  expect(await json(root, 'engine-state/_photo-guides.json')).toEqual(before)
})

test('a brand on a photo both a guide and an equipment guide show leaves the guide only, and again after a re-read brings it back', async () => {
  const root = await store({ tests: { photos: [photo('strips')] } }, { 'test-nuoc': { hero: photo('strips'), types: [] } })
  const { d } = model({ strips: { brand: true, note: 'Aquarium Co-op logo on a test-strip bottle' } })
  await screenGuidePhotos(root, d, { limit: 10 })
  expect(urls((await json(root, 'content/guides/tests/entity.json')).photos)).toEqual([])
  expect(name((await json(root, 'content/equipment/test-nuoc.json')).hero.url)).toBe('strips')
  expect(await json(root, 'engine-state/_photo-rejected.json')).toEqual({})
  await writeFile(join(root, 'content/guides/tests/entity.json'), JSON.stringify({ id: 'tests', photos: [photo('strips')] }))
  await screenGuidePhotos(root, d, { limit: 0 })
  expect(urls((await json(root, 'content/guides/tests/entity.json')).photos)).toEqual([])
})

test('the limit caps model calls, leads first; the rest wait for the next run', async () => {
  const root = await store({ a: { photos: [photo('a1'), photo('a2'), photo('a3')] }, b: { photos: [photo('b1')] } })
  const { d, seen } = model({})
  const r = await screenGuidePhotos(root, d, { limit: 0 })
  expect(r).toMatchObject({ sheets: 0, left: 4 })
  expect(seen).toEqual([])
  const one = await screenGuidePhotos(root, d, { limit: 1 })
  expect(seen.map(s => s.photos)).toEqual([['a1', 'b1', 'a2', 'a3']])
  expect(one.left).toBe(0)
})

test('a usage limit stops the run with nothing lost; a download that is not an image is tried again next run', async () => {
  const root = await store({ a: { photos: [photo('hands'), photo('html-gone'), photo('ok')] } })
  const stopped = await screenGuidePhotos(root, model({}, { stop: true }).d, { limit: 10 })
  expect(stopped.stopped).toMatch(/usage limit/)
  expect(urls((await json(root, 'content/guides/a/entity.json')).photos)).toEqual(['hands', 'html-gone', 'ok'])
  const { d, seen } = model({ hands: { person: true, note: 'hands' } })
  const r = await screenGuidePhotos(root, d, { limit: 10 })
  expect(seen.map(s => s.photos)).toEqual([['hands', 'ok']])
  expect(r.failed).toHaveLength(1)
  expect(urls((await json(root, 'content/guides/a/entity.json')).photos)).toEqual(['html-gone', 'ok'])
  expect(Object.keys(await json(root, 'engine-state/_photo-guides.json')).map(name)).toEqual(['hands', 'ok'])
})
