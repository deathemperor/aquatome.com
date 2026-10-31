import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from 'jose'
import { accounts, type AccountDeps, type AccountsEnv } from '../accounts/api'
import type { Mail } from '../accounts/email'
import { idTokenVerifier, type IdClaims } from '../accounts/idtoken'
import { COOKIE } from '../accounts/session'
import { testD1 } from './d1'

const readJson = (rel: string) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url).href), 'utf8'))
const ORIGIN = 'https://x.test'
const NOW = new Date('2026-11-01T00:00:00.000Z')

/** A fake provider: an ID token is `<sub>|<nonce>|<email>`; anything else is refused. */
function setup(over: Partial<AccountsEnv> = {}, opts: { turnstile?: boolean } = {}) {
  const db = testD1()
  const mails: Mail[] = []
  const deps: AccountDeps = {
    verifyIdToken: async (_p, token, audiences): Promise<IdClaims | undefined> => {
      if (!audiences.length) return undefined
      const [sub, nonce, email] = token.split('|')
      return sub ? { sub, emailVerified: Boolean(email), ...(nonce ? { nonce } : {}), ...(email ? { email } : {}) } : undefined
    },
    siteverify: async () => opts.turnstile ?? true,
    sendMail: async m => { mails.push(m); return true },
  }
  const env: AccountsEnv = { DB: db, ACCOUNTS: 'on', ACCOUNT_HMAC_KEY: 'k'.repeat(32), GOOGLE_CLIENT_IDS: 'web.apps.googleusercontent.com', APPLE_CLIENT_IDS: 'com.aquatome.web,com.aquatome.app', TURNSTILE_SECRET: 's', TURNSTILE_SITEKEY: 'sk', ...over }
  let now = NOW
  const call = async (method: string, path: string, o: { body?: unknown; cookie?: string; bearer?: string; origin?: string | null; site?: string; type?: string } = {}) => {
    const headers: Record<string, string> = {}
    if (o.body !== undefined) headers['content-type'] = o.type ?? 'application/json'
    if (o.origin !== null && method !== 'GET') headers.origin = o.origin ?? ORIGIN
    if (o.site) headers['sec-fetch-site'] = o.site
    if (o.cookie) headers.cookie = o.cookie
    if (o.bearer) headers.authorization = `Bearer ${o.bearer}`
    headers['cf-connecting-ip'] = '203.0.113.9'
    const req = new Request(`${ORIGIN}${path}`, { method, headers, ...(o.body !== undefined ? { body: typeof o.body === 'string' ? o.body : JSON.stringify(o.body) } : {}) })
    const res = await accounts(req, new URL(req.url), env, now, deps)
    const text = await res.text()
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : undefined }
  }
  const cookieOf = (r: { headers: Headers }) => /^(__Host-aq_session=[^;]+)/.exec(r.headers.get('set-cookie') ?? '')?.[1]
  /** Signs in with the fake Google: the session cookie (web) or token (app). */
  const google = async (sub: string, o: { email?: string; client?: 'web' | 'app'; cookie?: string; bearer?: string; link?: boolean } = {}) => {
    const { json: { nonce } } = await call('POST', '/api/v1/auth/nonce', { body: {} })
    const r = await call('POST', '/api/v1/auth/google', { body: { idToken: `${sub}|${nonce}|${o.email ?? ''}`, nonce, client: o.client ?? 'web', ...(o.link ? { link: true } : {}) }, cookie: o.cookie, bearer: o.bearer, origin: o.client === 'app' ? null : undefined })
    return { ...r, cookie: cookieOf(r), token: r.json?.token as string | undefined }
  }
  /** Asks for a code (signed in or not) and returns the flow secret and the mailed code. */
  const ask = async (email: string, o: { cookie?: string; lang?: string; link?: boolean } = {}) => {
    const r = await call('POST', '/api/v1/auth/email/start', { body: { email, turnstile: 't', lang: o.lang ?? 'id', ...(o.link ? { link: true } : {}) }, cookie: o.cookie })
    expect(r.status).toBe(200)
    return { flow: r.json.flow as string, code: /#ma=(\d{6})/.exec(mails.at(-1)!.text)![1]! }
  }
  const emailIn = async (email: string, o: { cookie?: string; link?: boolean } = {}) => {
    const { flow, code } = await ask(email, o)
    const r = await call('POST', '/api/v1/auth/email/verify', { body: { flow, code }, cookie: o.cookie })
    return { ...r, cookie: cookieOf(r), flow, code }
  }
  return { db, env, deps, mails, call, google, ask, emailIn, cookieOf, setNow: (d: Date) => { now = d } }
}

