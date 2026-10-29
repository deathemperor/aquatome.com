import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { videoCovers } from '../src/video-covers'

const vi = (extra = {}) => ({ slug: 's', name: 'Hạn chế rêu hại', altNames: [], sections: {}, quality: { score: 0.9, indexable: true }, ...extra })

test('labels video guides without a cover from their thumbnail; keeps existing ones; skips non-video guides', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cv-'))
  const put = async (id: string, entity: object, t: object) => {
    await mkdir(join(root, 'guides', id), { recursive: true })
    await writeFile(join(root, 'guides', id, 'entity.json'), JSON.stringify(entity))
    await writeFile(join(root, 'guides', id, 'vi.json'), JSON.stringify(t))
  }
  await put('youtube-a1', { video: { youtubeId: 'a1', title: 'ALL MY ALGAE SECRETS', thumb: { url: 'https://i.ytimg.com/vi/a1/maxresdefault.jpg' } } }, vi())
  await put('youtube-a2', { video: { youtubeId: 'a2', title: 'x' } }, vi({ cover: 'Đã có' }))
  await put('aquariumcoop-x', {}, vi())
  const got: string[] = []
  const prompts: string[] = []
  const r = await videoCovers(root, { get: async u => { got.push(u); return new Uint8Array([1]) }, look: async (_f, p) => { prompts.push(p); return { cover: '"Bí quyết trị rêu hại."' } } })
  expect(r).toEqual({ done: ['youtube-a1: Bí quyết trị rêu hại'], failed: [] })
  expect(got).toEqual(['https://i.ytimg.com/vi/a1/maxresdefault.jpg'])
  expect(prompts[0]).toContain('ALL MY ALGAE SECRETS')
  expect(JSON.parse(await readFile(join(root, 'guides/youtube-a1/vi.json'), 'utf8')).cover).toBe('Bí quyết trị rêu hại')
})
