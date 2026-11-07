import { readFileSync } from 'node:fs'
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { LANG, LANGS } from '@aq/schema/langs'
import { createSession } from '../accounts/session'
import { CHANGELOG_PATH, hostPath, innerPath, REPORT_PATH, SCOREBOARD_PATH, WEB_PAGES } from '../admin/shell'
import { RUNS_PATH, runPath, runsJsonPath } from '../admin/runs'
import { APP_PAGES } from '../app-switch'
import { putReport } from '../daily/log'
import { handle, type Env } from '../index'
import { OWNER_SCRIPT } from '../owner'
import { DASHBOARD_HOST, dashboardUrl, SITE_HOST } from '../paths'
import { testD1 } from './d1'
import { memoryR2 } from './r2'

/** A fish-ID run's id, for its page's address. */
const RUN = '00000000-0000-4000-8000-000000000001'

/**
 * The owner's dashboard on its own host, behind Cloudflare Access (worker/dashboard-host.ts, worker/access.ts): the
 * tokens are signed here with a test key pair and its certs answered by a stand-in for the team's address, no network.
 */
const TEAM = 'aquatome-test.cloudflareaccess.com'
const AUD = 'aud-tag-of-the-access-app'
const CERTS = `https://${TEAM}/cdn-cgi/access/certs`
const CONFIG = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, CANONICAL_HOST: SITE_HOST }
const KID = 'key-1'
const DASH = `https://${DASHBOARD_HOST}`
const SITE = `https://${SITE_HOST}`
const browser = { 'user-agent': 'Mozilla/5.0 Chrome/141.0 Safari/537.36', 'accept-language': 'vi' }

let keys: CryptoKeyPair
let other: CryptoKeyPair
let certs: { keys: JWK[] }
let certFetches: string[]

beforeAll(async () => {
  keys = await generateKeyPair('RS256', { extractable: true })
  other = await generateKeyPair('RS256', { extractable: true })
  certs = { keys: [{ ...(await exportJWK(keys.publicKey)), kid: KID, alg: 'RS256', use: 'sig' }] }
})
beforeEach(() => {
  certFetches = []
  // The only address these checks may fetch: anything else is a test reaching for the network.
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const u = String(input instanceof Request ? input.url : input)
    certFetches.push(u)
    if (u.endsWith('/cdn-cgi/access/certs')) return Response.json(certs)
    throw new Error(`no network in these tests: ${u}`)
  })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

type Claims = { aud?: string | string[]; iss?: string; exp?: number | null; nbf?: number; key?: CryptoKey; kid?: string }
/** A token as Access writes it: RS256, its audience a list, an email. */
async function jwt({ aud = [AUD], iss = `https://${TEAM}`, exp = Math.floor(Date.now() / 1000) + 3600, nbf, key = keys.privateKey, kid = KID }: Claims = {}) {
  const t = new SignJWT({ email: 'owner@aquatome.test', type: 'app' }).setProtectedHeader({ alg: 'RS256', kid }).setIssuedAt().setAudience(aud).setIssuer(iss).setSubject('s')
  if (exp !== null) t.setExpirationTime(exp)
  if (nbf !== undefined) t.setNotBefore(nbf)
  return t.sign(key)
}

const PAGE = '<!doctype html><html lang="vi"><head><title>public page</title></head><body><p>x</p></body></html>'
function env(over: Partial<Env> = {}) {
  const seen: string[] = []
  const store = new Map<string, string>()
  const meta = new Map<string, unknown>()
  const e = {
    ASSETS: { fetch: async (r: Request) => { seen.push(new URL(r.url).pathname); return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } }) } },
    AB: {
      get: async (k: string, o?: unknown) => { const v = store.get(k); return v === undefined ? null : o ? JSON.parse(v) : v },
      put: async (k: string, v: string, o?: { metadata?: unknown }) => { store.set(k, v); meta.set(k, o?.metadata) },
      list: async ({ prefix = '' }: { prefix?: string } = {}) => ({ keys: [...store.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name, metadata: meta.get(name) })), list_complete: true }),
    },
    AB_DASH_TOKEN: 'tok', OWNER_ACCOUNTS: 'owner-1', ...CONFIG, ...over,
  } as unknown as Env
  return { e, seen, store }
}
const dash = async (path: string, init: RequestInit & { token?: string | null } = {}, e: Env = env().e) => {
  const { token, ...rest } = init
  const assertion = token === undefined ? await jwt() : token
  const headers = { ...browser, ...(assertion ? { 'cf-access-jwt-assertion': assertion } : {}), ...(rest.headers as Record<string, string> | undefined) }
  return handle(new Request(`${DASH}${path}`, { ...rest, headers }), e)
}
const site = (path: string, e: Env, headers: Record<string, string> = browser, init: RequestInit = {}) => handle(new Request(`${SITE}${path}`, { ...init, headers }), e)

