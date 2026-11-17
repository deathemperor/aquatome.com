import { expect, test } from 'vitest'
import { createSession } from '../accounts/session'
import { bucketOf, linked, readAsks, STALE_MS, type Ask } from '../admin/asks'
import { SECTIONS } from '../dashboard'
import { handle, type Env } from '../index'
import { testD1 } from './d1'
import { memoryR2 } from './r2'

// The owner's asks (admin/asks.ts): the chief of staff's list, sent from the Mac with the dashboard token, shown to the
// owner. Made-up rows only: the list itself is never in the repository.
const DASH = 'dash-token-that-is-long-enough-to-pass'
/** A time `h` hours before now (the route reads the clock). */
const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

const row = (over: Partial<Ask> = {}): Ask => ({
  ask: 'A made-up ask', words: 'make it so', asked: ['15 Nov'], lead: 'Site', state: 'open', due: 'Tue 17 Nov', now: 'Being built.', ...over,
})
const list = (over: Record<string, unknown> = {}) => ({
  today: '2026-11-17', updated: 'Tue 17 Nov 18:00', rows: [row()], parked: [], rules: ['A standing word.'], ...over,
})

async function worker() {
  const db = testD1()
  for (const id of ['owner-1', 'reader-1']) await db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind(id, '2026-11-01T00:00:00Z').run()
  const owner = await createSession(db, 'owner-1', 'web', new Date())
  const reader = await createSession(db, 'reader-1', 'web', new Date())
  const uploads = memoryR2()
  const env = {
    ASSETS: { fetch: async () => new Response('page') }, AB: { get: async () => null, put: async () => {} }, EVENTS: { writeDataPoint: () => {} },
    DB: db, UPLOADS: uploads.bucket, AB_DASH_TOKEN: DASH, OWNER_ACCOUNTS: 'owner-1', ACCOUNT_HMAC_KEY: 'k',
  } as unknown as Env
  const send = (body: unknown, token = DASH, method = 'PUT') =>
    handle(new Request('https://x.test/_ab/asks', { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env)
  const open = (session = owner) => handle(new Request('https://x.test/_ab/yeu-cau/', { headers: { cookie: `__Host-aq_session=${session}` } }), env)
  return { env, uploads, send, open, reader }
}

test('a list that passes is kept whole, in one object, and the page shows it to the owner only', async () => {
  const w = await worker()
  const res = await w.send({ modified: ago(1), list: list() })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true, rows: 1, parked: 0 })
  expect([...w.uploads.m.keys()]).toEqual(['owner-asks/list.json'])
  const page = await w.open()
  expect(page.status).toBe(200)
  expect(page.headers.get('cache-control')).toContain('no-store')
  const html = await page.text()
  expect(html).toContain('<h1>Your asks</h1>')
  expect(html).toContain('A made-up ask')
  expect(html).toContain('Your standing words')
  expect((await (await w.open(w.reader)).text())).not.toContain('A made-up ask')
})

test('only the dashboard token sends a list: another bearer, or none, finds nothing there', async () => {
  const w = await worker()
  expect((await w.send({ modified: ago(1), list: list() }, 'wrong-token-that-is-long-enough')).status).toBe(404)
  expect((await handle(new Request('https://x.test/_ab/asks', { method: 'PUT', body: '{}' }), w.env)).status).toBe(404)
  expect(w.uploads.m.size).toBe(0)
})

