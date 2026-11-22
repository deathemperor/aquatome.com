import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createServer as createNetServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { ARCHIVE_POLITE, ARCHIVE_REST_MAX_MS, ARCHIVE_REST_MS, ArchiveFetcher, ArchiveRefused, AsksSpent, errorGot, MAX_HOPS, noCopy } from '../src/archive'
import { discover } from '../src/discover'
import { LockBusy, macLock } from '../src/mac-lock'
import { sourceById } from '../src/sources'

const restFile = () => join(mkdtempSync(join(tmpdir(), 'archive-rest-')), 'rest.json')
/** A lock no other reader holds: the tests of the Mac's lock give theirs. */
const free = async () => async () => {}
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
  // The index holds no older copy (an index that is down is not "no copy": below).
  const f = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: async u => { calls.push(u); return u.includes('/cdx/') ? res(200, '', 'text/plain') : u.endsWith('species_id=1') ? pages.a! : pages.b! }, now: () => new Date('2026-10-30T10:00:00Z'), sleep: async () => {}, ua: 'test' })
  const r = await f.get('https://www.planetcatfish.com/common/species.php?species_id=1')
  expect(calls[0]).toBe('https://web.archive.org/web/20261030id_/https://www.planetcatfish.com/common/species.php?species_id=1')
  expect(r).toMatchObject({ status: 200, finalUrl: 'https://www.planetcatfish.com/common/species.php?species_id=1' })
  await expect(f.get('https://www.planetcatfish.com/common/species.php?species_id=2')).rejects.toThrow(/no archived copy/)
})

test('an offline archive index fails the discovery loudly instead of finding nothing', async () => {
  const waits: number[] = []
  const f = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: async () => res(200, '<html><head><title>Internet Archive: Temporarily Offline</title>'), now: () => new Date(), sleep: async ms => { waits.push(ms) }, ua: 'test' })
  await expect(discover(sourceById('planetcatfish'), u => f.text(u), async () => [])).rejects.toThrow(/offline/)
  expect(waits).toEqual([30_000, 60_000, 120_000])
})

test('a 503 from the index is retried like an offline page', async () => {
  let n = 0
  const f = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: async () => (n++ < 2 ? res(503, '') : res(200, 'https://www.planetcatfish.com/common/species.php?species_id=9\n', 'text/plain')), now: () => new Date(), sleep: async () => {}, ua: 'test' })
  expect(await f.text('https://web.archive.org/cdx/search/cdx?url=x')).toContain('species_id=9')
})

test('an archived image that is really a page is no image', async () => {
  const f = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: async u => (u.includes('1.jpg') ? res(200, '<html>', 'text/html') : res(200, 'JPEG', 'image/jpeg')), now: () => new Date('2026-10-30T00:00:00Z'), sleep: async () => {}, ua: 'test' })
  await expect(f.bytes('https://www.planetcatfish.com/images/mid/1.jpg')).rejects.toThrow(/no archived image/)
  expect((await f.bytes('https://www.planetcatfish.com/images/mid/2.jpg')).length).toBe(4)
})

test('an index that is offline for a moment is asked once more', async () => {
  let n = 0
  const waits: number[] = []
  const f = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: async () => (n++ === 0 ? res(200, '<html>offline') : res(200, 'https://www.planetcatfish.com/common/species.php?species_id=7\n', 'text/plain')), now: () => new Date(), sleep: async ms => { waits.push(ms) }, ua: 'test' })
  expect(await f.text('https://web.archive.org/cdx/search/cdx?url=x')).toContain('species_id=7')
  expect(waits).toEqual([30_000])
})

const capture = (status: number, body: string, headers: Record<string, string> = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (n: string) => headers[n.toLowerCase()] ?? null }, text: async () => body, arrayBuffer: async () => new ArrayBuffer(0) })
const article = 'https://www.2hraquarist.com/blogs/hot-topics/best-temperature'

test('a page says which capture it came from; a source read through the archive keeps its own address', async () => {
  const f = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: async () => capture(200, '<title>Best temperature</title>', { 'memento-datetime': 'Fri, 17 Oct 2025 04:09:55 GMT' }), now: () => new Date('2026-11-07T00:00:00Z'), sleep: async () => {}, ua: 'test' })
  expect(await f.get(article)).toMatchObject({ finalUrl: article, capturedAt: '2025-10-17T04:09:55.000Z' })
})

