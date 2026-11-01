import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { deleteUser } from '../accounts/users'
import { createSession } from '../accounts/session'
import { plugs, type PlugsDeps, type PlugsEnv } from '../plugs/api'
import { sign, tuyaCloud, TuyaError } from '../plugs/tuya'
import { testD1 } from './d1'

// docs/smart-plugs.md, protocols/plugs.openapi.json. Device and user ids here are made up.

const NOW = new Date('2026-11-01T00:00:00.000Z')

test("signs as Tuya's worked examples do (token request, then a business request)", async () => {
  const base = { id: '1KAD46OrT9HafiKdsXeg', secret: '4OHBOnWOqaEC1mWXOpVL3yV50s0qGSRC', t: '1588925778000', nonce: '5138cc3a9033d69856923fd07b491173', method: 'GET', headers: [['area_id', '29a33e8796834b1efa6'], ['call_id', '8afdb70ab2ed11eb85290242ac130003']] as [string, string][] }
  expect(await sign({ ...base, path: '/v1.0/token?grant_type=1' })).toBe('9E48A3E93B302EEECC803C7241985D0A34EB944F40FB573C7B5C2A82158AF13E')
  expect(await sign({ ...base, token: '3f4eda2bdec17232f67c0b188af3eec1', path: '/v2.0/apps/schema/users?page_size=50&page_no=1' })).toBe('AE4481C692AA80B25F3A7E12C3A5FD9BBF6251539DD78E565A1A72A508A88784')
})

const KEYS = { host: 'https://tuya.test', id: 'test-client', secret: 'test-secret' }
let clients = 0
type FakeDevice = { id: string; name: string; online: boolean; product_name?: string; status: { code: string; value: unknown }[]; ignores?: boolean }

/**
 * Tuya's cloud as the docs describe it, refusing any request whose signature doesn't check out. A device that `ignores`
 * commands accepts them and keeps its state (a plug that didn't switch).
 */
function fakeTuya(devices: Record<string, FakeDevice[]>) {
  // Its own client id: tokens are kept per client id across a worker instance (here, across tests).
  const keys = { ...KEYS, id: `test-client-${++clients}` }
  const log: { method: string; path: string; body?: unknown }[] = []
  let issued = 0, expireTime = 7200
  const live = new Set<string>()
  let failing = false
  const fetch = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input), path = url.pathname + url.search, method = init.method ?? 'GET'
    const h = init.headers as Record<string, string>
    const body = typeof init.body === 'string' ? init.body : undefined
    const ok = (result: unknown) => Response.json({ success: true, result })
    const no = (code: number) => Response.json({ success: false, code, msg: 'no' })
    if (failing) return new Response('upstream down', { status: 502 })
    const expected = await sign({ id: keys.id, secret: keys.secret, t: h.t!, nonce: h.nonce!, token: h.access_token, method, path, body })
    if (h.client_id !== keys.id || h.sign !== expected || h.sign_method !== 'HMAC-SHA256') return no(1004)
    log.push({ method, path, ...(body ? { body: JSON.parse(body) } : {}) })
    if (path === '/v1.0/token?grant_type=1') { const t = `token-${++issued}`; live.add(t); return ok({ access_token: t, expire_time: expireTime, uid: 'project' }) }
    if (!live.has(h.access_token!)) return no(1010)
    let m = /^\/v1\.0\/users\/([^/]+)\/devices$/.exec(path)
    if (m) return ok(devices[decodeURIComponent(m[1]!)] ?? [])
    const all = Object.values(devices).flat()
    m = /^\/v1\.0\/iot-03\/devices\/([^/]+)\/status$/.exec(path)
    if (m) return ok(all.find(d => d.id === m![1])?.status ?? [])
    m = /^\/v1\.0\/iot-03\/devices\/([^/]+)\/commands$/.exec(path)
    if (m && method === 'POST') {
      const d = all.find(x => x.id === m![1])
      for (const c of (JSON.parse(body!) as { commands: { code: string; value: unknown }[] }).commands) {
        const s = d?.status.find(x => x.code === c.code)
        if (s && !d!.ignores) s.value = c.value
      }
      return ok(true)
    }
    return no(1108)
  }) as typeof globalThis.fetch
  return { keys, fetch, log, expire: (s: number) => { expireTime = s }, revoke: () => live.clear(), down: (d: boolean) => { failing = d } }
}

