import { expect, test } from 'vitest'
import { handle, type Env } from '../index'
import { cleanWanted, PER_READER_DAY, readerOf, recordWanted, wantedKey, wantedRoute, type Wanted, type WantedEnv } from '../wanted'

const now = new Date('2026-11-02T03:00:00Z')
const CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'

/** KV as the Worker uses it here: JSON reads, writes with metadata and a lifetime, and the engine's list by prefix. */
function kv() {
  const m = new Map<string, { value: string; metadata?: unknown; ttl?: number }>()
  return {
    m,
    get: async (k: string, type?: string) => { const v = m.get(k)?.value; return v === undefined ? null : type === 'json' ? JSON.parse(v) : v },
    put: async (k: string, value: string, o: { metadata?: unknown; expirationTtl?: number } = {}) => { m.set(k, { value, metadata: o.metadata, ttl: o.expirationTtl }) },
  } as unknown as KVNamespace & { m: typeof m }
}
const env = (over: Partial<WantedEnv> = {}) => ({ AB: kv(), ACCOUNT_HMAC_KEY: 'key', ...over }) as WantedEnv & { AB: ReturnType<typeof kv> }
const post = (body: unknown, headers: Record<string, string> = {}) => new Request('https://x.test/api/v1/wanted', {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
  headers: { 'content-type': 'application/json', origin: 'https://x.test', 'user-agent': CHROME, 'accept-language': 'vi', 'cf-connecting-ip': '203.0.113.9', ...headers },
})
const counts = (e: ReturnType<typeof env>) => [...e.AB.m].filter(([k]) => k.startsWith('wanted:n:')).map(([k, v]) => [k, JSON.parse(v.value) as Wanted] as const)

test('a name worth keeping: a kind the tanks know, 2–80 characters with a letter; junk is not', () => {
  expect(cleanWanted({ kind: 'fish', name: '  Cá  bống mắt tre ', sci: ' Rhinogobius   duospilus ' })).toEqual({ kind: 'fish', name: 'Cá bống mắt tre', sci: 'Rhinogobius duospilus' })
  expect(cleanWanted({ kind: 'plant', name: 'Rêu suối' })).toEqual({ kind: 'plant', name: 'Rêu suối' })
  // A name that is a scientific name counts as one.
  expect(cleanWanted({ kind: 'fish', name: 'Corydoras sterbai' })).toEqual({ kind: 'fish', name: 'Corydoras sterbai', sci: 'Corydoras sterbai' })
  // A scientific name that isn't one is left out; the name still counts.
  expect(cleanWanted({ kind: 'fish', name: 'Cá lạ', sci: 'cá con màu xanh' })).toEqual({ kind: 'fish', name: 'Cá lạ' })
  expect(cleanWanted({ kind: 'fish', name: 'Cá lạ', sci: 'Corydoras' })).toEqual({ kind: 'fish', name: 'Cá lạ' })
  expect(cleanWanted({ kind: 'fish', name: 'Cá lạ', sci: `A${'b'.repeat(60)} ${'c'.repeat(60)}` })).toEqual({ kind: 'fish', name: 'Cá lạ' })
  for (const bad of [
    { kind: 'snail', name: 'Ốc' }, { kind: 'fish', name: 'x' }, { kind: 'fish', name: 'a'.repeat(81) }, { kind: 'fish', name: '12345' },
    { kind: 'fish', name: 'mua tại https://shop.vn' }, { kind: 'fish', name: 'shop.com ca dep' }, { kind: 'fish', name: 'gọi 0901234567' },
    { kind: 'fish', name: 'ai@mail' }, { kind: 'fish', name: 'cá\u0000lạ' }, { kind: 'fish', name: 42 }, { kind: 1, name: 'Cá' },
  ]) expect(cleanWanted(bad), JSON.stringify(bad)).toBeUndefined()
  // An L-number is a fish's name, not a phone number.
  expect(cleanWanted({ kind: 'fish', name: 'Pleco L046' })).toEqual({ kind: 'fish', name: 'Pleco L046' })
})