test('the newest copy is a browser check: the next newest good one is read, raw, unhurried, and says its own date', async () => {
  const calls: string[] = []
  const waits: number[] = []
  const f = new ArchiveFetcher({
    lock: free,
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
  const f = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: async u => (u.includes('/cdx/') ? capture(200, '20250101000000\n') : capture(200, '<title>Just a moment...</title>')), now: () => new Date('2026-11-07T00:00:00Z'), sleep: async () => {}, ua: 'test' })
  await expect(f.get(article)).rejects.toThrow(/no archived copy \(the archive holds a browser-check page\)/)
})

// Chief of staff, 2026-11-10: "no request for 12 hours after a refusal, then one, doubling to a day."
const HOUR = 3_600_000
const start = new Date('2026-11-10T00:00:00Z').getTime()
/** A fetcher on a clock the test moves, sharing a rest file like two runs on this Mac; `answer` is what the archive says. */
function refusals(file = restFile()) {
  const t = { clock: start, asked: 0, answer: (): ReturnType<typeof capture> => capture(429, '') }
  const make = () => new ArchiveFetcher({ lock: free, restFile: file, fetch: async () => { t.asked++; return t.answer() }, now: () => new Date(t.clock), sleep: async () => {}, ua: 'test' })
  return { t, make, f: make() }
}

test('a capped reader makes its requests and no more: past them it stops before asking, which is no refusal, so no rest follows', async () => {
  const calls: string[] = []
  const file = restFile()
  const checks = (u: string) => (u.includes('/cdx/') ? res(200, '20250101000000\n20250201000000\n20250301000000\n20250401000000\n') : res(200, '<html><head><title>Just a moment...</title></head><body></body></html>'))
  const f = new ArchiveFetcher({ lock: free, restFile: file, fetch: async u => { calls.push(u); return checks(u) }, now: () => new Date('2026-11-21T06:00:00Z'), sleep: async () => {}, ua: 'test' })
  const three = f.capped(3)
  // The newest copy, the index, one older copy: the next older one is not asked for.
  await expect(three.get('https://www.example.org/post/')).rejects.toBeInstanceOf(AsksSpent)
  expect(calls).toHaveLength(3)
  expect(three.asked).toBe(3)
  await expect(three.text('https://web.archive.org/cdx/search/cdx?url=example.org*')).rejects.toBeInstanceOf(AsksSpent)
  expect(calls).toHaveLength(3)
  expect(() => readFileSync(file, 'utf8')).toThrow()
  // A reader with none left asks nothing; the reader it was made from keeps no count of its own.
  const none = f.capped(0)
  await expect(none.get('https://www.example.org/post/')).rejects.toBeInstanceOf(AsksSpent)
  expect(calls).toHaveLength(3)
  expect(f.asked).toBe(0)
})

// Codex's read of 21 Nov 2026: an automatic follow of the Archive's redirect sent two requests for one counted.
test("the Archive's redirects are followed one by one, each a request counted against the cap and noted before it is made; one off the Archive is no copy", async () => {
  const calls: { url: string; redirect?: string }[] = []
  const notes: number[] = []
  const at = (to: string) => capture(302, '', { location: to })
  const answers: Record<string, ReturnType<typeof capture>> = {
    [`https://web.archive.org/web/20261121id_/${article}`]: at(`/web/20251017040955id_/${article}`),
    [`https://web.archive.org/web/20251017040955id_/${article}`]: capture(200, '<title>Best temperature</title>', { 'memento-datetime': 'Fri, 17 Oct 2025 04:09:55 GMT' }),
  }
  const f = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: async (u, init) => { calls.push({ url: u, redirect: init?.redirect }); return answers[u] ?? capture(404, '') }, now: () => new Date('2026-11-21T06:00:00Z'), sleep: async () => {}, ua: 'test' })
  const two = f.capped(2, async () => { notes.push(calls.length) })
  expect(await two.get(article)).toMatchObject({ finalUrl: article, capturedAt: '2025-10-17T04:09:55.000Z' })
  expect(calls).toEqual([{ url: `https://web.archive.org/web/20261121id_/${article}`, redirect: 'manual' }, { url: `https://web.archive.org/web/20251017040955id_/${article}`, redirect: 'manual' }])
  expect(two.asked).toBe(2)
  // Each noted before its request went out.
  expect(notes).toEqual([0, 1])
  // One request allowed: the redirect is the second, and is not made.
  calls.length = 0
  await expect(f.capped(1).get(article)).rejects.toBeInstanceOf(AsksSpent)
  expect(calls).toHaveLength(1)
  // A redirect to the site itself, which the engine may read only through the Archive: not followed, no copy.
  calls.length = 0
  answers[`https://web.archive.org/web/20261121id_/${article}`] = at(article)
  await expect(f.get(article)).rejects.toThrow(/^no archived copy \(the archive points off itself, to www\.2hraquarist\.com\)$/)
  expect(calls.map(c => c.url)).toEqual([`https://web.archive.org/web/20261121id_/${article}`])
  // A loop: no copy after MAX_HOPS redirects.
  calls.length = 0
  const loop = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: async u => { calls.push({ url: u }); return at(u) }, now: () => new Date('2026-11-21T06:00:00Z'), sleep: async () => {}, ua: 'test' })
  await expect(loop.text('https://web.archive.org/cdx/search/cdx?url=x')).rejects.toThrow(`no archived copy (more than ${MAX_HOPS} redirects)`)
  expect(calls).toHaveLength(MAX_HOPS + 1)
  // A 429 on a redirect's request is a refusal, as on any.
  const { t, f: r } = refusals()
  let first = true
  t.answer = () => (first ? ((first = false), at('/web/2025id_/x')) : capture(429, ''))
  await expect(r.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  expect(t.asked).toBe(2)
})

