import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { FLAGS_SCHEMA, frameSheet, type FrameFlags, type FrameSheetDeps } from '../src/frame-sheet'

// A storyboard of two 2×2 sheets, 10 s a tile: tile k (t = 10k) is a flat grey of 20 + 25k, and so is the stream's frame
// at that second, so each frame matches its own tile only.
const grey = (k: number) => 20 + 25 * k
const solid = (v: number, width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: v, g: v, b: v } } })
const sheetOf = async (first: number) => solid(0, 64, 36).composite(await Promise.all([0, 1, 2, 3].map(async i => ({
  input: await solid(grey(first + i), 32, 18).png().toBuffer(), left: (i % 2) * 32, top: Math.floor(i / 2) * 18,
})))).png().toBuffer()

const ok: FrameFlags = { fish: true, whole: true, sideOn: true, adult: true, breeding: false, person: false, hand: false, lettering: false, sharp: true }

async function setup(o: { flags?: (n: number) => Partial<FrameFlags>; faces?: (t: number) => number; text?: (t: number) => boolean; frames?: (id: string) => Promise<void>; grab?: (sec: number) => Promise<void>; look?: () => Promise<void> } = {}) {
  const out = await mkdtemp(join(tmpdir(), 'frame-sheet-'))
  const sheets = [await sheetOf(0), await sheetOf(4)]
  const calls = { frames: [] as string[], looks: [] as string[], sleeps: [] as number[], grabs: [] as number[] }
  const tOf = (file: string) => Number(/-(\d+)\.png$/.exec(file)![1])
  const d: FrameSheetDeps = {
    frames: async id => {
      calls.frames.push(id)
      await o.frames?.(id)
      return { storyboard: { fps: 0.1, interval: 10, rows: 2, columns: 2, width: 32, height: 18, fragments: [{ url: 'https://example.org/sb/0' }, { url: 'https://example.org/sb/1' }] }, stream: { url: `https://example.org/stream/${id}` } }
    },
    get: async url => new Uint8Array(sheets[Number(url.split('/').pop())]!),
    grab: async (_s, sec) => { calls.grabs.push(sec); await o.grab?.(sec); return new Uint8Array(await solid(grey(Math.round(sec / 10)), 320, 180).png().toBuffer()) },
    look: async <T,>(_file: string, prompt: string) => {
      calls.looks.push(prompt)
      await o.look?.()
      return { tiles: Array.from({ length: 8 }, (_, i) => ({ n: i + 1, ...ok, ...o.flags?.(i + 1) })) } as T
    },
    faces: async files => files.map(f => o.faces?.(tOf(f)) ?? 0),
    text: async files => files.map(f => o.text?.(tOf(f)) ?? false),
    sleep: async ms => { calls.sleeps.push(ms) },
  }
  return { out, d, calls }
}
const exists = (f: string) => stat(f).then(() => true, () => false)
const run = (videos: string[], s: Awaited<ReturnType<typeof setup>>, per = 2) =>
  frameSheet(videos.map(id => ({ id, species: 'vieja-sample', name: 'Vieja sample' })), s.d, { out: s.out, per, apart: 15, gapMs: 20_000 })

test('frame sheet: only stills that pass every flag, at most `per` a video, `apart` seconds apart, saved as files with their flags', async () => {
  // Tile 3 (t 20) isn't side-on, tile 5 (t 40) has a person; t 10 is too close to t 0.
  const s = await setup({ flags: n => (n === 3 ? { sideOn: false } : n === 5 ? { person: true } : {}) })
  const r = await run(['v1'], s)
  expect(r.frames.map(f => f.t)).toEqual([0, 30])
  expect(r.frames[0]).toMatchObject({ video: 'v1', species: 'vieja-sample', file: join(s.out, 'v1-0.png'), flags: ok })
  for (const f of r.frames) expect(await exists(f.file)).toBe(true)
  expect(JSON.parse(await readFile(join(s.out, 'frames.json'), 'utf8'))).toEqual(r.frames)
  expect(await exists(join(s.out, 'sheets', 'v1.jpg'))).toBe(true)
  expect(s.calls.looks[0]).toContain('about Vieja sample')
  expect(s.calls.grabs).toEqual([0, 30])
})

test('frame sheet: a frame the Mac finds a face or text on is dropped, and its file removed', async () => {
  const s = await setup({ faces: t => (t === 0 ? 1 : 0), text: t => t === 30 })
  const r = await run(['v1'], s)
  expect(r.frames.map(f => f.t)).toEqual([10, 40])
  expect(await exists(join(s.out, 'v1-0.png'))).toBe(false)
  expect(await exists(join(s.out, 'v1-30.png'))).toBe(false)
})

test('frame sheet: the model answers flags only, never words, so no lettering can be written out', () => {
  const props = FLAGS_SCHEMA.properties.tiles.items.properties as Record<string, { type: string }>
  expect(Object.entries(props).filter(([k]) => k !== 'n').every(([, v]) => v.type === 'boolean')).toBe(true)
  expect(props.n!.type).toBe('number')
})

test('frame sheet: one video at a time, the gap between them; a refusal stops the run with no retry and no later video read', async () => {
  const s = await setup({ frames: async id => { if (id === 'v2') throw new Error('ERROR: HTTP Error 429: Too Many Requests') } })
  const r = await run(['v1', 'v2', 'v3'], s)
  expect(s.calls.frames).toEqual(['v1', 'v2'])
  expect(s.calls.sleeps).toEqual([20_000])
  expect(r.stopped).toMatch(/^v2: /)
  expect(r.frames.map(f => f.video)).toEqual(['v1', 'v1'])
  expect(JSON.parse(await readFile(join(s.out, 'frames.json'), 'utf8'))).toHaveLength(2)
})

test("frame sheet: a failed grab leaves that still out and the run goes on; a refused grab or the model's stop ends the run", async () => {
  const failed = await setup({ grab: async sec => { if (sec === 0) throw new Error('ffmpeg: no frame') } })
  expect((await run(['v1'], failed)).frames.map(f => f.t)).toEqual([10, 30])
  const refused = await setup({ grab: async () => { throw new Error('HTTP Error 429: Too Many Requests') } })
  const r = await run(['v1', 'v2'], refused)
  expect(r.stopped).toMatch(/^v1: /)
  expect(refused.calls.frames).toEqual(['v1'])
  const model = await setup({ look: async () => { throw new LlmError('the engine\'s daily line') } })
  const m = await run(['v1', 'v2'], model)
  expect(m.stopped).toMatch(/^v1: /)
  expect(model.calls.frames).toEqual(['v1'])
})

test('frame sheet: a video with no storyboard or no stream is skipped, not failed', async () => {
  const s = await setup()
  s.d.frames = async () => ({ storyboard: null, stream: { url: 'https://example.org/s' } })
  const r = await run(['v1'], s)
  expect(r.skipped).toEqual(['v1: no storyboard'])
  expect(r.frames).toEqual([])
})
