import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { sections, videoImages, type ImageDeps } from '../src/video-images'

test('sections: each h3 with the text under it', () => {
  expect(sections('<p>Mở đầu</p><h3>Vì sao</h3><p>Vì đèn.</p><ul><li>CO2</li></ul><h3>Cách xử lý</h3><p>Thay nước.</p>')).toEqual([
    { heading: 'Vì sao', text: 'Vì đèn. CO2' }, { heading: 'Cách xử lý', text: 'Thay nước.' },
  ])
})

test('videoImages: storyboard stills (no faces) and a Commons photo per section, uploaded; done guides skipped', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vi-'))
  const dir = join(root, 'guides', 'youtube-a1')
  await mkdir(dir, { recursive: true })
  const entity = { id: 'youtube-a1', kind: 'plantCare', source: 'youtube', sourceUrl: 'https://www.youtube.com/watch?v=a1', html: '', photos: [], mentions: [], updatedAt: '2026-10-29',
    video: { youtubeId: 'a1', title: 'Brown algae', channel: 'MJ', channelUrl: 'https://x', durationSec: 100, chapters: [] } }
  await writeFile(join(dir, 'entity.json'), JSON.stringify(entity))
  await writeFile(join(dir, 'vi.json'), JSON.stringify({ slug: 's', name: 'Rêu nâu', altNames: [], sections: {}, body: '<h3>Vì sao có rêu nâu</h3><p>Bể mới.</p><h3>Bắt đầu từ đâu</h3><p>Chờ.</p>', quality: { score: 1, indexable: true } }))
  // One 2×2 sheet of 32×18 tiles, a tile every 10 s (0, 10, 20, 30 s); stills around 10 s are the 10 s and 20 s tiles.
  const sheet = await sharp({ create: { width: 64, height: 36, channels: 3, background: '#3a6' } }).jpeg().toBuffer()
  const photo = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#555' } }).jpeg().toBuffer()
  const puts: string[] = []
  const looks: string[] = []
  const d: ImageDeps = {
    llm: async <T,>() => ({ sections: [{ times: [10], query: 'diatoms aquarium' }, { times: [], query: '' }] }) as T,
    look: async <T,>(_f: string, prompt: string) => { looks.push(prompt); return (prompt.includes('stills') ? { picks: [{ n: 1, caption: 'Có người.' }, { n: 2, caption: 'Rêu nâu phủ đá.' }] } : { picks: [{ n: 1, caption: 'Tảo silic dưới kính hiển vi.' }] }) as T },
    faces: async files => files.map(f => (f.endsWith('-10.jpg') ? 1 : 0)), // the 10 s still shows a face
    storyboard: async () => ({ fps: 0.1, rows: 2, columns: 2, width: 32, height: 18, fragments: [{ url: 'sb0' }] }),
    transcript: async () => '[0:00] brown algae',
    commons: async () => [{ url: 'https://commons/p.jpg', width: 900, height: 600, licence: 'CC BY-SA 4.0', author: 'Ann', sourceUrl: 'https://commons/File:p.jpg' }],
    get: async u => (u === 'sb0' ? sheet : photo),
    media: { urlFor: k => `https://m/${k}`, put: async k => { puts.push(k); return { url: `https://m/${k}`, width: 32, height: 18 } } },
  }
  const r = await videoImages(root, d)
  expect(r.done).toEqual(['youtube-a1: 1 sections, 1 stills, 1 photos'])
  const fig = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8')).video.figures
  expect(fig).toHaveLength(1)
  expect(fig[0]).toMatchObject({ heading: 'Vì sao có rêu nâu', moments: [{ t: 20, caption: 'Rêu nâu phủ đá.' }], photo: { author: 'Ann', licence: 'CC BY-SA 4.0', caption: 'Tảo silic dưới kính hiển vi.' } })
  expect(puts).toEqual(['video/a1/t20.webp', expect.stringMatching(/^video\/a1\/p0-.+\.webp$/)])
  expect((await videoImages(root, d)).done).toEqual([])
})