// The chief of staff, 21 Nov 2026: the three archived sites' reading now follows the Archive's redirects by hand, so Node's
// own fetch must give a 302's status and Location under `redirect: 'manual'`, or their reading breaks at the first cycle.
// A server on this Mac stands in for the Archive: nothing of the Archive's is asked.
test("with Node's own fetch, the Archive's 302 is read under `redirect: 'manual'`, its Location followed by hand and counted", async () => {
  const seen: string[] = []
  const server = createServer((q, r) => {
    seen.push(q.url ?? '')
    if (q.url === `/web/20261121id_/${article}`) { r.writeHead(302, { location: `/web/20251017040955id_/${article}` }); r.end(); return }
    if (q.url === `/web/20251017040955id_/${article}`) { r.writeHead(200, { 'content-type': 'text/html', 'memento-datetime': 'Fri, 17 Oct 2025 04:09:55 GMT' }); r.end('<title>Best temperature</title>'); return }
    r.writeHead(404)
    r.end()
  })
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok))
  const local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    const f = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: (u, init) => fetch(u.replace('https://web.archive.org', local), init), now: () => new Date('2026-11-21T06:00:00Z'), sleep: async () => {}, ua: 'test' })
    const two = f.capped(2)
    expect(await two.get(article)).toMatchObject({ finalUrl: article, html: '<title>Best temperature</title>', capturedAt: '2025-10-17T04:09:55.000Z' })
    expect(two.asked).toBe(2)
    // Two requests reached the server, one a hop: fetch followed nothing by itself.
    expect(seen).toEqual([`/web/20261121id_/${article}`, `/web/20251017040955id_/${article}`])
  } finally {
    await new Promise(ok => server.close(ok))
  }
})

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

// Codex's fresh read of 21 Nov 2026: the wait ended on the redirect, so a refusal of the redirect's own request started a
// fresh 12 hours instead of a day.
test('after the wait, a redirect ends nothing: refused on its request, the wait doubles; answered, it ends with that answer', async () => {
  const { t, f } = refusals()
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  t.clock = start + ARCHIVE_REST_MS
  let n = 0
  t.answer = () => (n++ === 0 ? capture(302, '', { location: `/web/20251017040955id_/${article}` }) : capture(429, ''))
  await expect(f.get(article)).rejects.toThrow(new RegExp(new Date(t.clock + ARCHIVE_REST_MAX_MS).toISOString()))
  expect(t.asked).toBe(3)
  t.clock += ARCHIVE_REST_MAX_MS
  n = 0
  t.answer = () => (n++ === 0 ? capture(302, '', { location: `/web/20251017040955id_/${article}` }) : capture(200, '<title>ok</title>'))
  await f.get(article)
  t.answer = () => capture(429, '')
  await expect(f.get(article)).rejects.toThrow(new RegExp(new Date(t.clock + ARCHIVE_REST_MS).toISOString()))
})

