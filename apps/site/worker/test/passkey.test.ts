import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers'
import { expect, test } from 'vitest'
import { accounts, type AccountDeps, type AccountsEnv } from '../accounts/api'
import { sha256 } from '../accounts/session'
import { removeMethod } from '../accounts/users'
import { testD1 } from './d1'

const NOW = new Date('2026-11-01T00:00:00.000Z')
const ORIGIN = 'https://aquatome.com'
const enc = new TextEncoder()
const cat = (...parts: (Uint8Array | number[])[]) => Uint8Array.from(parts.flatMap(p => [...p]))
const sha = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', b))
const b64 = (b: Uint8Array) => isoBase64URL.fromBuffer(new Uint8Array(b))

/** An ECDSA signature as WebAuthn carries it (DER), from WebCrypto's raw r‖s. */
function der(raw: Uint8Array) {
  const int = (b: Uint8Array) => {
    let i = 0
    while (i < b.length - 1 && b[i] === 0) i++
    const v = b.slice(i)
    return v[0]! & 0x80 ? cat([0x02, v.length + 1, 0], v) : cat([0x02, v.length], v)
  }
  const body = cat(int(raw.slice(0, 32)), int(raw.slice(32)))
  return cat([0x30, body.length], body)
}

/** A software authenticator for one passkey: makes and uses it as a browser's would (no attestation). */
async function authenticator(o: { rpId?: string; counter?: number; idBytes?: number } = {}) {
  const keys = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const jwk = (await crypto.subtle.exportKey('jwk', keys.publicKey)) as JsonWebKey
  const rawId = crypto.getRandomValues(new Uint8Array(o.idBytes ?? 16))
  const id = b64(rawId)
  const cose = isoCBOR.encode(new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1], [-2, isoBase64URL.toBuffer(jwk.x!)], [-3, isoBase64URL.toBuffer(jwk.y!)]]))
  let counter = o.counter ?? 0
  let handle: string | undefined
  const authData = async (made: boolean, flags: number) => cat(
    await sha(enc.encode(o.rpId ?? 'aquatome.com')), [flags | (made ? 0x40 : 0)], [(counter >>> 24) & 255, (counter >>> 16) & 255, (counter >>> 8) & 255, counter & 255],
    made ? cat(new Uint8Array(16), [rawId.length >> 8, rawId.length & 255], rawId, cose) : [],
  )
  const client = (type: string, challenge: string, origin: string) => enc.encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }))
  return {
    id,
    setCounter: (n: number) => { counter = n },
    /** navigator.credentials.create(), as RegistrationResponseJSON. Flags: user present (1) and verified (4). */
    async create(options: { challenge: string; user: { id: string } }, opt: { origin?: string; flags?: number; transports?: string[] | string } = {}) {
      handle = options.user.id
      const attestationObject = isoCBOR.encode(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', await authData(true, opt.flags ?? 0x05)]]) as never)
      return { id, rawId: id, type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64(client('webauthn.create', options.challenge, opt.origin ?? ORIGIN)), attestationObject: b64(attestationObject), transports: opt.transports ?? ['internal'] } }
    },
    /** navigator.credentials.get(), as AuthenticationResponseJSON. */
    async get(options: { challenge: string }, opt: { origin?: string; flags?: number; userHandle?: string } = {}) {
      const ad = await authData(false, opt.flags ?? 0x05)
      const cd = client('webauthn.get', options.challenge, opt.origin ?? ORIGIN)
      const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, cat(ad, await sha(cd))))
      return { id, rawId: id, type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64(cd), authenticatorData: b64(ad), signature: b64(der(raw)), userHandle: opt.userHandle ?? handle } }
    },
  }
}

