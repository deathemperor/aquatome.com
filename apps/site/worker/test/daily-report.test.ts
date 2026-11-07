import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createSession, sha256 } from '../accounts/session'
import { deleteUser } from '../accounts/users'
import { NAV, WEB_PAGES } from '../admin/shell'
import { ADMIN_PAGES, SECTIONS } from '../dashboard'
import { addChanges, CHANGELOG_KEY } from '../daily/changelog'
import { LOG_PREFIX, LOG_TTL, type Report } from '../daily/log'
import { addDevice, TOKENS_KEY } from '../daily/push'
import { SETTINGS_KEY } from '../daily/settings'
import { handle, type Env } from '../index'
import { testD1 } from './d1'
import * as S from './owner-sample'

afterEach(() => { vi.restoreAllMocks() })
/** The scoreboard's load asks GitHub for its live-check issues (admin/scoreboard.ts queryChecks): none here, and no other request leaves. */
const GITHUB_API = 'https://api.github.com/'
const offline = async (u: string | URL | Request) => (String(u).startsWith(GITHUB_API) ? Response.json([]) : new Response('offline', { status: 599 }))
beforeEach(() => { vi.spyOn(globalThis, 'fetch').mockImplementation(offline) })

const REPO = 'https://github.com/deathemperor/aquatome.com'
const TOKEN = 'dashtoken-0123456789'
const ADDRESS = 'owner@example.com'
/** What a report's answer says of the phones while push is off, as it is until the owner turns it on. */
const OFF = { push: { sent: 0, why: 'push_off' } }
const nothing = { total: 0, items: [] }
const runs = { runs: 0, failed: 0 }
const body = (runId = '1001', over: Record<string, unknown> = {}) => JSON.stringify({
  runId, runUrl: `${REPO}/actions/runs/${runId}`, since: '2026-11-05T00:00:00Z', missing: [], changes: [], deploys: runs, engine: runs, commits: { total: 0, parts: [] },
  ios: runs, testflight: { uploads: [], failed: 0 }, appStore: runs, watch: runs, failing: [], issues: nothing, notes: 0, prs: { ready: nothing, draft: nothing }, ...over,
})

type Put = { value: string; opts?: { expirationTtl?: number; metadata?: unknown } }
function kv() {
  const m = new Map<string, Put>()
  const ns = {
    get: async (k: string, o?: string | { type?: string }) => {
      const v = m.get(k)?.value
      if (v === undefined) return null
      return (typeof o === 'string' ? o : o?.type) === 'json' ? JSON.parse(v) : v
    },
    put: async (k: string, value: string, opts?: Put['opts']) => { m.set(k, { value, opts }) },
    list: async ({ prefix = '' }: { prefix?: string } = {}) => ({ keys: [...m].filter(([k]) => k.startsWith(prefix)).map(([name, x]) => ({ name, metadata: x.opts?.metadata })), list_complete: true }),
  } as unknown as KVNamespace
  return { m, ns }
}

function world(over: Record<string, unknown> = {}) {
  const ab = kv()
  const db = testD1()
  const send = vi.fn(async (_m: { to: string; from: { email: string; name: string }; subject: string; text: string; html?: string }) => ({ messageId: 'm1' }))
  const e = {
    ASSETS: { fetch: async () => Response.json(S.STATS) }, AB: ab.ns, DB: db, AB_DASH_TOKEN: TOKEN, REPORT_TO: ADDRESS, EMAIL: { send }, OWNER_ACCOUNTS: 'owner-1', ...over,
  } as unknown as Env
  return { e, ab, db, send }
}
const post = (e: Env, b = body(), headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }) => handle(new Request('https://x.test/_ab/report', { method: 'POST', headers, body: b }), e)
const stored = (w: ReturnType<typeof world>, id = '1001') => JSON.parse(w.ab.m.get(`${LOG_PREFIX}${id}`)!.value) as Report

test('POST /_ab/report: the dashboard token only; anyone else is not found, and nothing happens', async () => {
  const w = world()
  const db = w.db
  await db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind('owner-1', '2026-11-01T00:00:00Z').run()
  const now = new Date()
  const cookie = `__Host-aq_session=${await createSession(db, 'owner-1', 'web', now)}`
  const app = await createSession(db, 'owner-1', 'app', now)
  for (const h of [{}, { authorization: 'Bearer wrong' }, { authorization: `Bearer ${TOKEN}x` }, { authorization: TOKEN.slice(0, 5) }, { cookie }, { authorization: `Bearer ${app}` }] as Record<string, string>[]) {
    const r = await post(w.e, body(), h)
    expect(r.status, JSON.stringify(Object.keys(h))).toBe(404)
    expect(r.headers.get('cache-control')).toBe('no-store')
  }
  expect(w.send).not.toHaveBeenCalled()
  expect(w.ab.m.size).toBe(0)
  // Any other method, even with the token; and no token set means no way in.
  expect((await handle(new Request('https://x.test/_ab/report', { headers: { authorization: `Bearer ${TOKEN}` } }), w.e)).status).toBe(404)
  expect((await post(world({ AB_DASH_TOKEN: undefined }).e, body(), { authorization: 'Bearer ' })).status).toBe(404)
  const ok = await post(w.e)
  expect(ok.status).toBe(200)
  expect(await ok.json()).toEqual({ ok: true, id: '1001', sent: true, ...OFF })
  expect(w.send).toHaveBeenCalledTimes(1)
})

