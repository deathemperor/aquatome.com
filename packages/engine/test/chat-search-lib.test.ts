import { describe, expect, it } from 'vitest'
import type { Source } from '../../../apps/site/worker/chat/handbook'
import { changesOf, deleteBodies, docsOf, liveSource } from '../scripts/chat-search-lib'

describe('changesOf', () => {
  it('writes what is new or changed and removes what the handbook no longer has', () => {
    expect(changesOf({ same: '1', edited: '2', removed: '3' }, { same: '1', edited: '9', added: '4' })).toEqual({ write: ['edited', 'added'], gone: ['removed'] })
  })

  it('writes everything and removes nothing with no record', () => {
    expect(changesOf({}, { a: '1', b: '2' })).toEqual({ write: ['a', 'b'], gone: [] })
  })
})

describe('deleteBodies', () => {
  it('sends at most 100 ids in a call, which is all Vectorize takes, and every id once', () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`)
    const sent = deleteBodies(ids).map(b => (JSON.parse(b) as { ids: string[] }).ids)
    expect(sent.map(b => b.length)).toEqual([100, 100, 50])
    expect(sent.flat()).toEqual(ids)
  })

  it('makes no call with nothing to remove', () => {
    expect(deleteBodies([])).toEqual([])
  })
})

describe('docsOf', () => {
  const handbook = (topics: unknown): Source => ({ index: async () => ({ items: [], shards: {} }) as never, shard: async () => null, topics: async () => topics as never })

  it('stops when the topics file is missing or unreadable, or every video guide would look removed', async () => {
    await expect(docsOf(handbook(null), 'vi', 2000)).rejects.toThrow('topics')
    await expect(docsOf(handbook({ v: 2, pages: {} }), 'vi', 2000)).rejects.toThrow('topics')
    await expect(docsOf({ ...handbook(null), topics: async () => { throw new Error('503') } }, 'vi', 2000)).rejects.toThrow('topics')
  })

  it('reads a handbook with its topics', async () => {
    await expect(docsOf(handbook({ v: 1, pages: {} }), 'vi', 2000)).resolves.toMatchObject({ docs: [] })
  })
})

describe('liveSource', () => {
  const site = (status: (path: string) => number) => {
    const asked: string[] = []
    const get = (async (url: URL) => { asked.push(url.pathname); return new Response(JSON.stringify({ at: url.pathname }), { status: status(url.pathname) }) }) as typeof fetch
    return { asked, source: liveSource('https://aquatome.test', get) }
  }

  it('reads the index, a shard and the topics where the site serves them', async () => {
    const { source } = site(() => 200)
    expect(await source.index('vi')).toEqual({ at: '/app/vi.json' })
    expect(await source.shard('id', 'fish', 3)).toEqual({ at: '/app/pages/id/fish-3.json' })
    expect(await source.topics('ms')).toEqual({ at: '/app/chat/ms.json' })
  })

  it('reads a shard once, for all the pages in it', async () => {
    const { asked, source } = site(() => 200)
    await source.shard('vi', 'guide', 7)
    await source.shard('vi', 'guide', 7)
    expect(asked).toEqual(['/app/pages/vi/guide-7.json'])
  })

  it('stops on a read that fails, so a page left out is never taken for one removed', async () => {
    const { source } = site(p => (p.includes('fish-1') ? 503 : 200))
    await expect(source.shard('vi', 'fish', 1)).rejects.toThrow('503')
    await expect(source.topics('vi')).resolves.toBeTruthy()
  })
})