// Codex's fresh read of 21 Nov 2026: a job's pace wait comes after the rest was read, and another job on this Mac may be
// refused in it.
test('a refusal written while a request waited its turn stops that request', async () => {
  const file = restFile()
  const { t, f: other, make } = refusals(file)
  const f = new ArchiveFetcher({ lock: free, restFile: file, fetch: async () => { t.asked++; return capture(200, '<title>ok</title>') }, now: () => new Date(t.clock), sleep: async () => {}, ua: 'test' })
  // Its count is kept just before the request goes, after the rest is read again: a request the rest stops is never counted.
  const counted: number[] = []
  const waiting = f.capped(5, async () => { counted.push(1) }, async () => { await expect(other.get(article)).rejects.toBeInstanceOf(ArchiveRefused) })
  await expect(waiting.get(article)).rejects.toThrow(/no request before 2026-11-10T12:00:00.000Z/)
  expect(t.asked).toBe(1)
  expect(waiting.asked).toBe(0)
  expect(counted).toEqual([])
  // The wait over, another job's one request is answered while this one waits its pace: refused after, this one starts at
  // 12 hours, not a day.
  t.clock = start + ARCHIVE_REST_MS
  const answered = new ArchiveFetcher({ lock: free, restFile: file, fetch: async () => capture(200, '<title>ok</title>'), now: () => new Date(t.clock), sleep: async () => {}, ua: 'test' })
  const late = make().capped(5, undefined, async () => { await answered.get(article) })
  await expect(late.get(article)).rejects.toThrow(new RegExp(new Date(t.clock + ARCHIVE_REST_MS).toISOString()))
})

// The chief of staff, 21 Nov 2026, on the owner's rule on refusals: what a 403 from the Archive is.
test("a 403 from the Archive's index is a refusal: stop, and rest as on a 429", async () => {
  const { t, f } = refusals()
  t.answer = () => capture(403, '')
  await expect(f.text('https://web.archive.org/cdx/search/cdx?url=x')).rejects.toThrow(new RegExp(new Date(start + ARCHIVE_REST_MS).toISOString()))
  expect(t.asked).toBe(1)
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  expect(t.asked).toBe(1)
})

test("a 403 on one page's copy is no copy of that page, and rests nothing", async () => {
  const file = restFile()
  const { t, f } = refusals(file)
  t.answer = () => capture(403, '')
  await expect(f.get(article)).rejects.toThrow(/^no archived copy \(HTTP 403\)$/)
  // The same page again in the run: still only that page.
  await expect(f.get(article)).rejects.toThrow(/^no archived copy \(HTTP 403\)$/)
  expect(() => readFileSync(file, 'utf8')).toThrow()
  expect(t.asked).toBe(2)
})

test('no 403 ends a rest: after one on a page\'s copy, the next refusal doubles the wait', async () => {
  const { t, f, make } = refusals()
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  t.clock = start + ARCHIVE_REST_MS
  t.answer = () => capture(403, '')
  await expect(make().get(article)).rejects.toThrow(/^no archived copy \(HTTP 403\)$/)
  t.answer = () => capture(429, '')
  await expect(make().get(article)).rejects.toThrow(new RegExp(new Date(t.clock + ARCHIVE_REST_MAX_MS).toISOString()))
})

// Codex's read of 43fc906eab: a redirect with no address passed by the redirects' branch and ended the rest, so the next
// refusal started a fresh 12 hours.
test('after the wait, a redirect to no address is no copy and ends nothing: the next refusal doubles the wait', async () => {
  const file = restFile()
  const { t, f, make } = refusals(file)
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  t.clock = start + ARCHIVE_REST_MS
  t.answer = () => capture(302, '')
  await expect(make().get(article)).rejects.toThrow(/^no archived copy \(HTTP 302/)
  expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ waitMs: ARCHIVE_REST_MS })
  t.answer = () => capture(429, '')
  await expect(make().get(article)).rejects.toThrow(new RegExp(new Date(t.clock + ARCHIVE_REST_MAX_MS).toISOString()))
})

// From the index, a redirect to no address is the index not answering, as its other failures but a 4xx: past a browser
// check it stops the search, never "no copy".
test('past a browser check, the index redirecting to no address stops the search: not "no copy"', async () => {
  const f = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: async u => (u.includes('/cdx/') ? capture(302, '') : capture(200, '<html><head><title>Just a moment...</title></head><body></body></html>')), now: () => new Date('2026-11-21T06:00:00Z'), sleep: async () => {}, ua: 'test' })
  const e = await f.get(article).then(() => undefined, (x: unknown) => x as Error)
  expect(e?.message).toMatch(/302/)
  expect(noCopy(e)).toBe(false)
})