test('a body of the wrong shape, or too large, is refused and nothing is stored or sent', async () => {
  const w = world()
  for (const b of ['not json', '{}', body('abc'), body('1', { runUrl: 'https://evil.test/x' })]) expect((await post(w.e, b)).status, b.slice(0, 40)).toBe(400)
  expect((await post(w.e, 'x'.repeat(128 * 1024 + 1))).status).toBe(413)
  expect(w.ab.m.size).toBe(0)
  expect(w.send).not.toHaveBeenCalled()
})

test('the send: from the report\'s own sender to REPORT_TO, text and HTML; the same report in the log for 90 days', async () => {
  const w = world()
  expect((await post(w.e, body('1001', { changes: [{ area: 'Site', text: 'Readers can attach one photo to a comment.', at: '2026-11-05T10:00:00Z' }] }))).status).toBe(200)
  const mail = w.send.mock.calls[0]![0]
  expect(mail.to).toBe(ADDRESS)
  expect(mail.from).toEqual({ email: 'bao-cao@aquatome.com', name: 'AquaTome' })
  expect(mail.subject).toMatch(/^AquaTome daily · \d+ \w+ · \d+ needs? care$/)
  expect(mail.text).toContain('  Site:\n  - Readers can attach one photo to a comment.')
  expect(mail.html).toContain('Readers can attach one photo to a comment.</li>')
  const put = w.ab.m.get(`${LOG_PREFIX}1001`)!
  expect(put.opts?.expirationTtl).toBe(90 * 86_400)
  expect(LOG_TTL).toBe(90 * 86_400)
  const r = JSON.parse(put.value) as Report
  expect(r).toMatchObject({ subject: mail.subject, text: mail.text, html: mail.html, sent: true })
  expect(r).not.toHaveProperty('why')
  expect(Date.parse(r.when)).toBeGreaterThan(0)
  expect(put.opts?.metadata).toEqual({ when: r.when, subject: r.subject, sent: true, ...OFF, care: r.care })
})

test('the sender is one the binding allows', async () => {
  const { readFileSync } = await import('node:fs')
  const wrangler = readFileSync(new URL('../../wrangler.jsonc', import.meta.url).pathname, 'utf8')
  expect(wrangler).toMatch(/"allowed_sender_addresses": \[[^\]]*"bao-cao@aquatome\.com"/)
})

test('no REPORT_TO: kept in the log as not sent, no recipient, and answered 200; sent once it is set', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const w = world({ REPORT_TO: undefined })
  const r = await post(w.e)
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual({ ok: true, id: '1001', sent: false, why: 'no_recipient', ...OFF })
  expect(w.send).not.toHaveBeenCalled()
  expect(stored(w)).toMatchObject({ sent: false, why: 'no_recipient' })
  // The job run again, same id: still nothing to send, still one report.
  expect((await post(w.e)).status).toBe(200)
  expect([...w.ab.m.keys()].filter(k => k.startsWith(LOG_PREFIX))).toHaveLength(1)
  const first = stored(w)
  ;(w.e as unknown as { REPORT_TO: string }).REPORT_TO = ADDRESS
  expect(await (await post(w.e)).json()).toEqual({ ok: true, id: '1001', sent: true, ...OFF })
  expect(w.send.mock.calls[0]![0].text).toBe(first.text)
  expect(stored(w)).toMatchObject({ sent: true, when: first.when })
  expect(stored(w)).not.toHaveProperty('why')
  log.mockRestore()
})

test('no EMAIL binding: not sent, said so, and the job fails', async () => {
  const w = world({ EMAIL: undefined })
  const r = await post(w.e)
  expect(r.status).toBe(502)
  expect(await r.json()).toEqual({ ok: false, id: '1001', sent: false, why: 'no_binding', ...OFF })
  expect(stored(w).why).toBe('no_binding')
})

test('the same run id never sends twice: after the send, and at the same moment', async () => {
  const w = world()
  await post(w.e)
  const again = await post(w.e)
  expect(again.status).toBe(200)
  expect(await again.json()).toEqual({ ok: true, id: '1001', sent: true, ...OFF, duplicate: true })
  expect(w.send).toHaveBeenCalledTimes(1)
  // Two at once (a retry while the first still runs): one goes on, the other is told to wait.
  const x = world()
  const both = await Promise.all([post(x.e, body('2002')), post(x.e, body('2002'))])
  expect(both.map(r => r.status).sort()).toEqual([200, 409])
  expect(x.send).toHaveBeenCalledTimes(1)
  // A later run is a new report.
  await post(w.e, body('1002'))
  expect(w.send).toHaveBeenCalledTimes(2)
})

test('a report sent but not logged is not sent again', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const w = world()
  const put = w.ab.ns.put
  const down = vi.fn(async () => { throw new Error('KV 429') })
  const e = { ...w.e, AB: Object.assign(Object.create(w.ab.ns), { put: down }) } as unknown as Env
  expect((await post(e)).status).toBe(503)
  expect(w.send).toHaveBeenCalledTimes(1)
  // The claim stays: the retry is told a try is in progress, and the job shows it.
  expect((await post({ ...w.e, AB: { ...w.ab.ns, put } } as unknown as Env)).status).toBe(409)
  expect(w.send).toHaveBeenCalledTimes(1)
  log.mockRestore()
})