test('one count per name: by its scientific name (case, spacing, cf. aside), else by its name (accents and case aside)', () => {
  const k = (w: Parameters<typeof wantedKey>[0]) => wantedKey(w)
  expect(k({ kind: 'fish', name: 'Cá chuột', sci: 'Corydoras cf. Sterbai' })).toBe(k({ kind: 'fish', name: 'Cá khác', sci: 'Corydoras sterbai' }))
  expect(k({ kind: 'fish', name: 'Cá Bống Mắt Tre' })).toBe(k({ kind: 'fish', name: 'ca bong mat tre' }))
  expect(k({ kind: 'fish', name: 'Rêu' })).not.toBe(k({ kind: 'plant', name: 'Rêu' }))
})

test('the reader is an HMAC of the network and the day: the same all day, another tomorrow, never the address; none without a key', async () => {
  const req = (ip: string) => post({}, { 'cf-connecting-ip': ip })
  const today = await readerOf(req('203.0.113.9'), env(), now)
  expect(today).toMatch(/^[0-9a-f]{32}$/)
  expect(today).not.toContain('203')
  expect(await readerOf(req('203.0.113.9'), env(), new Date('2026-11-02T22:00:00Z'))).toBe(today)
  expect(await readerOf(req('203.0.113.9'), env(), new Date('2026-11-03T03:00:00Z'))).not.toBe(today)
  // One IPv6 /64 is one reader.
  expect(await readerOf(req('2001:db8:1:2::1'), env(), now)).toBe(await readerOf(req('2001:db8:1:2:aaaa::9'), env(), now))
  expect(await readerOf(req('203.0.113.9'), env({ ACCOUNT_HMAC_KEY: undefined, COMMENT_HMAC_KEY: 'c' }), now)).toMatch(/^[0-9a-f]{32}$/)
  expect(await readerOf(req('203.0.113.9'), env({ ACCOUNT_HMAC_KEY: undefined }), now)).toBeUndefined()
})

test('recordWanted counts each reader once a day per name, by source; what is kept is the name, never the reader', async () => {
  const e = env()
  const w = { kind: 'fish', name: 'Cá chuột sterbai', sci: 'Corydoras sterbai', source: 'tank' }
  expect(await recordWanted(e, { ...w, reader: 'a'.repeat(32) }, now)).toBe('counted')
  expect(await recordWanted(e, { ...w, name: 'Chuột sterbai', reader: 'a'.repeat(32) }, now)).toBe('again')
  expect(await recordWanted(e, { ...w, reader: 'b'.repeat(32) }, now)).toBe('counted')
  // The fish-ID tool's guesses no page matches: its own source, no reader to go by.
  expect(await recordWanted(e, { ...w, source: 'fish-id' }, new Date('2026-11-04T00:00:00Z'))).toBe('counted')
  expect(await recordWanted(e, { ...w, source: 'Tank Page!' }, now)).toBe('invalid')
  expect(await recordWanted(e, { kind: 'fish', name: 'http://x', source: 'tank' }, now)).toBe('invalid')
  const [[key, rec]] = counts(e) as [[string, Wanted]]
  expect(key).toBe('wanted:n:fish:s:corydoras sterbai')
  expect(rec).toEqual({ kind: 'fish', name: 'Cá chuột sterbai', sci: 'Corydoras sterbai', readers: 3, sources: { tank: 2, 'fish-id': 1 }, first: '2026-11-02', last: '2026-11-04' })
  // The engine lists names with their metadata, the same record.
  expect(e.AB.m.get(key)!.metadata).toEqual(rec)
  // A reader's day holds hashes of names, gone in two days.
  const day = e.AB.m.get(`wanted:r:${'a'.repeat(32)}`)!
  expect(day.ttl).toBe(172_800)
  expect(JSON.parse(day.value)).toEqual([expect.stringMatching(/^[0-9a-f]{12}$/)])
  expect(day.value).not.toMatch(/sterbai/i)
})

