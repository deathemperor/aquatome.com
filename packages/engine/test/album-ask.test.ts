import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { askAlbums, askSchema, type AskTile } from '../src/album-ask'
import { nameStep } from '../src/ceiling'
import { LlmError } from '../src/claude'
import { albumLooks } from '../src/gallery'

const photo = (n: number, o: Record<string, unknown> = {}) => ({ url: `https://media.aquatome.com/inaturalist/${n}.webp`, thumb: `https://media.aquatome.com/inaturalist/${n}-480.webp`, width: 1024, height: 768, licence: 'CC BY', author: 'a', sourceUrl: `https://www.inaturalist.org/photos/${n}`, ...o })
/** A tall picture for photo 1 (a tile shows it whole, grey bars beside it); wide ones for the rest. */
const picture = (url: string) => (url.includes('/1-480') ? sharp({ create: { width: 48, height: 96, channels: 3, background: '#c33' } }) : sharp({ create: { width: 96, height: 64, channels: 3, background: '#36c' } })).jpeg().toBuffer()

async function root() {
  const r = await mkdtemp(join(tmpdir(), 'aq-album-ask-'))
  for (const [kind, id, sci, vi] of [['species', 'xiphophorus-hellerii', 'Xiphophorus hellerii', 'Cá kiếm'], ['plants', 'anubias-nana', 'Anubias barteri var. nana', 'Ráy nana']] as const) {
    await mkdir(join(r, 'content', kind, id), { recursive: true })
    await writeFile(join(r, 'content', kind, id, 'entity.json'), JSON.stringify({ scientificName: sci, sections: [] }))
    await writeFile(join(r, 'content', kind, id, 'vi.json'), JSON.stringify({ name: vi }))
  }
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  await mkdir(join(r, 'engine-state'), { recursive: true })
  // The swordtail: 1 to 3 shown, 4 waiting for the photo check, 5 asked before. The anubias: 6 and 7.
  await writeFile(join(r, 'content/gallery/xiphophorus-hellerii.json'), JSON.stringify({ id: 'xiphophorus-hellerii', photos: [photo(1), photo(2), photo(3), photo(4, { unchecked: true }), photo(5)] }))
  await writeFile(join(r, 'content/gallery/anubias-nana.json'), JSON.stringify({ id: 'anubias-nana', photos: [photo(6), photo(7)] }))
  await writeFile(join(r, 'engine-state/_album-ask.json'), JSON.stringify({ [photo(5).url]: { setup: false, whole: true, small: false } }))
  return r
}
const state = async (r: string) => JSON.parse(await readFile(join(r, 'engine-state/_album-ask.json'), 'utf8'))