test('a refused send: logged by its code only, kept as not sent, the job told; the next try sends the same report', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const w = world()
  w.send.mockRejectedValueOnce(Object.assign(new Error(`can't send to ${ADDRESS}`), { code: 'E_RECIPIENT_NOT_ALLOWED' }))
  const r = await post(w.e)
  expect(r.status).toBe(502)
  expect(await r.json()).toEqual({ ok: false, id: '1001', sent: false, why: 'E_RECIPIENT_NOT_ALLOWED', ...OFF })
  expect(log).toHaveBeenCalledWith('daily report not sent:', 'E_RECIPIENT_NOT_ALLOWED')
  const first = stored(w)
  expect(first).toMatchObject({ sent: false, why: 'E_RECIPIENT_NOT_ALLOWED' })
  expect((await post(w.e)).status).toBe(200)
  expect(w.send).toHaveBeenCalledTimes(2)
  expect(w.send.mock.calls[1]![0].text).toBe(first.text)
  expect(stored(w)).toMatchObject({ sent: true, when: first.when })
  // An error with no code, or a "code" that isn't one, is unknown.
  for (const code of [undefined, ADDRESS, 'x'.repeat(41)]) {
    const x = world()
    x.send.mockRejectedValueOnce(Object.assign(new Error(ADDRESS), { code }))
    expect(await (await post(x.e)).json()).toMatchObject({ why: 'unknown' })
  }
})

test('the recipient reaches the send and nothing else: no log line, stored report, answer or claim', async () => {
  const lines: unknown[][] = []
  for (const k of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { lines.push(a) })
  const sentBody = world()
  const answers = [await (await post(sentBody.e)).text()]
  const refused = world()
  refused.send.mockRejectedValue(Object.assign(new Error(`refused ${ADDRESS}`), { code: 'E_DELIVERY_FAILED' }))
  answers.push(await (await post(refused.e)).text())
  const parts = world({ AE_API_TOKEN: 'ae', CF_ACCOUNT_ID: 'acc' })
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(`no ${ADDRESS}`, { status: 500 }))
  answers.push(await (await post(parts.e)).text())
  expect(lines.length).toBeGreaterThan(0)
  const everything = JSON.stringify([
    answers, [...sentBody.ab.m], [...refused.ab.m],
    await sentBody.db.prepare('SELECT * FROM rate_limits').all().then(r => r.results),
    lines.filter(l => l[0] === 'daily report not sent:' || l[0] === 'daily report failed:'),
  ])
  expect(everything).not.toContain(ADDRESS)
  expect(sentBody.send.mock.calls[0]![0].to).toBe(ADDRESS)
  // What a stored report says about addresses at all.
  for (const [k, v] of sentBody.ab.m) if (k.startsWith(LOG_PREFIX)) expect(v.value).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
})

test('the numbers come from the dashboard\'s loaders, in Vietnam\'s days; a part that can\'t load is said, the report still goes', async () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  const w = world({ AE_API_TOKEN: 'ae', CF_ACCOUNT_ID: 'acc' })
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('down', { status: 500 }))
  expect((await post(w.e)).status).toBe(200)
  expect(fetch).toHaveBeenCalled()
  const r = stored(w)
  expect(r.text).toContain('Could not load readers')
  expect(r.text).toContain('Could not load the app\'s telemetry')
  expect(r.text).toContain('SUCCESS, THIS WEEK\nCould not load the scoreboard\'s numbers.')
  expect(r.text).toContain('Could not load the week\'s success numbers')
  err.mockRestore()
  // No Analytics Engine yet: the app's line says so too, and the scoreboard's.
  const x = world()
  await post(x.e)
  expect(stored(x).text).toContain('Could not load the app\'s telemetry')
  expect(stored(x).text).toContain('Could not load the scoreboard\'s numbers.')
  // Analytics Engine up and nothing counted yet: the week's numbers, from the scoreboard's own loader.
  const y = world({ AE_API_TOKEN: 'ae', CF_ACCOUNT_ID: 'acc' })
  fetch.mockImplementation(async u => (String(u).startsWith('https://api.cloudflare.com/') ? Response.json({ data: [] }) : offline(u)))
  expect((await post(y.e)).status).toBe(200)
  expect(stored(y).text).toMatch(/\nSUCCESS, THIS WEEK\n- Readers who found their answer: 0 \(/)
  expect(stored(y).text).not.toContain('Could not load the week\'s success numbers')
})

// ——— As the owner set it: email, the phones' notification (daily/settings.ts, daily/push.ts) ———

const PHONE_A = 'a1'.repeat(32)
const PHONE_B = 'b2'.repeat(32)
/** A P-256 key made for the test, as Apple's .p8 holds one. */
async function p8() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')
  return `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`
}
/** The owner's app registering a phone, as it does at each launch (owner-api.ts), with its session's bearer. */
const register = (e: Env, bearer: string, token: string, environment = 'production') => handle(new Request('https://x.test/api/owner/push-token', {
  method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, body: JSON.stringify({ token, environment }),
}), e)
/** A world with push on (and email as given), the APNs key, and two phones the owner's app registered in its session `app`; APNs answers with `answer`. */
async function pushing(answer: (url: string) => Response, email = true) {
  const w = world({ APNS_KEY: await p8(), APNS_KEY_ID: 'KEY1234567', APPLE_TEAM_ID: 'TEAM123456' })
  w.ab.m.set(SETTINGS_KEY, { value: JSON.stringify({ email, push: true }) })
  await w.db.prepare('INSERT OR IGNORE INTO users (id, created_at) VALUES (?, ?)').bind('owner-1', '2026-11-01T00:00:00Z').run()
  const app = await createSession(w.db, 'owner-1', 'app', new Date())
  for (const [token, environment] of [[PHONE_A, 'production'], [PHONE_B, 'sandbox']] as const) expect((await register(w.e, app, token, environment)).status).toBe(200)
  const apns = vi.fn(async (u: string, _init?: RequestInit) => answer(u))
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => (String(u).startsWith(GITHUB_API) ? offline(u) : apns(String(u), init)))
  return { ...w, apns, app }
}