test("a 403 on a second page's copy in the same run is the reader shut out: a refusal, said in the log with both pages", async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    const { t, f, make } = refusals()
    t.answer = () => capture(403, '')
    const other = 'https://www.2hraquarist.com/blogs/hot-topics/other'
    // The run's readers share what they met: a capped one made from it, as the magazine's are.
    await expect(f.get(article)).rejects.toThrow(/^no archived copy \(HTTP 403\)$/)
    await expect(f.capped(5).get(other)).rejects.toThrow(new RegExp(new Date(start + ARCHIVE_REST_MS).toISOString()))
    expect(log.mock.calls.at(-1)?.[0]).toContain("HTTP 403 on a second page's copy in this run (2hraquarist.com/blogs/hot-topics/other, after 2hraquarist.com/blogs/hot-topics/best-temperature)")
    // A new run starts with none met.
    t.clock = start + ARCHIVE_REST_MS
    t.answer = () => capture(200, '<title>ok</title>')
    await make().get(article)
    t.answer = () => capture(403, '')
    await expect(make().get(other)).rejects.toThrow(/^no archived copy \(HTTP 403\)$/)
  } finally { log.mockRestore() }
})

// Codex's fresh read of f4e7985fae: two jobs each sent the one request after a wait; the first refused wrote a new wait, and
// the second, answered after, took it away.
test("an answer after the wait ends only that wait: a new one another job's refusal wrote meanwhile stands", async () => {
  const file = restFile()
  const { t, f } = refusals(file)
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  t.clock = start + ARCHIVE_REST_MS
  let answer!: () => void
  const held = new Promise<void>(ok => { answer = ok })
  const slow = new ArchiveFetcher({ lock: free, restFile: file, fetch: async () => { await held; return capture(200, '<title>ok</title>') }, now: () => new Date(t.clock), sleep: async () => {}, ua: 'test' })
  const reading = slow.get(article)
  // The other job's request after the same wait is refused: a day's wait now.
  await expect(f.get(article)).rejects.toThrow(new RegExp(new Date(t.clock + ARCHIVE_REST_MAX_MS).toISOString()))
  answer()
  await reading
  const asked = t.asked
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  expect(t.asked).toBe(asked)
})

// The chief of staff, 21 Nov 2026: one lock across the Mac around each Archive request (rest check, ledger write, request,
// rest cleared), for the two overlaps between readers in different jobs (the pages part and the sf part run side by side).
/** A port no one holds, for a test's own lock: never the Mac's, which a cycle may hold. */
const freePort = () => new Promise<number>(ok => { const s = createNetServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address() as AddressInfo; s.close(() => ok(port)) }) })
const pause = (ms: number) => new Promise(r => setTimeout(r, ms))
/** Whether the rest file holds a wait not yet over, at the clock's time. */
const restingNow = (file: string, clock: number) => { try { return clock < new Date((JSON.parse(readFileSync(file, 'utf8')) as { until: string }).until).getTime() } catch { return false } }

test("no request goes out past a refusal another reader on the Mac got while it counted this one", async () => {
  const file = restFile()
  const lock = await freePort().then(port => () => macLock(port))
  const sent: boolean[] = []
  const refuses = new ArchiveFetcher({ lock, restFile: file, fetch: async () => capture(429, ''), now: () => new Date(start), sleep: async () => {}, ua: 'test' })
  let other!: Promise<unknown>
  // While this request is counted (its rest read, its ledger written), another job's request is refused.
  const counting = new ArchiveFetcher({ lock, restFile: file, fetch: async () => { sent.push(restingNow(file, start)); return capture(200, '<title>ok</title>') }, now: () => new Date(start), sleep: async () => {}, ua: 'test' })
    .capped(5, async () => { other = refuses.get(article).catch(e => e); await Promise.race([other, pause(300)]) })
  await counting.get(article)
  expect(await other).toBeInstanceOf(ArchiveRefused)
  // Sent with no rest on file: the other job's request waited for the lock and was refused after this one's answer.
  expect(sent).toEqual([false])
})

