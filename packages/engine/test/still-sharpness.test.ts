import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { STILL_MIN_SHARPNESS, stillShown } from '@aq/schema'
import { asStored } from '../src/media'
import { frameSharpness, scoreStills, sharpnessOf } from '../src/still-sharpness'
import labels from './still-sharpness-labels.json'

/** A frame of `w`×`h` with a sharp-edged pattern of 8 px squares over part of it, and a plain grey around it. */
async function pattern(w: number, h: number, at: { x: number; y: number; size: number }) {
  const px = Buffer.alloc(w * h, 128)
  for (let y = at.y; y < at.y + at.size; y++) for (let x = at.x; x < at.x + at.size; x++) px[y * w + x] = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 230 : 25
  return sharp(px, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer()
}

test('sharpness reads the sharpest part of a frame: a sharp subject on a plain background passes, the same frame blurred does not, a plain frame scores nothing', async () => {
  const frame = await pattern(1280, 720, { x: 500, y: 200, size: 300 })
  expect(await frameSharpness(frame)).toBeGreaterThanOrEqual(STILL_MIN_SHARPNESS)
  const blurred = await sharp(frame).blur(6).png().toBuffer()
  expect(await frameSharpness(blurred)).toBeLessThan(STILL_MIN_SHARPNESS)
  const plain = await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#808080' } }).png().toBuffer()
  expect(await sharpnessOf(await asStored(plain).toBuffer())).toBe(0)
})

test('the bar does what it was tuned to on 58 stills judged by eye at phone width: 3 of 7 blurry stopped, 44 of 45 fine kept', () => {
  expect(labels.fine).toHaveLength(45)
  expect(labels.borderline).toHaveLength(6)
  expect(labels.blurry).toHaveLength(7)
  const shown = (s: { sharpness: number }) => stillShown({ width: 1200, height: 675, sharpness: s.sharpness, person: false })
  expect(labels.blurry.filter(s => !shown(s))).toHaveLength(3)
  expect(labels.fine.filter(shown)).toHaveLength(44)
})

test('every full-size still without a sharpness gets one; a tile, a still measured before and one that cannot be fetched are left', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sharpness-'))
  const file = join(root, 'content/guides/youtube-a1/entity.json')
  await mkdir(join(file, '..'), { recursive: true })
  const moment = (t: number, url: string, width: number, height: number, more = {}) => ({ t, url, width, height, caption: 'x', ...more })
  await writeFile(file, JSON.stringify({
    id: 'youtube-a1', kind: 'care', source: 'youtube', sourceUrl: 'https://www.youtube.com/watch?v=a1', html: '', photos: [], mentions: [], updatedAt: '2026-11-09',
    video: { youtubeId: 'a1', title: 'T', channel: 'C', channelUrl: 'https://x', durationSec: 100, chapters: [], figures: [{ heading: 'H', moments: [
      moment(1, 'https://m/new-hd.webp', 1200, 675),
      moment(2, 'https://m/tile.webp', 320, 180),
      moment(3, 'https://m/done-hd.webp', 1200, 675, { sharpness: 42 }),
      moment(4, 'https://m/gone-hd.webp', 1200, 675),
    ] }] },
  }))
  const stored = await asStored(await pattern(1200, 675, { x: 400, y: 200, size: 300 })).toBuffer()
  const asked: string[] = []
  const report = await scoreStills(root, async u => { asked.push(u); if (u.includes('gone')) throw new Error('HTTP 404'); return stored })
  expect(report).toEqual({ scored: 1, guides: 1, failed: 1 })
  expect(asked).toEqual(['https://m/new-hd.webp', 'https://m/gone-hd.webp'])
  const [first, tile, done, gone] = JSON.parse(await readFile(file, 'utf8')).video.figures[0].moments
  expect(first.sharpness).toBeGreaterThanOrEqual(STILL_MIN_SHARPNESS)
  expect(tile.sharpness).toBeUndefined()
  expect(done.sharpness).toBe(42)
  expect(gone.sharpness).toBeUndefined()
  // Nothing left but the one that failed.
  expect(await scoreStills(root, async () => stored)).toEqual({ scored: 1, guides: 1, failed: 0 })
  expect(await scoreStills(root, async () => stored)).toEqual({ scored: 0, guides: 0, failed: 0 })
})
