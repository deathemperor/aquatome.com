import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { videoStills, type StillDeps } from '../src/video-stills'
import type { TextLine } from '../src/watermarks'

const grey = (v: number, width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: v, g: v, b: v } } })
const line = (t: string): TextLine => ({ t, c: 1, x: 0.1, y: 0.9, w: 0.3, h: 0.03 })
const old = (t: number) => `https://m/video/b1/t${t}.webp`
const moment = (t: number, caption: string) => ({ t, url: old(t), width: 320, height: 180, caption })

/**
 * One guide whose stills are tiles; each tile is its own shade of grey and the video's frame at its second the same
 * shade, so a frame matches its tile. yt-dlp's fps is 11 tiles ÷ 100 s and YouTube's interval 10 s: t18 is at 20 s, t27
 * at 30 s and so on.
 */
async function site(over: Partial<StillDeps> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'stills-'))
  const put = async (path: string, data: unknown) => {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`)
  }
  await put('content/guides/youtube-b1/entity.json', {
    id: 'youtube-b1', kind: 'aquascaping', source: 'youtube', sourceUrl: 'https://www.youtube.com/watch?v=b1', html: '', photos: [], mentions: [], updatedAt: '2026-10-29',
    video: { youtubeId: 'b1', title: 'Scape', channel: 'S', channelUrl: 'https://x', durationSec: 100, chapters: [], figures: [
      { heading: 'Đá', moments: [moment(18, 'Một'), moment(27, 'Hai'), moment(36, 'Ba')] },
      { heading: 'Nền', moments: [moment(45, 'Bốn'), moment(54, 'Năm'), moment(63, 'Sáu'), moment(72, 'Bảy')] },
    ] },
  })
  // The t27 still's text was judged before: a product's own label.
  await put('engine-state/_photo-watermarks.json', { [old(27)]: { ocr: [{ t: 'SERA', c: 1, at: 'bottom left' }], watermark: false, kind: 'none', what: 'product label' } })
  await put('engine-state/_photo-rejected.json', { [old(72)]: 'owner: hands' })
  await put('content/picture-hashes.json', {})
  const shade = (t: number) => 20 + t * 2
  const calls = { frames: 0, grabs: [] as number[], puts: [] as string[], looks: 0 }
  const d: StillDeps = {
    frames: async () => { calls.frames++; return { storyboard: { fps: 0.11, interval: 10, rows: 3, columns: 3, width: 320, height: 180, fragments: [] }, stream: { url: 'https://stream/b1' } } },
    grab: async (_s, sec) => {
      calls.grabs.push(sec)
      if (sec === 70) throw new Error('ffmpeg: Server returned 403 Forbidden (access denied)')
      return grey(sec === 50 ? 0 : shade(Math.round(sec / 10 / 0.11)), 1280, 720).png().toBuffer() // 50 s: another moment than t45's tile
    },
    get: async u => grey(shade(Number(u.match(/t(\d+)\.webp$/)![1])), 320, 180).webp().toBuffer(),
    faces: async files => files.map(f => (f.endsWith('-54.png') ? 1 : 0)),
    read: async files => files.map(f => (f.endsWith('-27.png') ? [line('SERA flore')] : f.endsWith('-36.png') ? [line('© Tank Channel')] : [])),
    look: async () => { calls.looks++; return { photos: [{ n: 1, watermark: true, kind: 'credit', what: '© Tank Channel, bottom' }] } },
    media: { urlFor: k => `https://m/${k}`, put: async k => { calls.puts.push(k); return { url: `https://m/${k}`, width: 1200, height: 675 } } },
    now: () => new Date('2026-11-06T12:00:00Z'),
    ...over,
  }
  const read = async (path: string) => JSON.parse(await readFile(join(root, path), 'utf8'))
  const raw = async () => Promise.all(['content/guides/youtube-b1/entity.json', 'engine-state/_video-stills.json', 'engine-state/_photo-watermarks.json', 'engine-state/_photo-rejected.json', 'content/picture-hashes.json'].map(p => readFile(join(root, p), 'utf8').catch(() => '')))
  return { root, d, calls, read, raw }
}