/** The owner's account signed in on the site (web and app) and a reader's. */
async function accounts(db = testD1()) {
  for (const id of ['owner-1', 'reader-1']) await db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind(id, '2026-11-01T00:00:00Z').run()
  const now = new Date()
  return { db, owner: `__Host-aq_session=${await createSession(db, 'owner-1', 'web', now)}`, reader: `__Host-aq_session=${await createSession(db, 'reader-1', 'web', now)}`, app: await createSession(db, 'owner-1', 'app', now) }
}

/** The owner's dashboard itself, as opposed to the refusal or a public page. */
const isDashboard = (html: string) => html.includes('Các mục quản trị')

// ---- The token ----

test('a valid token opens the dashboard: the overview at /, each page at /<key>/ (the web-only ones too), with no site session', async () => {
  const { e } = env()
  const home = await dash('/', {}, e)
  expect(home.status).toBe(200)
  const html = await home.text()
  expect(isDashboard(html)).toBe(true)
  expect(html).toContain('href="/" aria-current="page"')
  expect(WEB_PAGES).toEqual(expect.arrayContaining([SCOREBOARD_PATH, REPORT_PATH, CHANGELOG_PATH]))
  for (const p of WEB_PAGES.filter(x => x !== '/_ab/')) {
    const key = p.slice('/_ab'.length)
    const r = await dash(key, {}, e)
    expect(r.status, key).toBe(200)
    expect(await r.text(), key).toContain(`href="${key}" aria-current="page"`)
  }
})

test('a page added under /_ab/<key>/ needs nothing else: the mapping reads the dashboard\'s own list of its pages', () => {
  for (const [inner, host] of [['/_ab/', '/'], ['/_ab/doc-gia/', '/doc-gia/'], ['/_ab/thanh-cong/', '/thanh-cong/'], ['/_ab/thanh-cong.json', '/thanh-cong.json'], ['/_ab/bao-cao/', '/bao-cao/'], ['/_ab/bao-cao/1003/', '/bao-cao/1003/'],
    // The fish-ID runs, under their section: a day's list, one run, the day as JSON (admin/runs.ts).
    [RUNS_PATH, '/nhan-dien-ca/luot/'], [runPath('2026-11-06', RUN), `/nhan-dien-ca/luot/2026-11-06/${RUN}/`], [runsJsonPath('2026-11-06'), '/nhan-dien-ca/luot/2026-11-06.json']] as const) {
    expect([inner, hostPath(inner)]).toEqual([inner, host])
    expect([host, innerPath(host)]).toEqual([host, inner])
  }
  expect(hostPath('/_ab/nhan-dien-ca/?x=1#key')).toBe('/nhan-dien-ca/?x=1#key')
  // The rest of /_ab/ (actions, images, fonts, the build's JSON) stays where it is, on both hosts.
  for (const p of ['/_ab/hidden', '/_ab/hidden.json', '/_ab/content.json', '/_ab/photos', '/_ab/report', '/_ab/anh/abc', '/_ab/fonts/a.woff2', '/_ab/anh-nhan-dien/anh/x/y', '/_ab/anh-nhan-dien/xoa', '/_ab/khong-co/', '/ca/x/', '/']) expect(hostPath(p), p).toBe(p)
  for (const p of ['/hidden', '/hidden.json', '/fonts/', '/anh/', '/report', '/khong-co/', '/doc-gia', '/ca/x/', '/doc-gia/../hidden', '/DOC-GIA/']) expect(innerPath(p), p).toBeUndefined()
})

test('one address is printed for a dashboard page outside it, the site\'s, which opens before and after the move', () => {
  expect(dashboardUrl()).toBe(`${SITE}/_ab/`)
  expect(dashboardUrl('/_ab/nhan-dien-ca/#key')).toBe(`${SITE}/_ab/nhan-dien-ca/#key`)
})

test('the web-only pages on the host: the scoreboard, its JSON, the report log and one report, with their links', async () => {
  const { e } = env()
  await putReport(e.AB, '1003', { when: '2026-11-05T00:00:00.000Z', subject: 'AquaTome · 5/11', sent: true, care: 0, text: 't', html: '<p>mail</p>' })
  const score = await dash('/thanh-cong/', {}, e)
  expect(score.status).toBe(200)
  expect(await score.text()).toContain('href="/thanh-cong/" aria-current="page"')
  const json = await dash('/thanh-cong.json', {}, e)
  expect([json.status, json.headers.get('content-type'), json.headers.get('x-robots-tag'), json.headers.get('cache-control')]).toEqual([200, 'application/json', 'noindex, nofollow', 'no-store'])
  expect(await json.json()).toMatchObject({ page: `${SITE}/_ab/thanh-cong/` })
  const log = await (await dash('/bao-cao/', {}, e)).text()
  expect(log).toContain('href="/bao-cao/" aria-current="page"')
  expect(log).toContain('href="/bao-cao/1003/"')
  const one = await dash('/bao-cao/1003/', {}, e)
  expect(one.status).toBe(200)
  const html = await one.text()
  expect(html).toContain('<p>mail</p>')
  expect(html).toContain('href="/bao-cao/"')
  expect((await dash('/bao-cao/999/', {}, e)).status).toBe(404)
  // From before the move, the same page here.
  for (const [from, to] of [['/_ab/thanh-cong/', '/thanh-cong/'], ['/_ab/thanh-cong.json', '/thanh-cong.json'], ['/_ab/bao-cao/1003/', '/bao-cao/1003/'], ['/_ab/bao-cao', '/bao-cao/']] as const) {
    expect((await dash(from, {}, e)).headers.get('location'), from).toBe(to)
  }
  for (const p of ['/thanh-cong/', '/thanh-cong.json', '/bao-cao/', '/bao-cao/1003/']) expect((await dash(p, { token: null }, e)).status, p).toBe(403)
})

