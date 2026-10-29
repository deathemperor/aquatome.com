import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { backfillVideoItems, matchTaxon } from '../src/video-items'
import { candidates } from '../src/wanted'

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'aq-vi-'))
  const guide = async (id: string, video: object) => {
    await mkdir(join(root, 'guides', id), { recursive: true })
    await writeFile(join(root, 'guides', id, 'entity.json'), JSON.stringify({ id, kind: 'setup', source: 'youtube', sourceUrl: 'u', html: '', photos: [], mentions: ['old'], updatedAt: '2026-10-01', video: { youtubeId: id.slice(8), title: 'T', channel: 'C', channelUrl: 'u', durationSec: 600, chapters: [], ...video } }))
    await writeFile(join(root, 'guides', id, 'vi.json'), JSON.stringify({ body: '' }))
  }
  await guide('youtube-v1', { lang: 'vi', transcribed: true })
  await guide('youtube-v2', { gear: [] }) // done already
  await guide('youtube-v3', {})
  await mkdir(join(root, 'plants/rotala-rotundifolia'), { recursive: true })
  return root
}
const llm: Llm = async <T,>() => ({ taxa: ['Rotala rotundifolia', 'Betta mahachaiensis'], gear: [{ category: 'loc', brand: 'Sunsun', model: 'HBL-802', t: 40 }] }) as T
const kit = [{ category: 'loc', name: 'Lọc', types: [] }]

test('backfill: transcript in the spoken language, kit and taxa stored, our plants linked, each guide once', async () => {
  const root = await setup()
  const asked: string[] = []
  const transcript = async (id: string, lang: string, own: boolean) => { asked.push(`${id} ${lang} ${own}`); return '[0:40] the Sunsun HBL-802' }
  const r = await backfillVideoItems(root, { llm, kit, transcript, stop: () => false, sleep: async () => {}, gapMs: 0 }, { limit: 10 })
  expect(asked).toEqual(['v1 vi true', 'v3 en false'])
  expect(r.done).toEqual(['youtube-v1: 2 taxa (2 linked), 1 kit', 'youtube-v3: 2 taxa (2 linked), 1 kit'])
  const e = JSON.parse(await readFile(join(root, 'guides/youtube-v1/entity.json'), 'utf8'))
  expect(e.mentions).toEqual(['old', 'rotala-rotundifolia'])
  expect(e.video).toMatchObject({ lang: 'vi', taxa: ['Rotala rotundifolia', 'Betta mahachaiensis'], gear: [{ category: 'loc', brand: 'Sunsun', model: 'HBL-802', t: 40 }] })
  expect((await backfillVideoItems(root, { llm, kit, transcript, stop: () => false, sleep: async () => {}, gapMs: 0 }, { limit: 10 })).done).toEqual([])
  // Species a video shows but we have no page for feed the wanted list.
  expect((await candidates(root, () => false)).get('Betta mahachaiensis')).toEqual(['guides/youtube-v1', 'guides/youtube-v3'])
})

test('backfill stops on throttling, leaving the rest for next time', async () => {
  const root = await setup()
  const transcript = async () => { throw new Error('HTTP Error 429: Too Many Requests') }
  const r = await backfillVideoItems(root, { llm, kit, transcript, stop: e => /429/.test((e as Error).message), sleep: async () => {}, gapMs: 0 }, { limit: 10 })
  expect(r.stopped).toContain('youtube-v1')
  expect(JSON.parse(await readFile(join(root, 'guides/youtube-v1/entity.json'), 'utf8')).video.gear).toBeUndefined()
})

test('matchTaxon: exact name, a genus page for "sp.", the single variety page; several varieties are not guessed', () => {
  const ids = ['vallisneria', 'alternanthera-reineckii-mini', 'bucephalandra-sp', 'bucephalandra-sp-mini-melawi', 'cryptocoryne-wendtii-green', 'cryptocoryne-wendtii-brown', 'neocaridina-davidi']
  expect(matchTaxon('Neocaridina davidi', ids)).toBe('neocaridina-davidi')
  expect(matchTaxon('Vallisneria sp.', ids)).toBe('vallisneria')
  expect(matchTaxon('Alternanthera reineckii', ids)).toBe('alternanthera-reineckii-mini')
  expect(matchTaxon('Bucephalandra sp.', ids)).toBe('bucephalandra-sp')
  expect(matchTaxon('Cryptocoryne wendtii', ids)).toBeUndefined()
  expect(matchTaxon('Betta splendens', ids)).toBeUndefined()
})
