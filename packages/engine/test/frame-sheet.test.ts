import { mkdir, mkdtemp, readdir, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { FLAGS_SCHEMA, frameFolder, frameSheet, type FrameFlags, type FrameSheetDeps } from '../src/frame-sheet'

// A storyboard of two 2×2 sheets, 10 s a tile: tile k (t = 10k) is a flat grey of 20 + 25k, and so is the stream's frame
// at that second, so each frame matches its own tile only.
const grey = (k: number) => 20 + 25 * k
const solid = (v: number, width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: v, g: v, b: v } } })
const sheetOf = async (first: number) => solid(0, 64, 36).composite(await Promise.all([0, 1, 2, 3].map(async i => ({
  input: await solid(grey(first + i), 32, 18).png().toBuffer(), left: (i % 2) * 32, top: Math.floor(i / 2) * 18,
})))).png().toBuffer()

const ok: FrameFlags = { fish: true, whole: true, sideOn: true, adult: true, breeding: false, person: false, hand: false, lettering: false, sharp: true }
const V1 = 'aaaaaaaaa-1', V2 = 'aaaaaaaaa-2', V3 = 'aaaaaaaaa-3'

type Opts = {
  flags?: (n: number) => Partial<FrameFlags>; faces?: (t: number) => number; text?: (t: number) => boolean | null
  frames?: (id: string) => Promise<void>; grab?: (sec: number) => Promise<void>; look?: () => Promise<void>; duration?: number; other?: number
}
async function setup(o: Opts = {}) {
  const out = await mkdtemp(join(tmpdir(), 'frame-sheet-'))
  const sheets = [await sheetOf(0), await sheetOf(4)]
  const calls = { frames: [] as string[], looks: [] as { file: string; prompt: string }[], sleeps: [] as number[], grabs: [] as number[] }
  const tOf = (file: string) => Number(/-(\d+)\.png$/.exec(file)![1])
  const d: FrameSheetDeps = {
    frames: async id => {
      calls.frames.push(id)
      await o.frames?.(id)
      return { storyboard: { fps: 0.1, interval: 10, rows: 2, columns: 2, width: 32, height: 18, fragments: [{ url: 'https://example.org/sb/0' }, { url: 'https://example.org/sb/1' }] }, stream: { url: `https://example.org/stream/${id}` }, ...(o.duration ? { duration: o.duration } : {}) }
    },
    get: async url => new Uint8Array(sheets[Number(url.split('/').pop())]!),
    // `other`: at that second the stream shows another moment than its tile.
    grab: async (_s, sec) => { calls.grabs.push(sec); await o.grab?.(sec); const k = Math.round(sec / 10); return new Uint8Array(await solid(grey(k === o.other ? k + 4 : k), 320, 180).png().toBuffer()) },
    look: async <T,>(file: string, prompt: string) => {
      calls.looks.push({ file, prompt })
      await o.look?.()
      return { tiles: Array.from({ length: 8 }, (_, i) => ({ n: i + 1, ...ok, ...o.flags?.(i + 1) })) } as T
    },
    faces: async files => files.map(f => o.faces?.(tOf(f)) ?? 0),
    text: async files => files.map(f => (o.text ? o.text(tOf(f)) : false)),
    sleep: async ms => { calls.sleeps.push(ms) },
  }
  return { out, d, calls }
}
const exists = (f: string) => stat(f).then(() => true, () => false)
const run = (videos: string[], s: Awaited<ReturnType<typeof setup>>, per = 2) =>
  frameSheet(videos.map(id => ({ id, species: 'vieja-sample', name: 'Vieja sample' })), s.d, { out: s.out, per, apart: 15, gapMs: 20_000, grabGapMs: 5_000 })

test('frame sheet: only stills that pass every flag, at most `per` a video, `apart` seconds apart; `out` holds those frames and frames.json, nothing else', async () => {
  // Tile 3 (t 20) isn't side-on, tile 5 (t 40) has a person; t 10 is too close to t 0.
  const s = await setup({ flags: n => (n === 3 ? { sideOn: false } : n === 5 ? { person: true } : {}) })
  const r = await run([V1], s)
  expect(r.frames.map(f => f.t)).toEqual([0, 30])
  expect(r.frames[0]).toMatchObject({ video: V1, species: 'vieja-sample', file: join(await frameFolder(s.out), `${V1}-0.png`), flags: ok })
  expect((await readdir(s.out)).sort()).toEqual([`${V1}-0.png`, `${V1}-30.png`, 'frames.json'])
  expect(JSON.parse(await readFile(join(s.out, 'frames.json'), 'utf8'))).toEqual(r.frames)
  // The contact sheet the model saw, every tile on it, is gone.
  expect(s.calls.looks[0]!.prompt).toContain('about Vieja sample')
  expect(await exists(s.calls.looks[0]!.file)).toBe(false)
  expect(s.calls.grabs).toEqual([0, 30])
})