const refusedTokens: [string, () => Promise<string | null>][] = [
  ['missing', async () => null],
  ['empty', async () => ''],
  ['garbage', async () => 'not-a-token'],
  ['wrong aud', () => jwt({ aud: ['another-app'] })],
  ['no aud', async () => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: KID }).setIssuer(`https://${TEAM}`).setExpirationTime('1h').sign(keys.privateKey)],
  ['wrong issuer', () => jwt({ iss: 'https://evil.cloudflareaccess.com' })],
  ['the bare team domain as issuer', () => jwt({ iss: TEAM })],
  ['expired', () => jwt({ exp: Math.floor(Date.now() / 1000) - 5 })],
  ['no expiry', () => jwt({ exp: null })],
  ['not yet valid', () => jwt({ nbf: Math.floor(Date.now() / 1000) + 600 })],
  ['bad signature: another key under our kid', () => jwt({ key: other.privateKey })],
  ['an unknown kid', () => jwt({ key: other.privateKey, kid: 'someone-elses' })],
  ['tampered claims', async () => {
    const [h, p, s] = (await jwt({ aud: ['another-app'] })).split('.') as [string, string, string]
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString()) as Record<string, unknown>
    return [h, Buffer.from(JSON.stringify({ ...claims, aud: [AUD] })).toString('base64url'), s].join('.')
  }],
  ['alg none', async () => {
    const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    return `${b({ alg: 'none', kid: KID })}.${b({ aud: [AUD], iss: `https://${TEAM}`, exp: Math.floor(Date.now() / 1000) + 3600 })}.`
  }],
  ['HS256 keyed with the public cert', async () => {
    const secret = new TextEncoder().encode(JSON.stringify(certs.keys[0]))
    return new SignJWT({}).setProtectedHeader({ alg: 'HS256', kid: KID }).setAudience(AUD).setIssuer(`https://${TEAM}`).setExpirationTime('1h').sign(secret)
  }],
]
for (const [name, make] of refusedTokens) {
  test(`a token that is ${name}: 403, and the dashboard is never served`, async () => {
    const { e, seen } = env()
    for (const path of ['/', '/doc-gia/', '/_ab/hidden.json', '/robots.txt', '/ca/x/']) {
      const r = await dash(path, { token: await make() }, e)
      expect(r.status, path).toBe(403)
      expect(isDashboard(await r.text()), path).toBe(false)
      expect([r.headers.get('x-robots-tag'), r.headers.get('cache-control')], path).toEqual(['noindex, nofollow', 'no-store'])
    }
    expect(seen).toEqual([]) // the build's own files, the dashboard's data among them, were never read
  })
}

test('the audience as Access writes it (a list) and as a plain string both pass; a team domain written with https:// reads the same', async () => {
  expect((await dash('/', { token: await jwt({ aud: ['x', AUD] }) })).status).toBe(200)
  expect((await dash('/', { token: await jwt({ aud: AUD }) })).status).toBe(200)
  const { e } = env({ ACCESS_TEAM_DOMAIN: `https://${TEAM}/` } as Partial<Env>)
  expect((await dash('/', {}, e)).status).toBe(200)
})

test('RS256 only: another RSA algorithm is refused, even from a key the team publishes', async () => {
  const pair = await generateKeyPair('RS512', { extractable: true })
  const team = 'rs512.cloudflareaccess.com'
  const { alg: _, ...key } = await exportJWK(pair.publicKey)
  vi.stubGlobal('fetch', async () => Response.json({ keys: [{ ...key, kid: 'k' }] }))
  const token = await new SignJWT({}).setProtectedHeader({ alg: 'RS512', kid: 'k' }).setAudience(AUD).setIssuer(`https://${team}`).setExpirationTime('1h').sign(pair.privateKey)
  const { e } = env({ ACCESS_TEAM_DOMAIN: team } as Partial<Env>)
  expect((await dash('/', { token }, e)).status).toBe(403)
})

test('the site\'s own session opens nothing here: only the token does', async () => {
  const { db, owner } = await accounts()
  const { e } = env({ DB: db } as Partial<Env>)
  expect((await dash('/', { token: null, headers: { cookie: owner } }, e)).status).toBe(403)
  expect((await dash('/', { token: null, headers: { authorization: 'Bearer tok' } }, e)).status).toBe(403)
})

