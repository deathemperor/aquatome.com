import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { handle, type Env } from '../index'
import { COUNTED, WHO_RANK } from '../admin/ae'
import { joinReads, PAGE_VIEWS_SQL, type ContentStats } from '../admin/content'
import { BEACON_SQL, visitsOf } from '../admin/scoreboard'
import { countedSessions, SESSIONS_SQL, summariseReaders, VIEWS_SQL } from '../readers'
import { NET_FOR_MS, NET_KEY } from '../us'
import { testD1 } from './d1'

// Our own visits (worker/us.ts): every mark reaches the event, and no reader count reads a marked event.

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const OURS_IP = '171.0.2.10'
const READER_IP = '203.0.113.7'
const body = JSON.stringify({ p: '/ca/ca-betta/', t: 'view', v: 1, sid: 'abc123def456' })

function env() {
  const points: { blobs: string[] }[] = []
  const store = new Map<string, string>()
  const e = {
    ASSETS: { fetch: async () => new Response('x') },
    AB: {
      get: async (k: string, o?: unknown) => { const v = store.get(k); return v === undefined ? null : o ? JSON.parse(v) : v },
      put: async (k: string, v: string) => { store.set(k, v) },
    },
    EVENTS: { writeDataPoint: (p: { blobs: string[] }) => { points.push(p) } },
    STAGING: '1', AB_DASH_TOKEN: 'tok', ACCOUNT_HMAC_KEY: 'k'.repeat(32),
  } as unknown as Env
  return { e, points, store }
}
const beacon = (headers: Record<string, string> = {}, ip = READER_IP) =>
  new Request('https://x.test/_e', { method: 'POST', body, headers: { 'user-agent': IPHONE, 'accept-language': 'vi', origin: 'https://x.test', 'cf-connecting-ip': ip, ...headers } })
const ping = (ip: string, token = 'tok') => new Request('https://x.test/_ab/our-network', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'cf-connecting-ip': ip } })

test('a reader\'s event carries no mark; each of ours carries its own', async () => {
  const { e, points } = env()
  const marks: [Record<string, string>, string][] = [
    [{}, ''],
    [{ cookie: 'aq_owner=1' }, 'owner'],
    [{ cookie: 'x=1; aq_us=1' }, 'team'],
    [{ referer: 'https://x.test/gioi-thieu/?aqcheck=1' }, 'team'],
    [{ 'user-agent': `${IPHONE} AquaTomeApp/1.0` }, 'app'],
  ]
  for (const [headers] of marks) expect((await handle(beacon(headers), e)).status).toBe(204)
  expect(points.map(p => p.blobs[0])).toEqual(marks.map(m => m[1]))
  // Our automated checks stay out altogether, with the bots.
  await handle(beacon({ 'user-agent': `${IPHONE} AquaTomeCheck/1` }), e)
  expect(points).toHaveLength(marks.length)
})

test('a page our app copy opened (aqcheck=1) marks its view, and sets nothing in the browser: a shared link costs a tab, not a reader', async () => {
  const { e, points } = env()
  for (const referer of ['https://x.test/gioi-thieu/?aqcheck=1', 'https://x.test/gioi-thieu/', 'https://x.test/?aqcheck=0']) {
    expect((await handle(beacon({ referer }), e)).headers.get('set-cookie')).toBeNull()
  }
  expect(points.map(p => p.blobs[0])).toEqual(['team', '', ''])
})

test('one marked event makes its whole tab ours: no reader count reads it', () => {
  // The tab the app opened: its first view marked, its next page and its scroll not. And a reader's tab beside it.
  const sessions = [
    { sid: 'mixed', first: '2026-11-07 01:00:00', pages: 2, t: 60, scroll: 90, land: '/ca/ca-betta/', ref: '', cc: 'VN', who: 3 },
    { sid: 'reader', first: '2026-11-07 02:00:00', pages: 1, t: 40, scroll: 0, land: '/ca/ca-betta/', ref: 'www.google.com', cc: 'VN', who: 0 },
  ]
  const r = summariseReaders(sessions, [{ sid: 'mixed', p: '/ca/ca-betta/', views: 1 }, { sid: 'reader', p: '/ca/ca-betta/', views: 1 }], 14)
  expect([r.sessions, r.readers, r.pages]).toEqual([1, 1, [{ path: '/ca/ca-betta/', views: 1 }]])
  expect(r.excluded!.find(x => x.who === 'team')).toEqual({ who: 'team', sessions: 1, readers: 1 })
  expect(countedSessions(sessions).map(s => s.sid)).toEqual(['reader'])
  // The content pages' counts, and the scoreboard's, by the same rule.
  // (the fixture build's content.json: pnpm test builds the site first)
  const stats = JSON.parse(readFileSync(fileURLToPath(new URL('../../dist/_ab/content.json', import.meta.url).href), 'utf8')) as ContentStats
  const reads = joinReads(stats, countedSessions(sessions), [{ sid: 'mixed', p: '/ca/ca-neon-vua/', views: 2 }, { sid: 'reader', p: '/ca/ca-neon-vua/', views: 1 }], 14)
  expect(reads.top.map(p => [p.path, p.readers, p.views])).toEqual([['/ca/ca-neon-vua/', 1, 1]])
  const row = (t: string, who: number) => ({ sid: 'mixed', t, p: '/ca/ca-betta/', ref: '', cc: 'VN', first: '2026-11-07 01:00:00', v: 90, n: 1, who })
  expect(visitsOf([row('view', 0), row('scroll', 0), row('time', 3)])).toEqual([])
  expect(visitsOf([row('view', 0), row('scroll', 0)])).toHaveLength(1)
})