const strip = (): FakeDevice => ({
  id: 'fake-strip-1', name: 'Ổ cắm bể 60', online: true, product_name: 'Ổ cắm 4 cổng',
  status: [{ code: 'switch_1', value: true }, { code: 'switch_2', value: false }, { code: 'switch_usb1', value: true }, { code: 'switch_led', value: true }, { code: 'countdown_1', value: 0 }],
})

test("a Tuya user's plugs: outlets only (not the indicator light or a countdown), devices without outlets left out", async () => {
  const tuya = fakeTuya({ u1: [strip(), { id: 'fake-sensor', name: 'Nhiệt kế', online: true, status: [{ code: 'va_temperature', value: 260 }] }] })
  const cloud = tuyaCloud(tuya.keys, { fetch: tuya.fetch, now: () => NOW.getTime() })
  expect(await cloud.plugs('u1')).toEqual([{ provider: 'tuya', id: 'fake-strip-1', name: 'Ổ cắm bể 60', model: 'Ổ cắm 4 cổng', online: true, outlets: [{ code: 'switch_1', on: true }, { code: 'switch_2', on: false }, { code: 'switch_usb1', on: true }] }])
})

test('a token is used until a minute before it runs out, and a revoked one is replaced once', async () => {
  const tuya = fakeTuya({ u2: [strip()] })
  let now = NOW.getTime()
  const cloud = tuyaCloud(tuya.keys, { fetch: tuya.fetch, now: () => now })
  await cloud.plugs('u2')
  await cloud.plugs('u2')
  const tokens = () => tuya.log.filter(l => l.path.startsWith('/v1.0/token')).length
  expect(tokens()).toBe(1)
  now += 7140_000 + 1 // past expire_time less the minute
  await cloud.plugs('u2')
  expect(tokens()).toBe(2)
  tuya.revoke()
  expect(await cloud.plugs('u2')).toHaveLength(1)
  expect(tokens()).toBe(3)
  tuya.down(true)
  await expect(cloud.plugs('u2')).rejects.toBeInstanceOf(TuyaError)
})

/** A signed-in account (app bearer token), its Tuya link if given, and the routes with a fake Tuya cloud. */
async function setup(o: { link?: string; devices?: Record<string, FakeDevice[]>; configured?: boolean; env?: Partial<PlugsEnv> } = {}) {
  const db = testD1()
  const env: PlugsEnv = { DB: db, ACCOUNTS: 'on', ACCOUNT_HMAC_KEY: 'k'.repeat(32), ...o.env }
  const tuya = fakeTuya(o.devices ?? { u1: [strip()] })
  const deps: PlugsDeps = o.configured === false ? {} : { tuya: tuyaCloud(tuya.keys, { fetch: tuya.fetch, now: () => NOW.getTime() }) }
  const user = async (id: string) => {
    await db.prepare(`INSERT INTO users (id, created_at) VALUES (?, ?)`).bind(id, NOW.toISOString()).run()
    return createSession(db, id, 'app', NOW)
  }
  const token = await user('user-1')
  if (o.link) await db.prepare(`INSERT INTO plug_links (user_id, provider, provider_uid, created_at) VALUES ('user-1', 'tuya', ?, ?)`).bind(o.link, NOW.toISOString()).run()
  const call = async (method: string, path: string, x: { body?: unknown; bearer?: string | null; cookie?: string } = {}) => {
    const headers: Record<string, string> = {}
    if (x.bearer !== null) headers.authorization = `Bearer ${x.bearer ?? token}`
    if (x.cookie) headers.cookie = x.cookie
    if (x.body !== undefined) headers['content-type'] = 'application/json'
    const req = new Request(`https://x.test${path}`, { method, headers, ...(x.body !== undefined ? { body: JSON.stringify(x.body) } : {}) })
    const res = await plugs(req, new URL(req.url), env, NOW, deps)
    const text = await res.text()
    return { status: res.status, json: text ? JSON.parse(text) : undefined }
  }
  return { db, call, tuya, user }
}