test('a certs address that fails refuses (503, 500, not JSON, no keys, no answer) and nothing is stored from it', async () => {
  const failing: (() => Response | Promise<Response>)[] = [
    () => new Response('down', { status: 503 }),
    () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    () => Response.json({ keys: [] }),
    () => { throw new Error('unreachable') },
  ]
  for (const [i, answer] of failing.entries()) {
    const team = `failing-${i}.cloudflareaccess.com`
    vi.stubGlobal('fetch', async () => answer())
    const { e } = env({ ACCESS_TEAM_DOMAIN: team } as Partial<Env>)
    expect((await dash('/', { token: await jwt({ iss: `https://${team}` }) }, e)).status, String(i)).toBe(403)
  }
})

test('the certs are fetched from the team\'s address and cached; a key rotated in is found', async () => {
  const team = 'cached.cloudflareaccess.com'
  const { e } = env({ ACCESS_TEAM_DOMAIN: team } as Partial<Env>)
  const iss = `https://${team}`
  for (let i = 0; i < 5; i++) expect((await dash('/', { token: await jwt({ iss }) }, e)).status).toBe(200)
  expect(certFetches.filter(u => u.endsWith('/certs'))).toEqual([`https://${team}/cdn-cgi/access/certs`])

  // A new key under a new kid, past jose's half-minute wait between fetches.
  const before = certs
  certs = { keys: [...certs.keys, { ...(await exportJWK(other.publicKey)), kid: 'key-2', alg: 'RS256', use: 'sig' }] }
  vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 31_000 })
  try {
    expect((await dash('/', { token: await jwt({ iss, key: other.privateKey, kid: 'key-2' }) }, e)).status).toBe(200)
  } finally {
    certs = before
  }
  expect(certFetches.filter(u => u.endsWith('/certs'))).toHaveLength(2)
})

test('the certs of the configured team only: never an address the token names', async () => {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const token = `${b({ alg: 'RS256', kid: KID, jku: 'https://evil.test/certs', x5u: 'https://evil.test/c' })}.${b({ aud: [AUD], iss: 'https://evil.test', exp: 9999999999 })}.AAAA`
  await dash('/', { token })
  expect(certFetches.filter(u => !u.startsWith(`https://${TEAM}/`))).toEqual([])
})

// ---- Not configured: closed here, today's dashboard on the site ----

