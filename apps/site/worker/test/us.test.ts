import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { handle, type Env } from '../index'
import { COUNTED } from '../admin/ae'
import { PAGE_VIEWS_SQL } from '../admin/content'
import { BEACON_SQL } from '../admin/scoreboard'
import { OURS_SQL, SESSIONS_SQL, VIEWS_SQL } from '../readers'
import { NET_FOR_MS, NET_KEY } from '../us'

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

test('a page our app copy opened (aqcheck=1) marks the browser, so its next pages are ours too', async () => {
  const { e } = env()
  const first = await handle(beacon({ referer: 'https://x.test/gioi-thieu/?aqcheck=1' }), e)
  expect(first.headers.get('set-cookie')).toBe('aq_us=1; Path=/; Max-Age=31536000; Secure; SameSite=Lax')
  // A reader's page, or a browser already marked, sets nothing.
  expect((await handle(beacon({ referer: 'https://x.test/gioi-thieu/' }), e)).headers.get('set-cookie')).toBeNull()
  expect((await handle(beacon({ referer: 'https://x.test/?aqcheck=1', cookie: 'aq_us=1' }), e)).headers.get('set-cookie')).toBeNull()
  expect((await handle(beacon({ referer: 'https://x.test/?aqcheck=0' }), e)).headers.get('set-cookie')).toBeNull()
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
  await handle(beacon({}, OURS_IP), e)
  await handle(beacon({}, READER_IP), e)
  expect(points.slice(-2).map(p => p.blobs[0])).toEqual(['net', ''])
  // An address it stopped reporting is a reader's again (the address may go to someone else).
  const nets = JSON.parse(store.get(NET_KEY)!) as { h: string; seen: number }[]
  store.set(NET_KEY, JSON.stringify(nets.map(n => ({ ...n, seen: n.seen - NET_FOR_MS - 1 }))))
  await handle(beacon({}, OURS_IP), e)
  expect(points.at(-1)!.blobs[0]).toBe('')
})

test('every reader count reads only unmarked events', () => {
  expect(COUNTED).toContain("blob1 = ''")
  for (const sql of [SESSIONS_SQL(14), VIEWS_SQL(14), PAGE_VIEWS_SQL(14), BEACON_SQL('2026-11-05T03:10:00Z')]) expect(sql).toContain(COUNTED)
  expect(OURS_SQL(14)).toContain("blob1 != ''")
  // A query over the beacon's dataset written anywhere in the Worker goes through COUNTED (or is the one that counts us).
  const dir = fileURLToPath(new URL('..', import.meta.url).href)
  for (const f of ['readers.ts', 'lang-ask.ts', 'admin/content.ts', 'admin/scoreboard.ts']) {
    const src = readFileSync(`${dir}${f}`, 'utf8')
    for (const q of src.match(/FROM \$\{(?:table|EVENTS)\}[^`]*/g) ?? []) expect(q.includes('${COUNTED}') || q.includes("blob1 != ''"), `${f}: ${q}`).toBe(true)
  }
})