test(`a reader adds at most ${PER_READER_DAY} names a day`, async () => {
  const e = env()
  for (let i = 0; i < PER_READER_DAY; i++) expect(await recordWanted(e, { kind: 'plant', name: `Cây số ${i}`, source: 'tank', reader: 'r' }, now)).toBe('counted')
  expect(await recordWanted(e, { kind: 'plant', name: 'Cây nữa', source: 'tank', reader: 'r' }, now)).toBe('limited')
  // A name already counted today is still only "again".
  expect(await recordWanted(e, { kind: 'plant', name: 'Cây số 0', source: 'tank', reader: 'r' }, now)).toBe('again')
  expect(await recordWanted(e, { kind: 'plant', name: 'Cây nữa', source: 'tank', reader: 'other' }, now)).toBe('counted')
})

test('POST /api/v1/wanted: this site or the app, JSON, small; bots and the owner not counted; 400 junk, 429 past the day\'s names', async () => {
  const e = env()
  const ok = { kind: 'fish', name: 'Cá bống mắt tre', sci: 'Rhinogobius duospilus' }
  expect((await wantedRoute(post(ok), e, now)).status).toBe(204)
  expect(counts(e)).toHaveLength(1)
  expect((await wantedRoute(post(ok), e, now)).status).toBe(204) // again today: not counted twice
  expect(counts(e)[0]![1].readers).toBe(1)
  // The app sends no Origin.
  const app = post({ kind: 'plant', name: 'Rêu suối' }, { origin: '', 'user-agent': 'AquaTome/1 CFNetwork/1 Darwin/25', 'cf-connecting-ip': '198.51.100.7' })
  app.headers.delete('origin')
  expect((await wantedRoute(app, e, now)).status).toBe(204)
  expect(counts(e)).toHaveLength(2)
  expect((await wantedRoute(post(ok, { origin: 'https://evil.test' }), e, now)).status).toBe(403)
  expect((await wantedRoute(post(ok, { 'content-type': 'text/plain' }), e, now)).status).toBe(415)
  expect((await wantedRoute(new Request('https://x.test/api/v1/wanted'), e, now)).status).toBe(405)
  expect((await wantedRoute(post('{"kind":'), e, now)).status).toBe(400)
  expect((await wantedRoute(post([ok]), e, now)).status).toBe(400)
  expect((await wantedRoute(post({ ...ok, name: 'x'.repeat(2000) }), e, now)).status).toBe(413)
  expect((await wantedRoute(post({ kind: 'fish', name: 'www.cacanh.vn' }), e, now)).status).toBe(400)
  expect((await wantedRoute(post({ kind: 'fish', name: 'Cá bot' }, { 'user-agent': 'Googlebot/2.1' }), e, now)).status).toBe(204)
  expect((await wantedRoute(post({ kind: 'fish', name: 'Cá chủ' }, { cookie: 'aq_owner=1' }), e, now)).status).toBe(204)
  expect(counts(e)).toHaveLength(2)
  // Only kind, name and sci are read: a tank or an account sent along is not kept.
  await wantedRoute(post({ kind: 'plant', name: 'Cây thêm', tank: 'Bể 60', account: 'me', count: 3 }, { 'cf-connecting-ip': '192.0.2.1' }), e, now)
  expect(JSON.stringify([...e.AB.m.values()])).not.toMatch(/Bể 60|account|"me"|192\.0\.2/)
  expect((await wantedRoute(post(ok), env({ ACCOUNT_HMAC_KEY: undefined }), now)).status).toBe(503)
  for (let i = 0; i < PER_READER_DAY; i++) await wantedRoute(post({ kind: 'plant', name: `Cây ${i}` }, { 'cf-connecting-ip': '192.0.2.50' }), e, now)
  expect((await wantedRoute(post({ kind: 'plant', name: 'Cây quá' }, { 'cf-connecting-ip': '192.0.2.50' }), e, now)).status).toBe(429)
})

test('the Worker answers /api/v1/wanted itself, accounts on or off', async () => {
  const e = { ASSETS: { fetch: async () => new Response('') }, AB: kv(), COMMENT_HMAC_KEY: 'c' } as unknown as Env
  const r = await handle(post({ kind: 'fish', name: 'Cá bống mắt tre' }), e)
  expect(r.status).toBe(204)
  expect((await handle(post({ kind: 'fish', name: 'Cá bống mắt tre' }).clone(), e)).status).toBe(204)
  // Accounts stay off for everything else.
  expect((await handle(new Request('https://x.test/api/v1/tanks'), e)).status).toBe(404)
})
