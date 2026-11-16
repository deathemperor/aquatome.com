import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, expect, test } from 'vitest'
import { GLOSSARY_PHOTOS, glossaryPhoto, type GlossaryPhotoDeps } from '../src/glossary-photo'
import { mirrorPlan } from '../src/mirror-photos'
import { assertPhotoPrivacy } from '../src/photo-privacy'

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))) })

// The term's kinds are its entry's "Các loại …" list: lua-bonsai and lua-cholla; the list under "Xử lý" is no kinds.
const BODY = '<p>Lũa là gỗ ngâm.</p><h2>Các loại lũa</h2><ul><li><strong>Lũa bonsai</strong>: dáng cây.</li><li>Lũa cholla (cholla wood): rỗng.</li></ul><h2>Xử lý</h2><ul><li>Ngâm nước: vài tuần.</li></ul>'
const OTHER = 'https://media.aquatome.com/commons/0000000000000000.webp'
async function root() {
  const r = await mkdtemp(join(tmpdir(), 'aq-glossary-photo-'))
  dirs.push(r)
  await mkdir(join(r, 'content/glossary/lua'), { recursive: true })
  await mkdir(join(r, 'engine-state'))
  await writeFile(join(r, 'content/glossary/lua/entity.json'), `${JSON.stringify({ id: 'lua', en: 'Driftwood' }, null, 2)}\n`)
  await writeFile(join(r, 'content/glossary/lua/vi.json'), `${JSON.stringify({ slug: 'lua', name: 'Lũa', body: BODY }, null, 2)}\n`)
  // Another photo's screen record, which a run keeps.
  await writeFile(join(r, 'engine-state/_photo-watermarks.json'), `${JSON.stringify({ [OTHER]: { ocr: [], watermark: false, kind: 'none' } }, null, 2)}\n`)
  return r
}
const load = (r: string, f: string) => readFile(join(r, f), 'utf8').then(s => JSON.parse(s))
const has = (r: string, f: string) => readFile(join(r, f)).then(() => true, () => false)
/** Every file under content/, with its bytes. */
async function snapshot(r: string) {
  const files = (await readdir(join(r, 'content'), { recursive: true })).sort()
  return Promise.all(files.map(async f => [f, await readFile(join(r, 'content', f), 'utf8').catch(() => 'a folder')]))
}

const FILE = 'File:Driftwood sample.jpg'
const THUMB = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Driftwood_sample.jpg/1280px-Driftwood_sample.jpg'
const PAGE = 'https://commons.wikimedia.org/wiki/File:Driftwood_sample.jpg'
const ARTIST = '<a href="//commons.wikimedia.org/wiki/User:Ann_Sample">Ann Sample</a>'
const info = (o: { width?: number; licence?: string; mime?: string; artist?: string } = {}) => ({ query: { pages: { 42: { title: FILE, imageinfo: [{
  width: o.width ?? 4000, height: 3000, mime: o.mime ?? 'image/jpeg', thumburl: `${THUMB}?utm_source=commons.wikimedia.org`, thumbwidth: 1280, thumbheight: 960, descriptionurl: PAGE,
  extmetadata: { LicenseShortName: { value: o.licence ?? 'CC BY-SA 4.0' }, Artist: { value: o.artist ?? ARTIST } },
}] } } } })
const COMMONS_KEY = mirrorPlan(THUMB)!.key
const OURS = `https://media.aquatome.com/${COMMONS_KEY}`

const flickr = (id: string, photo: number) => ({
  id, url: `https://live.staticflickr.com/65535/${photo}_0123abcd45_b.jpg`, creator: ' Sample Shooter ', license: 'by', license_version: '2.0',
  foreign_landing_url: `https://www.flickr.com/photos/someone/${photo}`, width: 1024, height: 768, source: 'flickr',
})
/** Openverse's pages 1…n of 10, each with one other photo; the one asked for (5550001) on page `at`. */
const pages = (n: number, at?: number) => Array.from({ length: n }, (_, i) => ({ page_count: 10, results: [flickr(`ov-${i + 1}`, 1000 + i), ...(at === i + 1 ? [flickr('ov-target', 5550001)] : [])] }))

/** Lettering on a photo, for the fake Vision: never to be written anywhere. */
const LETTERING = ['GLOSSARY', 'TEST', 'ONLY', 'CREDIT'].join('_')
const photo = (width = 1600, height = 1200) => sharp({ create: { width, height, channels: 3, background: '#6b4f2a' } }).jpeg().toBuffer()

