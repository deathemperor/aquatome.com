import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { ocrHit, screenWatermarks, type TextLine, type WatermarkDeps } from '../src/watermarks'

const line = (t: string, c = 1): TextLine => ({ t, c, x: 0.1, y: 0.9, w: 0.3, h: 0.03 })

test('text worth a look: a credit, a web address or a clear word; not the stray letters scales and stems read as', () => {
  expect(ocrHit([line('© Hristo Hristov')])).toBe(true)
  expect(ocrHit([line('planetcatfish.com', 0.3)])).toBe(true)
  expect(ocrHit([line('AQUARIUM GLASER')])).toBe(true)
  expect(ocrHit([line('female')])).toBe(true)
  expect(ocrHit([line('ll'), line('W'), line('I I')])).toBe(false)
  expect(ocrHit([line('Wnsh', 0.3)])).toBe(false)
  expect(ocrHit([])).toBe(false)
})

// Each photo is a JPEG whose width says which it is, so the fake Vision can tell them apart.
const NAMES = ['fish', 'glaser', 'box', 'fish2', 'still-credit', 'still-ok', 'hero-credit', 'type-ok', 'logo-only']
const TEXT: Record<string, string[]> = { glaser: ['AQUARIUM GLASER'], box: ['SERA flore'], 'still-credit': ['© Tank Channel'], 'hero-credit': ['www.shop.example'] }
const url = (n: string) => `https://media.example/${n}.webp`
const photo = (n: string) => ({ url: url(n), width: 960, height: 720, licence: 'x', author: 'x', sourceUrl: 'x' })

async function site() {
  const r = await mkdtemp(join(tmpdir(), 'aq-wm-'))
  const put = async (path: string, data: unknown) => {
    await mkdir(join(r, 'content', path, '..'), { recursive: true })
    await writeFile(join(r, 'content', path), `${JSON.stringify(data, null, 2)}\n`)
  }
  await mkdir(join(r, 'engine-state'))
  // glaser/logo-only: a dealer's mark with no letters Vision can read; its source is one whose photos the model always sees.
  await put('species/a/entity.json', { id: 'a', photos: ['fish', 'glaser', 'box', 'glaser/logo-only'].map(photo) })
  await put('gallery/a.json', { id: 'a', photos: ['glaser', 'fish2'].map(photo) })
  await put('guides/g/entity.json', { id: 'g', photos: [], video: { youtubeId: 'v', figures: [
    { heading: 'Lọc', moments: [{ t: 5, url: url('still-credit'), width: 160, height: 90, caption: 'x' }] },
    { heading: 'Đèn', moments: [{ t: 9, url: url('still-ok'), width: 160, height: 90, caption: 'x' }], photo: photo('glaser') },
  ] } })
  for (const p of ['equipment/den.json', 'equipment/id/den.json']) await put(p, { hero: photo('hero-credit'), types: [{ id: 't', photo: photo('type-ok') }] })
  return r
}
const read = (r: string, path: string) => readFile(join(r, path), 'utf8').then(s => JSON.parse(s))

function deps() {
  const calls = { get: [] as string[], looked: [] as string[] }
  const d: WatermarkDeps = {
    get: async u => {
      calls.get.push(u)
      const n = NAMES.indexOf(u.split('/').pop()!.replace('.webp', ''))
      return new Uint8Array(await sharp({ create: { width: 40 + n, height: 30, channels: 3, background: '#468' } }).jpeg().toBuffer())
    },
    read: files => Promise.all(files.map(async f => (TEXT[NAMES[(await sharp(f).metadata()).width! - 40]!] ?? []).map(t => line(t)))),
    look: async (_sheet, prompt) => {
      const photos = [...prompt.matchAll(/^(\d+): (.*)$/gm)].map(([, n, text]) => {
        calls.looked.push(text!)
        const mark = /GLASER|©|www\.|no text found/.test(text!)
        return { n: Number(n), watermark: mark, kind: mark ? ('logo' as const) : ('none' as const), what: mark ? 'added text' : 'product box label' }
      })
      return { photos }
    },
  }
  return { d, calls }
}