test('a list that fails is refused with why, and the page keeps the last one that passed', async () => {
  const w = await worker()
  await w.send({ modified: ago(1), list: list() })
  const refused = async (l: unknown) => { const r = await w.send({ modified: ago(0.5), list: l }); expect(r.status).toBe(400); return ((await r.json()) as { why: string }).why }
  expect(await refused(list({ rows: [row({ state: 'shipped' as never })] }))).toMatch(/state isn't one of/)
  expect(await refused(list({ rows: [row({ now: 'see <script>alert(1)</script>' })] }))).toBe("rows 1's now holds an HTML tag")
  expect(await refused(list({ rows: [row({ ask: 'x'.repeat(301) })] }))).toBe("rows 1's ask is 301 characters, over 300")
  expect(await refused(list({ rows: [row({ asked: ['yesterday'] })] }))).toMatch(/asked isn't/)
  expect(await refused(list({ rows: [row({ now: 'see <a href="https://x.test">here</a>' })] }))).toBe("rows 1's now holds an HTML tag")
  expect(await refused(list({ rows: [row({ now: '<svg/onload=alert(1)>' })] }))).toBe("rows 1's now holds an HTML tag")
  expect(await refused(list({ rows: [{ ...row(), secret: 'x' }] }))).toBe("rows 1 has a field the page doesn't know: secret")
  // A field named with the list's own words isn't said back.
  expect(await refused(list({ rows: [{ ...row(), 'the made-up words': 'x' }] }))).toBe("rows 1 has a field the page doesn't know")
  expect(await refused(list({ rows: [] }))).toBe('the list has no rows')
  expect(await refused(list({ rules: ['bell \u0007'] }))).toBe('rule 1 holds a control character')
  expect(await refused(list({ today: '2026-02-30' }))).toBe("today isn't a day like 2026-11-17")
  // A month or a day out of range is refused with why, not thrown (a 500 before 17 Nov).
  expect(await refused(list({ today: '2026-13-01' }))).toBe("today isn't a day like 2026-11-17")
  expect(await refused(list({ today: '2026-11-32' }))).toBe("today isn't a day like 2026-11-17")
  expect(await refused('not a list')).toBe("the list isn't an object")
  const later = await w.send({ modified: '2099-01-01T00:00:00Z', list: list() })
  expect(later.status).toBe(400)
  expect((await (await w.open()).text())).toContain('A made-up ask')
})

test('words a lead quotes with angle brackets are text, not markup; every field is shown as text', () => {
  expect(readAsks(list({ rows: [row({ where: 'any fish → Hỏi về <tên>' })] }))).toMatchObject({ rows: [{ where: 'any fish → Hỏi về <tên>' }] })
  expect(linked('a & b <tên>')).toBe('a &amp; b &lt;tên&gt;')
  // A placeholder in an address is words too.
  expect(readAsks(list({ rows: [row({ now: 'Live at /ca/<slug>/ and /_ab/<key>/, <b >not</b> yet' })] }))).toEqual({ why: "rows 1's now holds an HTML tag" })
  expect(readAsks(list({ rows: [row({ now: 'Live at /ca/<slug>/ and /_ab/<key>/' })] }))).toMatchObject({ rows: [{ now: 'Live at /ca/<slug>/ and /_ab/<key>/' }] })
})

test('a row links only to our own addresses; any other address stays text', () => {
  expect(linked('Live: https://aquatome.com/ca/ca-betta/. Then the app.')).toBe('Live: <a href="https://aquatome.com/ca/ca-betta/">https://aquatome.com/ca/ca-betta/</a>. Then the app.')
  expect(linked('https://dashboard.aquatome.com/yeu-cau/')).toBe('<a href="https://dashboard.aquatome.com/yeu-cau/">https://dashboard.aquatome.com/yeu-cau/</a>')
  expect(linked('http://aquatome.com/x/ and https://aquatome.com.evil.test/ and https://user@aquatome.com/')).toBe('http://aquatome.com/x/ and https://aquatome.com.evil.test/ and https://user@aquatome.com/')
})

test("rows sort into the chief's groups: an ask open since it was asked twice or a week ago isn't being followed", () => {
  expect(bucketOf(row({ state: 'late' }), '2026-11-17')).toBe('red')
  expect(bucketOf(row({ state: 'open', asked: ['15 Nov'] }), '2026-11-17')).toBe('build')
  expect(bucketOf(row({ state: 'open', asked: ['10 Nov'] }), '2026-11-17')).toBe('red')
  expect(bucketOf(row({ state: 'open', asked: ['15 Nov', '16 Nov'] }), '2026-11-17')).toBe('red')
  expect(bucketOf(row({ state: 'partly', asked: ['1 Nov'] }), '2026-11-17')).toBe('build')
  expect(bucketOf(row({ state: 'you' }), '2026-11-17')).toBe('you')
  // An ask from late December, on a list of early January: last year's.
  expect(bucketOf(row({ state: 'open', asked: ['30 Dec'] }), '2027-01-02')).toBe('build')
})

test('a list not changed for over six hours says so, with how long', async () => {
  const w = await worker()
  await w.send({ modified: new Date(Date.now() - STALE_MS - 3_600_000).toISOString(), list: list() })
  expect(await (await w.open()).text()).toContain('Not changed for 7 hours.')
  await w.send({ modified: new Date(Date.now() - 60_000).toISOString(), list: list() })
  expect(await (await w.open()).text()).not.toContain('Not changed for')
})

test('the rail lists the page after Today, and the app\'s section list doesn\'t have it yet', async () => {
  const w = await worker()
  await w.send({ modified: ago(0), list: list() })
  const html = await (await w.open()).text()
  const from = html.indexOf('<nav class="rail"')
  const rail = html.slice(from, html.indexOf('</nav>', from))
  expect(rail.indexOf('/_ab/yeu-cau/')).toBeGreaterThan(rail.indexOf('href="/_ab/"'))
  expect(rail.indexOf('/_ab/yeu-cau/')).toBeLessThan(rail.indexOf('/_ab/thanh-cong/'))
  expect(SECTIONS.map(s => s.key)).not.toContain('yeu-cau')
})
