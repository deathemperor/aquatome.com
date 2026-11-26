import { denied } from './piece-admission'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test, vi } from 'vitest'
import { LlmError } from '../src/claude'
import { writePhotoState } from '../src/photo-state'
import { ocrHit, screenWatermarks, type TextLine, type WatermarkDeps } from '../src/watermarks'

vi.mock('../src/photo-state', async importOriginal => {
  const native = await importOriginal<typeof import('../src/photo-state')>()
  return { ...native, writePhotoState: vi.fn(native.writePhotoState) }
})

const line = (t: string, c = 1): TextLine => ({ t, c, x: 0.1, y: 0.9, w: 0.3, h: 0.03 })

test('text worth a look: a credit, a web address or a clear word; not the stray letters scales and stems read as', () => {
  expect(ocrHit([line('© TEST_ONLY_CREDIT')])).toBe(true)
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
const photo = (n: string) => ({ url: url(n), width: 960, height: 720, licence: 'CC BY 4.0', author: 'x', sourceUrl: 'x' })

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
        const mark = !text!.includes(createHash('sha256').update(TEXT.box![0]!).digest('hex'))
        return { n: Number(n), watermark: mark, kind: mark ? ('logo' as const) : ('none' as const), locations: ['bottom left'] }
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
  expect(calls.looked).toHaveLength(5)
  for(const words of Object.values(TEXT).flat())expect(calls.looked.join(' ')).not.toContain(words)
  expect((await read(r, 'content/species/a/entity.json')).photos.map((p: { url: string }) => p.url)).toEqual([url('fish'), url('box')])
  expect((await read(r, 'content/gallery/a.json')).photos.map((p: { url: string }) => p.url)).toEqual([url('fish2')])
  // A section whose only still had a credit goes; the other keeps its still and loses its photo.
  expect((await read(r, 'content/guides/g/entity.json')).video.figures).toEqual([{ heading: 'Đèn', moments: [{ t: 9, url: url('still-ok'), width: 160, height: 90, caption: 'x' }] }])
  // An equipment page needs a hero: the first type photo takes its place, in every language's copy.
  for (const p of ['content/equipment/den.json', 'content/equipment/id/den.json']) expect((await read(r, p)).hero.url).toBe(url('type-ok'))
  const refusals=await read(r,'engine-state/_photo-rejected.json')
  expect(Object.keys(refusals).sort()).toEqual(['old','glaser','glaser/logo-only','hero-credit','still-credit'].map(url).sort())
  expect(refusals[url('old')].startsWith('watermark:')).toBe(false)
  for(const n of ['glaser','glaser/logo-only','hero-credit','still-credit'])expect(refusals[url(n)]).toMatch(/^watermark: withheld \[sha256:[a-f0-9]{64}\]$/)
  expect((await read(r, 'engine-state/_photo-watermarks.json'))[url('box')]).toEqual({ocr:[{c:1,at:'bottom left',alnum:9,mark:false,hash:createHash('sha256').update(TEXT.box![0]!).digest('hex')}],watermark:false,kind:'none',locations:['bottom left']})

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

test('the watermark pass holds a last photo while its sibling still owes the dead-fish screen', async () => {
  const r = await site()
  const file = 'content/species/a/entity.json'
  await writeFile(join(r, file), JSON.stringify({ id: 'a', photos: ['glaser', 'fish'].map(photo) }))
  await writeFile(join(r, 'engine-state/_photo-faces.json'), JSON.stringify({ [url('glaser')]: 0, [url('fish')]: 0 }))
  await writeFile(join(r, 'engine-state/_dead-screen.json'), JSON.stringify({ [url('glaser')]: { dead: false } }))
  const { d } = deps()
  const result = await screenWatermarks(r, join(r, 'engine-state/_photo-watermarks.json'), join(r, 'engine-state/_photo-rejected.json'), d, { limit: 10 })
  expect(result.held).toContain(`${url('glaser')}: species/a`)
  expect((await read(r, file)).photos.map((p: { url: string }) => p.url)).toEqual([url('glaser'), url('fish')])
})

test.each([false, true])('watermark holds use the album and this pass’s decisions (own photo waiting: %s)', async ownWaiting => {
  const r = await site()
  const ownFile = 'content/species/a/entity.json'
  const albumFile = 'content/gallery/a.json'
  await writeFile(join(r, ownFile), JSON.stringify({ id: 'a', photos: (ownWaiting ? ['fish'] : ['glaser', 'box']).map(photo) }))
  await writeFile(join(r, albumFile), JSON.stringify({ id: 'a', photos: ownWaiting ? [photo('glaser')] : [] }))
  await writeFile(join(r, 'engine-state/_photo-faces.json'), JSON.stringify({ [url('glaser')]: 0, [url('fish')]: 0, [url('box')]: 0 }))
  await writeFile(join(r, 'engine-state/_dead-screen.json'), JSON.stringify({ [url('glaser')]: { dead: false }, [url('box')]: { dead: false } }))
  const cache = join(r, 'engine-state/_photo-watermarks.json')
  await writeFile(cache, '{}')

  const result = await screenWatermarks(r, cache, join(r, 'engine-state/_photo-rejected.json'), deps().d, { limit: 10 })

  if (ownWaiting) {
    expect(result.held).toContain(`${url('glaser')}: species/a`)
    expect((await read(r, albumFile)).photos).toEqual([photo('glaser')])
  } else {
    expect(result.held).toEqual([])
    expect((await read(r, ownFile)).photos).toEqual([photo('box')])
  }
})

test('a mirror already listed for a source watermark cannot replace the last photo', async () => {
  const r = await site()
  const source = 'https://live.staticflickr.com/123/456_abc.jpg'
  const mirror = 'https://media.aquatome.com/flickr/456.webp'
  await writeFile(join(r, 'content/species/a/entity.json'), JSON.stringify({ id: 'a', photos: [photo('glaser'), { ...photo('fish'), url: mirror }] }))
  await writeFile(join(r, 'content/gallery/a.json'), JSON.stringify({ id: 'a', photos: [] }))
  const cache = join(r, 'engine-state/_photo-watermarks.json')
  const rejected = join(r, 'engine-state/_photo-rejected.json')
  await writeFile(cache, JSON.stringify({ [mirror]: { ocr: [], watermark: false } }))
  await writeFile(rejected, JSON.stringify({ [source]: 'watermark: withheld' }))

  const result = await screenWatermarks(r, cache, rejected, deps().d, { limit: 10 })

  expect(result.held).toContain(`${url('glaser')}: species/a`)
})

test('the watermark pass holds the last served original of an already rejected alteration', async () => {
  const r = await site()
  const original = photo('glaser')
  const stored = { ...photo('stored'), altered: [{ method: 'lanczos3-upscale' }],
    original: { url: original.url, width: original.width, height: original.height } }
  const file = 'content/species/a/entity.json'
  await writeFile(join(r, file), JSON.stringify({ id: 'a', photos: [stored] }))
  await writeFile(join(r, 'content/gallery/a.json'), JSON.stringify({ id: 'a', photos: [] }))
  const other = join(r, 'content/species/b/entity.json')
  await mkdir(join(other, '..'), { recursive: true })
  await writeFile(other, JSON.stringify({ id: 'b', photos: [original, photo('box')] }))
  const rejected = join(r, 'engine-state/_photo-rejected.json')
  await writeFile(rejected, JSON.stringify({ [stored.url]: 'dead: withheld' }))

  const result = await screenWatermarks(r, join(r, 'engine-state/_photo-watermarks.json'), rejected, deps().d, { limit: 10 })

  expect(result.held).toContain(`${original.url}: species/a`)
  expect((await read(r, file)).photos).toEqual([stored])
  expect((await read(r, 'engine-state/_photo-rejected.json'))[original.url]).toBeUndefined()
})

test('item admission stops without model calls or content changes', async () => {
  const root = await site()
  const { d, calls } = deps()
  await denied('watermarks', root, async () => {
    const r = await screenWatermarks(root, join(root, 'engine-state/cache.json'), join(root, 'engine-state/rejected.json'), d, { limit: 10 })
    expect(r.stopped).toBeTruthy()
    expect(r.failed).toEqual([])
    expect(calls.looked).toEqual([])
  })
})

test("a watermarked photo that is a page's last stays everywhere it shows, off the blocklist, held for a second look; one on a page with another photo leaves as before", async () => {
  // The chief of staff, 2026-11-14: a page's last photo doesn't come off on an automatic check's word alone (last-photo.ts).
  const r = await mkdtemp(join(tmpdir(), 'aq-wm-last-'))
  const put = async (path: string, data: unknown) => { await mkdir(join(r, 'content', path, '..'), { recursive: true }); await writeFile(join(r, 'content', path), `${JSON.stringify(data, null, 2)}\n`) }
  await mkdir(join(r, 'engine-state'))
  await put('species/z/entity.json', { id: 'z', photos: [photo('glaser')] })
  await put('species/y/entity.json', { id: 'y', photos: [photo('fish'), photo('hero-credit'), photo('glaser')] })
  const out = await screenWatermarks(r, join(r, 'engine-state/_photo-watermarks.json'), join(r, 'engine-state/_photo-rejected.json'), deps().d, { limit: 10 })
  expect(out.held).toEqual([`${url('glaser')}: species/z`])
  expect((await read(r, 'content/species/z/entity.json')).photos.map((p: { url: string }) => p.url)).toEqual([url('glaser')])
  expect((await read(r, 'content/species/y/entity.json')).photos.map((p: { url: string }) => p.url)).toEqual([url('fish'), url('glaser')])
  expect(Object.keys(await read(r, 'engine-state/_photo-rejected.json'))).toEqual([url('hero-credit')])
  const look = await read(r, 'engine-state/_photo-second-look.json')
  expect(look[url('glaser')]).toMatchObject({ step: 'the watermark screen', pages: ['species/z'] })
  expect(look[url('glaser')].why).toMatch(/^watermark: /)
})

test('a newly refused alteration records the bare original before its wrapper leaves', async () => {
  const r = await site()
  const cache = join(r, 'engine-state/_photo-watermarks.json')
  const rejected = join(r, 'engine-state/_photo-rejected.json')
  const original = photo('original'), stored = photo('stored'), live = photo('live')
  const wrapper = { ...stored, altered: [{ method: 'lanczos3-upscale' }], original }
  await writeFile(join(r, 'content/species/a/entity.json'), JSON.stringify({ id: 'a', photos: [wrapper, live] }))
  await writeFile(join(r, 'content/gallery/a.json'), JSON.stringify({ id: 'a', photos: [original] }))
  await writeFile(join(r, 'content/guides/g/entity.json'), JSON.stringify({ id: 'g', photos: [] }))
  const clear = { ocr: [], watermark: false }
  await writeFile(cache, JSON.stringify({ [stored.url]: { ocr: [], watermark: true, kind: 'logo' }, [original.url]: clear, [live.url]: clear,
    [url('hero-credit')]: clear, [url('type-ok')]: clear }))
  const { d } = deps()
  await screenWatermarks(r, cache, rejected, d, { limit: 0 })
  expect((await read(r, 'content/species/a/entity.json')).photos).toEqual([live])
  expect((await read(r, 'engine-state/_photo-rejected.json'))[original.url]).toMatch(/^watermark:/)
})

test('a failed rejection save leaves a newly refused watermark waiting', async () => {
  const r = await site()
  const { d } = deps()
  const cache = join(r, 'engine-state/_photo-watermarks.json')
  const rejected = join(r, 'engine-state/_photo-rejected.json')
  await writeFile(cache, '{}')
  vi.mocked(writePhotoState).mockRejectedValueOnce(new Error('fixture state write failure'))
  await expect(screenWatermarks(r, cache, rejected, d, { limit: 10 })).rejects.toThrow('fixture state write failure')
  expect(await read(r, 'engine-state/_photo-watermarks.json')).toEqual({})
  expect((await read(r, 'content/species/a/entity.json')).photos.map((p: { url: string }) => p.url)).toContain(url('glaser'))
})