const SWITCH = '/api/v1/plugs/tuya/devices/fake-strip-1/outlets/switch_2'

test('signed out, or accounts off: nothing about plugs', async () => {
  const { call } = await setup({ link: 'u1' })
  expect(await call('GET', '/api/v1/plugs', { bearer: null })).toEqual({ status: 401, json: { error: 'signed_out' } })
  const off = await setup({ link: 'u1', env: { ACCOUNTS: undefined } })
  expect(await off.call('GET', '/api/v1/plugs')).toEqual({ status: 404, json: { error: 'accounts_off' } })
})

test('the list: nothing linked yet, then the linked Smart Life account\'s plugs as they are now', async () => {
  const empty = await setup()
  expect((await empty.call('GET', '/api/v1/plugs')).json).toEqual({ providers: [{ id: 'tuya', linked: false, available: false }, { id: 'ewelink', linked: false, available: false }], plugs: [] })
  const { call, tuya } = await setup({ link: 'u1' })
  const r = await call('GET', '/api/v1/plugs')
  expect(r.status).toBe(200)
  expect(r.json.providers[0]).toEqual({ id: 'tuya', linked: true, available: false })
  expect(r.json.plugs).toEqual([{ provider: 'tuya', id: 'fake-strip-1', name: 'Ổ cắm bể 60', model: 'Ổ cắm 4 cổng', online: true, outlets: [{ code: 'switch_1', on: true }, { code: 'switch_2', on: false }, { code: 'switch_usb1', on: true }] }])
  expect(tuya.log.some(l => l.method === 'POST'), 'listing switches nothing').toBe(false)
})

test("a maker that can't be reached shows its problem; the list still answers", async () => {
  const { call, tuya } = await setup({ link: 'u1' })
  tuya.down(true)
  expect((await call('GET', '/api/v1/plugs')).json).toEqual({ providers: [{ id: 'tuya', linked: true, available: false, problem: 'unreachable' }, { id: 'ewelink', linked: false, available: false }], plugs: [] })
  const unconfigured = await setup({ link: 'u1', configured: false })
  expect((await unconfigured.call('GET', '/api/v1/plugs')).json.providers[0]).toEqual({ id: 'tuya', linked: true, available: false, problem: 'unreachable' })
})

test('switching sends one command and answers with what the plug then reports, not what was asked', async () => {
  const { call, tuya } = await setup({ link: 'u1' })
  expect(await call('POST', SWITCH, { body: { on: true } })).toEqual({ status: 200, json: { outlet: { code: 'switch_2', on: true } } })
  expect(tuya.log.filter(l => l.method === 'POST')).toEqual([{ method: 'POST', path: '/v1.0/iot-03/devices/fake-strip-1/commands', body: { commands: [{ code: 'switch_2', value: true }] } }])
  const stuck = await setup({ link: 'u1', devices: { u1: [{ ...strip(), ignores: true }] } })
  expect((await stuck.call('POST', SWITCH, { body: { on: true } })).json).toEqual({ outlet: { code: 'switch_2', on: false } })
})

