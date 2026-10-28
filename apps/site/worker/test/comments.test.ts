import { expect, test } from 'vitest'
import { applyDecisions, ipDayKey, ipUnit, listComments, moderationQueue, postComment, purgeRemoved, type CommentsEnv } from '../comments/api'
import { checkRules, parseComment } from '../comments/rules'
import { handle, type Env } from '../index'
import { testD1 } from './d1'

const now = new Date('2026-10-29T03:00:00Z')
const c = (body: string, name = 'Lộc') => ({ entityRef: 'species:betta-splendens', name, body })
const ok = { duplicate: false, postsToday: 1 }

function kv() {
  const m = new Map<string, string>()
  return { m, get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v) } } as unknown as KVNamespace & { m: Map<string, string> }
}
function env(over: Partial<CommentsEnv> = {}) {
  return { DB: testD1(), AB: kv(), TURNSTILE_SECRET: 's', TURNSTILE_SITEKEY: 'site', COMMENT_HMAC_KEY: 'hmac', ...over } as CommentsEnv & { DB: D1Database; AB: ReturnType<typeof kv> }
}
const post = (body: object, headers: Record<string, string> = {}) =>
  new Request('https://x.test/_c', { method: 'POST', body: JSON.stringify(body), headers: { origin: 'https://x.test', 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9', ...headers } })
const pass = async () => true
const send = (e: CommentsEnv, body: string, extra: object = {}) => postComment(post({ e: 'species:betta-splendens', name: 'Lộc', body, token: 't', ...extra }), e, now, pass)
const list = async (e: CommentsEnv, ref = 'species:betta-splendens') => (await (await listComments(new URL(`https://x.test/_c?e=${ref}`), e)).json()) as { comments: { body: string }[] }

test('shape: name 1–40, body 2–2000, known entity type', () => {
  expect(parseComment({ e: 'species:x', name: ' A ', body: 'hi' })).toEqual({ entityRef: 'species:x', name: 'A', body: 'hi' })
  expect(parseComment({ e: 'user:x', name: 'A', body: 'hi' })).toBe('bad entity')
  expect(parseComment({ e: 'species:x', name: '', body: 'hi' })).toMatch(/name/)
  expect(parseComment({ e: 'species:x', name: 'x'.repeat(41), body: 'hi' })).toMatch(/name/)
  expect(parseComment({ e: 'species:x', name: 'A', body: 'h' })).toMatch(/comment/)
  expect(parseComment({ e: 'species:x', name: 'A', body: 'h'.repeat(2001) })).toMatch(/comment/)
})

test('rules truth table', () => {
  expect(checkRules(c('Cá của mình sống tốt ở 26°C, pH 6.5.'), ok)).toEqual({ ok: true })
  expect(checkRules(c('Xem thêm https://a.vn'), ok)).toEqual({ ok: true }) // one link is fine
  expect(checkRules(c('https://a.vn và https://b.vn'), ok)).toEqual({ held: 'more than one link' })
  expect(checkRules(c('<b>hi</b>'), ok)).toEqual({ held: 'contains <' })
  expect(checkRules(c('hi', '<img>'), ok)).toEqual({ held: 'contains <' })
  expect(checkRules(c('Nhà cái uy tín'), ok)).toMatchObject({ held: expect.stringMatching(/blocked/) })
  expect(checkRules(c('hello'), { duplicate: true, postsToday: 1 })).toEqual({ held: 'duplicate within 24 h' })
  expect(checkRules(c('hello'), { duplicate: false, postsToday: 6 })).toEqual({ held: 'more than 5 posts today' })
  expect(checkRules(c('Cách sexing cá betta? Unisex?'), ok)).toEqual({ ok: true })
  expect(checkRules(c('xem sex free'), ok)).toMatchObject({ held: 'blocked term: sex' })
  expect(checkRules(c('Nha\u0300 ca\u0301i'), ok)).toMatchObject({ held: expect.stringMatching(/blocked/) }) // decomposed Vietnamese
})

test('clean comment appears at once; held comment is never public', async () => {
  const e = env()
  const r = await send(e, 'Bể 60 lít nuôi được mấy con?')
  expect(r.status).toBe(201)
  expect(await r.json()).toMatchObject({ status: 'approved', comment: { name: 'Lộc', body: 'Bể 60 lít nuôi được mấy con?' } })
  expect(await (await send(e, 'mua tại https://a.vn https://b.vn')).json()).toEqual({ status: 'held' })
  expect((await list(e)).comments.map(x => x.body)).toEqual(['Bể 60 lít nuôi được mấy con?'])
  expect((await list(e, 'species:other')).comments).toEqual([])
})

test('Turnstile failure or missing token → 403, nothing stored', async () => {
  const e = env()
  expect((await postComment(post({ e: 'species:x', name: 'A', body: 'hi', token: 't' }), e, now, async () => false)).status).toBe(403)
  expect((await postComment(post({ e: 'species:x', name: 'A', body: 'hi' }), e, now, pass)).status).toBe(403)
  expect(await e.DB.prepare('SELECT COUNT(*) AS n FROM comments').first()).toEqual({ n: 0 })
})

test('cross-origin POST is refused', async () => {
  expect((await postComment(post({ e: 'species:x', name: 'A', body: 'hi', token: 't' }, { origin: 'https://evil.test' }), env(), now, pass)).status).toBe(403)
})

test('rate limit keys on an HMAC of IP + day; the IP is never stored', async () => {
  const e = env()
  for (let i = 0; i < 6; i++) await send(e, `câu hỏi số ${i}`)
  expect(await (await send(e, 'câu hỏi thứ bảy')).json()).toEqual({ status: 'held' })
  const keys = [...e.AB.m.keys()]
  expect(keys).toEqual([await ipDayKey('hmac', '203.0.113.9', now)])
  expect(keys[0]).toMatch(/^rl:[0-9a-f]{32}$/)
  expect(await ipDayKey('hmac', '203.0.113.9', new Date('2026-10-30T03:00:00Z'))).not.toBe(keys[0])
  const rows = JSON.stringify((await e.DB.prepare('SELECT * FROM comments').all()).results)
  expect(rows).not.toContain('203.0.113')
  expect(keys[0]).not.toContain('203.0.113')
})

test('duplicate body on the same page within 24 h is held; other pages are fine', async () => {
  const e = env()
  await send(e, 'Cảm ơn bạn')
  expect(await (await send(e, 'Cảm ơn bạn')).json()).toEqual({ status: 'held' })
  expect(await (await send(e, 'Cảm ơn bạn', { e: 'plant:x' })).json()).toMatchObject({ status: 'approved' })
})

test('IPv6 addresses are limited per /64', async () => {
  expect(ipUnit('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2')
  expect(ipUnit('203.0.113.9')).toBe('203.0.113.9')
  expect(await ipDayKey('k', '2001:db8:1:2::1', now)).toBe(await ipDayKey('k', '2001:db8:1:2:ffff::9', now))
})

test('oversized body is refused even without content-length (chunked)', async () => {
  const big = new TextEncoder().encode(JSON.stringify({ e: 'species:x', name: 'A', body: 'x'.repeat(9000), token: 't' }))
  const stream = new ReadableStream({ start(ctl) { ctl.enqueue(big.slice(0, 5000)); ctl.enqueue(big.slice(5000)); ctl.close() } })
  const req = new Request('https://x.test/_c', { method: 'POST', body: stream, headers: { origin: 'https://x.test' }, duplex: 'half' } as RequestInit)
  expect((await postComment(req, env(), now, pass)).status).toBe(413)
})

test('keep_held never unpublishes; deferred held comments come back after a week; unseen approved never age out', async () => {
  const e = env()
  await send(e, 'Đã đăng từ lâu')
  await send(e, '<i>giữ lại</i>')
  const later = new Date('2026-11-15T00:00:00Z') // home machine was off for 2+ weeks
  const q = await moderationQueue(e.DB, later)
  expect(q).toHaveLength(2)
  await applyDecisions(e.DB, q.map(x => ({ id: x.id, action: 'keep_held', helpful: false, reason: 'unsure' })), later)
  expect((await list(e)).comments.map(x => x.body)).toEqual(['Đã đăng từ lâu'])
  expect(await moderationQueue(e.DB, new Date('2026-11-20T00:00:00Z'))).toEqual([])
  expect((await moderationQueue(e.DB, new Date('2026-11-23T00:00:00Z'))).map(x => x.body)).toEqual(['<i>giữ lại</i>'])
})

test('Decree 147 hook: phone mode → 403 verification_required', async () => {
  const r = await send(env({ COMMENT_VERIFICATION: 'phone' }), 'hello')
  expect(r.status).toBe(403)
  expect(await r.json()).toEqual({ error: 'verification_required' })
})

test('without D1 (or secrets) comments are off: 503', async () => {
  expect((await listComments(new URL('https://x.test/_c?e=species:x'), env({ DB: undefined }))).status).toBe(503)
  expect((await send(env({ TURNSTILE_SECRET: undefined }), 'hello')).status).toBe(503)
})

test('moderation: queue = held + unseen approved; decisions apply; unknown ids are no-ops; removed purge after 30 days', async () => {
  const e = env()
  await send(e, 'Câu trả lời rất chi tiết')
  await send(e, 'spam https://a.vn https://b.vn')
  const q = await moderationQueue(e.DB, now)
  expect(q.map(x => x.status).sort()).toEqual(['approved', 'held'])
  const [good, spam] = [q.find(x => x.status === 'approved')!, q.find(x => x.status === 'held')!]
  const res = await applyDecisions(e.DB, [
    { id: good.id, action: 'approve', helpful: true, reason: 'answers the question' },
    { id: spam.id, action: 'remove', helpful: false, reason: 'link spam' },
    { id: 'nope', action: 'approve', helpful: false, reason: 'x' },
    { id: good.id, action: 'delete-all', helpful: false, reason: 'x' },
  ], now)
  expect(res).toEqual({ applied: 2, ignored: 2 })
  expect(await moderationQueue(e.DB, now)).toEqual([])
  expect(await list(e)).toMatchObject({ comments: [{ body: 'Câu trả lời rất chi tiết', helpful: true }] })
  expect(await purgeRemoved(e.DB, new Date('2026-11-20T00:00:00Z'))).toBe(0)
  expect(await purgeRemoved(e.DB, new Date('2026-12-01T00:00:00Z'))).toBe(1)
})

test('admin routes need the bearer token; 503 without D1', async () => {
  const base = { ASSETS: { fetch: async () => new Response('') }, AB: kv(), AB_DASH_TOKEN: 'tok' } as unknown as Env
  const q = (auth?: string, extra: Partial<Env> = {}) => handle(new Request('https://x.test/_c/admin/queue', { headers: auth ? { authorization: auth } : {} }), { ...base, ...extra })
  expect((await q()).status).toBe(404)
  expect((await q('Bearer wrong', { DB: testD1() })).status).toBe(404)
  expect((await q('Bearer tok')).status).toBe(503)
  expect(await (await q('Bearer tok', { DB: testD1() })).json()).toEqual([])
})