const UNSET: Partial<Env>[] = [{ ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' }, { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: '' }, { ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: AUD }, { ACCESS_TEAM_DOMAIN: undefined, ACCESS_AUD: undefined }] as Partial<Env>[]

test('unconfigured, or half configured: the host refuses everything, a valid token too, and no key is fetched', async () => {
  for (const vars of UNSET) {
    const { e, seen } = env(vars)
    for (const path of ['/', '/doc-gia/', '/_ab/', '/_ab/hidden.json', '/robots.txt', '/ca/x/', '/_c/admin/queue', '/api/owner/dashboard']) {
      const r = await dash(path, {}, e)
      expect(r.status, path).toBe(403)
      expect(isDashboard(await r.text()), path).toBe(false)
    }
    const post = await dash('/_ab/hidden', { method: 'POST', body: new URLSearchParams({ url: '/ca/x/', action: 'hide' }), headers: { 'sec-fetch-site': 'same-origin' } }, e)
    expect(post.status).toBe(403)
    expect(seen).toEqual([])
  }
  expect(certFetches).toEqual([])
})

test('unconfigured: /_ab/ on the site is exactly today\'s, with no redirect: the owner\'s session opens it, and the owner bar\'s links stay on it', async () => {
  const { db, owner } = await accounts()
  for (const vars of UNSET) {
    const { e } = env({ DB: db, ...vars } as Partial<Env>)
    for (const p of ['/_ab/', '/_ab/doc-gia/', '/_ab/doc-gia', '/_ab/ung-dung/?test=1']) {
      const signedIn = await site(p, e, { ...browser, cookie: owner })
      expect([p, signedIn.status, signedIn.headers.get('location')]).toEqual([p, 200, null])
      const html = await signedIn.text()
      expect(isDashboard(html), p).toBe(true)
      // Links as they are today: no public page sent elsewhere, no sign-out of Access.
      expect(html).toContain('href="/_ab/doc-gia/"')
      expect(html).not.toContain('/cdn-cgi/access/logout')
      expect(signedIn.headers.getSetCookie()[0]).toMatch(/^aq_owner=1; Path=\/;[^D]*$/)
      expect((await site(p, e)).status, p).toBe(200) // signed out: the sign-in in its place
    }
  }
  expect(OWNER_SCRIPT).toContain("['Quản trị','/_ab/']")
  expect(OWNER_SCRIPT).toContain("['Người đọc','/_ab/doc-gia/']")
})

// ---- Configured: the site's /_ab/ after the move ----

test('configured: a browser\'s GET of a dashboard page on the site 301s to the same page on the host, and the owner bar\'s links arrive there', async () => {
  const { db, owner } = await accounts()
  const { e } = env({ DB: db } as Partial<Env>)
  for (const p of [...WEB_PAGES, `${REPORT_PATH}1003/`]) {
    for (const [headers, method] of [[browser, 'GET'], [{ ...browser, cookie: owner }, 'GET'], [browser, 'HEAD']] as const) {
      const r = await site(p, e, headers, { method })
      expect([p, r.status, r.headers.get('location')]).toEqual([p, 301, `${DASH}${p.slice('/_ab'.length)}`])
      // Never remembered by the browser, so turning Access off again can't leave anyone stuck on the host.
      expect(r.headers.get('cache-control')).toBe('no-store')
    }
  }
  expect((await site('/_ab', e)).headers.get('location')).toBe(`${DASH}/`)
  expect((await site('/_ab/doc-gia', e)).headers.get('location')).toBe(`${DASH}/doc-gia/`)
  expect((await site('/_ab/ung-dung/?test=1', e)).headers.get('location')).toBe(`${DASH}/ung-dung/?test=1`)
  for (const link of ['/_ab/', '/_ab/doc-gia/']) {
    expect(OWNER_SCRIPT).toContain(`'${link}'`)
    expect((await site(link, e)).status).toBe(301)
  }
})

test('configured: what isn\'t a browser asking for a page stays on the site, unchanged', async () => {
  const { db, owner, reader, app } = await accounts()
  const r2 = memoryR2()
  const id = crypto.randomUUID()
  await r2.bucket.put(`fish-id/reader-1/${id}`, new Uint8Array([0xff, 0xd8, 1]), { customMetadata: { created: '2026-11-03T10:00:00.000Z', verdict: 'fish', guesses: '[]', model: 'm', lang: 'vi' } })
  const { e, store } = env({ DB: db, UPLOADS: r2.bucket } as Partial<Env>)
  const dashToken = { authorization: 'Bearer tok' }

  // The build's and scripts' token.
  const hidden = await site('/_ab/hidden.json', e, dashToken)
  expect([hidden.status, await hidden.json()]).toEqual([200, {}])
  expect((await site('/_ab/hidden.json', e)).status).toBe(404)
  // A bearer on a page gets what it gets today (no page, and no redirect).
  for (const h of [dashToken, { authorization: `Bearer ${app}` }]) {
    const r = await site('/_ab/doc-gia/', e, h)
    expect([r.status, r.headers.get('location'), isDashboard(await r.text())]).toEqual([200, null, false])
  }
  // Every machine endpoint: answered, not moved.
  const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) })
  for (const [path, init] of [['/_c/admin/queue', {}], ['/_c/admin/decisions', post([])], ['/_aff/products', post([])], ['/_p/admin/queue', {}], ['/_ab/report', post({})], ['/_ab/thanh-cong.json', {}]] as [string, RequestInit][]) {
    expect((await site(path, e, dashToken, init)).status, path).not.toBe(404)
    expect((await site(path, e, browser, init)).status, path).toBe(404)
  }
  // The owner bar's button: the owner's session on the site.
  const form = (cookie: string) => site('/_ab/hidden', e, { ...browser, cookie, 'content-type': 'application/x-www-form-urlencoded' }, { method: 'POST', body: new URLSearchParams({ url: '/ca/x/', action: 'hide' }) })
  expect((await form(reader)).status).toBe(404)
  const hide = await form(owner)
  expect([hide.status, hide.headers.get('location')]).toEqual([303, '/_ab/an-trang/'])
  expect(JSON.parse(store.get('hidden')!)).toHaveProperty(['/ca/x/'])
  // The iOS app: its owner API and the two images, with its own session.
  const appHeaders = { authorization: `Bearer ${app}` }
  expect((await site('/api/owner/dashboard', e, appHeaders)).status).toBe(200)
  const img = await site(`/_ab/anh-nhan-dien/anh/reader-1/${id}`, e, appHeaders)
  expect([img.status, img.headers.get('location')]).toEqual([200, null])
  // The old token form's address, and a reader's own session on a page: as a browser, moved.
  expect((await site('/_ab/login', e, browser, { method: 'POST' })).headers.get('location')).toBe('/_ab/')
  expect((await site('/_ab/', e, { ...browser, cookie: reader })).status).toBe(301)
})

