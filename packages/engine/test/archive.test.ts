import { expect, test } from 'vitest'
import { ArchiveFetcher } from '../src/archive'
import { discover } from '../src/discover'
import { sourceById } from '../src/sources'

const res = (status: number, body: string, type = 'text/html') => ({ ok: status >= 200 && status < 300, status, headers: { get: (n: string) => (n === 'content-type' ? type : null) }, text: async () => body, arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer })

test('PlanetCatfish is discovered from the archive index: one https://www address per species, other views dropped', async () => {
  let asked = ''
  const cdx = ['http://planetcatfish.com/common/species.php?species_id=1', 'https://www.planetcatfish.com:80/common/species.php?species_id=1', 'http://www.planetcatfish.com/common/species.php?species_id=2000', 'http://www.planetcatfish.com/common/species.php?species_id=2000&image=3', ''].join('\n')
  const found = await discover(sourceById('planetcatfish'), async u => { asked = u; return cdx }, async () => { throw new Error('no crawling') })
  expect(asked).toContain('/cdx/search/cdx?url=planetcatfish.com%2Fcommon%2Fspecies.php*')
  expect(found.map(f => f.url)).toEqual(['https://www.planetcatfish.com/common/species.php?species_id=1', 'https://www.planetcatfish.com/common/species.php?species_id=2000'])
})

test('pages come from the latest archived copy and keep the source address; an archived browser check is "no copy", not a block', async () => {
  const calls: string[] = []
  const pages: Record<string, ReturnType<typeof res>> = {
    a: res(200, '<html><head><title>PlanetCatfish.com - Hoplisoma adolfoi</title></head><body>…</body></html>'),
    b: res(200, '<html><head><title>Just a moment...</title></head><body></body></html>'),
  }
  const f = new ArchiveFetcher({ fetch: async u => { calls.push(u); return u.endsWith('species_id=1') ? pages.a! : pages.b! }, now: () => new Date('2026-10-30T10:00:00Z'), sleep: async () => {}, ua: 'test' })
  const r = await f.get('https://www.planetcatfish.com/common/species.php?species_id=1')
  expect(calls[0]).toBe('https://web.archive.org/web/20261030id_/https://www.planetcatfish.com/common/species.php?species_id=1')
  expect(r).toMatchObject({ status: 200, finalUrl: 'https://www.planetcatfish.com/common/species.php?species_id=1' })
  await expect(f.get('https://www.planetcatfish.com/common/species.php?species_id=2')).rejects.toThrow(/no archived copy/)
})

test('too many requests: one long wait, then one more try', async () => {
  const waits: number[] = []
  let n = 0
  const f = new ArchiveFetcher({ fetch: async () => (n++ === 0 ? res(429, '') : res(200, '<title>ok</title>')), now: () => new Date(), sleep: async ms => { waits.push(ms) }, ua: 'test' })
  await f.get('https://www.planetcatfish.com/common/species.php?species_id=1')
  expect(waits).toEqual([60_000])
  expect(n).toBe(2)
})

test('an offline archive index fails the discovery loudly instead of finding nothing', async () => {
  const f = new ArchiveFetcher({ fetch: async () => res(200, '<html><head><title>Internet Archive: Temporarily Offline</title>'), now: () => new Date(), sleep: async () => {}, ua: 'test' })
  await expect(discover(sourceById('planetcatfish'), u => f.text(u), async () => [])).rejects.toThrow(/offline/)
})

test('an archived image that is really a page is no image', async () => {
  const f = new ArchiveFetcher({ fetch: async u => (u.includes('1.jpg') ? res(200, '<html>', 'text/html') : res(200, 'JPEG', 'image/jpeg')), now: () => new Date('2026-10-30T00:00:00Z'), sleep: async () => {}, ua: 'test' })
  await expect(f.bytes('https://www.planetcatfish.com/images/mid/1.jpg')).rejects.toThrow(/no archived image/)
  expect((await f.bytes('https://www.planetcatfish.com/images/mid/2.jpg')).length).toBe(4)
})

test('an index that is offline for a moment is asked once more', async () => {
  let n = 0
  const waits: number[] = []
  const f = new ArchiveFetcher({ fetch: async () => (n++ === 0 ? res(200, '<html>offline') : res(200, 'https://www.planetcatfish.com/common/species.php?species_id=7\n', 'text/plain')), now: () => new Date(), sleep: async ms => { waits.push(ms) }, ua: 'test' })
  expect(await f.text('https://web.archive.org/cdx/search/cdx?url=x')).toContain('species_id=7')
  expect(waits).toEqual([30_000])
})