test("an answer that ends a wait is taken in before another reader on the Mac sends, so a wait that reader begins stands", async () => {
  const file = restFile()
  const lock = await freePort().then(port => () => macLock(port))
  const { t, f } = refusals(file)
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  t.clock = start + ARCHIVE_REST_MS
  let answer!: () => void, out!: () => void
  const gate = new Promise<void>(ok => { answer = ok }), isOut = new Promise<void>(ok => { out = ok })
  const after = new ArchiveFetcher({ lock, restFile: file, fetch: async () => { out(); await gate; return capture(200, '<title>ok</title>') }, now: () => new Date(t.clock), sleep: async () => {}, ua: 'test' })
  const oldWait: boolean[] = []
  let sentOther!: () => void
  const otherSent = new Promise<void>(ok => { sentOther = ok })
  const other = new ArchiveFetcher({ lock, restFile: file, fetch: async () => { oldWait.push(existsSync(file)); sentOther(); return capture(429, '') }, now: () => new Date(t.clock), sleep: async () => {}, ua: 'test' })
  const reading = after.get(article)
  await isOut
  // The request after the wait is out; another job's request starts.
  const refused = other.get(article).catch(e => e)
  await Promise.race([otherSent, pause(300)])
  answer()
  await reading
  expect(await refused).toBeInstanceOf(ArchiveRefused)
  // The other job sent only once the answer had ended the old wait, and the wait it began, 12 hours from a clean start, stands.
  expect(oldWait).toEqual([false])
  expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ until: new Date(t.clock + ARCHIVE_REST_MS).toISOString(), waitMs: ARCHIVE_REST_MS })
})

// The chief of staff, 22 Nov 2026: something not ours holding the port is never the Archive refusing.
test('a lock held by something not ours: the reader waits and says so, asks nothing, writes no rest, and the run asks nothing more', async () => {
  const port = await freePort()
  const other = createNetServer()
  await new Promise<void>(ok => other.listen({ port, host: '127.0.0.1' }, ok))
  const file = restFile()
  const said: string[] = []
  let asked = 0
  const f = new ArchiveFetcher({ lock: () => macLock(port, { waitMs: 500, noteMs: 150, log: l => said.push(l) }), restFile: file, fetch: async () => { asked++; return capture(200, '<title>ok</title>') }, now: () => new Date(start), sleep: async () => {}, ua: 'test' })
  const e = await f.get(article).catch((x: unknown) => x)
  expect(e).toBeInstanceOf(LockBusy)
  expect(e).not.toBeInstanceOf(ArchiveRefused)
  expect((e as Error).message).toContain(`127.0.0.1:${port}`)
  expect(said).toHaveLength(1)
  expect(asked).toBe(0)
  expect(existsSync(file)).toBe(false)
  // The rest of the run, a capped reader too, asks nothing, and at once rather than waiting again.
  const t0 = Date.now()
  await expect(f.capped(5).get(article)).rejects.toThrow(/; nothing more is asked of the archive in this run$/)
  expect(Date.now() - t0).toBeLessThan(150)
  expect(asked).toBe(0)
  expect(existsSync(file)).toBe(false)
  await new Promise(ok => other.close(ok))
})

