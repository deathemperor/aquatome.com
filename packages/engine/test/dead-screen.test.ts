import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { screenDead, thumbnail, videoFrames, type DeadScreenDeps } from '../src/dead-screen'

const video = (youtubeId: string) => ({ youtubeId, title: youtubeId, durationSec: 300, lang: 'en' })
const photo = (url: string) => ({ url, width: 960, height: 640, licence: 'CC BY 4.0', author: 'A', sourceUrl: 'https://commons.wikimedia.org/x' })
const DEAD = new Set([thumbnail('deadthumb01'), videoFrames('deadframe01')[3]!, 'https://m/a-dead.webp'])

// Species a: a video whose thumbnail shows a dead fish (on b's page too), a live one, and a main photo of a dead fish.
// Species b: its main photo already judged by the photo check since it asked about dead fish. Plant c: a live main photo.
async function store() {
  const root = await mkdtemp(join(tmpdir(), 'dead-screen-'))
  const put = async (path: string, data: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), `${JSON.stringify(data, null, 2)}\n`) }
  await put('content/species/a/entity.json', { id: 'a', photos: [photo('https://m/a-dead.webp'), photo('https://m/a-2.webp')], videos: [video('deadthumb01'), video('alivethumb1')] })
  await put('content/species/b/entity.json', { id: 'b', photos: [photo('https://m/b-asked.webp')], videos: [video('deadthumb01')] })
  await put('content/plants/c/entity.json', { id: 'c', photos: [photo('https://m/c-alive.webp')], videos: [] })
  await put('engine-state/_photo-subjects.json', { 'https://m/b-asked.webp': { b: { ok: 'yes', typical: true, note: 'a live fish', logo: false } } })
  return root
}
const json = async (root: string, path: string) => JSON.parse(await readFile(join(root, path), 'utf8'))

/** A tile: a video's frames, together, or one photo. */
const tileOf = (u: string) => /\/vi\/([^/]+)\//.exec(u)?.[1] ?? u

/** The model, as a fake: each sheet's tiles are the pictures fetched for it, in order (one sheet at a time). */
function deps(o: { fail?: Set<string>; stop?: boolean } = {}) {
  const asked: string[] = []
  let sheet: string[] = []
  const d: DeadScreenDeps = {
    get: async u => {
      if (o.fail?.has(u)) throw new Error('HTTP 404')
      asked.push(u)
      sheet.push(u)
      return new Uint8Array(await sharp({ create: { width: 480, height: 360, channels: 3, background: '#468' } }).png().toBuffer())
    },
    look: async () => {
      if (o.stop) throw new LlmError('usage limit')
      const groups = [...new Set(sheet.map(tileOf))].map(t => sheet.filter(u => tileOf(u) === t))
      const tiles = groups.map((g, i) => { const dead = g.some(u => DEAD.has(u)); return { n: i + 1, dead, note: dead ? 'fish on a tape measure' : 'live fish in a tank' } })
      sheet = []
      return { tiles }
    },
  }
  return { d, asked }
}

test('dead-screen: video thumbnails, then main photos the photo check never asked about; a dead one leaves every page and stays off; each judged once', async () => {
  const root = await store()
  const { d, asked } = deps()
  const r = await screenDead(root, d, { limit: 48 })
  expect(asked).toEqual([...videoFrames('deadthumb01'), ...videoFrames('alivethumb1'), 'https://m/a-dead.webp', 'https://m/c-alive.webp'])
  expect(r).toMatchObject({ sheets: 1, judged: 4, left: 0, failed: [], stopped: '' })
  expect(r.dead).toEqual(['youtube:deadthumb01: fish on a tape measure', 'https://m/a-dead.webp: fish on a tape measure'])
  const a = await json(root, 'content/species/a/entity.json')
  expect(a.videos.map((v: { youtubeId: string }) => v.youtubeId)).toEqual(['alivethumb1'])
  expect(a.photos.map((p: { url: string }) => p.url)).toEqual(['https://m/a-2.webp'])
  expect((await json(root, 'content/species/b/entity.json')).videos).toEqual([])
  expect(await json(root, 'engine-state/_video-rejected.json')).toEqual({ deadthumb01: 'dead: fish on a tape measure (the dead-fish screen)' })
  expect(await json(root, 'engine-state/_photo-rejected.json')).toEqual({ 'https://m/a-dead.webp': 'dead: fish on a tape measure (the dead-fish screen)' })
  // A second run finds nothing to judge: a-2 is a's main photo now, and is judged once.
  const again = deps()
  expect(await screenDead(root, again.d, { limit: 48 })).toMatchObject({ judged: 1, dead: [] })
  expect(again.asked).toEqual(['https://m/a-2.webp'])
  const third = deps()
  expect(await screenDead(root, third.d, { limit: 48 })).toMatchObject({ sheets: 0, judged: 0 })
  expect(third.asked).toEqual([])
})