function deps(o: { info?: unknown; pages?: unknown[]; remaining?: number; faces?: number; text?: string[]; read?: 'unreadable'; mark?: boolean; verdict?: false; stored?: string[] } = {}) {
  const calls = { http: [] as string[], openverse: [] as string[], bytes: [] as string[], put: [] as string[], faces: 0, read: 0, looks: 0 }
  const d: GlossaryPhotoDeps = {
    http: async u => { calls.http.push(u); return o.info ?? info() },
    openverse: async u => {
      calls.openverse.push(u)
      return { json: o.pages?.[Number(new URL(u).searchParams.get('page')) - 1] ?? { page_count: 10, results: [] }, remaining: o.remaining ?? 100 }
    },
    bytes: async u => { calls.bytes.push(u); return new Uint8Array(await photo()) },
    exists: async u => (o.stored ?? []).includes(u),
    media: {
      urlFor: k => `https://media.aquatome.com/${k}`,
      put: async k => { calls.put.push(k); return { url: `https://media.aquatome.com/${k}`, thumb: `https://media.aquatome.com/${k.replace(/\.webp$/, '-480.webp')}`, width: 1200, height: 900 } },
    },
    faces: async files => { calls.faces++; return files.map(() => o.faces ?? 0) },
    read: async files => { calls.read++; return files.map(() => (o.read ? null : (o.text ?? []).map(t => ({ t, c: 1, x: 0.7, y: 0.9, w: 0.25, h: 0.04 })))) },
    look: async () => {
      calls.looks++
      if (o.verdict === false) return { photos: [] }
      return { photos: [{ n: 1, watermark: !!o.mark, kind: o.mark ? 'credit' : 'none', locations: o.mark ? ['bottom right'] : [], what: `a credit reading ${LETTERING}` }] }
    },
    now: () => new Date('2026-11-16T03:00:00Z'),
  }
  return { d, calls }
}

test('Commons: one file-details read; its licence, size and credit; the credit is the name alone, without an email or the place; stored on our host', async () => {
  const r = await root()
  const { d, calls } = deps({ info: info({ artist: `${ARTIST} (someone@example.org) Depicted place: 12 Sample Street, Sampletown (10.77, 106.70)` }) })
  const rec = await glossaryPhoto(r, { term: 'lua', kind: 'lua-bonsai', file: FILE }, d)
  expect(calls.http).toHaveLength(1)
  expect(Object.fromEntries(new URL(calls.http[0]!).searchParams)).toEqual({
    format: 'json', action: 'query', titles: FILE, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280', iiextmetadatafilter: 'LicenseShortName|Artist|ImageDescription|Categories',
  })
  expect(calls.bytes).toEqual([THUMB]) // without Commons' query string
  expect(calls.put).toEqual([COMMONS_KEY])
  expect(rec).toEqual({
    url: OURS, thumb: OURS.replace('.webp', '-480.webp'), width: 1200, height: 900, licence: 'CC BY-SA 4.0', author: 'Ann Sample', sourceUrl: PAGE, key: FILE, at: '2026-11-16',
  })
  expect(await load(r, GLOSSARY_PHOTOS)).toEqual({ 'lua/lua-bonsai': [rec] })
  // No text on our copy: Vision's read is the whole screen, and no model look.
  expect(calls).toMatchObject({ faces: 1, read: 1, looks: 0 })
  expect((await load(r, 'engine-state/_photo-watermarks.json'))[OURS]).toEqual({ ocr: [] })
})

test('Commons: a non-commercial licence, a file under 800 px and one not a JPEG, PNG or WebP are refused, before any download', async () => {
  const cases: [Parameters<typeof info>[0], RegExp][] = [
    [{ licence: 'CC BY-NC-SA 4.0' }, /licence \(CC BY-NC-SA 4.0\) is not one the site may use/], [{ width: 600 }, /600 px wide, under 800/], [{ mime: 'image/tiff' }, /image\/tiff, not a JPEG, PNG or WebP/],
  ]
  for (const [o, why] of cases) {
    const r = await root()
    const { d, calls } = deps({ info: info(o) })
    await expect(glossaryPhoto(r, { term: 'lua', kind: 'lua-bonsai', file: FILE }, d)).rejects.toThrow(why)
    expect(calls.bytes).toEqual([])
    expect(calls.put).toEqual([])
    expect(await has(r, GLOSSARY_PHOTOS)).toBe(false)
  }
})

test("Openverse: the Flickr photo found on page 2, with Openverse's record id kept", async () => {
  const r = await root()
  const { d, calls } = deps({ pages: pages(5, 2) })
  const rec = await glossaryPhoto(r, { term: 'lua', kind: 'lua-cholla', openverse: 'cholla wood', flickr: '5550001' }, d)
  expect(calls.openverse.map(u => new URL(u).searchParams.get('page'))).toEqual(['1', '2'])
  expect(new URL(calls.openverse[0]!).searchParams.get('q')).toBe('"cholla wood"')
  expect(calls.http).toEqual([])
  expect(calls.put).toEqual(['flickr/5550001.webp'])
  expect(rec).toEqual({
    url: 'https://media.aquatome.com/flickr/5550001.webp', thumb: 'https://media.aquatome.com/flickr/5550001-480.webp', width: 1200, height: 900,
    licence: 'CC BY 2.0', author: 'Sample Shooter', sourceUrl: 'https://www.flickr.com/photos/someone/5550001', key: 'flickr:5550001', openverse: 'ov-target', at: '2026-11-16',
  })
})