// Codex's fresh read of 21 Nov 2026: past a browser check, the requests allowed ran out or one copy failed, and the post
// was recorded as having no copy.
test('past a browser check: requests spent stop the search, not "no copy"; an older copy that fails is passed over', async () => {
  const check = capture(200, '<html><head><title>Just a moment...</title></head></html>')
  const f = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: async () => check, now: () => new Date('2026-11-21T06:00:00Z'), sleep: async () => {}, ua: 'test' })
  await expect(f.capped(1).get(article)).rejects.toBeInstanceOf(AsksSpent)
  const calls: string[] = []
  const g = new ArchiveFetcher({
    lock: free,
    restFile: restFile(),
    fetch: async u => {
      calls.push(u)
      if (u.includes('/cdx/')) return capture(200, '20240101000000\n20250101000000\n')
      if (u.includes('/web/20250101000000id_/')) return capture(404, '')
      if (u.includes('/web/20240101000000id_/')) return capture(200, '<title>Best temperature</title>')
      return check
    },
    now: () => new Date('2026-11-21T06:00:00Z'), sleep: async () => {}, ua: 'test',
  })
  // And with no date in the answer, the copy's date is its stamp.
  expect(await g.get(article)).toMatchObject({ html: '<title>Best temperature</title>', capturedAt: '2024-01-01T00:00:00.000Z' })
  expect(calls).toHaveLength(4)
  // An older copy the Archive doesn't answer for, twice: that stops it, not "no copy".
  const h = new ArchiveFetcher({
    lock: free,
    restFile: restFile(),
    fetch: async u => {
      if (u.includes('/cdx/')) return capture(200, '20240101000000\n20250101000000\n')
      if (u.includes('/web/20250101000000id_/')) throw new TypeError('fetch failed')
      return check
    },
    now: () => new Date('2026-11-21T06:00:00Z'), sleep: async () => {}, ua: 'test',
  })
  await expect(h.get(article)).rejects.toThrow(/^the archive isn't answering/)
  // A 403 on an older copy: no copy of this page, and its other older copies aren't asked (Fable, 21 Nov 2026).
  const asked403: string[] = []
  const j = new ArchiveFetcher({
    lock: free,
    restFile: restFile(),
    fetch: async u => { asked403.push(u); return u.includes('/cdx/') ? capture(200, '20240101000000\n20250101000000\n') : u.includes('/web/2026') ? check : capture(403, '') },
    now: () => new Date('2026-11-21T06:00:00Z'), sleep: async () => {}, ua: 'test',
  })
  await expect(j.get(article)).rejects.toThrow(/^no archived copy \(HTTP 403\)$/)
  expect(asked403.filter(u => /\/web\/20[0-9]{12}id_/.test(u))).toHaveLength(1)
  // The index itself not answering, or down, stops it too: only its saying it holds nothing (a 4xx) is no copies.
  for (const [index, said] of [[async () => { throw new TypeError('fetch failed') }, /^the archive isn't answering/], [async () => capture(502, ''), /^HTTP 502 from web\.archive\.org/], [async () => capture(404, ''), /^no archived copy \(the archive holds a browser-check page\)$/]] as const) {
    const i = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: async u => (u.includes('/cdx/') ? index() : check), now: () => new Date('2026-11-21T06:00:00Z'), sleep: async () => {}, ua: 'test' })
    await expect(i.get(article)).rejects.toThrow(said)
  }
})

// Codex's fresh read of 21 Nov 2026: a copy reached through a redirect, with no Memento-Datetime, had no date.
test("a copy with no date of its own takes the stamp of the address that answered, never today's", async () => {
  const answers: Record<string, ReturnType<typeof capture>> = {
    [`https://web.archive.org/web/20261121id_/${article}`]: capture(302, '', { location: `/web/20251017040955id_/${article}` }),
    [`https://web.archive.org/web/20251017040955id_/${article}`]: capture(200, '<title>Best temperature</title>'),
  }
  const f = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: async u => answers[u] ?? capture(404, ''), now: () => new Date('2026-11-21T06:00:00Z'), sleep: async () => {}, ua: 'test' })
  expect((await f.get(article)).capturedAt).toBe('2025-10-17T04:09:55.000Z')
  answers[`https://web.archive.org/web/20261121id_/${article}`] = capture(200, '<title>Best temperature</title>')
  expect((await f.get(article)).capturedAt).toBeUndefined()
})

test('a refused connection is a refusal, with no minute\'s wait and no second try', async () => {
  const waits: number[] = []
  let n = 0
  const f = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: async () => { n++; throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }) }, now: () => new Date(start), sleep: async ms => { waits.push(ms) }, ua: 'test' })
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  expect([n, waits]).toEqual([1, []])
})

test('after the wait, any failure of the one request counts as refused', async () => {
  const file = restFile()
  const { t, f } = refusals(file)
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
  t.clock = start + ARCHIVE_REST_MS
  let n = 0
  const again = new ArchiveFetcher({ lock: free, restFile: file, fetch: async () => { n++; throw new TypeError('fetch failed') }, now: () => new Date(t.clock), sleep: async () => {}, ua: 'test' })
  await expect(again.get(article)).rejects.toThrow(new RegExp(new Date(t.clock + ARCHIVE_REST_MAX_MS).toISOString()))
  expect(n).toBe(1)
})