test('email off: the report is kept, not mailed, and the answer and the log say so; the job is fine', async () => {
  const w = world()
  w.ab.m.set(SETTINGS_KEY, { value: JSON.stringify({ email: false, push: false }) })
  const r = await post(w.e)
  expect([r.status, await r.json()]).toEqual([200, { ok: true, id: '1001', sent: false, why: 'email_off', ...OFF }])
  expect(w.send).not.toHaveBeenCalled()
  expect(stored(w)).toMatchObject({ sent: false, why: 'email_off', ...OFF })
  // Again: nothing due, nothing sent.
  expect(await (await post(w.e)).json()).toMatchObject({ duplicate: true })
  expect(w.send).not.toHaveBeenCalled()
})

test('push on: one alert to each phone, the subject and the first thing that needs care, opening the report; the mail too; the answer says how many, never a phone', async () => {
  const w = await pushing(() => new Response(null, { status: 200 }))
  const r = await post(w.e)
  const answer = await r.text()
  expect([r.status, JSON.parse(answer)]).toEqual([200, { ok: true, id: '1001', sent: true, push: { sent: 2 } }])
  expect(w.send).toHaveBeenCalledTimes(1)
  const kept = stored(w)
  expect(kept).toMatchObject({ sent: true, push: { sent: 2 }, first: expect.any(String) })
  expect(w.apns.mock.calls.map(([u]) => String(u)).sort()).toEqual([`https://api.push.apple.com/3/device/${PHONE_A}`, `https://api.sandbox.push.apple.com/3/device/${PHONE_B}`])
  const alert = JSON.parse(w.apns.mock.calls[0]![1]!.body as string)
  expect(alert).toEqual({ aps: { alert: { title: 'AquaTome', body: `${kept.subject}\n${kept.first}` }, 'thread-id': 'daily-report' }, url: 'https://aquatome.com/_ab/bao-cao/1001/' })
  for (const x of [answer, JSON.stringify([...w.ab.m].filter(([k]) => k !== TOKENS_KEY))]) for (const t of [PHONE_A, PHONE_B]) expect(x).not.toContain(t)
  // The same run again: neither goes out twice.
  expect(await (await post(w.e)).json()).toEqual({ ok: true, id: '1001', sent: true, push: { sent: 2 }, duplicate: true })
  expect([w.send.mock.calls.length, w.apns.mock.calls.length]).toEqual([1, 2])
})

test('push on with no APNs key, or no phone: skipped, said why, the mail still goes and the job is fine', async () => {
  const noKey = world()
  noKey.ab.m.set(SETTINGS_KEY, { value: JSON.stringify({ email: true, push: true }) })
  await addDevice(noKey.ab.ns, PHONE_A, 'production', 'a-session', new Date())
  expect(await (await post(noKey.e)).json()).toEqual({ ok: true, id: '1001', sent: true, push: { sent: 0, why: 'no_apns_key' } })
  const noPhone = await pushing(() => new Response(null, { status: 200 }))
  noPhone.ab.m.delete(TOKENS_KEY)
  expect(await (await post(noPhone.e)).json()).toEqual({ ok: true, id: '1001', sent: true, push: { sent: 0, why: 'no_device' } })
  expect(noPhone.apns).not.toHaveBeenCalled()
  // Neither email nor a phone to push to: kept, as asked, and fine.
  const nothingOut = world()
  nothingOut.ab.m.set(SETTINGS_KEY, { value: JSON.stringify({ email: false, push: true }) })
  const r = await post(nothingOut.e)
  expect([r.status, await r.json()]).toEqual([200, { ok: true, id: '1001', sent: false, why: 'email_off', push: { sent: 0, why: 'no_apns_key' } }])
})

/** How an app session ends without the app getting to say so. */
const ENDINGS: [string, (w: Awaited<ReturnType<typeof pushing>>) => Promise<unknown>][] = [
  ['signed out (its row gone, as signing out leaves it)', async w => w.db.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(w.app)).run()],
  ['expired', async w => w.db.prepare('UPDATE sessions SET expires_at = ?').bind('2026-01-01T00:00:00.000Z').run()],
  ['its account deleted', async w => deleteUser(w.db, 'owner-1')],
  ['its account no longer the owner\'s', async w => { (w.e as unknown as { OWNER_ACCOUNTS: string }).OWNER_ACCOUNTS = 'someone-else' }],
]
for (const [how, end] of ENDINGS) {
  test(`a phone whose session ended, ${how}: no push, and it is dropped, counted as dropped and not refused`, async () => {
    const w = await pushing(() => new Response(null, { status: 200 }))
    await end(w)
    const r = await post(w.e)
    expect([r.status, await r.json()]).toEqual([200, { ok: true, id: '1001', sent: true, push: { sent: 0, dropped: 2, why: 'no_device' } }])
    expect(w.apns).not.toHaveBeenCalled()
    expect(JSON.parse(w.ab.m.get(TOKENS_KEY)!.value)).toEqual({})
  })
}