test('switching is refused for a plug or outlet not the account\'s, an offline plug, or a bad body, and nothing is sent', async () => {
  const { call, tuya } = await setup({ link: 'u1', devices: { u1: [strip(), { ...strip(), id: 'fake-offline', online: false }], other: [{ ...strip(), id: 'fake-not-mine' }] } })
  expect(await call('POST', '/api/v1/plugs/tuya/devices/fake-not-mine/outlets/switch_1', { body: { on: true } })).toEqual({ status: 404, json: { error: 'no_such_plug' } })
  expect(await call('POST', '/api/v1/plugs/tuya/devices/fake-strip-1/outlets/switch_led', { body: { on: false } })).toEqual({ status: 404, json: { error: 'no_such_outlet' } })
  expect(await call('POST', '/api/v1/plugs/tuya/devices/fake-offline/outlets/switch_1', { body: { on: true } })).toEqual({ status: 409, json: { error: 'offline' } })
  expect((await call('POST', SWITCH, { body: { on: 'yes' } })).json).toEqual({ error: 'bad_request' })
  expect(tuya.log.filter(l => l.method === 'POST')).toEqual([])
  const unlinked = await setup()
  expect(await unlinked.call('POST', SWITCH, { body: { on: true } })).toEqual({ status: 404, json: { error: 'not_linked' } })
  const down = await setup({ link: 'u1' })
  down.tuya.down(true)
  expect(await down.call('POST', SWITCH, { body: { on: true } })).toEqual({ status: 502, json: { error: 'maker_error' } })
})

test('switches are limited to 30 a minute per account', async () => {
  const { call } = await setup({ link: 'u1' })
  for (let i = 0; i < 30; i++) expect((await call('POST', SWITCH, { body: { on: i % 2 === 0 } })).status).toBe(200)
  expect(await call('POST', SWITCH, { body: { on: true } })).toEqual({ status: 429, json: { error: 'rate_limited' } })
})

test("a browser's change must come from the site's pages", async () => {
  const { call, db } = await setup({ link: 'u1' })
  const cookieToken = await createSession(db, 'user-1', 'web', NOW)
  expect(await call('POST', SWITCH, { bearer: null, cookie: `__Host-aq_session=${cookieToken}`, body: { on: true } })).toEqual({ status: 403, json: { error: 'cross_site' } })
})

test('linking: not open to every account yet; unlinking removes the link; makers without keys are not configured', async () => {
  const { call, db } = await setup()
  expect(await call('POST', '/api/v1/plugs/tuya/link')).toEqual({ status: 403, json: { error: 'not_available' } })
  expect(await call('POST', '/api/v1/plugs/ewelink/link')).toEqual({ status: 503, json: { error: 'not_configured' } })
  expect(await call('POST', '/api/v1/plugs/acme/link')).toEqual({ status: 404, json: { error: 'unknown_provider' } })
  const linked = await setup({ link: 'u1' })
  expect(await linked.call('POST', '/api/v1/plugs/tuya/link')).toEqual({ status: 409, json: { error: 'already_linked' } })
  expect((await linked.call('DELETE', '/api/v1/plugs/tuya/link')).status).toBe(204)
  expect(await linked.db.prepare(`SELECT COUNT(*) AS n FROM plug_links`).first()).toEqual({ n: 0 })
  expect((await linked.call('GET', '/api/v1/plugs')).json.plugs).toEqual([])
  expect(await call('GET', '/api/v1/plugs/tuya/callback?state=x&code=y', { bearer: null })).toEqual({ status: 400, json: { error: 'bad_state' } })
  void db
})

test("deleting the account deletes its plug links", async () => {
  const { db } = await setup({ link: 'u1' })
  await deleteUser(db, 'user-1')
  expect(await db.prepare(`SELECT COUNT(*) AS n FROM plug_links`).first()).toEqual({ n: 0 })
})

test('every path in the API contract (protocols/plugs.openapi.json) is served', async () => {
  const api = JSON.parse(readFileSync(fileURLToPath(new URL('../../../../protocols/plugs.openapi.json', import.meta.url).href), 'utf8')) as { paths: Record<string, Record<string, unknown>> }
  const { call } = await setup({ link: 'u1' })
  for (const [path, ops] of Object.entries(api.paths)) {
    for (const method of Object.keys(ops)) {
      const concrete = path.replace('{provider}', 'tuya').replace('{device}', 'fake-strip-1').replace('{code}', 'switch_1')
      const r = await call(method.toUpperCase(), concrete, method === 'post' && path.includes('outlets') ? { body: { on: true } } : {})
      expect(r.json?.error, `${method.toUpperCase()} ${path}`).not.toBe('not_found')
    }
  }
})
