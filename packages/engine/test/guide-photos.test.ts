import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { guideSubject, screenGuidePhotos, type GuidePhotoDeps, type GuidePhotoVerdict } from '../src/guide-photos'
import { videoStills, type StillDeps } from '../src/video-stills'

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
function model(table: Record<string, Partial<Omit<GuidePhotoVerdict, 'other'>> & { other?: boolean | ((prompt: string) => boolean) }>, o: { stop?: boolean } = {}) {
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
      return { photos: photos.map((p, i) => { const { other, ...rest } = table[p] ?? {}; return { n: i + 1, person: false, mark: false, brand: false, note: p, ...rest, other: typeof other === 'function' ? other(prompt) : other } }) }
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
    kit: { brand: true, note: 'a shop\'s own-brand test kit box' },
    signed: { mark: true, note: 'faint signature, bottom right' },
    stamped: { mark: true, note: 'round logo, top left' },
  })
  const r = await screenGuidePhotos(root, d, { limit: 10 })
  // Leads first (a guide's first photo, an equipment guide's hero), then the rest in order; a still that is still a
  // storyboard tile waits for the video's own frame.
  expect(seen.map(s => s.photos)).toEqual([['betta', 'hands', 'siphon', 'kit', 'signed', 'stamped'], ['strips', 'carpet']])
  expect(seen[0]!.prompt).toContain('- person: true if a person or any part of one is in it: a hand or fingers')
  expect(seen[0]!.prompt).toContain('- brand: true if a shop\'s or dealer\'s logo or name can be read or recognised in the photo')
  expect(r).toMatchObject({ sheets: 2, judged: 8, left: 0, waiting: 1, failed: [], stopped: '' })
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

/** A video guide as the engine stores it (video-stills.ts parses it), its stills by `t`: the video's own frames (`-hd`) or storyboard tiles. */
const still = (t: number, hd: boolean) => ({ t, url: url(`video/b1/${hd ? `at${t}-hd` : `t${t}`}`), width: hd ? 1200 : 320, height: hd ? 675 : 180, caption: `still ${t}`, ...(hd ? { sharpness: 400 } : {}) })
const videoGuide = (photos: object[], figures: object[]) => ({
  kind: 'aquascaping', source: 'youtube', sourceUrl: 'https://www.youtube.com/watch?v=b1', html: '', photos, mentions: [], updatedAt: '2026-11-06',
  video: { youtubeId: 'b1', title: 'Scape', channel: 'S', channelUrl: 'https://x', durationSec: 100, chapters: [], figures },
})
const stillsOf = async (root: string) => ((await json(root, 'content/guides/youtube-b1/entity.json')).video.figures as { heading: string; moments: { url: string }[]; photo?: { url: string } }[])
  .map(f => ({ heading: f.heading, moments: urls(f.moments), ...(f.photo ? { photo: name(f.photo.url) } : {}) }))

