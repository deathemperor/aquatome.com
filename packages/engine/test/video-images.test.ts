import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { sections, tileTime, videoImages, type ImageDeps } from '../src/video-images'

test('sections: each h3 with the text under it', () => {
  expect(sections('<p>Mở đầu</p><h3>Vì sao</h3><p>Vì đèn.</p><ul><li>CO2</li></ul><h3>Cách xử lý</h3><p>Thay nước.</p>')).toEqual([
    { heading: 'Vì sao', text: 'Vì đèn. CO2' }, { heading: 'Cách xử lý', text: 'Thay nước.' },
  ])
})

test("tileTime: the second a still's tile shows, from its t (k ÷ yt-dlp's fps) and YouTube's interval", () => {
  // P7GTfHdl5E8: the t163 still is the frame at 2:45 (checked by eye); ddIenwrxWgU: t964 is at 16:20.
  expect(tileTime({ fps: 109 / 539, interval: 5, rows: 3, columns: 3, width: 320, height: 180, fragments: [] }, 163)).toBe(165)
  expect(tileTime({ fps: 105 / 1033, interval: 10, rows: 3, columns: 3, width: 320, height: 180, fragments: [] }, 964)).toBe(980)
})

const solid = (background: string, width: number, height: number) => sharp({ create: { width, height, channels: 3, background } })

/** A guide with two sections; its storyboard is one 2×2 sheet of 32×18 tiles, 11 tiles over 100 s, one every 10 s. */
async function guide(over: Partial<ImageDeps> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'vi-'))
  const dir = join(root, 'guides', 'youtube-a1')
  await mkdir(dir, { recursive: true })
  const entity = { id: 'youtube-a1', kind: 'plantCare', source: 'youtube', sourceUrl: 'https://www.youtube.com/watch?v=a1', html: '', photos: [], mentions: [], updatedAt: '2026-10-29',
    video: { youtubeId: 'a1', title: 'Brown algae', channel: 'MJ', channelUrl: 'https://x', durationSec: 100, chapters: [] } }
  await writeFile(join(dir, 'entity.json'), JSON.stringify(entity))
  await writeFile(join(dir, 'vi.json'), JSON.stringify({ slug: 's', name: 'Rêu nâu', altNames: [], sections: {}, body: '<h3>Vì sao có rêu nâu</h3><p>Bể mới.</p><h3>Bắt đầu từ đâu</h3><p>Chờ.</p>', quality: { score: 1, indexable: true } }))
  const sheet = await solid('#3a6', 64, 36).jpeg().toBuffer()
  const photo = await solid('#555', 900, 600).jpeg().toBuffer()
  const puts: string[] = []
  const grabs: number[] = []
  const faced: string[] = []
  const d: ImageDeps = {
    llm: async <T,>() => ({ sections: [{ times: [10], query: 'diatoms aquarium' }, { times: [], query: '' }] }) as T,
    look: async <T,>(_f: string, prompt: string) => (prompt.includes('stills') ? { picks: [{ n: 1, caption: 'Có người.' }, { n: 2, caption: 'Rêu nâu phủ đá.' }] } : { picks: [{ n: 1, caption: 'Tảo silic dưới kính hiển vi.' }] }) as T,
    // The 9 s still shows a face, as a tile or as the video's frame.
    faces: async files => { faced.push(...files.map(f => f.split('/').pop()!)); return files.map(f => (/-9(-hd\.png|\.jpg)$/.test(f) ? 1 : 0)) },
    // yt-dlp's fps is 11 tiles ÷ 100 s: stills around 10 s are the tiles k = 1 and 2, t = 9 and 18 (k ÷ fps), at 10 and 20 s.
    frames: async () => ({ storyboard: { fps: 0.11, interval: 10, rows: 2, columns: 2, width: 32, height: 18, fragments: [{ url: 'sb0' }] }, stream: { url: 'https://stream/a1', userAgent: 'UA' } }),
    grab: async (_s, sec) => { grabs.push(sec); return solid('#3a6', 1280, 720).png().toBuffer() },
    transcript: async () => '[0:00] brown algae',
    commons: async () => [{ url: 'https://commons/p.jpg', width: 900, height: 600, licence: 'CC BY-SA 4.0', author: 'Ann', sourceUrl: 'https://commons/File:p.jpg' }],
    get: async u => (u === 'sb0' ? sheet : photo),
    media: { urlFor: k => `https://m/${k}`, put: async k => { puts.push(k); return k.includes('-hd') ? { url: `https://m/${k}`, width: 1200, height: 675 } : { url: `https://m/${k}`, width: 32, height: 18 } } },
    ...over,
  }
  const figures = async () => JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8')).video.figures
  return { root, d, puts, grabs, faced, figures }
}

test("videoImages: a picked still is the video's own frame at its tile's second, screened for faces; a Commons photo per section; done guides skipped", async () => {
  const g = await guide()
  const r = await videoImages(g.root, g.d)
  expect(r.done).toEqual(['youtube-a1: 1 sections, 1 stills, 1 photos'])
  const fig = await g.figures()
  expect(fig).toHaveLength(1)
  expect(fig[0]).toMatchObject({ heading: 'Vì sao có rêu nâu', moments: [{ t: 18, url: 'https://m/video/a1/t18-hd.webp', width: 1200, height: 675, caption: 'Rêu nâu phủ đá.' }], photo: { author: 'Ann', licence: 'CC BY-SA 4.0', caption: 'Tảo silic dưới kính hiển vi.' } })
  expect(g.grabs).toEqual([10, 20]) // the tiles' own seconds, not t
  expect(g.faced).toContain('a1-9-hd.png') // the face check sees what is published
  expect(g.puts).toEqual(['video/a1/t18-hd.webp', expect.stringMatching(/^video\/a1\/p0-.+\.webp$/)])
  expect((await videoImages(g.root, g.d)).done).toEqual([])
})

test("videoImages: the tile stays when there is no stream, the grab fails, or the frame isn't the tile's moment", async () => {
  for (const over of [
    { frames: async () => ({ storyboard: { fps: 0.11, interval: 10, rows: 2, columns: 2, width: 32, height: 18, fragments: [{ url: 'sb0' }] }, stream: null }) },
    { grab: async () => { throw new Error('ffmpeg: Server returned 403 Forbidden (access denied)') } },
    { grab: async () => solid('#000', 1280, 720).png().toBuffer() }, // another moment
  ] satisfies Partial<ImageDeps>[]) {
    const g = await guide(over)
    expect((await videoImages(g.root, g.d)).done).toEqual(['youtube-a1: 1 sections, 1 stills, 1 photos'])
    expect((await g.figures())[0].moments).toEqual([{ t: 18, url: 'https://m/video/a1/t18.webp', width: 32, height: 18, caption: 'Rêu nâu phủ đá.' }])
    expect(g.puts[0]).toBe('video/a1/t18.webp')
  }
})

test('videoImages: YouTube throttling a frame grab stops the run and leaves the guide without pictures', async () => {
  const g = await guide({ grab: async () => { throw new Error('ffmpeg: Server returned 429 Too Many Requests') } })
  const r = await videoImages(g.root, g.d)
  expect(r).toMatchObject({ done: [], stoppedEarly: true })
  expect(await g.figures()).toBeUndefined()
  expect(g.puts).toEqual([])
})
