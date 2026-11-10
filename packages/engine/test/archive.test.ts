import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { ARCHIVE_POLITE, ARCHIVE_REST_MAX_MS, ARCHIVE_REST_MS, ArchiveFetcher, ArchiveRefused } from '../src/archive'
import { discover } from '../src/discover'
import { sourceById } from '../src/sources'

const restFile = () => join(mkdtempSync(join(tmpdir(), 'archive-rest-')), 'rest.json')
const res = (status: number, body: string, type = 'text/html') => ({ ok: status >= 200 && status < 300, status, headers: { get: (n: string) => (n === 'content-type' ? type : null) }, text: async () => body, arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer })

test('PlanetCatfish is discovered from the archive index: one https://www address per species, other views dropped', async () => {
  let asked = ''
  const cdx = ['http://planetcatfish.com/common/species.php?species_id=1', 'https://www.planetcatfish.com:80/common/species.php?species_id=1', 'http://www.planetcatfish.com/common/species.php?species_id=2000', 'http://www.planetcatfish.com/common/species.php?species_id=2000&image=3', ''].join('\n')
  const found = await discover(sourceById('planetcatfish'), async u => { asked = u; return cdx }, async () => { throw new Error('no crawling') })
  expect(asked).toContain('/cdx/search/cdx?url=planetcatfish.com%2Fcommon%2Fspecies.php*')
  expect(found.map(f => f.url)).toEqual(['https://www.planetcatfish.com/common/species.php?species_id=1', 'https://www.planetcatfish.com/common/species.php?species_id=2000'])
})

test('2Hr Aquarist is discovered from the archive index: one https://www address per article, listings, tags, feeds and other languages dropped', async () => {
  let asked = ''
  const cdx = [
    'http://2hraquarist.com/blogs/articles/dennerle-vs-ada', 'https://www.2hraquarist.com:80/blogs/articles/dennerle-vs-ada', 'http://www.2hraquarist.com/blogs/articles/dennerle-vs-ada?page=2',
    'https://www.2hraquarist.com/blogs/plant-nutrients/potassium', 'https://www.2hraquarist.com/blogs/articles', 'https://www.2hraquarist.com/blogs/articles?page=3',
    'https://www.2hraquarist.com/blogs/articles/tagged/co2', 'https://www.2hraquarist.com/blogs/articles.atom', 'https://www.2hraquarist.com/en-sg/blogs/articles/dennerle-vs-ada', '',
  ].join('\n')
  const found = await discover(sourceById('2hraquarist'), async u => { asked = u; return cdx }, async () => { throw new Error('no crawling') })
  expect(asked).toContain('/cdx/search/cdx?url=2hraquarist.com%2Fblogs%2F*')
  expect(found.map(f => f.url)).toEqual(['https://www.2hraquarist.com/blogs/articles/dennerle-vs-ada', 'https://www.2hraquarist.com/blogs/plant-nutrients/potassium'])
})

test('pages come from the latest archived copy and keep the source address; an archived browser check is "no copy", not a block', async () => {
  const calls: string[] = []
  const pages: Record<string, ReturnType<typeof res>> = {
    a: res(200, '<html><head><title>PlanetCatfish.com - Hoplisoma adolfoi</title></head><body>…</body></html>'),
    b: res(200, '<html><head><title>Just a moment...</title></head><body></body></html>'),
  }
  const f = new ArchiveFetcher({ restFile: restFile(), fetch: async u => { calls.push(u); return u.endsWith('species_id=1') ? pages.a! : pages.b! }, now: () => new Date('2026-10-30T10:00:00Z'), sleep: async () => {}, ua: 'test' })
  const r = await f.get('https://www.planetcatfish.com/common/species.php?species_id=1')
  expect(calls[0]).toBe('https://web.archive.org/web/20261030id_/https://www.planetcatfish.com/common/species.php?species_id=1')
  expect(r).toMatchObject({ status: 200, finalUrl: 'https://www.planetcatfish.com/common/species.php?species_id=1' })
  await expect(f.get('https://www.planetcatfish.com/common/species.php?species_id=2')).rejects.toThrow(/no archived copy/)
})