test('a phone registered again in a new session keeps getting the report after the old session ends; the other is dropped', async () => {
  const w = await pushing(() => new Response(null, { status: 200 }))
  const second = await createSession(w.db, 'owner-1', 'app', new Date())
  expect(await (await register(w.e, second, PHONE_A)).json()).toEqual({ ok: true, changed: true })
  await w.db.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(w.app)).run()
  expect(await (await post(w.e)).json()).toEqual({ ok: true, id: '1001', sent: true, push: { sent: 1, dropped: 1 } })
  expect(w.apns.mock.calls.map(([u]) => String(u))).toEqual([`https://api.push.apple.com/3/device/${PHONE_A}`])
  const kept = JSON.parse(w.ab.m.get(TOKENS_KEY)!.value) as Record<string, { session: string }>
  expect(Object.keys(kept)).toEqual([PHONE_A])
  // The session's id (the bearer's hash), never the bearer.
  expect(kept[PHONE_A]!.session).toBe(await sha256(second))
  expect(JSON.stringify(kept)).not.toContain(second)
})

test('push refused with nothing else out: the job fails and the next try pushes; refused beside a mail sent: kept as said, the job fine', async () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  let up = false
  const w = await pushing(() => (up ? new Response(null, { status: 200 }) : Response.json({ reason: 'InternalServerError' }, { status: 500 })), false)
  const r = await post(w.e)
  expect([r.status, await r.json()]).toEqual([502, { ok: false, id: '1001', sent: false, why: 'email_off', push: { sent: 0, why: 'InternalServerError' } }])
  expect(err).toHaveBeenCalledWith('daily report push refused:', 'InternalServerError, InternalServerError')
  const first = stored(w)
  up = true
  const again = await post(w.e)
  expect([again.status, await again.json()]).toEqual([200, { ok: true, id: '1001', sent: false, why: 'email_off', push: { sent: 2 } }])
  expect(stored(w)).toMatchObject({ when: first.when, text: first.text, push: { sent: 2 } })
  expect(JSON.parse(w.apns.mock.calls.at(-1)![1]!.body as string).aps.alert.body).toBe(`${first.subject}\n${first.first}`)
  // With the mail out, a refused push is the log's to say: the owner has the report.
  const x = await pushing(() => Response.json({ reason: 'InvalidProviderToken' }, { status: 403 }))
  const r2 = await post(x.e)
  expect([r2.status, await r2.json()]).toEqual([200, { ok: true, id: '1001', sent: true, push: { sent: 0, why: 'InvalidProviderToken' } }])
})

// ——— The log on the dashboard ———