test('off: the page learns accounts are off; everything else is not there', async () => {
  for (const over of [{ ACCOUNTS: undefined }, { ACCOUNT_HMAC_KEY: undefined }, { ACCOUNTS: 'preview' }]) {
    const { call } = setup(over)
    expect((await call('GET', '/api/v1/session')).json).toEqual({ accounts: false })
    expect((await call('POST', '/api/v1/auth/nonce', { body: {} })).status).toBe(404)
  }
  // Preview: only with the owner's flag cookie.
  const { call } = setup({ ACCOUNTS: 'preview' })
  expect((await call('GET', '/api/v1/session', { cookie: 'aq_owner=1' })).json.accounts).toBe(true)
})

test('the session tells the page which sign-ins it can offer, with public client ids only', async () => {
  const { call } = setup()
  expect((await call('GET', '/api/v1/session')).json).toEqual({
    accounts: true, turnstileSitekey: 'sk', user: null,
    providers: { google: { clientId: 'web.apps.googleusercontent.com' }, apple: { clientId: 'com.aquatome.web' }, email: true, passkey: false },
  })
  expect((await setup({ GOOGLE_CLIENT_IDS: undefined, TURNSTILE_SECRET: undefined }).call('GET', '/api/v1/session')).json.providers).toMatchObject({ google: null, email: false })
})

test('web sign-in: an HttpOnly, Secure, SameSite cookie that the next request is signed in with', async () => {
  const { call, google } = setup()
  const r = await google('g-1')
  expect(r.status).toBe(200)
  const set = r.headers.get('set-cookie')!
  expect(set).toMatch(new RegExp(`^${COOKIE}=[A-Za-z0-9_-]{43}; Path=/; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax$`))
  expect(r.json.token).toBeUndefined()
  const me = await call('GET', '/api/v1/session', { cookie: r.cookie })
  expect(me.json.user.methods).toMatchObject([{ kind: 'google' }])
  expect(me.headers.get('set-cookie')).toContain(r.cookie) // the cookie's lifetime renewed
  // The same Google account again: the same user.
  expect((await google('g-1')).json.user.id).toBe(r.json.user.id)
})

test('app sign-in: a bearer token, no cookie; a token is not a cookie and a cookie is not a token', async () => {
  const { call, google } = setup()
  const app = await google('g-1', { client: 'app' })
  expect(app.status).toBe(200)
  expect(app.headers.get('set-cookie')).toBeNull()
  expect(app.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect((await call('GET', '/api/v1/session', { bearer: app.token })).json.user.id).toBe(app.json.user.id)
  expect((await call('GET', '/api/v1/session', { cookie: `${COOKIE}=${app.token}` })).json.user).toBeNull()
  const web = await google('g-1')
  expect((await call('GET', '/api/v1/session', { bearer: web.cookie!.split('=')[1] })).json.user).toBeNull()
})

test('CSRF: changes need this site\'s origin, or no cookie at all (the app)', async () => {
  const { call, google } = setup()
  const { cookie } = await google('g-1')
  expect((await call('DELETE', '/api/v1/account', { cookie, origin: 'https://evil.test' })).status).toBe(403)
  expect((await call('DELETE', '/api/v1/account', { cookie, origin: null })).status).toBe(403)
  expect((await call('DELETE', '/api/v1/account', { cookie, site: 'cross-site' })).status).toBe(403)
  expect((await call('POST', '/api/v1/tanks/sync', { cookie, body: 'store=x', type: 'application/x-www-form-urlencoded' })).status).toBe(400)
  // A browser sign-in (it sets a cookie) from another site, or with no origin: refused.
  expect((await call('POST', '/api/v1/auth/nonce', { body: {}, origin: 'https://evil.test' })).status).toBe(403)
  expect((await call('POST', '/api/v1/auth/email/verify', { body: { flow: 'x'.repeat(43), code: '123456' }, origin: null })).status).toBe(403)
  // The app: no origin, no cookie.
  expect((await google('g-2', { client: 'app' })).status).toBe(200)
  // Still signed in after the refused attempts.
  expect((await call('GET', '/api/v1/session', { cookie })).json.user).not.toBeNull()
})

test('nonces: issued by us, used once, matched as they are or as their SHA-256 (Apple on iOS)', async () => {
  const { call } = setup()
  const nonce = (await call('POST', '/api/v1/auth/nonce', { body: {} })).json.nonce as string
  expect((await call('POST', '/api/v1/auth/google', { body: { idToken: 'g|other', nonce } })).status).toBe(401)
  expect((await call('POST', '/api/v1/auth/google', { body: { idToken: `g|${nonce}`, nonce } })).json.error).toBe('bad_nonce') // used up above
  expect((await call('POST', '/api/v1/auth/google', { body: { idToken: 'g|made-up', nonce: 'made-up' } })).json.error).toBe('bad_nonce')
  const n2 = (await call('POST', '/api/v1/auth/nonce', { body: {} })).json.nonce as string
  const hashed = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(n2)))].map(b => b.toString(16).padStart(2, '0')).join('')
  expect((await call('POST', '/api/v1/auth/apple', { body: { idToken: `a|${hashed}`, nonce: n2, client: 'app' }, origin: null })).status).toBe(200)
})