function setup(over: Partial<AccountsEnv> = {}) {
  const db = testD1()
  const deps: AccountDeps = {
    verifyIdToken: async (_p, token) => { const [sub, nonce] = token.split('|'); return sub ? { sub, emailVerified: false, ...(nonce ? { nonce } : {}) } : undefined },
    siteverify: async () => true,
  }
  const env: AccountsEnv = { DB: db, ACCOUNTS: 'on', PASSKEYS: 'on', CANONICAL_HOST: 'aquatome.com', ACCOUNT_HMAC_KEY: 'k'.repeat(32), GOOGLE_CLIENT_IDS: 'web', ...over }
  const call = async (method: string, path: string, o: { body?: unknown; cookie?: string; bearer?: string; app?: boolean; host?: string } = {}) => {
    const headers: Record<string, string> = { 'cf-connecting-ip': '203.0.113.9' }
    if (o.body !== undefined) headers['content-type'] = 'application/json'
    if (!o.app && method !== 'GET') headers.origin = `https://${o.host ?? 'aquatome.com'}`
    if (o.cookie) headers.cookie = o.cookie
    if (o.bearer) headers.authorization = `Bearer ${o.bearer}`
    const req = new Request(`https://${o.host ?? 'aquatome.com'}${path}`, { method, headers, ...(o.body !== undefined ? { body: JSON.stringify(o.body) } : {}) })
    const res = await accounts(req, new URL(req.url), env, NOW, deps)
    const text = await res.text()
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : undefined }
  }
  const cookieOf = (r: { headers: Headers }) => /^(__Host-aq_session=[^;]+)/.exec(r.headers.get('set-cookie') ?? '')?.[1]
  /** Signed in with the fake Google: the web cookie. */
  const google = async (sub: string) => {
    const { json: { nonce } } = await call('POST', '/api/v1/auth/nonce', { body: {} })
    return cookieOf(await call('POST', '/api/v1/auth/google', { body: { idToken: `${sub}|${nonce}`, nonce } }))!
  }
  /** Adds a new passkey to the account signed in with this cookie. */
  const add = async (cookie: string, a: Awaited<ReturnType<typeof authenticator>>, opt: Parameters<typeof a.create>[1] = {}) => {
    const options = (await call('POST', '/api/v1/account/passkey/options', { body: {}, cookie })).json
    return call('POST', '/api/v1/account/passkey', { body: { response: await a.create(options, opt) }, cookie })
  }
  const signIn = async (a: Awaited<ReturnType<typeof authenticator>>, opt: Parameters<typeof a.get>[1] & { app?: boolean } = {}) => {
    const options = (await call('POST', '/api/v1/auth/passkey/options', { body: {}, app: opt.app })).json
    return call('POST', '/api/v1/auth/passkey', { body: { response: await a.get(options, opt), ...(opt.app ? { client: 'app' } : {}) }, app: opt.app })
  }
  return { db, env, call, cookieOf, google, add, signIn }
}

test('a passkey answer sent twice at once with the same counter (a cloned key) signs in once', async () => {
  const { google, add, call } = setup()
  const a = await authenticator({ counter: 1 })
  expect((await add(await google('g-1'), a)).status).toBe(200)
  a.setCounter(5)
  const answers = await Promise.all([0, 1].map(async () => a.get((await call('POST', '/api/v1/auth/passkey/options', { body: {} })).json)))
  const both = await Promise.all(answers.map(response => call('POST', '/api/v1/auth/passkey', { body: { response } })))
  expect(both.map(r => r.status).sort()).toEqual([200, 401])
})

test('adding a passkey: a credential id over 1023 bytes and transports that are not a list are refused, not a server error', async () => {
  const { google, add, db } = setup()
  const cookie = await google('g-1')
  expect((await add(cookie, await authenticator({ idBytes: 1024 }))).json).toEqual({ error: 'bad_passkey' })
  const odd = await add(cookie, await authenticator(), { transports: 'internal' })
  expect(odd.status).toBe(200)
  expect((await db.prepare(`SELECT transports FROM credentials WHERE kind = 'passkey'`).first<{ transports: string | null }>())!.transports).toBeNull()
})

test('removing a method keeps one way in that is not a passkey, only right after signing in, and ends the other sessions', async () => {
  const { google, add, call, signIn, cookieOf, db } = setup()
  const cookie = await google('g-1')
  const a = await authenticator()
  expect((await add(cookie, a)).status).toBe(200)
  const elsewhere = cookieOf(await signIn(a))!
  const methods = (await call('GET', '/api/v1/session', { cookie })).json.user.methods as { id: string; kind: string }[]
  const id = (kind: string) => methods.find(m => m.kind === kind)!.id
  // Google is the only way in that isn't the passkey: it stays.
  expect((await call('DELETE', `/api/v1/account/methods/${id('google')}`, { cookie })).json).toEqual({ error: 'last_method' })
  // A session opened more than ten minutes ago removes or adds nothing: sign in again first. A refused removal ends no
  // session.
  const old = new Date(NOW.getTime() - 11 * 60_000).toISOString()
  const mine = await sha256(cookie.slice(cookie.indexOf('=') + 1))
  await db.prepare(`UPDATE sessions SET created_at = ? WHERE id = ?`).bind(old, mine).run()
  expect((await call('DELETE', `/api/v1/account/methods/${id('passkey')}`, { cookie })).json).toEqual({ error: 'reauth_needed' })
  expect((await call('POST', '/api/v1/account/passkey/options', { body: {}, cookie })).json).toEqual({ error: 'reauth_needed' })
  expect((await call('GET', '/api/v1/session', { cookie: elsewhere })).json.user).not.toBeNull()
  await db.prepare(`UPDATE sessions SET created_at = ? WHERE created_at = ?`).bind(NOW.toISOString(), old).run()
  // The passkey goes, and the session it opened elsewhere with it; this one goes on.
  expect((await call('DELETE', `/api/v1/account/methods/${id('passkey')}`, { cookie })).status).toBe(204)
  expect((await call('GET', '/api/v1/session', { cookie: elsewhere })).json.user).toBeNull()
  expect((await call('GET', '/api/v1/session', { cookie })).json.user.methods.map((m: { kind: string }) => m.kind)).toEqual(['google'])
})