const browser = { 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36', 'accept-language': 'vi' }
async function owner(w: ReturnType<typeof world>) {
  await w.db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind('owner-1', '2026-11-01T00:00:00Z').run()
  await w.db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind('reader-1', '2026-11-01T00:00:00Z').run()
  const now = new Date()
  return { owner: `__Host-aq_session=${await createSession(w.db, 'owner-1', 'web', now)}`, reader: `__Host-aq_session=${await createSession(w.db, 'reader-1', 'web', now)}` }
}
const open = (e: Env, path: string, cookie?: string) => handle(new Request(`https://x.test${path}`, { headers: { ...browser, ...(cookie ? { cookie } : {}) } }), e)
const keep = (w: ReturnType<typeof world>, id: string, r: Partial<Report>) => {
  const full = { when: '2026-11-05T00:00:00.000Z', subject: 's', sent: true, care: 0, text: 't', html: '<div>h</div>', ...r }
  const { when, subject, sent, why, push, care } = full as Report
  w.ab.m.set(`${LOG_PREFIX}${id}`, { value: JSON.stringify(full), opts: { metadata: { when, subject, sent, ...(why ? { why } : {}), ...(push ? { push } : {}), care } } })
}

test('the log: nothing yet', async () => {
  const w = world()
  const { owner: c } = await owner(w)
  const r = await open(w.e, '/_ab/bao-cao/', c)
  expect(r.status).toBe(200)
  expect([r.headers.get('cache-control'), r.headers.get('x-robots-tag')]).toEqual(['no-store', 'noindex, nofollow'])
  const html = await r.text()
  expect(html).toContain('<h1>Báo cáo hằng ngày</h1>')
  expect(html).toContain('aria-current="page">Báo cáo hằng ngày<')
  expect(html).toContain('Chưa có báo cáo nào.')
})

test('the log: newest first, date and time, sent or why not, subject and how many need care; each opens the report as it was sent', async () => {
  const w = world()
  const { owner: c } = await owner(w)
  keep(w, '1001', { when: '2026-11-04T00:00:00.000Z', subject: 'AquaTome daily · 4 Nov · nothing needs care', care: 0 })
  keep(w, '1003', { when: '2026-11-06T00:00:00.000Z', subject: 'AquaTome daily · 6 Nov · 2 need care', care: 2, sent: false, why: 'no_recipient', html: '<div style="color:#000">the mail <b>as sent</b></div>', text: 'the mail as text & all' })
  keep(w, '1002', { when: '2026-11-05T00:00:00.000Z', subject: 'AquaTome daily · 5 Nov <b>', care: 1, sent: false, why: 'E_RECIPIENT_NOT_ALLOWED' })
  const list = await (await open(w.e, '/_ab/bao-cao', c)).text()
  const rows = list.split('<ul class="areas">')[1]!.split('</li>').slice(0, 3)
  expect(rows[0]).toContain('2 need care')
  expect(rows[0]).toContain('Chưa gửi')
  expect(rows[0]).toContain('chưa có người nhận')
  expect(rows[0]).toContain('href="/_ab/bao-cao/1003/"')
  expect(rows[0]).toContain('2 cần xử lý')
  expect(rows[0]).toContain('<time datetime="2026-11-06T00:00:00.000Z">')
  expect(rows[1]).toContain('<code>E_RECIPIENT_NOT_ALLOWED</code>')
  expect(rows[1]).toContain('5 Nov &lt;b&gt;')
  expect(rows[2]).toContain('Đã gửi')
  const one = await open(w.e, '/_ab/bao-cao/1003/', c)
  expect(one.status).toBe(200)
  const page = await one.text()
  expect(page).toContain('<div class="mail"><div style="color:#000">the mail <b>as sent</b></div></div>')
  expect(page).toContain('the mail as text &amp; all')
  expect(page).toContain('href="/_ab/bao-cao/"')
  expect((await open(w.e, '/_ab/bao-cao/999/', c)).status).toBe(404)
  expect((await open(w.e, '/_ab/bao-cao/abc/', c)).status).toBe(404)
})

test('the log after a real report: the page shows what was sent', async () => {
  const w = world()
  const { owner: c } = await owner(w)
  await post(w.e)
  const list = await (await open(w.e, '/_ab/bao-cao/', c)).text()
  expect(list).toContain('Đã gửi')
  expect(list).toContain('href="/_ab/bao-cao/1001/"')
  expect(await (await open(w.e, '/_ab/bao-cao/1001/', c)).text()).toContain(stored(w).html)
})

test('the log says what went out: the mail, the phones notified, or neither and why', async () => {
  const w = world()
  const { owner: c } = await owner(w)
  keep(w, '2001', { when: '2026-11-06T00:00:00.000Z', sent: true, push: { sent: 2 } })
  keep(w, '2002', { when: '2026-11-05T00:00:00.000Z', sent: false, why: 'email_off', push: { sent: 0, why: 'no_apns_key' } })
  keep(w, '2003', { when: '2026-11-04T00:00:00.000Z', sent: false, why: 'email_off', push: { sent: 0, why: 'push_off' } })
  keep(w, '2004', { when: '2026-11-03T00:00:00.000Z', sent: true, push: { sent: 1, why: 'TooManyRequests' } })
  keep(w, '2005', { when: '2026-11-02T00:00:00.000Z', sent: true, push: { sent: 1, dropped: 2 } })
  const rows = (await (await open(w.e, '/_ab/bao-cao/', c)).text()).split('<ul class="areas">')[1]!.split('</li>')
  expect(rows[0]).toContain('<span class="chip good">Đã gửi email</span> · <span class="chip good">Đã gửi 2 thông báo</span>')
  expect(rows[1]).toContain('<span class="chip bad">Chưa gửi thông báo</span>: chưa có khóa APNs')
  expect(rows[1]).not.toContain('email')
  expect(rows[2]).toContain('<span class="chip">Không gửi</span>: email và thông báo đều đang tắt')
  expect(rows[3]).toContain('Đã gửi 1 thông báo</span>: <code>TooManyRequests</code>')
  expect(rows[4]).toContain('Đã gửi 1 thông báo</span> · <span class="chip">Bỏ 2 điện thoại</span>: đã đăng xuất hoặc không còn nhận thông báo')
  expect(await (await open(w.e, '/_ab/bao-cao/2002/', c)).text()).toContain('Chưa gửi thông báo</span>: chưa có khóa APNs')
})

test('the delivery from the page: its state and a button for each switch, a form only the owner signed in on the web can post', async () => {
  const w = world()
  const { owner: c, reader } = await owner(w)
  const page = async () => (await (await open(w.e, '/_ab/bao-cao/', c)).text()).split('<h2>Nhận báo cáo</h2>')[1]!.split('<h2>')[0]!
  expect(await page()).toBe('<p>Email: đang bật. Thông báo trên điện thoại: đang tắt.</p><form class="inline" method="post" action="/_ab/bao-cao/cai-dat"><button name="email" value="0">Tắt email</button><button name="push" value="1">Bật thông báo</button></form>')
  const press = (fields: Record<string, string>, cookie?: string) => handle(new Request('https://x.test/_ab/bao-cao/cai-dat', { method: 'POST', headers: { ...browser, ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(fields) }), w.e)
  // Nobody, another account: not found, nothing changes.
  for (const who of [undefined, reader]) expect((await press({ push: '1' }, who)).status).toBe(404)
  expect(w.ab.m.has(SETTINGS_KEY)).toBe(false)
  const r = await press({ push: '1' }, c)
  expect([r.status, r.headers.get('location')]).toEqual([303, '/_ab/bao-cao/'])
  expect(JSON.parse(w.ab.m.get(SETTINGS_KEY)!.value)).toEqual({ email: true, push: true })
  expect(await page()).toContain('<p class="failed" role="status">Email: đang bật. Thông báo trên điện thoại: đang bật, nhưng chưa có điện thoại nào đăng ký và chưa có khóa APNs nên chưa gửi được.')
  expect(await page()).toContain('<button name="push" value="0">Tắt thông báo</button>')
  for (const bad of [{}, { push: 'on' }, { email: '2' }] as Record<string, string>[]) expect((await press(bad, c)).status, JSON.stringify(bad)).toBe(400)
  expect((await open(w.e, '/_ab/bao-cao/cai-dat', c)).status).toBe(404)
  expect(JSON.parse(w.ab.m.get(SETTINGS_KEY)!.value)).toEqual({ email: true, push: true })
})

test('the log opens only to the owner\'s account signed in on the web', async () => {
  const w = world()
  const { reader } = await owner(w)
  keep(w, '1001', { subject: 'secret subject', html: '<div>secret mail</div>' })
  for (const path of ['/_ab/bao-cao/', '/_ab/bao-cao/1001/']) {
    for (const [cookie, status] of [[undefined, 200], [reader, 403]] as const) {
      const r = await open(w.e, path, cookie)
      const html = await r.text()
      expect(r.status, path).toBe(status)
      expect(html, path).not.toContain('secret')
      expect(html, path).not.toContain('Các mục quản trị')
    }
    // A token opens no page.
    expect(await (await handle(new Request(`https://x.test${path}`, { headers: { ...browser, authorization: `Bearer ${TOKEN}` } }), w.e)).text(), path).not.toContain('secret')
  }
})

test('the log is a section of the app too, reached on the web from its rail (once) and the overview', async () => {
  // SECTIONS is what GET /api/owner/dashboard lists and the iOS app draws (protocols/owner-dashboard.openapi.json).
  expect(SECTIONS.map(s => s.key)).toContain('bao-cao')
  expect(ADMIN_PAGES).toContain('/_ab/bao-cao/')
  const w = world()
  const { owner: c } = await owner(w)
  for (const page of ['/_ab/', '/_ab/an-trang/']) {
    const html = await (await open(w.e, page, c)).text()
    expect(html, page).toContain('<li><a href="/_ab/bao-cao/">Báo cáo hằng ngày</a></li>')
    expect(html.split('<nav')[1]!.split('</nav>')[0]!.match(/href="\/_ab\/bao-cao\/"/g), page).toHaveLength(1)
  }
  // A phone's overview hides the rail: the page itself links it.
  expect((await (await open(w.e, '/_ab/', c)).text()).split('<main>')[1]).toContain('href="/_ab/bao-cao/"')
})

// ——— The product change log ———

const change = (area: string, text: string, at: string) => ({ area, text, at })
const changesKept = (w: ReturnType<typeof world>) => JSON.parse(w.ab.m.get(CHANGELOG_KEY)!.value) as unknown[]

test('the change log: the report adds its changes to KV before it sends, each once, cut as the mail is', async () => {
  const w = world()
  const order: string[] = []
  const put = w.ab.ns.put.bind(w.ab.ns)
  Object.assign(w.ab.ns, { put: async (k: string, v: string, o?: Put['opts']) => { order.push(k); return put(k, v, o) } })
  w.send.mockImplementation(async () => { order.push('send'); return { messageId: 'm1' } })
  const a = change('Site', 'Readers can attach one photo to a comment.', '2026-11-05T10:00:00Z')
  const b = change('App', `Write to ${ADDRESS} or see https://tracker.test/p`, '2026-11-05T09:00:00Z')
  expect((await post(w.e, body('1001', { changes: [a, b] }))).status).toBe(200)
  expect(order).toEqual([CHANGELOG_KEY, 'send', `${LOG_PREFIX}1001`])
  const cutB = { ...b, text: 'Write to [address removed] or see [link removed]' }
  expect(changesKept(w)).toEqual([a, cutB])
  // No expiry on the key: a year is kept by the entries' own dates (below).
  expect(w.ab.m.get(CHANGELOG_KEY)!.opts?.expirationTtl).toBeUndefined()
  // The same run again, then a run by hand within the day with the same pull requests and a new one: each kept once.
  await post(w.e, body('1001', { changes: [a, b] }))
  const c = change('Engine', 'Guides keep their photos.', '2026-11-05T20:00:00Z')
  await post(w.e, body('1002', { changes: [c, a, b] }))
  expect(changesKept(w)).toEqual([c, a, cutB])
  // A day with none writes nothing.
  const quiet = world()
  await post(quiet.e)
  expect(quiet.ab.m.has(CHANGELOG_KEY)).toBe(false)
})

test('the change log keeps a year: what is older leaves on the next write; nothing new, nothing written', async () => {
  const w = world()
  const now = new Date('2026-11-06T00:00:00Z')
  const old = change('Site', 'Old.', '2025-11-01T00:00:00Z')
  const recent = change('Site', 'Recent.', '2025-11-07T00:00:00Z')
  w.ab.m.set(CHANGELOG_KEY, { value: JSON.stringify([recent, old]) })
  const put = vi.spyOn(w.ab.ns, 'put')
  expect(await addChanges(w.ab.ns, [], now)).toBe(0)
  expect(await addChanges(w.ab.ns, [recent as never], now)).toBe(0)
  expect(put).not.toHaveBeenCalled()
  const fresh = change('App', 'New.', '2026-11-05T00:00:00Z')
  expect(await addChanges(w.ab.ns, [fresh as never], now)).toBe(1)
  expect(changesKept(w)).toEqual([fresh, recent])
})

test('the change log: a write that fails sends nothing; the next try writes it, then sends', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const w = world()
  const down = { ...w.e, AB: Object.assign(Object.create(w.ab.ns), { put: vi.fn(async () => { throw new Error('KV 429') }) }) } as unknown as Env
  const changes = [change('Site', 'One.', '2026-11-05T10:00:00Z')]
  expect((await post(down, body('1001', { changes }))).status).toBe(503)
  expect(w.send).not.toHaveBeenCalled()
  expect((await post(w.e, body('1001', { changes }))).status).toBe(200)
  expect(w.send).toHaveBeenCalledTimes(1)
  expect(changesKept(w)).toEqual(changes)
  log.mockRestore()
})

test('the change log page: nothing yet', async () => {
  const w = world()
  const { owner: c } = await owner(w)
  const r = await open(w.e, '/_ab/thay-doi/', c)
  expect(r.status).toBe(200)
  expect([r.headers.get('cache-control'), r.headers.get('x-robots-tag')]).toEqual(['no-store', 'noindex, nofollow'])
  const html = await r.text()
  expect(html).toContain('<h1>Thay đổi sản phẩm</h1>')
  expect(html).toContain('aria-current="page">Thay đổi sản phẩm<')
  expect(html).toContain('Chưa có thay đổi nào.')
})

const heads = (html: string) => html.split('<section><h3>').slice(1).map(d => d.split('</h3>')[0])

test('the change log page: by the day each merged in the viewer\'s zone, newest first; the site, the app, the engine; each line once; escaped', async () => {
  const w = world()
  const { owner: c } = await owner(w)
  w.ab.m.set(CHANGELOG_KEY, { value: JSON.stringify([
    change('App', 'The app opens links.', '2026-11-05T10:00:00Z'),
    change('Engine', 'Guides keep their photos.', '2026-11-05T20:00:00Z'), // 06/11 03:00 in Vietnam
    change('Site', 'Shop links fit <small> phones.', '2026-11-05T16:00:00Z'), // 05/11 23:00
    change('Site', 'Readers can search.', '2026-11-05T09:00:00Z'),
    change('Site', 'Readers can search.', '2026-11-05T08:00:00Z'),
  ]) })
  const html = await (await open(w.e, '/_ab/thay-doi/', c)).text()
  expect(heads(html)).toEqual(['Thứ Sáu · 06/11/2026', 'Thứ Năm · 05/11/2026'])
  const days = html.split('<section><h3>').slice(1)
  expect(days[0]).toContain('<li><p>Guides keep their photos.</p><small>Engine nội dung</small></li>')
  expect([...days[1]!.matchAll(/<li><p>(.*?)<\/p><small>(.*?)<\/small>/g)].map(m => [m[1], m[2]])).toEqual([
    ['Shop links fit &lt;small&gt; phones.', 'Trang web'], ['Readers can search.', 'Trang web'], ['The app opens links.', 'Ứng dụng'],
  ])
  // A viewer in New York: every one of them on the 5th.
  const ny = await (await open(w.e, '/_ab/thay-doi/', `${c}; aq_tz=America%2FNew_York`)).text()
  expect(heads(ny)).toEqual(['Thứ Năm · 05/11/2026'])
})

test('the change log page: a key that can\'t be read says so in its place', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const w = world()
  const { owner: c } = await owner(w)
  const down = { ...w.e, AB: Object.assign(Object.create(w.ab.ns), { get: async () => { throw new Error('KV down') } }) } as unknown as Env
  const html = await (await open(down, '/_ab/thay-doi/', c)).text()
  expect(html).toContain('Không tải được nhật ký thay đổi.<code>KV down</code>')
  log.mockRestore()
})