test('a provider with no client id configured is off', async () => {
  const { call } = setup({ APPLE_CLIENT_IDS: undefined })
  const { json: { nonce } } = await call('POST', '/api/v1/auth/nonce', { body: {} })
  expect((await call('POST', '/api/v1/auth/apple', { body: { idToken: `a|${nonce}`, nonce } })).status).toBe(503)
})

test('email: Turnstile, a one-time code in the reader\'s language, with a link to the page, used once, for 15 minutes', async () => {
  const { call, mails, ask, emailIn, setNow } = setup()
  expect((await call('POST', '/api/v1/auth/email/start', { body: { email: 'nope', turnstile: 't' } })).status).toBe(400)
  const r = await emailIn('  Reader@Example.com ')
  expect(r.status).toBe(200)
  expect(mails[0]).toMatchObject({ to: 'reader@example.com', subject: `${r.code} adalah kode masuk AquaTome` })
  expect(mails[0]!.text).toContain(`${ORIGIN}/id/alat/akuarium-saya/#ma=${r.code}`)
  expect((await call('POST', '/api/v1/auth/email/verify', { body: { flow: r.flow, code: r.code } })).json.error).toBe('bad_code') // used
  // The same address later: the same account.
  expect((await emailIn('reader@example.com')).json.user.id).toBe(r.json.user.id)
  // A code older than 15 minutes.
  const late = await ask('late@example.com')
  setNow(new Date(NOW.getTime() + 16 * 60_000))
  expect((await call('POST', '/api/v1/auth/email/verify', { body: late })).json.error).toBe('bad_code')
})

test('email: five wrong codes and the flow is gone', async () => {
  const { call, ask } = setup()
  const { flow, code } = await ask('reader@example.com')
  const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0')
  for (let i = 0; i < 5; i++) expect((await call('POST', '/api/v1/auth/email/verify', { body: { flow, code: wrong } })).status).toBe(401)
  expect((await call('POST', '/api/v1/auth/email/verify', { body: { flow, code } })).json.error).toBe('bad_code')
})

test('email: tries sent at once can\'t pass the limit, and one code signs in once', async () => {
  const { call, ask } = setup()
  const { flow, code } = await ask('reader@example.com')
  const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0')
  const tries = await Promise.all([...Array(8)].map(() => call('POST', '/api/v1/auth/email/verify', { body: { flow, code: wrong } })).concat(call('POST', '/api/v1/auth/email/verify', { body: { flow, code } })))
  expect(tries.filter(r => r.status === 200).length).toBeLessThanOrEqual(1)
  const b = await ask('b@example.com')
  const both = await Promise.all([1, 2].map(() => call('POST', '/api/v1/auth/email/verify', { body: b })))
  expect(both.map(r => r.status).sort()).toEqual([200, 401])
})