test("video-stills: each tile becomes the video's frame at its second, screened; caption, t and order stay; a second run changes nothing", async () => {
  const s = await site()
  const r = await videoStills(s.root, s.d)
  expect(s.calls.grabs).toEqual([20, 30, 40, 50, 60, 70]) // not t72: the owner rejected it
  expect(r.done).toEqual(['youtube-b1: 2 sharp, 2 dropped, 2 kept as tiles, 1 for next run'])
  expect(r.dropped).toEqual(['youtube-b1 t54: a face in the frame', 'youtube-b1 t36: watermark (© Tank Channel, bottom)'])
  expect(r.kept).toEqual(['youtube-b1 t45'])
  expect(r.failed).toEqual(['youtube-b1 t63: ffmpeg: Server returned 403 Forbidden (access denied)'])
  const figs = (await s.read('content/guides/youtube-b1/entity.json')).video.figures
  expect(figs).toEqual([
    { heading: 'Đá', moments: [{ t: 18, url: 'https://m/video/b1/t18-hd.webp', width: 1200, height: 675, caption: 'Một' }, { t: 27, url: 'https://m/video/b1/t27-hd.webp', width: 1200, height: 675, caption: 'Hai' }] },
    { heading: 'Nền', moments: [moment(45, 'Bốn'), moment(63, 'Sáu'), moment(72, 'Bảy')] },
  ])
  // Uploaded only after the screens: not the face, not the watermark.
  expect(s.calls.puts).toEqual(['video/b1/t18-hd.webp', 'video/b1/t27-hd.webp'])
  // The t27 frame's text keeps its old verdict; only t36's text, never judged, went to the model.
  expect(s.calls.looks).toBe(1)
  const marks = await s.read('engine-state/_photo-watermarks.json')
  expect(marks['https://m/video/b1/t18-hd.webp']).toEqual({ ocr: [] })
  expect(marks['https://m/video/b1/t27-hd.webp']).toEqual({ ocr: [{ t: 'SERA flore', c: 1, at: 'bottom left' }], watermark: false, kind: 'none', what: 'product label' })
  expect(await s.read('engine-state/_photo-rejected.json')).toEqual({ [old(72)]: 'owner: hands', [old(36)]: 'watermark: © Tank Channel, bottom' })
  expect(Object.keys(await s.read('content/picture-hashes.json'))).toEqual(['https://m/video/b1/t18-hd.webp', 'https://m/video/b1/t27-hd.webp'])
  expect(await s.read('engine-state/_video-stills.json')).toEqual({ 'youtube-b1': { at: '2026-11-06', kept: { 45: "the frame at 50 s isn't the tile's moment", 72: 'rejected' } } })

  // The next run takes the still whose grab failed, and only it.
  s.calls.grabs.length = 0
  s.d.grab = async (_st, sec) => { s.calls.grabs.push(sec); return grey(20 + 63 * 2, 1280, 720).png().toBuffer() }
  expect((await videoStills(s.root, s.d)).done).toEqual(['youtube-b1: 1 sharp, 0 dropped, 2 kept as tiles'])
  expect(s.calls.grabs).toEqual([70])
  expect((await s.read('content/guides/youtube-b1/entity.json')).video.figures[1].moments.map((m: { url: string }) => m.url)).toEqual([old(45), 'https://m/video/b1/t63-hd.webp', old(72)])

  // Then nothing is left: no yt-dlp call, no grab, no upload, no file touched.
  const before = await s.raw()
  const calls = { ...s.calls, grabs: s.calls.grabs.length, puts: s.calls.puts.length }
  const r3 = await videoStills(s.root, s.d)
  expect(r3).toMatchObject({ done: [], failed: [], stopped: '' })
  expect({ frames: s.calls.frames, grabs: s.calls.grabs.length, puts: s.calls.puts.length }).toEqual({ frames: calls.frames, grabs: calls.grabs, puts: calls.puts })
  expect(await s.raw()).toEqual(before)
})

test('video-stills: YouTube throttling or a model failure stops the run and leaves the guide as it was, nothing marked failed', async () => {
  for (const over of [
    { grab: async (_s: unknown, sec: number) => { if (sec === 30) throw new Error('ffmpeg: Server returned 429 Too Many Requests'); return grey(56, 1280, 720).png().toBuffer() } },
    { frames: async () => { throw new Error('yt-dlp: ERROR: [youtube] b1: Sign in to confirm you’re not a bot.') } },
    { look: async () => { throw new LlmError('usage limit') }, grab: async (_s: unknown, sec: number) => grey(20 + 2 * Math.round(sec / 10 / 0.11), 1280, 720).png().toBuffer() },
  ] as Partial<StillDeps>[]) {
    const s = await site(over)
    const before = await s.raw()
    const r = await videoStills(s.root, s.d)
    expect(r.stopped).not.toBe('')
    expect(r).toMatchObject({ done: [], failed: [] })
    expect(s.calls.puts).toEqual([])
    expect(await s.raw()).toEqual(before)
  }
})

test('video-stills: three grabs failing in a row stop the run', async () => {
  const s = await site({ grab: async () => { throw new Error('ffmpeg: Server returned 403 Forbidden (access denied)') } })
  const r = await videoStills(s.root, s.d)
  expect(r.stopped).toBe('three frame grabs failed in a row')
  expect(r.done).toEqual([])
  expect(s.calls.puts).toEqual([])
})