test('the change log page: the owner\'s alone; on the web dashboard\'s rail, and one of the app\'s sections', async () => {
  const w = world()
  const { owner: c, reader } = await owner(w)
  w.ab.m.set(CHANGELOG_KEY, { value: JSON.stringify([change('Site', 'secret change', '2026-11-05T10:00:00Z')]) })
  for (const [cookie, status] of [[undefined, 200], [reader, 403]] as const) {
    const r = await open(w.e, '/_ab/thay-doi/', cookie)
    const html = await r.text()
    expect(r.status).toBe(status)
    expect(html).not.toContain('secret')
    expect(html).not.toContain('Các mục quản trị')
  }
  // The dashboard token opens no page.
  expect(await (await handle(new Request('https://x.test/_ab/thay-doi/', { headers: { ...browser, authorization: `Bearer ${TOKEN}` } }), w.e)).text()).not.toContain('secret')
  expect(await (await open(w.e, '/_ab/thay-doi/', c)).text()).toContain('secret change')
  // NAV and SECTIONS are the iOS app's contract (protocols/owner-dashboard.openapi.json): the change log is in it (docs/design/dashboard.md).
  expect(NAV.map(([p]) => p)).toContain('/_ab/thay-doi/')
  expect(SECTIONS.map(s => s.key)).toContain('thay-doi')
  expect(WEB_PAGES).toContain('/_ab/thay-doi/')
  expect(await (await open(w.e, '/_ab/', c)).text()).toContain('<li><a href="/_ab/thay-doi/">Thay đổi sản phẩm</a></li>')
})