test('email: a code someone else asked for neither signs this browser in nor joins this account (CSRF)', async () => {
  const { call, ask, google } = setup()
  const attacker = await ask('attacker@example.com')
  const victim = await google('g-victim')
  // The attacker's link carries only the code: the victim's browser doesn't hold the attacker's flow.
  expect((await call('POST', '/api/v1/auth/email/verify', { body: { flow: 'v'.repeat(43), code: attacker.code }, cookie: victim.cookie })).status).toBe(401)
  // Even with the attacker's flow, a code asked for signed out never joins the signed-in account.
  const r = await call('POST', '/api/v1/auth/email/verify', { body: attacker, cookie: victim.cookie })
  expect(r.json.user.id).not.toBe(victim.json.user.id)
  expect((await call('GET', '/api/v1/session', { cookie: victim.cookie })).json.user).toBeNull() // that session ended
  const methods = (await call('GET', '/api/v1/session', { cookie: (await google('g-victim')).cookie })).json.user.methods
  expect(methods.map((m: { kind: string }) => m.kind)).toEqual(['google'])
})

test('email: adding an address to the account works only for the account that asked', async () => {
  const { call, ask, google } = setup()
  const a = await google('g-a')
  const b = await google('g-b')
  const forA = await ask('a@example.com', { cookie: a.cookie, link: true })
  expect((await call('POST', '/api/v1/auth/email/verify', { body: forA, cookie: b.cookie })).status).toBe(401)
  const forA2 = await ask('a@example.com', { cookie: a.cookie, link: true })
  expect((await call('POST', '/api/v1/auth/email/verify', { body: forA2 })).status).toBe(401)
  const forA3 = await ask('a@example.com', { cookie: a.cookie, link: true })
  const added = await call('POST', '/api/v1/auth/email/verify', { body: forA3, cookie: a.cookie })
  expect(added.json.user.methods.map((m: { kind: string }) => m.kind)).toEqual(['google', 'email'])
  expect(added.headers.get('set-cookie')).toBeNull()
})

test('email link: refused without Turnstile, and limited per address', async () => {
  expect((await setup({}, { turnstile: false }).call('POST', '/api/v1/auth/email/start', { body: { email: 'a@example.com', turnstile: 't' } })).status).toBe(403)
  const { call, mails } = setup()
  const send = () => call('POST', '/api/v1/auth/email/start', { body: { email: 'a@example.com', turnstile: 't' } })
  for (let i = 0; i < 3; i++) expect((await send()).status).toBe(200)
  expect((await send()).status).toBe(429)
  expect(mails).toHaveLength(3)
  expect((await setup({}, {}).call('POST', '/api/v1/auth/email/start', { body: { email: 'a@example.com' } })).status).toBe(403)
})

test('no email address, IP or name is stored anywhere', async () => {
  const { db, google, emailIn } = setup()
  await emailIn('reader@example.com')
  await google('g-1', { email: 'other@example.com' })
  const dump = JSON.stringify(await Promise.all(['users', 'credentials', 'sessions', 'auth_challenges', 'rate_limits', 'tank_records'].map(t => db.prepare(`SELECT * FROM ${t}`).all())))
  expect(dump).not.toMatch(/@|example|203\.0\.113/)
})

test('a verified address links sign-ins: Google first, an email link to the same address later finds the account', async () => {
  const { google, emailIn } = setup()
  const g = await google('g-1', { email: 'reader@example.com' })
  expect((await emailIn('reader@example.com')).json.user.id).toBe(g.json.user.id)
})

test('signed in, a sign-in method joins the account only when asked to (link); one that belongs to another account is refused', async () => {
  const { call, google, emailIn } = setup()
  const e = await emailIn('reader@example.com')
  const added = await google('g-1', { cookie: e.cookie, link: true })
  expect(added.json.user.id).toBe(e.json.user.id)
  expect(added.headers.get('set-cookie')).toBeNull() // the same session goes on
  expect((await call('GET', '/api/v1/session', { cookie: e.cookie })).json.user.methods.map((m: { kind: string }) => m.kind)).toEqual(['email', 'google'])
  const other = await google('g-2')
  expect((await google('g-1', { cookie: other.cookie, link: true })).status).toBe(409)
  expect((await google('g-3', { link: true })).status).toBe(401) // nothing to add it to
})

test('signing in as someone else on a signed-in browser switches accounts: never joins them (a shared computer)', async () => {
  const { call, google } = setup()
  const a = await google('g-a')
  const b = await google('g-b', { cookie: a.cookie })
  expect(b.json.user.id).not.toBe(a.json.user.id)
  expect((await call('GET', '/api/v1/session', { cookie: a.cookie })).json.user).toBeNull() // A's session ended
  expect((await call('GET', '/api/v1/session', { cookie: b.cookie })).json.user.methods).toMatchObject([{ kind: 'google' }])
  expect((await google('g-a')).json.user.methods).toMatchObject([{ kind: 'google' }])
})

