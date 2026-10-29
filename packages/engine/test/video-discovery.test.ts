import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { addOwnerPicks, discoverPlaylists, discoverSingles, type Finder } from '../src/video-discovery'

const vids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, title: `${prefix} video ${i}` }))
const lists: Record<string, { title: string; videos: { id: string; title: string }[] }> = {
  PLgood: { title: 'Planted tank basics', videos: vids('g', 5) },
  PLvlog: { title: 'Fish room vlog', videos: vids('v', 5) },
  PLdup: { title: 'Algae again', videos: [...vids('seen', 3), ...vids('d', 2)] },
  PLtiny: { title: 'Two videos', videos: vids('t', 2) },
}
const find: Finder = {
  search: async () => [{ id: 'PLgood', title: '', channel: 'A' }, { id: 'PLvlog', title: '', channel: 'B' }, { id: 'UCnotaplaylist', title: '', channel: 'C' }],
  channel: async () => [{ id: 'PLdup', title: '', channel: 'A' }, { id: 'PLtiny', title: '', channel: 'A' }, { id: 'PLknown', title: '', channel: 'A' }],
  uploads: async () => [{ id: 'u1', title: 'How to set up a planted tank', channel: 'A' }, { id: 'u2', title: 'Fish room tour 2026', channel: 'A' }, { id: 'seen0', title: 'Already processed', channel: 'A' }],
  playlist: async id => ({ id, title: lists[id]!.title, channel: 'A', channelUrl: '', videos: lists[id]!.videos }),
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'disc-'))
  await mkdir(join(root, 'engine-state'))
  await writeFile(join(root, 'engine-state/youtube-playlists.json'), JSON.stringify([{ id: 'PLknown', title: 'Seed', channel: 'A', by: 'seed', addedAt: '2026-10-29' }]))
  await writeFile(join(root, 'engine-state/youtube.json'), JSON.stringify(Object.fromEntries(vids('seen', 3).map(v => [v.id, { status: 'processed', entityIds: [], attempts: 0, updatedAt: '' }]))))
  return root
}

test('vets new playlists only: filters tiny and overlapping ones, records both verdicts', async () => {
  const root = await setup()
  const prompts: string[] = []
  const llm = async <T,>(a: { prompt: string }) => { prompts.push(a.prompt); return { verdicts: [{ id: 'PLgood', ok: true, reason: 'care guides' }, { id: 'PLvlog', ok: false, reason: 'vlog' }] } as T }
  const r = await discoverPlaylists({ find, llm, root, now: () => new Date('2026-10-29T00:00:00Z') }, { queries: ['x'], channels: ['A'] })
  expect(r.candidates).toBe(4)
  expect(r.added).toEqual(['PLgood Planted tank basics (A, 5)'])
  expect(prompts).toHaveLength(1)
  expect(prompts[0]).not.toContain('PLdup')
  const saved = JSON.parse(await readFile(join(root, 'engine-state/youtube-playlists.json'), 'utf8'))
  expect(saved.map((e: { id: string; skip?: boolean; reason?: string }) => [e.id, !!e.skip, e.reason ?? ''])).toEqual([
    ['PLknown', false, ''], ['PLdup', true, 'mostly videos we already have'], ['PLtiny', true, 'fewer than 3 videos'], ['PLgood', false, ''], ['PLvlog', true, 'vlog'],
  ])
  expect(saved[3].videoIds).toHaveLength(5)

  const again = await discoverPlaylists({ find, llm, root, now: () => new Date() }, { queries: ['x'], channels: ['A'] })
  expect(again.candidates).toBe(0)
})

test('does nothing while enough videos are queued', async () => {
  const root = await setup()
  await writeFile(join(root, 'engine-state/youtube-playlists.json'), JSON.stringify([{ id: 'PLq', title: 'Q', channel: 'A', by: 'search', addedAt: '', videoIds: vids('q', 5).map(v => v.id) }]))
  const r = await discoverPlaylists({ find, llm: async () => { throw new Error('no') }, root, now: () => new Date() }, { queueCap: 5 })
  expect(r.skipped).toBe('5 videos already queued')
})

test('single videos from upload pages: unknown ones vetted by title, both verdicts kept', async () => {
  const root = await setup()
  let prompt = ''
  const llm = async <T,>(a: { prompt: string }) => { prompt = a.prompt; return { verdicts: [{ id: 'u1', ok: true, reason: 'how-to' }, { id: 'u2', ok: false, reason: 'tour' }] } as T }
  const r = await discoverSingles({ find, llm, root, now: () => new Date('2026-10-30T00:00:00Z') }, { channels: ['A'] })
  expect(r).toMatchObject({ candidates: 2, added: ['u1 How to set up a planted tank (A)'], rejected: 1 })
  expect(prompt).not.toContain('seen0')
  const saved = JSON.parse(await readFile(join(root, 'engine-state/youtube-videos.json'), 'utf8'))
  expect(saved.map((e: { id: string; skip?: boolean }) => [e.id, !!e.skip])).toEqual([['u1', false], ['u2', true]])
})

test("the owner's picks go to the front of the queues, un-rejecting a rejected one", async () => {
  const root = await setup()
  await writeFile(join(root, 'engine-state/youtube-videos.json'), JSON.stringify([{ id: 'xxxxxxxxxx1', title: 't', channel: 'c', by: 'search', addedAt: '' }, { id: 'r53ZQW0m8VM', title: 't', channel: 'c', by: 'search', addedAt: '', skip: true, reason: 'x' }]))
  const out = await addOwnerPicks(root, ['https://www.youtube.com/playlist?list=PLgood', 'https://www.youtube.com/watch?v=r53ZQW0m8VM&t=3s'], find, new Date('2026-10-30T00:00:00Z'))
  expect(out).toEqual(['playlist PLgood: Planted tank basics (5)', 'video r53ZQW0m8VM'])
  const lists = JSON.parse(await readFile(join(root, 'engine-state/youtube-playlists.json'), 'utf8'))
  expect(lists.map((e: { id: string; by: string }) => [e.id, e.by])).toEqual([['PLgood', 'owner'], ['PLknown', 'seed']])
  const vids = JSON.parse(await readFile(join(root, 'engine-state/youtube-videos.json'), 'utf8'))
  expect(vids.map((e: { id: string; skip?: boolean }) => [e.id, !!e.skip])).toEqual([['r53ZQW0m8VM', false], ['xxxxxxxxxx1', false]])
})