test('a video still with hands, a person or a mark leaves its guide for good, and video-stills doesn\'t bring it back; one with no one in it stays, a brand in the scene too; a tile waiting for its frame is judged once it is one', async () => {
  // Teaching videos show hands planting and siphoning; video-stills screens a frame only for faces and text.
  const root = await store({
    'youtube-b1': videoGuide([photo('lead')], [
      { heading: 'Trồng', moments: [still(20, true), still(30, true)] },
      { heading: 'Nền', moments: [still(45, false)] },
      { heading: 'Hút', moments: [still(50, false)] },
      { heading: 'Bố cục', moments: [still(60, true)], photo: photo('scape') },
    ]),
  })
  // video-stills kept the t50 tile for good (its frame showed another moment); t45 is a tile it hasn't reached yet.
  await writeFile(join(root, 'engine-state/_video-stills.json'), JSON.stringify({ 'youtube-b1': { at: '2026-11-06', timed: true, kept: { 50: "the frame at 50 s isn't the tile's moment" } } }))
  const { d, seen } = model({
    'at20-hd': { person: true, note: 'hands planting a stem plant' },
    'at30-hd': { brand: true, note: 'a carpet, an Aquarium Co-op bottle at the edge' },
    'at60-hd': { mark: true, note: 'channel logo, bottom right' },
  })
  const r = await screenGuidePhotos(root, d, { limit: 10 })
  // The lead, then the stills, then the other photo; not the tile waiting for its frame, nor the tile kept for good, which never shows.
  expect(seen.map(s => s.photos)).toEqual([['lead', 'at20-hd', 'at30-hd', 'at60-hd', 'scape']])
  expect(seen[0]!.prompt).toContain('Numbered photos and video frames')
  expect(r).toMatchObject({ sheets: 1, judged: 5, left: 0, waiting: 1, failed: [], stopped: '' })
  expect(await stillsOf(root)).toEqual([
    { heading: 'Trồng', moments: ['at30-hd'] },
    { heading: 'Nền', moments: ['t45'] },
    { heading: 'Hút', moments: ['t50'] },
    { heading: 'Bố cục', moments: [], photo: 'scape' },
  ])
  expect(Object.fromEntries(Object.entries(await json(root, 'engine-state/_photo-rejected.json')).map(([u, w]) => [name(u), w]))).toEqual({
    'at20-hd': 'people: hands planting a stem plant',
    'at60-hd': 'watermark: channel logo, bottom right',
  })

  // video-stills turns the waiting tile into the video's frame, and leaves the stills taken off out.
  const grey = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 110, g: 110, b: 110 } } })
  const sd: StillDeps = {
    frames: async () => ({ storyboard: { fps: 0.1, interval: 5, rows: 3, columns: 3, width: 320, height: 180, fragments: [] }, stream: { url: 'https://stream/b1' } }),
    grab: async () => grey(1280, 720).png().toBuffer(),
    get: async () => grey(320, 180).webp().toBuffer(),
    faces: async files => files.map(() => 0),
    read: async files => files.map(() => []),
    look: async () => { throw new Error('no text to judge') },
    judge: async () => ({ photos: [{ n: 1, person: false, mark: false, brand: false, note: 'a tank' }] }),
    media: { urlFor: k => url(k.replace('.webp', '')), put: async k => ({ url: url(k.replace('.webp', '')), width: 1200, height: 675 }) },
    now: () => new Date('2026-11-07T12:00:00Z'),
  }
  expect((await videoStills(root, sd)).done).toEqual(['youtube-b1: 1 sharp, 0 dropped, 1 kept as tiles'])
  expect(await stillsOf(root)).toEqual([
    { heading: 'Trồng', moments: ['at30-hd'] },
    { heading: 'Nền', moments: ['at45-hd'] },
    { heading: 'Hút', moments: ['t50'] },
    { heading: 'Bố cục', moments: [], photo: 'scape' },
  ])

  // video-stills judged the new frame before uploading it, so the next screen has nothing to ask; what it took off stays off.
  const next = model({})
  const again = await screenGuidePhotos(root, next.d, { limit: 10 })
  expect(next.seen).toEqual([])
  expect(again).toMatchObject({ judged: 0, removed: [], waiting: 0 })
  expect((await stillsOf(root)).flatMap(f => f.moments)).toEqual(['at30-hd', 'at45-hd', 't50'])
})

test('a still with no one in it gets `person: false`, which it needs to show, once; a still the other bars hide is not judged', async () => {
  const root = await store({ 'youtube-b1': videoGuide([], [{ heading: 'x', moments: [still(20, true), { ...still(30, true), sharpness: 3 }, { ...still(40, true), width: 640, height: 360 }] }]) })
  const { d, seen } = model({})
  expect(await screenGuidePhotos(root, d, { limit: 5 })).toMatchObject({ judged: 1, cleared: 1 })
  expect(seen.map(s => s.photos)).toEqual([['at20-hd']])
  const moments = async () => (await json(root, 'content/guides/youtube-b1/entity.json')).video.figures[0].moments as { person?: boolean }[]
  expect((await moments()).map(m => m.person)).toEqual([false, undefined, undefined])
  expect(await screenGuidePhotos(root, d, { limit: 5 })).toMatchObject({ judged: 0, cleared: 0 })
})

test('--only: the model looks at the named guide alone, and the others wait their turn', async () => {
  const root = await store({
    'youtube-a': videoGuide([], [{ heading: 'x', moments: [{ ...still(1, true), url: url('s1-hd') }] }]),
    'youtube-b': videoGuide([], [{ heading: 'y', moments: [{ ...still(2, true), url: url('s2-hd') }] }]),
  }, { 'test-nuoc': { hero: photo('kit') } })
  const { d, seen } = model({})
  expect(await screenGuidePhotos(root, d, { limit: 5, only: ['youtube-b'] })).toMatchObject({ judged: 1, left: 0 })
  expect(seen.map(s => s.photos)).toEqual([['s2-hd']])
})