test('an offline archive index fails the discovery loudly instead of finding nothing', async () => {
  const waits: number[] = []
  const f = new ArchiveFetcher({ restFile: restFile(), fetch: async () => res(200, '<html><head><title>Internet Archive: Temporarily Offline</title>'), now: () => new Date(), sleep: async ms => { waits.push(ms) }, ua: 'test' })
  await expect(discover(sourceById('planetcatfish'), u => f.text(u), async () => [])).rejects.toThrow(/offline/)
  expect(waits).toEqual([30_000, 60_000, 120_000])
})

test('a 503 from the index is retried like an offline page', async () => {
  let n = 0
  const f = new ArchiveFetcher({ restFile: restFile(), fetch: async () => (n++ < 2 ? res(503, '') : res(200, 'https://www.planetcatfish.com/common/species.php?species_id=9\n', 'text/plain')), now: () => new Date(), sleep: async () => {}, ua: 'test' })
  expect(await f.text('https://web.archive.org/cdx/search/cdx?url=x')).toContain('species_id=9')
})

test('an archived image that is really a page is no image', async () => {
  const f = new ArchiveFetcher({ restFile: restFile(), fetch: async u => (u.includes('1.jpg') ? res(200, '<html>', 'text/html') : res(200, 'JPEG', 'image/jpeg')), now: () => new Date('2026-10-30T00:00:00Z'), sleep: async () => {}, ua: 'test' })
  await expect(f.bytes('https://www.planetcatfish.com/images/mid/1.jpg')).rejects.toThrow(/no archived image/)
  expect((await f.bytes('https://www.planetcatfish.com/images/mid/2.jpg')).length).toBe(4)
})

test('an index that is offline for a moment is asked once more', async () => {
  let n = 0
  const waits: number[] = []
  const f = new ArchiveFetcher({ restFile: restFile(), fetch: async () => (n++ === 0 ? res(200, '<html>offline') : res(200, 'https://www.planetcatfish.com/common/species.php?species_id=7\n', 'text/plain')), now: () => new Date(), sleep: async ms => { waits.push(ms) }, ua: 'test' })
  expect(await f.text('https://web.archive.org/cdx/search/cdx?url=x')).toContain('species_id=7')
  expect(waits).toEqual([30_000])
})

const capture = (status: number, body: string, headers: Record<string, string> = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (n: string) => headers[n.toLowerCase()] ?? null }, text: async () => body, arrayBuffer: async () => new ArrayBuffer(0) })
const article = 'https://www.2hraquarist.com/blogs/hot-topics/best-temperature'

test('a page says which capture it came from; a source read through the archive keeps its own address', async () => {
  const f = new ArchiveFetcher({ restFile: restFile(), fetch: async () => capture(200, '<title>Best temperature</title>', { 'memento-datetime': 'Fri, 17 Oct 2025 04:09:55 GMT' }), now: () => new Date('2026-11-07T00:00:00Z'), sleep: async () => {}, ua: 'test' })
  expect(await f.get(article)).toMatchObject({ finalUrl: article, capturedAt: '2025-10-17T04:09:55.000Z' })
})

