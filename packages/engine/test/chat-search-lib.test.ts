import { describe, expect, it } from 'vitest'
import { changesOf, liveSource } from '../scripts/chat-search-lib'

describe('changesOf', () => {
  it('writes what is new or changed and removes what the handbook no longer has', () => {
    expect(changesOf({ same: '1', edited: '2', removed: '3' }, { same: '1', edited: '9', added: '4' })).toEqual({ write: ['edited', 'added'], gone: ['removed'] })
  })

  it('writes everything and removes nothing with no record', () => {
    expect(changesOf({}, { a: '1', b: '2' })).toEqual({ write: ['a', 'b'], gone: [] })
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