test('removing a sign-in method, but never the last', async () => {
  const { call, google, emailIn } = setup()
  const e = await emailIn('reader@example.com')
  await google('g-1', { cookie: e.cookie, link: true })
  const methods = (await call('GET', '/api/v1/session', { cookie: e.cookie })).json.user.methods as { id: string }[]
  // Both at once: one goes, the other is the last and stays.
  const both = await Promise.all(methods.map(m => call('DELETE', `/api/v1/account/methods/${m.id}`, { cookie: e.cookie })))
  expect(both.map(r => r.status).sort()).toEqual([204, 409])
  expect((await call('GET', '/api/v1/session', { cookie: e.cookie })).json.user.methods).toHaveLength(1)
  expect((await call('DELETE', '/api/v1/account/methods/00000000-0000-4000-8000-000000000000', { cookie: e.cookie })).status).toBe(404)
})

type MergeCase = { note: string; kept: { id: string }[]; incoming: unknown[]; expected: unknown[] }
const V = readJson('../../../../protocols/tanks-vectors.json') as { merge: MergeCase[]; valid: { kind: string; value: Record<string, unknown> & { id: string } }[] }
const store = (tanks: unknown[] = [], devices: unknown[] = []) => ({ v: 1, tanks, devices })

test.each(V.merge.filter(c => new Set(c.kept.map(r => r.id)).size === c.kept.length))('sync merges like the shared vectors: $note', async ({ kept, incoming, expected }) => {
  const { call, google } = setup()
  const { cookie } = await google('g-1')
  await call('POST', '/api/v1/tanks/sync', { cookie, body: { store: store(kept) } })
  const r = await call('POST', '/api/v1/tanks/sync', { cookie, body: { store: store(incoming) } })
  expect(r.status).toBe(200)
  expect(r.json.store).toEqual(store(expected))
})

test('sync: signed out is refused; a record that doesn\'t validate is listed and the rest are kept', async () => {
  const { call, google } = setup()
  expect((await call('POST', '/api/v1/tanks/sync', { body: { store: store() } })).status).toBe(401)
  const { cookie } = await google('g-1')
  const good = V.valid.find(c => c.kind === 'tank')!.value
  const bad = { ...good, id: '00000000-0000-4000-8000-0000000000ff', name: '' }
  const r = await call('POST', '/api/v1/tanks/sync', { cookie, body: { store: store([good, bad]) } })
  expect(r.json.store.tanks).toEqual([good])
  expect(r.json.refused).toEqual([{ kind: 'tank', id: bad.id, issues: [expect.objectContaining({ path: ['name'] })] }])
  expect((await call('GET', '/api/v1/tanks', { cookie })).json.store.tanks).toEqual([good])
  expect((await call('POST', '/api/v1/tanks/sync', { cookie, body: { store: { v: 2, tanks: [], devices: [] } } })).status).toBe(400)
})

test('sync: a time ahead of the server\'s clock becomes the server\'s', async () => {
  const { call, google } = setup()
  const { cookie } = await google('g-1')
  const t = { ...V.valid.find(c => c.kind === 'tank')!.value, createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z' }
  const r = await call('POST', '/api/v1/tanks/sync', { cookie, body: { store: store([t]) } })
  expect(r.json.store.tanks[0]).toMatchObject({ createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() })
  expect(r.json.serverTime).toBe(NOW.toISOString())
})

test('sync: an account holds at most 200 live tanks', async () => {
  const { call, google } = setup()
  const { cookie } = await google('g-1')
  const t = V.valid.find(c => c.kind === 'tank')!.value
  const many = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ ...t, id: `00000000-0000-4000-8000-${String(from + i).padStart(12, '0')}` }))
  expect((await call('POST', '/api/v1/tanks/sync', { cookie, body: { store: store(many(1000, 150)) } })).status).toBe(200)
  expect((await call('POST', '/api/v1/tanks/sync', { cookie, body: { store: store(many(2000, 51)) } })).json.error).toBe('too_many')
  expect((await call('POST', '/api/v1/tanks/sync', { cookie, body: { store: store(many(2000, 50)) } })).status).toBe(200)
})