test('a view opened from one of our own pages keeps "=" as its referrer: never a burst, and not a source', async () => {
  const { e, points } = env()
  const view = (r: string) => new Request('https://x.test/_e', { method: 'POST', body: JSON.stringify({ p: '/ca/ca-betta/', t: 'view', v: 1, sid: 'abc123def456', r }), headers: { 'user-agent': IPHONE, 'accept-language': 'vi', origin: 'https://x.test', 'cf-connecting-ip': READER_IP } })
  await handle(view('x.test'), e)
  await handle(view('www.google.com'), e)
  expect(points.map(p => p.blobs[4])).toEqual(['=', 'www.google.com'])
})

test('the "this browser is ours" link sets the mark and takes it off', async () => {
  const { e } = env()
  const on = await handle(new Request('https://x.test/_e?us=on'), e)
  expect([on.status, on.headers.get('set-cookie'), on.headers.get('x-robots-tag')]).toEqual([200, 'aq_us=1; Path=/; Max-Age=31536000; Secure; SameSite=Lax', 'noindex, nofollow'])
  expect(await on.text()).toContain('This browser is marked as ours')
  expect((await handle(new Request('https://x.test/_e?us=off'), e)).headers.get('set-cookie')).toBe('aq_us=; Path=/; Max-Age=0; Secure; SameSite=Lax')
  expect((await handle(new Request('https://x.test/_e'), e)).status).toBe(405)
})

test('our network: the Mac\'s job reports its address, and that address\'s events are ours until it stops', async () => {
  const { e, points, store } = env()
  // A phone-shaped browser script on this network (Playwright's WebKit with an iPhone's user agent) looks like a reader...
  await handle(beacon({}, OURS_IP), e)
  expect(points.at(-1)!.blobs[0]).toBe('')
  // ...until the job reports the address: without the token nothing is kept, and only a keyed hash is.
  expect((await handle(ping(OURS_IP, 'wrong'), e)).status).toBe(404)
  expect(store.size).toBe(0)
  expect((await handle(ping(OURS_IP), e)).status).toBe(200)
  expect(store.get(NET_KEY)).not.toContain(OURS_IP)
  // Each report is kept, so the address stays ours exactly while the Mac is on it (it's a laptop).
  expect(NET_FOR_MS).toBeGreaterThan((10 + 5 + 1) * 60_000)
  await handle(beacon({}, OURS_IP), e)
  await handle(beacon({}, READER_IP), e)
  expect(points.slice(-2).map(p => p.blobs[0])).toEqual(['net', ''])
  // An address it stopped reporting is a reader's again (the address may go to someone else).
  const nets = JSON.parse(store.get(NET_KEY)!) as { h: string; seen: number }[]
  store.set(NET_KEY, JSON.stringify(nets.map(n => ({ ...n, seen: n.seen - NET_FOR_MS - 1 }))))
  await handle(beacon({}, OURS_IP), e)
  expect(points.at(-1)!.blobs[0]).toBe('')
})

test('a shop click counts only when it is a reader\'s: not from our browsers, the app\'s tabs, our network or the app', async () => {
  const { e } = env()
  const counted = async (headers: Record<string, string>, ip = READER_IP) => {
    const db = testD1()
    const waits: Promise<unknown>[] = []
    const req = new Request('https://x.test/go/shopee/?k=neon', { headers: { 'user-agent': IPHONE, 'accept-language': 'vi', 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate', 'cf-connecting-ip': ip, ...headers } })
    expect((await handle(req, { ...e, DB: db } as Env, p => { waits.push(p) })).status).toBe(302)
    await Promise.all(waits)
    return (await db.prepare('SELECT COUNT(*) AS n FROM clicks_daily').first<{ n: number }>())!.n
  }
  expect(await counted({})).toBe(1)
  expect(await counted({ cookie: 'aq_owner=1' })).toBe(0)
  expect(await counted({ cookie: 'aq_us=1' })).toBe(0)
  expect(await counted({ referer: 'https://x.test/ca/ca-betta/?aqcheck=1' })).toBe(0)
  expect(await counted({ 'user-agent': `${IPHONE} AquaTomeApp/1.0` })).toBe(0) // every copy is ours until it's on the App Store
  await handle(ping(OURS_IP), e)
  expect(await counted({}, OURS_IP)).toBe(0)
  expect(await counted({}, READER_IP)).toBe(1)
})

test("every reader count reads only unmarked events, or each tab's mark to leave it out", () => {
  expect(COUNTED).toContain("blob1 = ''")
  for (const sql of [VIEWS_SQL(14), PAGE_VIEWS_SQL(14)]) expect(sql).toContain(COUNTED)
  for (const sql of [SESSIONS_SQL(14), BEACON_SQL('2026-11-05T03:10:00Z')]) expect(sql).toContain(WHO_RANK)
  // A query over the beacon's dataset written anywhere in the Worker reads COUNTED or returns the tab's mark (the tests
  // above hold what reads it to leaving the tab out).
  const dir = fileURLToPath(new URL('..', import.meta.url).href)
  for (const f of ['readers.ts', 'lang-ask.ts', 'admin/content.ts', 'admin/scoreboard.ts']) {
    const src = readFileSync(`${dir}${f}`, 'utf8')
    const queries = [...src.matchAll(/`SELECT[^`]*FROM \$\{(?:table|EVENTS)\}[^`]*`/g)].map(m => m[0])
    expect(queries.length, f).toBeGreaterThan(0)
    for (const q of queries) expect(q.includes('${COUNTED}') || q.includes('${WHO_RANK}'), `${f}: ${q}`).toBe(true)
  }
})