test('frame sheet: a frame the Mac finds a face or text on, or a screen that fails or can\'t read it, never reaches `out`', async () => {
  const s = await setup({ faces: t => (t === 0 ? 1 : 0), text: t => t === 30 })
  expect((await run([V1], s)).frames.map(f => f.t)).toEqual([10, 40])
  expect(await readdir(s.out)).not.toContain(`${V1}-0.png`)
  expect(await readdir(s.out)).not.toContain(`${V1}-30.png`)
  const unread = await setup({ text: t => (t === 0 ? null : false) })
  expect((await run([V1], unread)).frames.map(f => f.t)).toEqual([10, 30])
  const broken = await setup({ faces: t => { if (t === 0) throw new Error('vision failed'); return 0 } })
  const r = await run([V1], broken)
  expect(r.frames.map(f => f.t)).toEqual([10, 30])
  expect(r.failed).toEqual([])
  expect(await readdir(broken.out)).not.toContain(`${V1}-0.png`)
})

test('frame sheet: the model answers flags only, never words: booleans and the tile number, nothing else allowed', () => {
  const items = FLAGS_SCHEMA.properties.tiles.items
  expect(FLAGS_SCHEMA.additionalProperties).toBe(false)
  expect(items.additionalProperties).toBe(false)
  const props = items.properties as Record<string, { type: string }>
  expect(Object.entries(props).filter(([k]) => k !== 'n').every(([, v]) => v.type === 'boolean')).toBe(true)
  expect(props.n!.type).toBe('number')
})

test("frame sheet: one video at a time, the gap between videos and between a video's frames; a refusal stops the run with no later video read", async () => {
  const s = await setup({ frames: async id => { if (id === V2) throw new Error('ERROR: HTTP Error 429: Too Many Requests') } })
  const r = await run([V1, V2, V3], s)
  expect(s.calls.frames).toEqual([V1, V2])
  expect(s.calls.sleeps).toEqual([5_000, 20_000])
  expect(r.stopped).toBe(`${V2}: YouTube refused`)
  expect(r.frames.map(f => f.video)).toEqual([V1, V1])
  expect(JSON.parse(await readFile(join(s.out, 'frames.json'), 'utf8'))).toHaveLength(2)
  const later = await setup({ frames: async id => { if (id === V1) throw new Error('ERROR: [youtube] x: This content isn\'t available, try again later.') } })
  expect((await run([V1, V2], later)).stopped).toBe(`${V1}: YouTube refused`)
  expect(later.calls.frames).toEqual([V1])
})

test("frame sheet: a failed grab, or one showing another moment, leaves that still out and the run goes on; a refused grab or the model's stop ends the run, in our words, never the model's", async () => {
  const failed = await setup({ grab: async sec => { if (sec === 0) throw new Error('ffmpeg: no frame') } })
  expect((await run([V1], failed)).frames.map(f => f.t)).toEqual([10, 30])
  const moved = await setup({ other: 0 })
  expect((await run([V1], moved)).frames.map(f => f.t)).toEqual([10, 30])
  const refused = await setup({ grab: async () => { throw new Error('HTTP Error 403: Forbidden') } })
  expect((await run([V1, V2], refused)).stopped).toBe(`${V1}: YouTube refused`)
  expect(refused.calls.frames).toEqual([V1])
  const model = await setup({ look: async () => { throw new LlmError('words the model wrote off a frame') } })
  const m = await run([V1, V2], model)
  expect(m.stopped).toBe(`${V1}: the model stopped`)
  expect(model.calls.frames).toEqual([V1])
  expect(await exists(model.calls.looks[0]!.file)).toBe(false)
})

test("frame sheet: the tiles spread over the video's length, not past it into a sheet's empty end", async () => {
  const s = await setup({ duration: 35 })
  await run([V1], s)
  expect(s.calls.looks[0]!.prompt).toContain('These are 4 numbered stills')
})

test('frame sheet: a video with no storyboard or no stream is skipped, not failed', async () => {
  const s = await setup()
  s.d.frames = async () => ({ storyboard: null, stream: { url: 'https://example.org/s' } })
  expect((await run([V1], s)).skipped).toEqual([`${V1}: no storyboard`])
  const t = await setup()
  const real = t.d.frames
  t.d.frames = async id => ({ ...(await real(id)), stream: null })
  expect((await run([V1], t)).skipped).toEqual([`${V1}: no stream`])
})

test('frame sheet: only a video id and a species id name a file, `per` is 1 to 8, and `out` is an absolute folder outside any git checkout', async () => {
  const s = await setup()
  const at = (id: string, species = 'vieja-sample', per = 2, out = s.out) => frameSheet([{ id, species, name: 'x' }], s.d, { out, per, apart: 15, gapMs: 0, grabGapMs: 0 })
  await expect(at('../../aaaaaa')).rejects.toThrow(/--only/)
  await expect(at(V1, '../x')).rejects.toThrow(/--only/)
  await expect(at(V1, 'vieja-sample', Number('x'))).rejects.toThrow(/--per/)
  await expect(at(V1, 'vieja-sample', 9)).rejects.toThrow(/--per/)
  await expect(at(V1, 'vieja-sample', 2, 'frames')).rejects.toThrow(/absolute/)
  const repo = await mkdtemp(join(tmpdir(), 'frame-sheet-repo-'))
  await mkdir(join(repo, '.git'))
  await expect(at(V1, 'vieja-sample', 2, join(repo, 'a', 'b'))).rejects.toThrow(/git checkout/)
  expect(s.calls.frames).toEqual([])
})