test('sync: a tombstone is stored as its three keys, whatever else was sent', async () => {
  const { call, google } = setup()
  const { cookie } = await google('g-1')
  const dead = { id: '00000000-0000-4000-8000-000000000001', updatedAt: '2026-10-05T00:00:00.000Z', deletedAt: '2026-10-05T00:00:00.000Z', name: 'x'.repeat(10_000) }
  const r = await call('POST', '/api/v1/tanks/sync', { cookie, body: { store: store([dead]) } })
  expect(r.json.store.tanks).toEqual([{ id: dead.id, updatedAt: dead.updatedAt, deletedAt: dead.deletedAt }])
})

test('sync: only the newest 1000 tombstones of a kind are kept', async () => {
  const { call, google } = setup()
  const { cookie } = await google('g-1')
  const at = (i: number) => new Date(Date.UTC(2026, 9, 1) + i * 1000).toISOString()
  const dead = Array.from({ length: 1005 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, updatedAt: at(i), deletedAt: at(i) }))
  const r = await call('POST', '/api/v1/tanks/sync', { cookie, body: { store: store(dead) } })
  expect(r.json.store.tanks).toHaveLength(1000)
  expect(r.json.store.tanks.some((t: { id: string }) => t.id === dead[4]!.id)).toBe(false)
  expect(r.json.store.tanks.some((t: { id: string }) => t.id === dead[5]!.id)).toBe(true)
})

test('sync: an account holds at most 1 MB of live records', async () => {
  const { call, google } = setup()
  const { cookie } = await google('g-1')
  const t = V.valid.find(c => c.kind === 'tank')!.value
  const big = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ ...t, id: `00000000-0000-4000-8000-${String(from + i).padStart(12, '0')}`, notes: 'n'.repeat(4000) }))
  expect((await call('POST', '/api/v1/tanks/sync', { cookie, body: { store: store(big(1000, 150)) } })).status).toBe(200)
  expect((await call('POST', '/api/v1/tanks/sync', { cookie, body: { store: store(big(2000, 100)) } })).json.error).toBe('too_many')
})

test('sync: one at a time per account', async () => {
  const { db, call, google } = setup()
  const { cookie, json: { user } } = await google('g-1')
  await db.prepare(`UPDATE users SET sync_until = ? WHERE id = ?`).bind('2026-11-01T00:00:10.000Z', user.id).run()
  expect((await call('POST', '/api/v1/tanks/sync', { cookie, body: { store: store() } })).status).toBe(409)
  await db.prepare(`UPDATE users SET sync_until = ? WHERE id = ?`).bind('2026-10-31T23:59:00.000Z', user.id).run() // a sync that died
  expect((await call('POST', '/api/v1/tanks/sync', { cookie, body: { store: store() } })).status).toBe(200)
  expect((await db.prepare(`SELECT sync_until FROM users WHERE id = ?`).bind(user.id).first<{ sync_until: string | null }>())!.sync_until).toBeNull()
})

test('deleting the account also voids email codes already sent to its addresses', async () => {
  const { call, ask, emailIn } = setup()
  const e = await emailIn('reader@example.com')
  const pending = await ask('reader@example.com')
  expect((await call('DELETE', '/api/v1/account', { cookie: e.cookie })).status).toBe(204)
  expect((await call('POST', '/api/v1/auth/email/verify', { body: pending })).json.error).toBe('bad_code')
})