test('the removal itself (not only the route\'s check before it) leaves a way in that is not a passkey', async () => {
  const { google, add, call, db } = setup()
  const cookie = await google('g-1')
  expect((await add(cookie, await authenticator())).status).toBe(200)
  const { user } = (await call('GET', '/api/v1/session', { cookie })).json as { user: { id: string; methods: { id: string; kind: string }[] } }
  const id = (kind: string) => user.methods.find(m => m.kind === kind)!.id
  // As a second removal at once would find it: the route's check passed, then this runs.
  expect(await removeMethod(db, user.id, id('google'), 'none')).toBe('last')
  expect(await removeMethod(db, user.id, id('passkey'), 'none')).toBe('removed')
})

test('a passkey added to a signed-in account then signs in to it on its own: a cookie on the web, a token in the app', async () => {
  const { call, cookieOf, google, add, signIn, db } = setup()
  expect((await call('GET', '/api/v1/session')).json.providers.passkey).toBe(true)
  const cookie = await google('g-1')
  const a = await authenticator()
  const added = await add(cookie, a)
  expect(added.status).toBe(200)
  expect(added.json.user.methods.map((m: { kind: string }) => m.kind)).toEqual(['google', 'passkey'])
  // What is kept: the credential id, its public key, counter and transports; no attestation.
  const row = await db.prepare(`SELECT subject, public_key, counter, transports FROM credentials WHERE kind = 'passkey'`).first<Record<string, unknown>>()
  expect(row).toMatchObject({ subject: a.id, counter: 0, transports: '["internal"]' })

  const web = await signIn(a)
  expect(web.status).toBe(200)
  expect(cookieOf(web)).toBeTruthy()
  expect(web.json.user.id).toBe(added.json.user.id)
  const app = await signIn(a, { app: true })
  expect(app.status).toBe(200)
  expect(app.json.token).toBeTruthy()
  expect(cookieOf(app)).toBeUndefined()
  expect((await call('GET', '/api/v1/session', { cookie: cookieOf(web)! })).json.user.methods).toHaveLength(2)
})

test('a passkey is refused: another origin or site, no user verification, a replayed challenge, a counter going back, another account\'s handle', async () => {
  const { google, add, signIn, call, db } = setup()
  const cookie = await google('g-1')
  // Made on another site, for another relying party, or without Face ID / a PIN: not added.
  expect((await add(cookie, await authenticator(), { origin: 'https://evil.example' })).json).toEqual({ error: 'bad_passkey' })
  expect((await add(cookie, await authenticator({ rpId: 'evil.example' }))).json).toEqual({ error: 'bad_passkey' })
  expect((await add(cookie, await authenticator(), { flags: 0x01 })).json).toEqual({ error: 'bad_passkey' })

  const a = await authenticator({ counter: 5 })
  expect((await add(cookie, a)).status).toBe(200)
  a.setCounter(6)
  expect((await signIn(a)).status).toBe(200)
  // A counter that doesn't move on (a cloned key), another origin, no verification: refused.
  expect((await signIn(a)).json).toEqual({ error: 'bad_passkey' })
  a.setCounter(7)
  expect((await signIn(a, { origin: 'https://evil.example' })).json).toEqual({ error: 'bad_passkey' })
  expect((await signIn(a, { flags: 0x01 })).json).toEqual({ error: 'bad_passkey' })
  expect((await signIn(a, { userHandle: isoBase64URL.fromUTF8String('someone-else') })).json).toEqual({ error: 'bad_passkey' })

  // A challenge answers once: a synced passkey's counter stays 0, so only that stops a replay.
  const synced = await authenticator()
  expect((await add(cookie, synced)).status).toBe(200)
  const options = (await call('POST', '/api/v1/auth/passkey/options', { body: {} })).json
  const response = await synced.get(options)
  expect((await call('POST', '/api/v1/auth/passkey', { body: { response } })).status).toBe(200)
  expect((await call('POST', '/api/v1/auth/passkey', { body: { response } })).json).toEqual({ error: 'bad_passkey' })
  // A passkey nobody added, and rubbish: refused, nothing thrown.
  expect((await signIn(await authenticator())).json).toEqual({ error: 'bad_passkey' })
  expect((await call('POST', '/api/v1/auth/passkey', { body: { response: { id: 'x', response: { clientDataJSON: 'not base64!' } } } })).json).toEqual({ error: 'bad_passkey' })
  expect((await call('POST', '/api/v1/auth/passkey', { body: {} })).json).toEqual({ error: 'bad_passkey' })
  expect((await db.prepare(`SELECT counter FROM credentials WHERE subject = ?`).bind(a.id).first<{ counter: number }>())!.counter).toBe(6)
})