test('dead-screen: --limit pictures a run, the rest left for later; a picture not fetched is tried again; a model failure stops with nothing marked', async () => {
  const root = await store()
  const first = deps({ fail: new Set(videoFrames('alivethumb1')) })
  expect(await screenDead(root, first.d, { limit: 2 })).toMatchObject({ judged: 1, left: 2, failed: [`youtube:alivethumb1: HTTP 404`] })
  const stopped = deps({ stop: true })
  expect(await screenDead(root, stopped.d, { limit: 48 })).toMatchObject({ judged: 0, stopped: 'usage limit', dead: [] })
  expect((await json(root, 'content/species/a/entity.json')).photos).toHaveLength(2)
  const rest = deps()
  await screenDead(root, rest.d, { limit: 48 })
  expect(rest.asked).toEqual([...videoFrames('alivethumb1'), 'https://m/a-dead.webp', 'https://m/c-alive.webp'])
})

test('dead-screen: a live thumbnail does not clear a video: dead fish in a frame further in takes it off (the climbing perch Short, 2026-11-10)', async () => {
  const root = await store()
  await mkdir(join(root, 'content/species/d'), { recursive: true })
  await writeFile(join(root, 'content/species/d/entity.json'), `${JSON.stringify({ id: 'd', photos: [], videos: [video('deadframe01')] }, null, 2)}\n`)
  const { d } = deps()
  const r = await screenDead(root, d, { limit: 48 })
  expect(r.dead).toContain('youtube:deadframe01: fish on a tape measure')
  expect((await json(root, 'content/species/d/entity.json')).videos).toEqual([])
  expect((await json(root, 'engine-state/_video-rejected.json')).deadframe01).toBeDefined()
  expect((await json(root, 'engine-state/_dead-screen.json'))['youtube:deadframe01']).toMatchObject({ dead: true, frames: true })
})

test('dead-screen: a frame YouTube does not have is passed over, and a verdict from the thumbnail alone is looked at again only on a back-check', async () => {
  const root = await store()
  // Judged before the screen looked past the thumbnail; its third frame shows the dead fish.
  await mkdir(join(root, 'content/species/d'), { recursive: true })
  await writeFile(join(root, 'content/species/d/entity.json'), `${JSON.stringify({ id: 'd', photos: [], videos: [video('deadframe01')] }, null, 2)}\n`)
  await writeFile(join(root, 'engine-state/_dead-screen.json'), `${JSON.stringify({ 'youtube:deadframe01': { dead: false, note: 'live fish in a hand' } }, null, 2)}\n`)
  const first = deps({ fail: new Set([videoFrames('alivethumb1')[2]!]) })
  const r = await screenDead(root, first.d, { limit: 48 })
  expect(first.asked).not.toContain(thumbnail('deadframe01'))
  expect(r.failed).toEqual([])
  expect((await json(root, 'content/species/d/entity.json')).videos).toHaveLength(1)
  const back = deps()
  const again = await screenDead(root, back.d, { limit: 48, backCheck: true })
  expect(back.asked).toEqual([...videoFrames('deadframe01'), 'https://m/a-2.webp']) // a-2 is a's main photo since a-dead left
  expect(again.dead).toEqual(['youtube:deadframe01: fish on a tape measure'])
  expect((await json(root, 'content/species/d/entity.json')).videos).toEqual([])
  const third = deps()
  expect(await screenDead(root, third.d, { limit: 48, backCheck: true })).toMatchObject({ sheets: 0, judged: 0 })
})