test('the newest copy is a browser check: the next newest good one is read, raw, unhurried, and says its own date', async () => {
  const calls: string[] = []
  const waits: number[] = []
  const f = new ArchiveFetcher({
    restFile: restFile(),
    fetch: async u => {
      calls.push(u)
      if (u.includes('/cdx/')) return capture(200, '20240101000000\n20250101000000\n20260101000000\n', { 'content-type': 'text/plain' })
      if (u.includes('/web/20250101000000id_/')) return capture(200, '<title>Best temperature</title>', { 'memento-datetime': 'Wed, 01 Jan 2025 00:00:00 GMT' })
      return capture(200, '<html><head><title>Just a moment...</title></head></html>')
    },
    now: () => new Date('2026-11-07T00:00:00Z'), sleep: async ms => { waits.push(ms) }, ua: 'test',
  })
  const r = await f.get(article)
  expect(r).toMatchObject({ finalUrl: article, html: '<title>Best temperature</title>', capturedAt: '2025-01-01T00:00:00.000Z' })
  expect(calls.filter(u => u.includes('/web/'))).toEqual([`https://web.archive.org/web/20261107id_/${article}`, `https://web.archive.org/web/20260101000000id_/${article}`, `https://web.archive.org/web/20250101000000id_/${article}`])
  expect(new URL(calls[1]!).searchParams.get('url')).toBe(article)
  expect(waits).toEqual([ARCHIVE_POLITE, ARCHIVE_POLITE, ARCHIVE_POLITE])
})

test('every copy is a browser check: no copy', async () => {
  const f = new ArchiveFetcher({ restFile: restFile(), fetch: async u => (u.includes('/cdx/') ? capture(200, '20250101000000\n') : capture(200, '<title>Just a moment...</title>')), now: () => new Date('2026-11-07T00:00:00Z'), sleep: async () => {}, ua: 'test' })
  await expect(f.get(article)).rejects.toThrow(/no archived copy \(the archive holds a browser-check page\)/)
})

// Chief of staff, 2026-11-10: "no request for 12 hours after a refusal, then one, doubling to a day."
const HOUR = 3_600_000
const start = new Date('2026-11-10T00:00:00Z').getTime()
/** A fetcher on a clock the test moves, sharing a rest file like two runs on this Mac; `answer` is what the archive says. */
function refusals(file = restFile()) {
  const t = { clock: start, asked: 0, answer: (): ReturnType<typeof capture> => capture(429, '') }
  const make = () => new ArchiveFetcher({ restFile: file, fetch: async () => { t.asked++; return t.answer() }, now: () => new Date(t.clock), sleep: async () => {}, ua: 'test' })
  return { t, make, f: make() }
}

test('a refusal asks nothing more: no retry in the run, and none for 12 hours', async () => {
  const { t, f } = refusals()
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  expect(t.asked).toBe(1)
  t.clock = start + ARCHIVE_REST_MS - 1
  await expect(f.get(article)).rejects.toThrow(/the archive refused this Mac: no request before 2026-11-10T12:00:00.000Z/)
  await expect(f.text('https://web.archive.org/cdx/search/cdx?url=x')).rejects.toBeInstanceOf(ArchiveRefused)
  await expect(f.bytes('https://example.com/a.jpg')).rejects.toBeInstanceOf(ArchiveRefused)
  expect(t.asked).toBe(1)
})

test('the wait is the Mac\'s, not the run\'s: the next run and another checkout keep it', async () => {
  const { t, f, make } = refusals()
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  t.clock = start + 3 * HOUR
  await expect(make().get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  expect(t.asked).toBe(1)
})

test('after the wait, one request; refused again, the wait doubles to a day and stays a day', async () => {
  const { t, f } = refusals()
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  t.clock = start + ARCHIVE_REST_MS
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  expect(t.asked).toBe(2)
  t.clock += ARCHIVE_REST_MAX_MS - 1
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  expect(t.asked).toBe(2)
  t.clock += 1
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  expect(t.asked).toBe(3)
  t.clock += ARCHIVE_REST_MAX_MS
  await expect(f.get(article)).rejects.toThrow(new RegExp(new Date(t.clock + ARCHIVE_REST_MAX_MS).toISOString()))
  expect(t.asked).toBe(4)
})

test('the one request after the wait isn\'t refused: reading carries on, and the next refusal starts at 12 hours', async () => {
  const { t, f } = refusals()
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  t.clock = start + ARCHIVE_REST_MS
  t.answer = () => capture(200, '<title>ok</title>')
  await f.get(article)
  await f.get(article)
  expect(t.asked).toBe(3)
  t.answer = () => capture(429, '')
  await expect(f.get(article)).rejects.toThrow(new RegExp(new Date(t.clock + ARCHIVE_REST_MS).toISOString()))
})

test('a refused connection is a refusal, with no minute\'s wait and no second try', async () => {
  const waits: number[] = []
  let n = 0
  const f = new ArchiveFetcher({ restFile: restFile(), fetch: async () => { n++; throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }) }, now: () => new Date(start), sleep: async ms => { waits.push(ms) }, ua: 'test' })
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  expect([n, waits]).toEqual([1, []])
})