test('the rest file and one log line say what the request got: a 429, a dropped connection\'s code, a timeout; and the answer that ends a wait', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    const file = restFile()
    const rest = () => JSON.parse(readFileSync(file, 'utf8')) as unknown
    // Each refusal: the whole record, and exactly one new log line saying it.
    const refusal = async (f: ArchiveFetcher, at: number, waitMs: number, got: string) => {
      const before = log.mock.calls.length
      await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
      const until = new Date(at + waitMs).toISOString()
      expect(rest()).toEqual({ until, waitMs, got, at: new Date(at).toISOString() })
      expect(log.mock.calls.slice(before).map(c => c[0])).toEqual([`archive: counted as refused at ${new Date(at).toISOString()}, it got ${got}: no request before ${until}`])
    }
    const { t, f } = refusals(file)
    await refusal(f, start, ARCHIVE_REST_MS, 'HTTP 429')
    // After the wait, a dropped connection still counts as refused (unchanged), and says what it was.
    t.clock = start + ARCHIVE_REST_MS
    const dropped = new ArchiveFetcher({ lock: free, restFile: file, fetch: async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }) }, now: () => new Date(t.clock), sleep: async () => {}, ua: 'test' })
    await refusal(dropped, t.clock, ARCHIVE_REST_MAX_MS, 'ECONNRESET (fetch failed)')
    t.clock += ARCHIVE_REST_MAX_MS
    const slow = new ArchiveFetcher({ lock: free, restFile: file, fetch: async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError') }, now: () => new Date(t.clock), sleep: async () => {}, ua: 'test' })
    await refusal(slow, t.clock, ARCHIVE_REST_MAX_MS, 'TimeoutError (The operation was aborted due to timeout)')
    // The one request after the next wait is answered: the file goes, and one log line keeps what it got.
    t.clock += ARCHIVE_REST_MAX_MS
    t.answer = () => capture(200, '<title>ok</title>')
    const before = log.mock.calls.length
    await f.get(article)
    expect(() => readFileSync(file, 'utf8')).toThrow()
    expect(log.mock.calls.slice(before).map(c => c[0])).toEqual(['archive: answered after the wait, at 2026-11-12T12:00:00.000Z, with HTTP 200: reading carries on'])
  } finally { log.mockRestore() }
})

test('a failed request\'s code: a timeout\'s name, else its cause\'s code, else its own, each with its message; else the message', () => {
  const failed = (o: object, message = 'fetch failed') => Object.assign(new TypeError(message), o)
  expect([
    errorGot(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
    errorGot(new DOMException('This operation was aborted', 'AbortError')),
    errorGot(failed({ cause: { code: 'UND_ERR_CONNECT_TIMEOUT' }, code: 'OTHER' })),
    errorGot(failed({ cause: { code: 42 }, code: 'ENOTFOUND' }, 'getaddrinfo ENOTFOUND web.archive.org')),
    errorGot(failed({ cause: {} })),
    errorGot('plain words'),
  ]).toEqual([
    'TimeoutError (The operation was aborted due to timeout)',
    'AbortError (This operation was aborted)',
    'UND_ERR_CONNECT_TIMEOUT (fetch failed)',
    'ENOTFOUND (getaddrinfo ENOTFOUND web.archive.org)',
    'fetch failed',
    'plain words',
  ])
})

test('a refusal of the index behind a browser-check copy is a refusal, not "no copy"', async () => {
  let n = 0
  const f = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: async () => (n++ === 0 ? capture(200, '<title>Just a moment...</title>') : capture(429, '')), now: () => new Date(start), sleep: async () => {}, ua: 'test' })
  await expect(f.get(article)).rejects.toBeInstanceOf(ArchiveRefused)
})

test('the archive refusing the connection gets one long wait, then says so', async () => {
  const waits: number[] = []
  let n = 0
  const f = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: async () => { n++; throw new TypeError('fetch failed') }, now: () => new Date(), sleep: async ms => { waits.push(ms) }, ua: 'test' })
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
  const a = new ArchiveFetcher({ lock: free, restFile: restFile(), fetch: async (url: string) => { asked.push(url); return res(200, hub) }, now: () => new Date('2026-11-10T00:00:00Z'), sleep: async () => {}, ua: 'x' })
  const start = (src.discover as { start: string[] }).start[0]!
  const links = await a.links(start, 'main')
  expect(links).toContain('https://www.thesprucepets.com/guppy-1381234')
  expect(links).not.toContain('https://www.thesprucepets.com/about-1000000')
  expect(asked.every(u => u.startsWith('https://web.archive.org/web/'))).toBe(true)
  const found = await discover(src, async () => { throw new Error('no sitemap') }, (u, scope) => a.links(u, scope))
  expect(found.map(f => f.url)).toEqual(['https://www.thesprucepets.com/guppy-1381234'])
})