test('the limit caps model calls with video stills too: leads, then the stills, guides in order, then the other photos', async () => {
  const root = await store({
    'youtube-a': videoGuide([photo('a1')], [{ heading: 'x', moments: [1, 2, 3, 4, 5, 6].map(t => ({ ...still(t, true), url: url(`s${t}-hd`) })) }]),
    'youtube-b': videoGuide([], [{ heading: 'y', moments: [{ ...still(7, true), url: url('s7-hd') }] }]),
  }, { 'test-nuoc': { hero: photo('kit'), types: [{ photo: photo('t1') }] } })
  const { d, seen } = model({})
  const one = await screenGuidePhotos(root, d, { limit: 1 })
  expect(seen.map(s => s.photos)).toEqual([['a1', 'kit', 's1-hd', 's2-hd', 's3-hd', 's4-hd']])
  expect(one).toMatchObject({ sheets: 1, left: 4 })
  const two = await screenGuidePhotos(root, d, { limit: 1 })
  expect(seen.map(s => s.photos)[1]).toEqual(['s5-hd', 's6-hd', 's7-hd', 't1'])
  expect(two.left).toBe(0)
})

test('what a guide is about: one kind of fish or plant, from its kind and title; not a how-to, a tank-mates list or a guide naming several', () => {
  expect(guideSubject('care', 'aquariumcoop-blogs-aquarium-platy-care-guide')).toBe('platy')
  expect(guideSubject('care', 'Hướng dẫn nuôi cá platy: cho ăn, sinh sản và cá cùng bể')).toBe('platy')
  expect(guideSubject('discovery', 'Top 10 loài cá tetra cho bể cộng đồng')).toBe('tetra')
  expect(guideSubject('care', 'Hướng dẫn chăm sóc cá chạch hề')).toBe('loach')
  expect(guideSubject('plantCare', 'Cách buộc ráy (Anubias) lên lũa')).toBe('anubias')
  expect(guideSubject('discovery', 'Top 10 loài cá chuột (Corydoras) đáng nuôi nhất')).toBe('corydoras')
  expect(guideSubject('setup', 'Cách set bể cá betta đẹp')).toBeUndefined()
  expect(guideSubject('aquascaping', 'Bày lũa cho bể cá rồng')).toBeUndefined()
  expect(guideSubject('care', '10 loài cá nuôi chung tốt nhất với cá vàng')).toBeUndefined()
  expect(guideSubject('care', 'Best tank mates for goldfish')).toBeUndefined()
  expect(guideSubject('care', 'Set bể nuôi cá thần tiên, cá đĩa')).toBeUndefined()
  expect(guideSubject('care', 'Cách cho cá ăn thức ăn đông lạnh')).toBeUndefined()
  expect(guideSubject(undefined, 'platy')).toBeUndefined()
  // Real titles a review caught: a word in passing, or a second animal the table didn't know.
  expect(guideSubject('care', 'Bể Tanganyika cho cá sống trong vỏ ốc')).toBeUndefined()
  expect(guideSubject('care', 'Cách chuyển cá rồng và cá đuối lớn sang hệ bể mới')).toBeUndefined()
  expect(guideSubject('care', 'Cá endler, bảy màu và cá kiếm')).toBeUndefined()
  expect(guideSubject('breeding', 'x', 'aquariumcoop-blogs-aquarium-baby-brine-shrimp')).toBeUndefined()
  expect(guideSubject('care', 'Cách chuyển cá rồng sang bể mới và thả chung với cá khác')).toBeUndefined()
  expect(guideSubject('care', 'x', 'aquariumcoop-blogs-goldfish-tank-mates')).toBeUndefined()
})