test('the album ask: each shown photo asked once, on sheets that show it whole; fish asked all three, plants a photo tank only', async () => {
  const r = await root()
  const asks: { prompt: string; plant: boolean; bar: number[] }[] = []
  const ask = async (sheet: string, prompt: string, plant: boolean) => {
    // The first tile's left edge: grey where the tall photo is shown whole, not cropped to fill the tile.
    const { data, info } = await sharp(sheet).raw().toBuffer({ resolveWithObject: true })
    const at = (90 * info.width + 5) * info.channels
    asks.push({ prompt, plant, bar: [data[at]!, data[at + 1]!, data[at + 2]!] })
    const n = (prompt.match(/^\d+: /gm) ?? []).length
    return { tiles: Array.from({ length: n }, (_, i): AskTile => (plant ? { n: i + 1, setup: i === 0 } : { n: i + 1, setup: false, whole: i !== 0, small: i === 2 })) }
  }
  const report = await askAlbums(r, { get: async u => new Uint8Array(await picture(u)), ask }, { sheets: 5 })
  expect(report).toMatchObject({ sheets: 2, answered: 5, setup: 1, cut: 1, small: 1, left: 0, failed: [] })
  expect(asks.map(a => a.plant)).toEqual([false, true])
  expect(asks[0]!.prompt).toContain('1: Xiphophorus hellerii (Cá kiếm)\n2: Xiphophorus hellerii (Cá kiếm)\n3: Xiphophorus hellerii (Cá kiếm)')
  expect(asks[0]!.prompt).not.toContain('4: ')
  expect(asks[0]!.prompt).toMatch(/whole: false if the photo's own edge cuts off its head or tail/)
  expect(asks[1]!.prompt).toContain('1: Anubias barteri var. nana (Ráy nana)')
  expect(asks[1]!.prompt).not.toMatch(/whole:/)
  for (const c of asks[0]!.bar) expect(Math.abs(c - 0x88)).toBeLessThan(12)
  const s = await state(r)
  expect(s[photo(1).url]).toEqual({ setup: false, whole: false, small: false })
  expect(s[photo(3).url]).toEqual({ setup: false, whole: true, small: true })
  expect(s[photo(6).url]).toEqual({ setup: true })
  expect(s[photo(4).url]).toBeUndefined()
  // The album's order reads them.
  const looks = (await albumLooks(r))('xiphophorus-hellerii')
  expect(looks(photo(1).url)).toEqual({ setup: false, whole: false, small: false })
  // Asked once: a second run asks nothing.
  expect(await askAlbums(r, { get: async u => new Uint8Array(await picture(u)), ask }, { sheets: 5 })).toMatchObject({ sheets: 0, answered: 0, left: 0 })
  expect(askSchema(false).properties.tiles.items.required).toEqual(['n', 'setup', 'whole', 'small'])
  expect(askSchema(true).properties.tiles.items.required).toEqual(['n', 'setup'])
})

test('the album ask: a photo passed over or not fetched is tried on one more sheet, then left; the sheet budget and a usage limit stop it', async () => {
  const r = await root()
  let calls = 0
  // The last fish on a sheet is never answered (photo 2: photo 3 can't be fetched).
  const ask = async (_s: string, prompt: string, plant: boolean) => {
    calls++
    const lines = prompt.match(/^\d+: .*/gm) ?? []
    return { tiles: lines.flatMap((_, i): AskTile[] => (!plant && i === lines.length - 1 ? [] : [{ n: i + 1, setup: false, whole: true, small: false }])) }
  }
  const get = async (u: string) => { if (u.includes('/3-480')) throw new Error('HTTP 404'); return new Uint8Array(await picture(u)) }
  expect(await askAlbums(r, { get, ask }, { sheets: 1 })).toMatchObject({ sheets: 1, answered: 1, left: 2 })
  expect((await state(r))[photo(2).url]).toEqual({ tries: 1 })
  expect((await state(r))[photo(3).url]).toEqual({ tries: 1 })
  await askAlbums(r, { get, ask }, { sheets: 1 })
  expect((await state(r))[photo(2).url]).toEqual({ tries: 2 })
  // Both left now: the fish sheet is done; the plants' is next.
  const before = calls
  expect(await askAlbums(r, { get, ask }, { sheets: 5 })).toMatchObject({ sheets: 1, answered: 2, left: 0 })
  expect(calls - before).toBe(1)
  // A usage limit stops the run, and what was answered before stays.
  const r2 = await root()
  const stop = await askAlbums(r2, { get: async u => new Uint8Array(await picture(u)), ask: async () => { throw new LlmError('usage limit') } }, { sheets: 5 })
  expect(stop).toMatchObject({ sheets: 0, stopped: 'usage limit' })
  expect(Object.keys(await state(r2))).toEqual([photo(5).url])
})

test("the album ask: a photo that can't be read counts a try against itself alone; the others on its sheet are asked", async () => {
  const r = await root()
  let tiles = 0
  const ask = async (_s: string, prompt: string, plant: boolean) => {
    const n = (prompt.match(/^\d+: /gm) ?? []).length
    if (!plant) tiles = n
    return { tiles: Array.from({ length: n }, (_, i): AskTile => ({ n: i + 1, setup: false, whole: true, small: false })) }
  }
  const get = async (u: string) => (u.includes('/2-480') ? new Uint8Array([1, 2, 3]) : new Uint8Array(await picture(u)))
  const report = await askAlbums(r, { get, ask }, { sheets: 5 })
  expect(tiles).toBe(2)
  expect(report).toMatchObject({ sheets: 2, answered: 4 })
  const s = await state(r)
  expect(s[photo(2).url]).toEqual({ tries: 1 })
  expect(s[photo(1).url]).toEqual({ setup: false, whole: true, small: false })
  expect(s[photo(3).url]).toEqual({ setup: false, whole: true, small: false })
})

test("the album ask: with the day's line spent, no sheet starts: nothing fetched, asked or marked", async () => {
  const r = await root()
  const before = await state(r)
  const log = join(r, 'cost.jsonl')
  await writeFile(log, `${JSON.stringify({ at: new Date().toISOString(), step: 'album-ask', usd: 50 })}\n`)
  const was = process.env.ENGINE_COST_LOG
  process.env.ENGINE_COST_LOG = log
  nameStep('album-ask')
  try {
    let fetched = 0, asked = 0
    const report = await askAlbums(r, { get: async u => { fetched++; return new Uint8Array(await picture(u)) }, ask: async () => { asked++; return { tiles: [] } } }, { sheets: 5 })
    expect(report.stopped).toContain('not started')
    expect([fetched, asked, report.sheets]).toEqual([0, 0, 0])
    expect(await state(r)).toEqual(before)
  } finally {
    process.env.ENGINE_COST_LOG = was
    nameStep(undefined)
  }
})