test("adding a passkey: only to the account that asked for the challenge; one passkey one account; signed out, cross-site, or off: refused", async () => {
  const { google, call, add, env } = setup()
  const one = await google('g-1')
  const two = await google('g-2')
  const a = await authenticator()
  // Options asked by account one, answered while signed in as account two.
  const options = (await call('POST', '/api/v1/account/passkey/options', { body: {}, cookie: one })).json
  expect((await call('POST', '/api/v1/account/passkey', { body: { response: await a.create(options) }, cookie: two })).json).toEqual({ error: 'bad_passkey' })
  expect((await add(one, a)).status).toBe(200)
  // The same passkey (same credential id) again, for the other account: it belongs to account one.
  expect((await add(two, a)).json).toEqual({ error: 'credential_in_use' })
  // The options name the passkeys it has, so the device doesn't make a second one.
  expect((await call('POST', '/api/v1/account/passkey/options', { body: {}, cookie: one })).json.excludeCredentials).toEqual([{ id: a.id, type: 'public-key', transports: ['internal'] }])

  expect((await call('POST', '/api/v1/account/passkey/options', { body: {} })).status).toBe(401)
  const cross = new Request('https://aquatome.com/api/v1/auth/passkey', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie: one }, body: '{}' })
  expect((await accounts(cross, new URL(cross.url), env, NOW, { verifyIdToken: async () => undefined, siteverify: async () => true })).status).toBe(403)
  // Another host (the workers.dev address): no relying party there.
  expect((await call('POST', '/api/v1/auth/passkey/options', { body: {}, host: 'aquatome.example.workers.dev' })).json).toEqual({ error: 'provider_off' })
})

/** This database, with statements containing `match` failing as D1 does when it is down. */
const failing = (db: D1Database, match: string) => new Proxy(db, {
  get: (t, k) => k === 'prepare' ? (sql: string) => { if (sql.includes(match)) throw new Error('D1 down'); return t.prepare(sql) } : Reflect.get(t, k),
})

test('a database failure is a server error, not "in use" or "bad passkey"; only known transports are kept', async () => {
  const { google, add, signIn, env, db } = setup()
  const cookie = await google('g-1')
  env.DB = failing(db, 'INSERT INTO credentials')
  await expect(add(cookie, await authenticator())).rejects.toThrow('D1 down')
  env.DB = db
  const a = await authenticator()
  expect((await add(cookie, a, { transports: ['internal', 'hybrid', 'x'.repeat(500)] })).status).toBe(200)
  expect((await db.prepare(`SELECT transports FROM credentials WHERE subject = ?`).bind(a.id).first<{ transports: string }>())!.transports).toBe('["internal","hybrid"]')
  env.DB = failing(db, 'UPDATE credentials SET counter')
  await expect(signIn(a)).rejects.toThrow('D1 down')
})

test('passkeys off: not offered, every passkey path answers provider_off', async () => {
  const { call, google } = setup({ PASSKEYS: undefined })
  expect((await call('GET', '/api/v1/session')).json.providers.passkey).toBe(false)
  const cookie = await google('g-1')
  for (const path of ['/api/v1/auth/passkey/options', '/api/v1/auth/passkey', '/api/v1/account/passkey/options', '/api/v1/account/passkey']) {
    expect((await call('POST', path, { body: {}, cookie })).json).toEqual({ error: 'provider_off' })
  }
})