test('a guide about one fish: in the same call as the people check, a picture of another fish leaves that guide, joins no blocklist, and stays off after a re-read; a how-to is not asked', async () => {
  // The owner's reports (2026-11-10): arowanas and a corydoras on the platy guide.
  const id = 'aquariumcoop-blogs-aquarium-platy-care-guide'
  const root = await store({
    [id]: { kind: 'care', source: 'aquariumcoop', photos: [photo('platy'), photo('html-gone'), photo('arowana')] },
    'aquariumcoop-blogs-setup-a-tank': { kind: 'setup', source: 'aquariumcoop', photos: [photo('neon')] },
  })
  const { d, seen } = model({ arowana: { other: true, note: 'two silver arowana' }, neon: { other: true } })
  const r = await screenGuidePhotos(root, d, { limit: 5 })
  expect(seen).toHaveLength(1)
  expect(seen[0]!.photos).toEqual(['platy', 'neon', 'arowana'])
  // A download that failed doesn't shift the numbers; the guide's title goes with its subject.
  expect(seen[0]!.prompt).toContain(`- Photo 1 (platy): "${id}"\n- Photo 3 (platy): "${id}"`)
  expect(seen[0]!.prompt).not.toContain('- Photo 2 ')
  expect(urls((await json(root, `content/guides/${id}/entity.json`)).photos)).toEqual(['platy', 'html-gone'])
  expect(urls((await json(root, 'content/guides/aquariumcoop-blogs-setup-a-tank/entity.json')).photos)).toEqual(['neon'])
  expect(r.subject).toEqual([`content/guides/${id}/entity.json: ${url('arowana')}: two silver arowana`])
  expect(await json(root, 'engine-state/_photo-rejected.json')).toEqual({})
  expect((await json(root, 'engine-state/_photo-guides.json'))[url('arowana')].other).toEqual({ platy: true })

  const file = join(root, `content/guides/${id}/entity.json`)
  await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), photos: [photo('platy'), photo('arowana')] }))
  const again = await screenGuidePhotos(root, d, { limit: 5 })
  expect(seen).toHaveLength(1)
  expect(again.subject).toHaveLength(1)
  expect(urls((await json(root, `content/guides/${id}/entity.json`)).photos)).toEqual(['platy'])
})

test('a photo on two guides is asked about each subject, and leaves only the guide it is a stranger on', async () => {
  const root = await store({
    'aquariumcoop-arowana-care': { kind: 'care', source: 'aquariumcoop', photos: [photo('lead-a'), photo('both')] },
    'aquariumcoop-platy-care': { kind: 'care', source: 'aquariumcoop', photos: [photo('lead-p'), photo('both')] },
  })
  const { d, seen } = model({ both: { other: prompt => /Photo \d \(platy\)/.test(prompt) && !/Photo \d \(arowana\)/.test(prompt) } })
  await screenGuidePhotos(root, d, { limit: 5 })
  await screenGuidePhotos(root, d, { limit: 5 })
  expect(seen.map(s => s.photos)).toEqual([['lead-a', 'lead-p', 'both'], ['both']])
  expect(urls((await json(root, 'content/guides/aquariumcoop-arowana-care/entity.json')).photos)).toEqual(['lead-a', 'both'])
  expect(urls((await json(root, 'content/guides/aquariumcoop-platy-care/entity.json')).photos)).toEqual(['lead-p'])
})

test('a photo judged before the subject was asked is asked once, ahead of photos not judged, and keeps its verdict; a still is not asked', async () => {
  const id = 'aquariumcoop-platy-care'
  const root = await store({
    'aquariumcoop-new-tank': { kind: 'setup', source: 'aquariumcoop', photos: [photo('lead-n'), photo('unjudged')] },
    [id]: { kind: 'care', source: 'aquariumcoop', photos: [photo('lead'), photo('old')], video: { title: 'x', figures: [{ heading: 'a', moments: [{ ...still(3, true), url: url('still-hd') }] }] } },
  })
  const verdict = { person: false, mark: false, brand: false, note: 'a platy, from before' }
  await writeFile(join(root, 'engine-state/_photo-guides.json'), JSON.stringify({ [url('lead')]: { ...verdict, other: { platy: false } }, [url('lead-n')]: verdict, [url('old')]: verdict, [url('still-hd')]: verdict }))
  const { d, seen } = model({ old: { person: true, note: 'a new note' }, unjudged: {} })
  await screenGuidePhotos(root, d, { limit: 1 })
  expect(seen[0]!.photos).toEqual(['old', 'unjudged'])
  expect(seen[0]!.prompt).toContain('- Photo 1 (platy): ')
  expect(seen[0]!.prompt).not.toContain('- Photo 2 ')
  const after = await json(root, 'engine-state/_photo-guides.json')
  expect(after[url('old')]).toEqual({ ...verdict, other: { platy: false } })
  expect(urls((await json(root, `content/guides/${id}/entity.json`)).photos)).toEqual(['lead', 'old'])
  expect((await screenGuidePhotos(root, d, { limit: 1 })).judged).toBe(0)
  expect(seen).toHaveLength(1)
})