test('Openverse: a photo not on its first 5 pages is refused, and no sixth page is asked', async () => {
  const r = await root()
  const { d, calls } = deps({ pages: pages(10) })
  await expect(glossaryPhoto(r, { term: 'lua', kind: 'lua-cholla', openverse: 'cholla wood', flickr: '5550001' }, d)).rejects.toThrow(/flickr:5550001 is not among/)
  expect(calls.openverse).toHaveLength(5)
  expect(calls.bytes).toEqual([])
  expect(await has(r, GLOSSARY_PHOTOS)).toBe(false)
})

test('a kind the term does not list, or a term there is not, is refused before any request', async () => {
  const r = await root()
  for (const [o, why] of [
    [{ term: 'lua', kind: 'lua-gia', file: FILE }, /"lua-gia" is not one of lua's kinds \(lua-bonsai, lua-cholla\)/],
    [{ term: 'lua', kind: 'ngam-nuoc', openverse: 'x', flickr: '5550001' }, /"ngam-nuoc" is not one of lua's kinds/],
    [{ term: 'khong-co', kind: 'lua-bonsai', file: FILE }, /no glossary term "khong-co"/],
    [{ term: '../lua', kind: 'lua-bonsai', file: FILE }, /not a glossary term id/],
  ] as const) {
    const { d, calls } = deps()
    await expect(glossaryPhoto(r, o, d)).rejects.toThrow(why)
    expect(calls).toMatchObject({ http: [], openverse: [], bytes: [], put: [], faces: 0, read: 0, looks: 0 })
  }
})

test('a face on our copy makes the photo "off: people"', async () => {
  const r = await root()
  const rec = await glossaryPhoto(r, { term: 'lua', kind: 'lua-bonsai', file: FILE }, deps({ faces: 1 }).d)
  expect(rec.off).toBe('people')
  expect((await load(r, GLOSSARY_PHOTOS))['lua/lua-bonsai'][0].off).toBe('people')
})

test('a mark on our copy makes the photo "off: mark", with its screen record under our address and no lettering kept', async () => {
  const r = await root()
  const { d, calls } = deps({ text: [LETTERING], mark: true })
  const rec = await glossaryPhoto(r, { term: 'lua', kind: 'lua-bonsai', file: FILE }, d)
  expect(rec.off).toBe('mark')
  expect(calls.looks).toBe(1)
  const marks = await load(r, 'engine-state/_photo-watermarks.json')
  expect(marks[OURS]).toMatchObject({ watermark: true, kind: 'credit', locations: ['bottom right'], ocr: [{ c: 1, at: 'bottom right', hash: createHash('sha256').update(LETTERING).digest('hex') }] })
  expect(marks[OTHER]).toEqual({ ocr: [], watermark: false, kind: 'none' })
  for (const f of ['engine-state/_photo-watermarks.json', GLOSSARY_PHOTOS]) expect(await readFile(join(r, f), 'utf8')).not.toContain(LETTERING)
  await assertPhotoPrivacy(r)
  // Text the model judges part of the scene is no mark.
  const clean = await glossaryPhoto(await root(), { term: 'lua', kind: 'lua-bonsai', file: FILE }, deps({ text: [LETTERING] }).d)
  expect(clean.off).toBeUndefined()
})

test('a screen that cannot finish leaves no record: a copy face detection or Vision cannot read, a look with no verdict', async () => {
  const cases: [Parameters<typeof deps>[0], RegExp][] = [[{ faces: -1 }, /face detection could not read/], [{ faces: Number.NaN }, /face detection could not read/], [{ read: 'unreadable' }, /Vision could not read/], [{ text: [LETTERING], verdict: false }, /gave no verdict/]]
  for (const [o, why] of cases) {
    const r = await root()
    await expect(glossaryPhoto(r, { term: 'lua', kind: 'lua-bonsai', file: FILE }, deps(o).d)).rejects.toThrow(why)
    expect(await has(r, GLOSSARY_PHOTOS)).toBe(false)
  }
})

test('content/ is unchanged; a second run of the same photo replaces its record, leaving the stored photo alone; keys sorted', async () => {
  const r = await root()
  const before = await snapshot(r)
  await glossaryPhoto(r, { term: 'lua', kind: 'lua-cholla', openverse: 'cholla wood', flickr: '5550001' }, deps({ pages: pages(1, 1) }).d)
  await glossaryPhoto(r, { term: 'lua', kind: 'lua-bonsai', file: FILE }, deps().d)
  // Again, now that our host serves it: nothing downloaded from Commons or stored again, and the screens see our copy.
  const again = deps({ faces: 2, stored: [OURS] })
  const rec = await glossaryPhoto(r, { term: 'lua', kind: 'lua-bonsai', file: FILE }, again.d)
  expect(again.calls.put).toEqual([])
  expect(again.calls.bytes).toEqual([OURS])
  expect(rec).toMatchObject({ url: OURS, thumb: OURS.replace('.webp', '-480.webp'), width: 1600, height: 1200, off: 'people' })
  expect(await snapshot(r)).toEqual(before)
  const raw = await readFile(join(r, GLOSSARY_PHOTOS), 'utf8')
  const all = JSON.parse(raw)
  expect(Object.keys(all)).toEqual(['lua/lua-bonsai', 'lua/lua-cholla'])
  expect(all['lua/lua-bonsai']).toEqual([rec])
  expect(raw).toBe(`${JSON.stringify(all, null, 2)}\n`)
})

test("a screen record already under our address is not the verdict: the mirror may have copied the source file's there; our copy is read, and a kept-mark record stays", async () => {
  const r = await root()
  const kept = { source: 'glaser', sourceUrl: 'https://example.org/a-page', owner: 'source' }
  const marks = await load(r, 'engine-state/_photo-watermarks.json')
  await writeFile(join(r, 'engine-state/_photo-watermarks.json'), `${JSON.stringify({ ...marks, [OURS]: { ocr: [], watermark: false, kind: 'none', retainedOwnMark: kept } }, null, 2)}\n`)
  const { d, calls } = deps({ text: [LETTERING], mark: true, stored: [OURS] })
  const rec = await glossaryPhoto(r, { term: 'lua', kind: 'lua-bonsai', file: FILE }, d)
  expect(calls).toMatchObject({ read: 1, looks: 1 })
  expect(rec.off).toBe('mark')
  expect((await load(r, 'engine-state/_photo-watermarks.json'))[OURS]).toMatchObject({ watermark: true, kind: 'credit', retainedOwnMark: kept })
})

test('a run the privacy guard stops leaves the candidate file as it was', async () => {
  const r = await root()
  await glossaryPhoto(r, { term: 'lua', kind: 'lua-cholla', openverse: 'cholla wood', flickr: '5550001' }, deps({ pages: pages(1, 1) }).d)
  const before = await readFile(join(r, GLOSSARY_PHOTOS), 'utf8')
  // Another engine-state file with a free observation, which the guard refuses.
  await writeFile(join(r, 'engine-state/_photo-subjects.json'), `${JSON.stringify({ [OTHER]: { 'species/a': { ok: 'yes', typical: true, note: 'a sentence a model wrote about the photo' } } }, null, 2)}\n`)
  await expect(glossaryPhoto(r, { term: 'lua', kind: 'lua-bonsai', file: FILE }, deps().d)).rejects.toThrow(/photo privacy/)
  expect(await readFile(join(r, GLOSSARY_PHOTOS), 'utf8')).toBe(before)
  const fresh = await root()
  await writeFile(join(fresh, 'engine-state/_photo-subjects.json'), `${JSON.stringify({ [OTHER]: { 'species/a': { ok: 'yes', typical: true, note: 'a sentence a model wrote about the photo' } } }, null, 2)}\n`)
  await expect(glossaryPhoto(fresh, { term: 'lua', kind: 'lua-bonsai', file: FILE }, deps().d)).rejects.toThrow(/photo privacy/)
  expect(await has(fresh, GLOSSARY_PHOTOS)).toBe(false)
})

test("Openverse: no page is asked past the day's last ten requests", async () => {
  const r = await root()
  const { d, calls } = deps({ pages: pages(10), remaining: 9 })
  await expect(glossaryPhoto(r, { term: 'lua', kind: 'lua-cholla', openverse: 'cholla wood', flickr: '5550001' }, d)).rejects.toThrow(/requests for today are used up/)
  expect(calls.openverse).toHaveLength(1)
  expect(await has(r, GLOSSARY_PHOTOS)).toBe(false)
})

test("the mark screen's file keeps its own order: our photo's record goes last, every other stays where it was", async () => {
  const r = await root()
  const first = 'https://media.aquatome.com/scotcat/ffffffffffffffff.webp'
  const marks = { [first]: { ocr: [] }, [OTHER]: { ocr: [], watermark: false, kind: 'none' } }
  await writeFile(join(r, 'engine-state/_photo-watermarks.json'), `${JSON.stringify(marks, null, 2)}\n`)
  await glossaryPhoto(r, { term: 'lua', kind: 'lua-bonsai', file: FILE }, deps().d)
  expect(Object.keys(await load(r, 'engine-state/_photo-watermarks.json'))).toEqual([first, OTHER, OURS])
})