test('the machine endpoints are not on the host: without a token 403, and with one nothing answers them', async () => {
  const { db } = await accounts()
  const { e } = env({ DB: db } as Partial<Env>)
  for (const path of ['/_aff/products', '/_c/admin/queue', '/_c/admin/decisions', '/_p/admin/queue', '/api/owner/dashboard']) {
    expect((await dash(path, { token: null, headers: { authorization: 'Bearer tok' } }, e)).status, path).toBe(403)
    expect((await dash(path, { headers: { authorization: 'Bearer tok' } }, e)).status, path).toBe(404)
  }
  // The daily report's post (daily-report.yml): its route is the site's, so on the host it's nothing.
  const report = { method: 'POST', body: '{}', headers: { authorization: 'Bearer tok', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' } }
  expect((await dash('/_ab/report', { ...report, token: null }, e)).status).toBe(403)
  expect((await dash('/_ab/report', report, e)).status).toBe(404)
  expect((await dash('/report', report, e)).status).toBe(404)
})

// ---- The host's routes ----

test('with a token: /_ab/<key>/ 301s to /<key>/, the query kept; anything else of the site is 404, unread', async () => {
  const { e, seen } = env()
  for (const [from, to] of [['/_ab/', '/'], ['/_ab', '/'], ['/_ab/doc-gia/', '/doc-gia/'], ['/_ab/doc-gia', '/doc-gia/'], ['/_ab/ung-dung/?test=1', '/ung-dung/?test=1']] as const) {
    const r = await dash(from, {}, e)
    expect([from, r.status, r.headers.get('location')]).toEqual([from, 301, to])
  }
  seen.length = 0
  for (const p of ['/ca/x/', '/ca/', '/vi/', '/id/', '/huong-dan/x/', '/dang-nhap/', '/api/v1/session', '/go/shopee/', '/_e', '/_c', '/_p', '/.well-known/api-catalog', '/doc-gia', '/hidden/', '/fonts/', '/content.json', '/_ab/content.json', '/_ab/khong-co/', '/%5Fab/', '//_ab/', '//evil.test/', '/_auth', '/index.html']) {
    expect((await dash(p, {}, e)).status, p).toBe(404)
  }
  expect(seen).toEqual([])
})

test('every answer is noindex and never stored: pages, redirects, refusals, not found, wrong method, robots; a font stays cacheable, as today', async () => {
  const { e } = env()
  const answers = {
    page: await dash('/doc-gia/', {}, e),
    moved: await dash('/_ab/doc-gia/', {}, e),
    refused: await dash('/doc-gia/', { token: null }, e),
    unknown: await dash('/ca/x/', {}, e),
    method: await dash('/doc-gia/', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } }, e),
    robots: await dash('/robots.txt', {}, e),
    hidden: await dash('/_ab/hidden.json', {}, e),
    fontRefused: await dash('/_ab/fonts/a.woff2', { token: null }, e),
  }
  for (const [name, r] of Object.entries(answers)) expect([name, r.headers.get('x-robots-tag'), r.headers.get('cache-control')]).toEqual([name, 'noindex, nofollow', 'no-store'])
  const font = await dash('/_ab/fonts/a.woff2', {}, e)
  expect([font.status, font.headers.get('x-robots-tag'), font.headers.get('cache-control')]).toEqual([200, 'noindex, nofollow', 'public, max-age=604800'])
})

test('robots.txt there disallows everything; the site\'s is the site\'s', async () => {
  const { e, seen } = env()
  const r = await dash('/robots.txt', {}, e)
  expect([r.status, await r.text()]).toEqual([200, 'User-agent: *\nDisallow: /\n'])
  expect(seen).toEqual([])
  await site('/robots.txt', e)
  expect(seen).toEqual(['/robots.txt'])
})

test('the host-redirect rule lets the dashboard host through; every other host still goes to the site', async () => {
  const { e } = env()
  expect((await dash('/doc-gia/', {}, e)).status).toBe(200)
  for (const host of ['www.aquatome.com', 'old.workers.dev', 'dashboard.aquatome.com.evil.test', 'dashboard-aquatome.com']) {
    const r = await handle(new Request(`https://${host}/_ab/doc-gia/`, { headers: browser }), e)
    expect([host, r.status, r.headers.get('location')]).toEqual([host, 301, `${SITE}/_ab/doc-gia/`])
  }
})

// ---- The pages on the host ----

const hiddenPath = '/ca/ca-neon/'
async function hiddenPage() {
  const { e, store } = env()
  store.set('hidden', JSON.stringify({ [hiddenPath]: { at: '2026-11-01T00:00:00.000Z', note: 'Ghi chú <b> "x"' } }))
  return { e, store, html: await (await dash('/an-trang/', {}, e)).text() }
}