test('watermarked photos leave every page, gallery, video still and equipment hero, join the blocklist, and are judged once', async () => {
  const r = await site()
  const cache = join(r, 'engine-state/_photo-watermarks.json')
  const rejected = join(r, 'engine-state/_photo-rejected.json')
  await writeFile(rejected, JSON.stringify({ [url('old')]: 'hand' }))
  const { d, calls } = deps()
  const out = await screenWatermarks(r, cache, rejected, d, { limit: 10 })

  // The four photos with text went to the model, and the logo source's photo without any; the product's own label is
  // scene, not a watermark. Photos with no text from other sources are never sent.
  expect(out).toMatchObject({ read: 9, hits: 5, judged: 5, failed: [], stopped: '' })
  expect(calls.looked.sort()).toEqual(['"AQUARIUM GLASER" (bottom left)', '"SERA flore" (bottom left)', '"www.shop.example" (bottom left)', '"© Tank Channel" (bottom left)', 'no text found'])
  expect((await read(r, 'content/species/a/entity.json')).photos.map((p: { url: string }) => p.url)).toEqual([url('fish'), url('box')])
  expect((await read(r, 'content/gallery/a.json')).photos.map((p: { url: string }) => p.url)).toEqual([url('fish2')])
  // A section whose only still had a credit goes; the other keeps its still and loses its photo.
  expect((await read(r, 'content/guides/g/entity.json')).video.figures).toEqual([{ heading: 'Đèn', moments: [{ t: 9, url: url('still-ok'), width: 160, height: 90, caption: 'x' }] }])
  // An equipment page needs a hero: the first type photo takes its place, in every language's copy.
  for (const p of ['content/equipment/den.json', 'content/equipment/id/den.json']) expect((await read(r, p)).hero.url).toBe(url('type-ok'))
  expect(await read(r, 'engine-state/_photo-rejected.json')).toEqual({
    [url('old')]: 'hand', [url('glaser')]: 'watermark: added text', [url('glaser/logo-only')]: 'watermark: added text', [url('hero-credit')]: 'watermark: added text', [url('still-credit')]: 'watermark: added text',
  })
  expect((await read(r, 'engine-state/_photo-watermarks.json'))[url('box')]).toEqual({ ocr: [{ t: 'SERA flore', c: 1, at: 'bottom left' }], watermark: false, kind: 'none', what: 'product box label' })

  // Next cycle: a source re-read puts the Glaser photo back; it goes again with no download and no model call.
  await writeFile(join(r, 'content/species/a/entity.json'), JSON.stringify({ id: 'a', photos: ['glaser', 'fish'].map(photo) }))
  calls.get.length = 0
  calls.looked.length = 0
  const again = await screenWatermarks(r, cache, rejected, d, { limit: 10 })
  expect(calls).toEqual({ get: [], looked: [] })
  expect(again.removed).toEqual([`content/species/a/entity.json: ${url('glaser')}`])
})

test('a model failure (usage limit) stops the run; photos not judged stay on their pages until a later run', async () => {
  const r = await site()
  const { d } = deps()
  const cache = join(r, 'engine-state/_photo-watermarks.json')
  const rejected = join(r, 'engine-state/_photo-rejected.json')
  const out = await screenWatermarks(r, cache, rejected, { ...d, look: async () => { throw new LlmError('usage limit') } }, { limit: 10 })
  expect(out).toMatchObject({ read: 9, judged: 0, removed: [], stopped: 'usage limit' })
  expect((await read(r, 'content/species/a/entity.json')).photos).toHaveLength(4)
  // The text read is kept: the next run only asks the model.
  const next = await screenWatermarks(r, cache, rejected, d, { limit: 10 })
  expect(next).toMatchObject({ read: 0, judged: 5 })
  expect((await read(r, 'content/species/a/entity.json')).photos).toHaveLength(2)
})