test('after the wait, any failure of the one request counts as refused', async () => {
  const file = restFile()
  const { t, f } = refusals(file)
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  t.clock = start + ARCHIVE_REST_MS
  let n = 0
  const again = new ArchiveFetcher({ restFile: file, fetch: async () => { n++; throw new TypeError('fetch failed') }, now: () => new Date(t.clock), sleep: async () => {}, ua: 'test' })
  await expect(again.get(article)).rejects.toThrow(new RegExp(new Date(t.clock + ARCHIVE_REST_MAX_MS).toISOString()))
  expect(n).toBe(1)
})

test('a refusal of the index behind a browser-check copy is a refusal, not "no copy"', async () => {
  let n = 0
  const f = new ArchiveFetcher({ restFile: restFile(), fetch: async () => (n++ === 0 ? capture(200, '<title>Just a moment...</title>') : capture(429, '')), now: () => new Date(start), sleep: async () => {}, ua: 'test' })
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
})

test('the archive refusing the connection gets one long wait, then says so', async () => {
  const waits: number[] = []
  let n = 0
  const f = new ArchiveFetcher({ restFile: restFile(), fetch: async () => { n++; throw new TypeError('fetch failed') }, now: () => new Date(), sleep: async ms => { waits.push(ms) }, ua: 'test' })
  await expect(f.get(article)).rejects.toThrow(/the archive isn't answering \(fetch failed\)/)
  expect([n, waits]).toEqual([2, [60_000]])
})

test('sources read through the archive leave room for its redirect: under 15 requests a minute', () => {
  for (const id of ['2hraquarist', 'planetcatfish'] as const) expect(sourceById(id).delayMs).toBe(ARCHIVE_POLITE)
  expect(2 * (60_000 / ARCHIVE_POLITE)).toBeLessThan(15)
})

test('The Spruce Pets reads through the archive, at the archive\'s delay, and finds its fish articles on the archived hub', async () => {
  const src = sourceById('sprucepets')
  expect(src.via).toBe('archive')
  expect(src.delayMs).toBe(ARCHIVE_POLITE)
  const asked: string[] = []
  const hub = '<main><a href="/guppy-1381234">Guppy</a><a href="https://www.thesprucepets.com/bettas-4161234">a category</a></main><a href="/about-1000000">outside main</a>'
  const a = new ArchiveFetcher({ restFile: restFile(), fetch: async (url: string) => { asked.push(url); return res(200, hub) }, now: () => new Date('2026-11-10T00:00:00Z'), sleep: async () => {}, ua: 'x' })
  const start = (src.discover as { start: string[] }).start[0]!
  const links = await a.links(start, 'main')
  expect(links).toContain('https://www.thesprucepets.com/guppy-1381234')
  expect(links).not.toContain('https://www.thesprucepets.com/about-1000000')
  expect(asked.every(u => u.startsWith('https://web.archive.org/web/'))).toBe(true)
  const found = await discover(src, async () => { throw new Error('no sitemap') }, (u, scope) => a.links(u, scope))
  expect(found.map(f => f.url)).toEqual(['https://www.thesprucepets.com/guppy-1381234'])
})