test('a page\'s links: its own by address on the host, the site\'s pages back on the site, forms, images and fonts where they are', async () => {
  const { html } = await hiddenPage()
  for (const p of WEB_PAGES) expect(html, p).toContain(`href="${hostPath(p)}"`)
  expect(html).not.toMatch(/href="\/_ab\/(?:[a-z0-9-]+\/)?["?#]/)
  expect(html).toContain('class="brand" href="/"')
  // A hidden page's link is the public page's address, not a 404 on this host.
  expect(html).toContain(`<a href="${SITE}${hiddenPath}">`)
  // No root-relative link is left that this host wouldn't answer.
  const own = [...html.matchAll(/\b(?:href|src|action)="(\/[^"]*)"/g)].map(m => m[1]!)
  for (const link of own) expect(link.startsWith('/_ab/') || link.startsWith('/cdn-cgi/access/') || !!innerPath(link.replace(/[?#].*$/, '')), link).toBe(true)
  expect(html).toContain('action="/_ab/hidden"')
  expect(html).toContain('url(/_ab/fonts/')
  expect(html).toContain('Ghi chú &lt;b&gt;') // escaped text comes through untouched
})

test('on every page, no root-relative link is left that this host wouldn\'t answer', async () => {
  const { e } = env()
  await putReport(e.AB, '1003', { when: '2026-11-05T00:00:00.000Z', subject: 's', sent: true, care: 0, text: 't', html: '<p>mail</p>' })
  for (const p of [...WEB_PAGES, `${REPORT_PATH}1003/`, RUNS_PATH].map(hostPath)) {
    const html = await (await dash(p, {}, e)).text()
    expect(isDashboard(html), p).toBe(true)
    for (const [, link] of html.matchAll(/\b(?:href|src|action)="(\/[^"]*)"/g)) {
      expect(link!.startsWith('/_ab/') || link!.startsWith('/cdn-cgi/access/') || !!innerPath(link!.replace(/[?#].*$/, '')), `${p}: ${link}`).toBe(true)
    }
    expect(html, p).not.toMatch(/href="\/_ab\/(?:[a-z0-9-]+\/)?["?#]/)
  }
})

test('sign-out is a link to Access\'s own address, on this host', async () => {
  const { html } = await hiddenPage()
  expect(html).toContain('href="/cdn-cgi/access/logout"')
  expect(html.indexOf('/cdn-cgi/access/logout')).toBeLessThan(html.indexOf('</header>'))
})

test('the page\'s time zone cookie reaches pages at the root (it was Path=/_ab)', async () => {
  const { html } = await hiddenPage()
  expect(html).toContain("'; Path=/; Max-Age=31536000; SameSite=Lax; Secure'")
  // The one kept at /_ab before would win over it there (a longer path goes first), so it goes.
  expect(html).toContain("document.cookie='aq_tz=; Path=/_ab; Max-Age=0; SameSite=Lax; Secure'")
})

test('opening a page keeps the owner flag on the site too (it grants nothing), and sets no session of its own', async () => {
  const r = await dash('/doc-gia/', {})
  expect(r.headers.getSetCookie()).toEqual(['aq_owner=1; Path=/; Max-Age=2592000; Secure; SameSite=Strict; Domain=aquatome.com'])
})

test('the owner\'s forms work from the page itself, Origin: null as a no-referrer page sends it, and go to the page they came from', async () => {
  const { e, store } = env()
  const form = (headers: Record<string, string>, token?: string | null) => dash('/_ab/hidden', { method: 'POST', body: new URLSearchParams({ url: '/ca/x/', action: 'hide' }), token, headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers } }, e)
  const ok = await form({ 'sec-fetch-site': 'same-origin', origin: 'null' })
  expect([ok.status, ok.headers.get('location')]).toEqual([303, '/an-trang/'])
  expect(JSON.parse(store.get('hidden')!)).toHaveProperty(['/ca/x/'])
  store.clear()
  // Access's cookie isn't ours to mark SameSite: another page, or another host of this site, can't post with it.
  for (const headers of [{ 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }, { 'sec-fetch-site': 'none' }, {}] as Record<string, string>[]) {
    expect((await form(headers)).status, JSON.stringify(headers)).toBe(403)
    expect(store.size, JSON.stringify(headers)).toBe(0)
  }
  expect((await form({ 'sec-fetch-site': 'same-origin' }, null)).status).toBe(403)
  expect(store.size).toBe(0)
})

test('the daily report\'s delivery from its page on this host: the form posts behind Access, from the page only, and comes back to /bao-cao/', async () => {
  const { e, store } = env()
  expect(await (await dash('/bao-cao/', {}, e)).text()).toContain('<form class="inline" method="post" action="/_ab/bao-cao/cai-dat"><button name="email" value="0">Tắt email</button><button name="push" value="1">Bật thông báo</button></form>')
  const press = (headers: Record<string, string>, token?: string | null, on: Env = e) => dash('/_ab/bao-cao/cai-dat', { method: 'POST', body: new URLSearchParams({ push: '1' }), token, headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers } }, on)
  const ok = await press({ 'sec-fetch-site': 'same-origin', origin: 'null' })
  expect([ok.status, ok.headers.get('location'), ok.headers.get('x-robots-tag'), ok.headers.get('cache-control')]).toEqual([303, '/bao-cao/', 'noindex, nofollow', 'no-store'])
  expect(JSON.parse(store.get('report-settings')!)).toEqual({ email: true, push: true })
  expect(await (await dash('/bao-cao/', {}, e)).text()).toContain('<button name="push" value="0">Tắt thông báo</button>')
  store.clear()
  // Not from the page, or not through Access: refused, nothing written.
  for (const headers of [{ 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }, { 'sec-fetch-site': 'none' }, {}] as Record<string, string>[]) {
    expect((await press(headers)).status, JSON.stringify(headers)).toBe(403)
  }
  for (const token of [null, await jwt({ exp: Math.floor(Date.now() / 1000) - 5 }), await jwt({ aud: ['another-app'] })]) {
    expect((await press({ 'sec-fetch-site': 'same-origin' }, token)).status).toBe(403)
  }
  for (const vars of UNSET) {
    const off = env(vars)
    expect((await press({ 'sec-fetch-site': 'same-origin' }, undefined, off.e)).status, JSON.stringify(vars)).toBe(403)
    expect(off.store.size).toBe(0)
  }
  expect(store.size).toBe(0)
})

test('the owner\'s private images open with the token, on this host', async () => {
  const r2 = memoryR2()
  const id = crypto.randomUUID()
  await r2.bucket.put(`fish-id/anon/${id}`, new Uint8Array([0xff, 0xd8, 2]), { customMetadata: { created: '2026-11-03T10:00:00.000Z', verdict: 'fish', guesses: '[]', model: 'm', lang: 'vi' } })
  const { e } = env({ UPLOADS: r2.bucket } as Partial<Env>)
  const path = `/_ab/anh-nhan-dien/anh/anon/${id}`
  const img = await dash(path, {}, e)
  expect([img.status, img.headers.get('content-type'), img.headers.get('cache-control')]).toEqual([200, 'image/jpeg', 'no-store'])
  expect((await dash(path, { token: null }, e)).status).toBe(403)
  expect(await (await dash('/anh-nhan-dien/', {}, e)).text()).toContain(`src="${path}"`)
})

test('the owner bar\'s sign-in hint names the site\'s own sign-in: /_ab/ leads to the host, whose Access session doesn\'t make the site\'s', () => {
  expect(OWNER_SCRIPT).toContain('mở /dang-nhap/ để đăng nhập')
  expect(OWNER_SCRIPT).not.toContain('mở /_ab/')
})

// ---- The configuration the deploy reads ----

const config = JSON.parse(readFileSync(new URL('../../wrangler.jsonc', import.meta.url).pathname, 'utf8').replace(/^\s*\/\/.*$/gm, '')) as {
  assets: { run_worker_first: string[]; not_found_handling: string }
  routes: { pattern: string; zone_name: string; custom_domain: boolean }[]
  vars: Record<string, string>
}
/** Cloudflare's reading of run_worker_first: `*` over any characters, a negative pattern over any positive. */
const glob = (p: string) => new RegExp(`^${p.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
const workerFirst = (path: string) => {
  const rules = config.assets.run_worker_first
  return rules.filter(r => !r.startsWith('!')).some(r => glob(r).test(path)) && !rules.filter(r => r.startsWith('!')).some(r => glob(r.slice(1)).test(path))
}

test('the deploy creates the host, on the site\'s zone, and the vars are there to fill in', () => {
  expect(config.routes).toContainEqual({ pattern: DASHBOARD_HOST, zone_name: SITE_HOST, custom_domain: true })
  expect(config.vars.CANONICAL_HOST).toBe(SITE_HOST)
  expect(typeof config.vars.ACCESS_TEAM_DOMAIN).toBe('string')
  expect(typeof config.vars.ACCESS_AUD).toBe('string')
})

test('the Worker runs first on each dashboard page, or the 404 page would answer without it: a page added needs its line', () => {
  expect(config.assets.not_found_handling).toBe('404-page')
  for (const p of [...WEB_PAGES, `${REPORT_PATH}1003/`, RUNS_PATH, runPath('2026-11-06', RUN), runsJsonPath('2026-11-06')]) {
    const at = hostPath(p)
    expect(workerFirst(at), `${at} on the dashboard's host: add "/${at.split('/')[1]}/*" to run_worker_first in wrangler.jsonc`).toBe(true)
  }
  for (const p of ['/bao-cao/', '/thanh-cong/', '/robots.txt', '/_ab/hidden', '/_ab/anh/x', '/_ab/fonts/x.woff2', '/ca/x/', '/ca/x']) expect(workerFirst(p), p).toBe(true)
})

test('a page\'s JSON form the host answers runs the Worker first there too (it ends in .json, not a slash)', async () => {
  const { e } = env()
  const keys = WEB_PAGES.filter(p => p !== '/_ab/').map(p => p.slice('/_ab/'.length, -1))
  const served = []
  for (const key of keys) if ((await dash(`/${key}.json`, {}, e)).status !== 404) served.push(`/${key}.json`)
  expect(served).toContain('/thanh-cong.json')
  for (const p of served) expect(workerFirst(p), p).toBe(true)
})

test('the app page stays the Worker\'s in every language, its files too: it answers 404 to anyone but the owner (app-switch.ts)', () => {
  for (const page of APP_PAGES) for (const p of [page, `${page}index.html`, `${page}index.md`]) expect(workerFirst(p), p).toBe(true)
})

test('no negative pattern in run_worker_first: one wins over every positive rule, and took the app page from the Worker once', () => {
  expect(config.assets.run_worker_first.filter(r => r.startsWith('!'))).toEqual([])
})

test('assets and the Indonesian and Thai pages stay as they were: no Worker before them, on either host', () => {
  for (const l of LANGS) if (LANG[l].prefix) expect(workerFirst(`${LANG[l].prefix}/`), l).toBe(false)
  for (const p of ['/_astro/a.js', '/data/vi/species.json', '/app/vi.json', '/favicon.png', '/sitemap-index.xml', '/pagefind/pagefind.js', '/id/', '/id/ikan/x/', '/id/ikan/x/index.md', '/th/fish/x/']) expect(workerFirst(p), p).toBe(false)
})

test('what the Worker can\'t see on the host carries noindex: the host\'s rule in the build\'s _headers', () => {
  const rules = readFileSync(new URL('../../public/_headers', import.meta.url).pathname, 'utf8')
  expect(rules).toMatch(new RegExp(`^https://${DASHBOARD_HOST.replace(/\./g, '\\.')}/\\*\\n  X-Robots-Tag: noindex, nofollow$`, 'm'))
})