test('export: the account, its sign-in methods and its tanks; delete: all of it, and the session ends', async () => {
  const { db, call, google } = setup()
  const { cookie, json: { user } } = await google('g-1')
  const t = V.valid.find(c => c.kind === 'tank')!.value
  await call('POST', '/api/v1/tanks/sync', { cookie, body: { store: store([t]) } })
  const ex = await call('GET', '/api/v1/account/export', { cookie })
  expect(ex.headers.get('content-disposition')).toMatch(/^attachment; filename="aquatome-2026-11-01\.json"$/)
  expect(ex.json).toMatchObject({ user: { id: user.id, methods: [{ kind: 'google' }] }, tanks: store([t]) })
  const del = await call('DELETE', '/api/v1/account', { cookie })
  expect(del.status).toBe(204)
  expect(del.headers.get('set-cookie')).toMatch(/^__Host-aq_session=; Path=\/; Max-Age=0/)
  for (const table of ['users', 'credentials', 'sessions', 'tank_records']) expect((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n, table).toBe(0)
  expect((await call('GET', '/api/v1/session', { cookie })).json.user).toBeNull()
})

test('logout ends the session and clears the cookie', async () => {
  const { call, google } = setup()
  const { cookie } = await google('g-1')
  const out = await call('POST', '/api/v1/auth/logout', { cookie, body: {} })
  expect(out.status).toBe(204)
  expect(out.headers.get('set-cookie')).toContain('Max-Age=0')
  expect((await call('GET', '/api/v1/session', { cookie })).json.user).toBeNull()
})

test('sessions expire, and a session used again is extended', async () => {
  const { call, google, setNow } = setup()
  const { cookie } = await google('g-1')
  setNow(new Date(NOW.getTime() + 170 * 86_400_000))
  expect((await call('GET', '/api/v1/session', { cookie })).json.user).not.toBeNull()
  setNow(new Date(NOW.getTime() + 340 * 86_400_000)) // 170 days after it was last used: still on
  expect((await call('GET', '/api/v1/session', { cookie })).json.user).not.toBeNull()
  setNow(new Date(NOW.getTime() + 521 * 86_400_000)) // 181 days without use
  expect((await call('GET', '/api/v1/session', { cookie })).json.user).toBeNull()
})

test('ID tokens: Apple\'s and Google\'s signature, issuer, audience and expiry are all checked', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }
  const keys = createLocalJWKSet({ keys: [jwk] })
  const verify = idTokenVerifier({ apple: keys, google: keys })
  const now = Math.floor(Date.now() / 1000)
  const sign = (claims: Record<string, unknown>, o: { iss?: string; aud?: string; exp?: number } = {}) =>
    new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(o.iss ?? 'https://appleid.apple.com').setAudience(o.aud ?? 'com.aquatome.app').setSubject('s-1').setIssuedAt(now - 10).setExpirationTime(o.exp ?? now + 600).sign(privateKey)
  expect(await verify('apple', await sign({ nonce: 'n', email: 'a@b.c', email_verified: 'true' }), ['com.aquatome.web', 'com.aquatome.app'])).toEqual({ sub: 's-1', nonce: 'n', email: 'a@b.c', emailVerified: true })
  expect(await verify('apple', await sign({}, { aud: 'com.other' }), ['com.aquatome.app'])).toBeUndefined()
  expect(await verify('apple', await sign({}, { iss: 'https://accounts.google.com' }), ['com.aquatome.app'])).toBeUndefined()
  expect(await verify('google', await sign({}, { iss: 'https://accounts.google.com', exp: now - 120 }), ['com.aquatome.app'])).toBeUndefined()
  expect(await verify('google', await sign({}, { iss: 'https://accounts.google.com' }), ['com.aquatome.app'])).toMatchObject({ sub: 's-1', emailVerified: false })
  expect(await verify('apple', await sign({}), [])).toBeUndefined()
  // Not signed with the provider's key (alg none; a forged signature).
  const [h, p] = (await sign({})).split('.')
  expect(await verify('apple', `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${p}.`, ['com.aquatome.app'])).toBeUndefined()
  expect(await verify('apple', `${h}.${p}.${'A'.repeat(342)}`, ['com.aquatome.app'])).toBeUndefined()
})

test('every path in the API contract (protocols/accounts.openapi.json) is served', async () => {
  const api = readJson('../../../../protocols/accounts.openapi.json') as { paths: Record<string, Record<string, unknown>> }
  const { call, google } = setup()
  for (const [path, ops] of Object.entries(api.paths)) {
    for (const method of Object.keys(ops)) {
      const { token } = await google('g-1', { client: 'app' })
      const r = await call(method.toUpperCase(), path.replace('{id}', '00000000-0000-4000-8000-000000000000'), { bearer: token, origin: null, ...(method === 'post' ? { body: { client: 'app' } } : {}) })
      expect(r.status === 404 && path !== '/api/v1/account/methods/{id}', `${method} ${path}: ${r.status}`).toBe(false)
    }
  }
  // The app signs out with its token alone.
  const { token } = await google('g-1', { client: 'app' })
  expect((await call('POST', '/api/v1/auth/logout', { bearer: token, origin: null, body: {} })).status).toBe(204)
  expect((await call('GET', '/api/v1/session', { bearer: token })).json.user).toBeNull()
})
