import { expect, test, vi } from 'vitest'
import { handle, type Env } from '../index'
import type { Catalog } from '../fishid/catalog'
import { fishIdStatus, type FishIdDeps } from '../fishid/api'
import { keyHash, loadKeys, parseKeys } from '../fishid/keys'
import { fishIdPage } from '../admin/pages'
import { unset } from '../admin/shell'
import { COOKIE, createSession, type Client } from '../accounts/session'
import { contract } from './contract'
import { testD1 } from './d1'
import { deleteUser } from '../accounts/users'
import { KEEP_DAYS, stripJpeg, sweepKept } from '../fishid/kept'
import { memoryR2 } from './r2'
import { memoryLedger } from './ledger'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8])
const A = 'sk-ant-api03-aaaaaaaaaaaa'
const B = 'sk-ant-api03-bbbbbbbbbbbb'
const C = 'sk-ant-api03-cccccccccccc'
const CREDIT = 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'
const KEYS = `# three organisations\n${A} wrkspc_orgA\n\n${B}\n${C}   # a workspace key\n`

const CATALOG: Catalog = {
  version: 1,
  entries: [
    { id: 'betta-splendens', kind: 'species', sci: 'Betta splendens', name: { vi: 'Cá betta' }, url: { vi: '/vi/ca/ca-betta/' }, img: 'https://media.aquatome.com/betta-480.webp' },
    { id: 'halfmoon-betta', kind: 'breed', basedOn: 'betta-splendens', name: { vi: 'Cá betta Halfmoon (Halfmoon betta)' }, alt: ['Betta HM', 'Half moon betta'], url: { vi: '/vi/ca/ca-betta-halfmoon/' } },
    { id: 'paracheirodon-innesi', kind: 'species', sci: 'Paracheirodon innesi', name: { vi: 'Cá neon xanh', id: 'Ikan neon' }, url: { vi: '/vi/ca/ca-neon-xanh/', id: '/id/ikan/ikan-neon/' } },
    { id: 'paracheirodon-axelrodi', kind: 'species', sci: 'Paracheirodon axelrodi', name: { vi: 'Cá neon vua' }, url: { vi: '/vi/ca/ca-neon-vua/' } },
  ],
}

type Reply = (n: number) => Response
const message = (answer: unknown, stop = 'end_turn') => Response.json({
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: stop, stop_sequence: null,
  content: [{ type: 'text', text: typeof answer === 'string' ? answer : JSON.stringify(answer) }],
  usage: { input_tokens: 1500, output_tokens: 120 },
})
const apiError = (status: number, type: string, message: string, headers: Record<string, string> = {}) =>
  Response.json({ type: 'error', error: { type, message } }, { status, headers })
const NEON = { verdict: 'fish', guesses: [
  { scientificName: 'Paracheirodon innesi', commonName: 'Neon tetra', variety: null, confidence: 0.92, reason: 'Sọc xanh ánh kim, nửa sau thân đỏ.' },
  { scientificName: 'Paracheirodon simulans', commonName: 'Green neon tetra', variety: null, confidence: 0.05, reason: 'Sọc xanh dài hơn.' },
  { scientificName: 'Hyphessobrycon amandae', commonName: 'Ember tetra', variety: null, confidence: 0.4, reason: 'Thân cam.' },
] }

/** A fake Claude per key: what each key answers, every call it saw (its key, its workspace header, its body). */
function claude(replies: Record<string, Reply>) {
  const calls: { key: string; workspace: string | null; body: Record<string, unknown> }[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init)
    // The SDK sends the key as a bearer token (x-api-key in older versions).
    const key = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? req.headers.get('x-api-key') ?? ''
    calls.push({ key, workspace: req.headers.get('anthropic-workspace-id'), body: await req.json() as Record<string, unknown> })
    const reply = replies[key] ?? (() => message(NEON))
    return reply(calls.filter(c => c.key === key).length)
  }) as typeof globalThis.fetch
  return { fetch, calls }
}

function kv() {
  const m = new Map<string, { v: string; ttl?: number }>()
  return {
    m,
    ns: {
      get: async (k: string, type?: string) => { const e = m.get(k); return e ? (type === 'json' ? JSON.parse(e.v) : e.v) : null },
      put: async (k: string, v: string, o?: { expirationTtl?: number }) => { m.set(k, { v, ttl: o?.expirationTtl }) },
    } as unknown as KVNamespace,
  }
}
type Point = { blobs: string[]; doubles: number[]; indexes: string[] }
function env(extra: Record<string, unknown> = {}) {
  const store = kv()
  const ledger = memoryLedger()
  // Every test writes the Analytics Engine log, so a branch that throws while logging fails its own test.
  const points: Point[] = []
  const e = {
    FISHID_LOG: { writeDataPoint: (p: Point) => { points.push(p) } },
    ASSETS: { fetch: async (r: Request) => (new URL(r.url).pathname === '/app/fish-id.json' ? Response.json(CATALOG) : new Response('nope', { status: 404 })) },
    AB: store.ns,
    TURNSTILE_SECRET: 's', TURNSTILE_SITEKEY: 'site-key', COMMENT_HMAC_KEY: 'h', AB_DASH_TOKEN: 'tok',
    ANTHROPIC_KEYS: KEYS,
    DB: testD1(),
    FISHID_LEDGER: ledger.ns,
    ...extra,
  } as unknown as Env
  return { e, kv: store.m, points, ledger }
}
/** A data point by name, as worker/fishid/log.ts lays it out. */
const fields = (p: Point) => {
  const [outcome, model, key, verdict, top, page, lang, from, country] = p.blobs
  const [input, output, cost, ms, attempts, confidence, guesses] = p.doubles
  return { outcome, model, key, verdict, top, page, lang, from, country, input, output, cost, ms, attempts, confidence, guesses, index: p.indexes[0] }
}

const post = (file: Blob = new Blob([JPEG]), fields: Record<string, string> = { token: 't', lang: 'vi' }, headers: Record<string, string> = {}) => {
  const f = new FormData()
  f.set('file', file, 'photo.jpg')
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return new Request('https://x.test/api/fish-id', { method: 'POST', body: f, headers: { origin: 'https://x.test', 'cf-connecting-ip': '203.0.113.7', ...READER, ...headers } })
}
/** A reader's phone, as a browser or the app sends it. */
const READER = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', 'accept-language': 'vi-VN,vi;q=0.9' }
/** The app's way: its session as a bearer, no Origin and no Turnstile token, the photo as base64 JSON. */
const appPost = (token: string, headers: Record<string, string> = {}) => new Request('https://x.test/api/fish-id', {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', ...READER, ...headers },
  body: JSON.stringify({ image: btoa(String.fromCharCode(...JPEG)), lang: 'vi', from: 'page' }),
})
async function signIn(db: D1Database, client: Client = 'app', at = new Date()) {
  const id = crypto.randomUUID()
  await db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind(id, at.toISOString()).run()
  return { id, token: await createSession(db, id, client, at) }
}
// The random pick lands on the first healthy key: key A, while it is healthy.
const deps = (fetch: typeof globalThis.fetch, extra: Partial<FishIdDeps> = {}): FishIdDeps & { lines: Record<string, unknown>[] } => {
  const lines: Record<string, unknown>[] = []
  return { fetch, random: () => 0, siteverify: async () => true, log: l => { lines.push(l) }, lines, ...extra }
}
/** Every answer of /api/fish-id is checked against the app's contract (protocols/fishid.openapi.json). */
const { answer } = contract('fishid.openapi.json')
async function run(req: Request, e: Env, d: FishIdDeps): Promise<Response> {
  const res = await handle(req, e, undefined, undefined, d)
  if (new URL(req.url).pathname === '/api/fish-id') await answer('/api/fish-id', req.method.toLowerCase() as 'get' | 'post', res.clone())
  return res
}
type Body = { verdict?: string; error?: string; refused?: boolean; results?: { scientificName: string; page?: { id: string; url?: string; name: string }; species?: { id: string }; sameGenus?: { id: string; url?: string }[] }[] }

test('the keys file: one key per line, its workspace beside it; comments, blank lines and duplicates skipped; bad lines counted, never echoed', async () => {
  const text = `# keys\n\n${A} wrkspc_1\n${B}\n  ${B}  \n${C} # note\nnot a key line at all\nshort\n${A}x wrkspc_1 extra\n`
  const { entries, bad } = parseKeys(text)
  expect(entries).toEqual([{ key: A, workspace: 'wrkspc_1' }, { key: B }, { key: C }])
  expect(bad).toBe(3)
  expect(parseKeys(undefined)).toEqual({ entries: [], bad: 0 })
  expect(parseKeys('\n# only a comment\n')).toEqual({ entries: [], bad: 0 })
  const h = await keyHash(A)
  expect(h).toMatch(/^[0-9a-f]{8}$/)
  expect(h).not.toBe(await keyHash(B))
  expect((await loadKeys(text)).keys.map(k => k.hash)).toEqual([h, await keyHash(B), await keyHash(C)])
})

test('happy path: the photo goes to Claude with the workspace header for an organisation\'s key; guesses come back with the handbook\'s pages', async () => {
  const { e, ledger } = env()
  const fake = claude({})
  const d = deps(fake.fetch)
  const r = await run(post(), e, d)
  expect(r.status).toBe(200)
  const body = (await r.json()) as Body
  expect(body.verdict).toBe('fish')
  // Sorted by confidence; the neon tetra links its page with its genus's other page ("not this one?"), the green neon
  // has genus-mates only, the ember tetra nothing.
  expect(body.results!.map(x => x.scientificName)).toEqual(['Paracheirodon innesi', 'Hyphessobrycon amandae', 'Paracheirodon simulans'])
  expect(body.results![0]!.page).toMatchObject({ id: 'paracheirodon-innesi', url: '/vi/ca/ca-neon-xanh/', name: 'Cá neon xanh' })
  expect(body.results![0]!.sameGenus).toEqual([{ id: 'paracheirodon-axelrodi', kind: 'species', name: 'Cá neon vua', sci: 'Paracheirodon axelrodi', url: '/vi/ca/ca-neon-vua/' }])
  expect(body.results![1]!.page).toBeUndefined()
  expect(body.results![1]!.sameGenus).toBeUndefined()
  expect(body.results![2]!.page).toBeUndefined()
  expect(body.results![2]!.sameGenus!.map(x => x.id)).toEqual(['paracheirodon-innesi', 'paracheirodon-axelrodi'])
  // One call, with key A and its workspace; the image block first, as base64 JPEG; no retries, low effort, JSON schema.
  expect(fake.calls).toHaveLength(1)
  expect(fake.calls[0]).toMatchObject({ key: A, workspace: 'wrkspc_orgA' })
  const content = (fake.calls[0]!.body.messages as { content: { type: string; source?: { media_type: string; data: string } }[] }[])[0]!.content
  expect(content[0]).toMatchObject({ type: 'image', source: { media_type: 'image/jpeg', data: btoa(String.fromCharCode(...JPEG)) } })
  expect(fake.calls[0]!.body).toMatchObject({ model: 'claude-opus-5-5', output_config: { effort: 'low', format: { type: 'json_schema' } } })
  expect(fake.calls[0]!.body).not.toHaveProperty('thinking')
  // The image is in no log line, nor the key, nor the IP; usage and the key's hash are.
  const logged = JSON.stringify(d.lines)
  for (const secret of [A, 'wrkspc_orgA', '203.0.113.7', btoa(String.fromCharCode(...JPEG))]) expect(logged).not.toContain(secret)
  expect(d.lines[0]).toMatchObject({ fishId: 'ok', in: 1500, out: 120, attempts: [{ key: await keyHash(A) }] })
  // Counted in the ledger: the reader's day and the site's, with the key's call and its cost at list price (1,500 in and
  // 120 out on Opus 5.5); the run settled, its reservation given back.
  const day = ledger.day()!
  expect(day).toMatchObject({ calls: 1, keys: { [await keyHash(A)]: 1 }, ok: { [await keyHash(A)]: 1 }, runs: {}, refunds: {} })
  expect(Object.values(day.readers)).toEqual([1])
  expect(day.usd).toBeCloseTo(0.0084, 10)
})

test('a fish Claude is fairly sure of with no page counts as a reader\'s request; a matched, unsure or owner\'s one does not', async () => {
  const wanted = (kv: Map<string, { v: string }>) => [...kv].filter(([k]) => k.startsWith('wanted:n:')).map(([, x]) => JSON.parse(x.v) as { name: string; sci?: string; readers: number; sources: Record<string, number> })
  const harlequin = (confidence: number) => ({ verdict: 'fish', guesses: [{ scientificName: 'Trigonostigma heteromorpha', commonName: 'Harlequin rasbora', variety: null, confidence, reason: 'Mảng đen hình nêm.' }] })
  const sure = env()
  await run(post(), sure.e, deps(claude({ [A]: () => message(harlequin(0.85)) }).fetch))
  expect(wanted(sure.kv)).toEqual([expect.objectContaining({ name: 'Harlequin rasbora', sci: 'Trigonostigma heteromorpha', readers: 1, sources: { 'fish-id': 1 } })])
  // The same reader again today: still one.
  await run(post(), sure.e, deps(claude({ [A]: () => message(harlequin(0.85)) }).fetch))
  expect(wanted(sure.kv)[0]!.readers).toBe(1)
  // And the tank that reader then saves with it (POST /api/v1/wanted): the same reader, still one.
  const tank = new Request('https://x.test/api/v1/wanted', { method: 'POST', body: JSON.stringify({ kind: 'fish', name: 'Harlequin rasbora', sci: 'Trigonostigma heteromorpha' }), headers: { origin: 'https://x.test', 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', 'accept-language': 'vi-VN,vi;q=0.9' } })
  expect((await run(tank, sure.e, deps(claude({}).fetch))).status).toBe(204)
  expect(wanted(sure.kv)).toEqual([expect.objectContaining({ readers: 1, sources: { 'fish-id': 1 } })])
  // Another reader's tank: two.
  const other = new Request(tank.url, { method: 'POST', body: JSON.stringify({ kind: 'fish', name: 'Harlequin rasbora', sci: 'Trigonostigma heteromorpha' }), headers: { ...Object.fromEntries(tank.headers), 'cf-connecting-ip': '198.51.100.9' } })
  expect((await run(other, sure.e, deps(claude({}).fetch))).status).toBe(204)
  expect(wanted(sure.kv)[0]).toMatchObject({ readers: 2, sources: { 'fish-id': 1, tank: 1 } })
  // Our own checks are no readers: the browser checks' and the app's test builds' user agent.
  for (const [answer, headers] of [[harlequin(0.4), {}], [NEON, {}], [harlequin(0.85), { cookie: 'aq_owner=1' }], [harlequin(0.85), { 'user-agent': 'AquaTome/1 CFNetwork/3826 Darwin/25.0 AquaTomeCheck/1' }]] as const) {
    const other = env()
    await run(post(undefined, undefined, headers), other.e, deps(claude({ [A]: () => message(answer) }).fetch))
    expect(wanted(other.kv)).toEqual([])
  }
})

test('a workspace key sends no workspace header; the reader\'s language reaches the prompt and picks the page\'s address', async () => {
  const { e } = env()
  const fake = claude({})
  const r = await run(post(undefined, { token: 't', lang: 'id' }), e, deps(fake.fetch, { random: () => 0.5 }))
  expect(fake.calls[0]).toMatchObject({ key: B, workspace: null })
  expect(JSON.stringify(fake.calls[0]!.body.messages)).toContain('Indonesian')
  const body = (await r.json()) as Body
  expect(body.results![0]!.page).toMatchObject({ url: '/id/ikan/ikan-neon/', name: 'Ikan neon' })
  // A page the language doesn't have: its name, no link.
  expect(body.results![2]!.sameGenus!.find(x => x.id === 'paracheirodon-axelrodi')).not.toHaveProperty('url')
})

test('a variety names the breed page, with the species beside it', async () => {
  const { e } = env()
  const fake = claude({ [A]: () => message({ verdict: 'fish', guesses: [{ scientificName: 'Betta splendens', commonName: 'Siamese fighting fish', variety: 'Half moon', confidence: 0.8, reason: 'Đuôi xòe nửa vòng tròn.' }] }) })
  const body = (await (await run(post(), e, deps(fake.fetch))).json()) as Body
  expect(body.results![0]!.page).toMatchObject({ id: 'halfmoon-betta', url: '/vi/ca/ca-betta-halfmoon/' })
  expect(body.results![0]!.species).toMatchObject({ id: 'betta-splendens' })
})

test('not a fish: no results, no pages; refused: the calm can\'t-tell answer', async () => {
  const { e } = env()
  const other = claude({ [A]: () => message({ verdict: 'other', guesses: [{ scientificName: 'Felis catus', commonName: 'Cat', variety: null, confidence: 0.9, reason: 'Con mèo.' }] }) })
  expect(await (await run(post(), e, deps(other.fetch))).json()).toMatchObject({ verdict: 'other', results: [] })
  const refused = claude({ [A]: () => message('I can\'t help with that.', 'refusal') })
  expect(await (await run(post(), env().e, deps(refused.fetch))).json()).toMatchObject({ verdict: 'unclear', results: [], refused: true })
  // Out of room or not JSON: a failed call (502), no key marked.
  const cut = claude({ [A]: () => message('{"verdict":"fi', 'max_tokens') })
  const { e: e3, kv } = env()
  expect((await run(post(), e3, deps(cut.fetch))).status).toBe(502)
  expect([...kv.keys()].some(k => k.startsWith('fishid:key:'))).toBe(false)
})

test('the page list unreadable for a moment: guesses come back unlinked, and the next photo reads it again', async () => {
  const { e } = env()
  let reads = 0
  ;(e as unknown as { ASSETS: { fetch: (r: Request) => Promise<Response> } }).ASSETS = { fetch: async () => (++reads === 1 ? new Response('busy', { status: 500 }) : Response.json(CATALOG)) }
  // Its own origin: the page list is kept per isolate, and the other tests have already read x.test's.
  const req = () => {
    const f = new FormData()
    f.set('file', new Blob([JPEG]), 'photo.jpg')
    f.set('token', 't')
    return new Request('https://catalog.test/api/fish-id', { method: 'POST', body: f, headers: { origin: 'https://catalog.test', 'cf-connecting-ip': '203.0.113.8' } })
  }
  const d = deps(claude({}).fetch)
  const first = (await (await run(req(), e, d)).json()) as Body
  expect(first.results![0]).toMatchObject({ scientificName: 'Paracheirodon innesi' })
  expect(first.results![0]!.page).toBeUndefined()
  expect(d.lines[0]).toMatchObject({ catalog: 'missing' })
  const second = (await (await run(req(), e, d)).json()) as Body
  expect(second.results![0]!.page).toMatchObject({ id: 'paracheirodon-innesi' })
  expect(reads).toBe(2)
})

test('rotation: out of credit on key A falls to B, and A is skipped next time', async () => {
  const { e, kv } = env()
  // What an organisation with no credit answers (seen with a real key, 2026-11-02): a 400, not a 402.
  const fake = claude({ [A]: () => apiError(400, 'invalid_request_error', CREDIT) })
  const d = deps(fake.fetch)
  expect((await run(post(), e, d)).status).toBe(200)
  expect(fake.calls.map(c => c.key)).toEqual([A, B])
  const mark = kv.get(`fishid:key:${await keyHash(A)}`)!
  expect(JSON.parse(mark.v)).toMatchObject({ why: 'credit' })
  expect(mark.ttl).toBe(86_400)
  expect(d.lines[0]).toMatchObject({ fishId: 'ok', attempts: [{ key: await keyHash(A), status: 400, marked: 'credit' }, { key: await keyHash(B) }] })
  // The next request draws the first healthy key: B now, A never called again.
  await run(post(), e, d)
  expect(fake.calls.map(c => c.key)).toEqual([A, B, B])
  // Even while KV still answers "no mark" from its edge cache, this isolate remembers it.
  kv.delete(`fishid:key:${await keyHash(A)}`)
  await run(post(), e, d)
  expect(fake.calls.map(c => c.key)).toEqual([A, B, B, B])
  // A 402 billing error, and a spend limit in other words, count the same.
  for (const reply of [() => apiError(402, 'billing_error', 'Billing problem.'), () => apiError(400, 'invalid_request_error', 'You have reached your specified API usage limits.')]) {
    const other = claude({ [A]: reply })
    const { e: e2, kv: kv2 } = env()
    expect((await run(post(), e2, deps(other.fetch))).status).toBe(200)
    expect(JSON.parse(kv2.get(`fishid:key:${await keyHash(A)}`)!.v)).toMatchObject({ why: 'credit' })
  }
})

test('a key out of credit is tried again once its 24 h are over: its organisation may have been topped up', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date('2026-11-02T08:00:00Z'))
    const { e, kv } = env({ ANTHROPIC_KEYS: `${A}\n${B}` })
    let topped = false
    const fake = claude({ [A]: () => (topped ? message(NEON) : apiError(400, 'invalid_request_error', CREDIT)) })
    const d = deps(fake.fetch, { random: () => 0 })
    await run(post(), e, d)
    vi.setSystemTime(new Date('2026-11-03T07:59:00Z'))
    await run(post(undefined, undefined, { 'cf-connecting-ip': '198.51.100.9' }), e, d)
    expect(fake.calls.map(c => c.key)).toEqual([A, B, B])
    // A day on: KV has dropped the mark (its TTL), and this isolate's memory of it has run out too.
    vi.setSystemTime(new Date('2026-11-03T08:00:01Z'))
    kv.delete(`fishid:key:${await keyHash(A)}`)
    topped = true
    expect((await run(post(undefined, undefined, { 'cf-connecting-ip': '198.51.100.10' }), e, d)).status).toBe(200)
    expect(fake.calls.map(c => c.key)).toEqual([A, B, B, A])
  } finally {
    vi.useRealTimers()
  }
})

test('rotation: a refused key is set aside 24 h; a rate-limited one for its retry-after', async () => {
  const { e, kv } = env()
  const fake = claude({ [A]: () => apiError(401, 'authentication_error', 'invalid x-api-key'), [B]: () => apiError(429, 'rate_limit_error', 'slow down', { 'retry-after': '120' }) })
  const before = Date.now()
  expect((await run(post(), e, deps(fake.fetch))).status).toBe(200)
  expect(fake.calls.map(c => c.key)).toEqual([A, B, C])
  expect(JSON.parse(kv.get(`fishid:key:${await keyHash(A)}`)!.v)).toMatchObject({ why: 'auth' })
  const rate = kv.get(`fishid:key:${await keyHash(B)}`)!
  const health = JSON.parse(rate.v) as { until: number; why: string }
  expect(health.why).toBe('rate')
  expect(health.until).toBeGreaterThanOrEqual(before + 120_000)
  expect(health.until).toBeLessThan(Date.now() + 121_000)
  expect(rate.ttl).toBe(120)
  // No retry-after: a minute.
  const plain = claude({ [A]: () => apiError(429, 'rate_limit_error', 'slow down') })
  const { e: e2, kv: kv2 } = env()
  await run(post(), e2, deps(plain.fetch))
  expect(kv2.get(`fishid:key:${await keyHash(A)}`)!.ttl).toBe(60)
})

test('rotation: overloaded tries the next key without setting the first aside; another 400 stops at once', async () => {
  const { e, kv } = env()
  const busy = claude({ [A]: () => apiError(529, 'overloaded_error', 'Overloaded') })
  expect((await run(post(), e, deps(busy.fetch))).status).toBe(200)
  expect(busy.calls.map(c => c.key)).toEqual([A, B])
  expect([...kv.keys()].some(k => k.startsWith('fishid:key:'))).toBe(false)
  // Every key overloaded: each tried once, none marked, "try again shortly".
  const allBusy = claude({ [A]: () => apiError(529, 'overloaded_error', 'x'), [B]: () => apiError(500, 'api_error', 'x'), [C]: () => apiError(529, 'overloaded_error', 'x') })
  const { e: e2, kv: kv2 } = env()
  const r2 = await run(post(), e2, deps(allBusy.fetch))
  expect(r2.status).toBe(503)
  expect(await r2.json()).toEqual({ error: 'unavailable' })
  expect(allBusy.calls).toHaveLength(3)
  expect([...kv2.keys()].some(k => k.startsWith('fishid:key:'))).toBe(false)
  // Our request is wrong: every key would say so. One call, no mark.
  const bad = claude({ [A]: () => apiError(400, 'invalid_request_error', 'messages.0.content.0.source: invalid base64 data') })
  const { e: e3, kv: kv3 } = env()
  const r3 = await run(post(), e3, deps(bad.fetch))
  expect(r3.status).toBe(502)
  expect(await r3.json()).toEqual({ error: 'failed' })
  expect(bad.calls).toHaveLength(1)
  expect([...kv3.keys()].some(k => k.startsWith('fishid:key:'))).toBe(false)
})

test('every key set aside: no call, the tool rests (GET says so too); keys found dead in one request rest it as well', async () => {
  const { e, kv, ledger } = env()
  const until = Date.now() + 3_600_000
  for (const k of [A, B, C]) kv.set(`fishid:key:${await keyHash(k)}`, { v: JSON.stringify({ until, why: 'credit' }) })
  const fake = claude({})
  const r = await run(post(), e, deps(fake.fetch))
  expect(r.status).toBe(503)
  expect(await r.json()).toEqual({ error: 'resting' })
  expect(fake.calls).toHaveLength(0)
  expect(await (await run(new Request('https://x.test/api/fish-id'), e, deps(fake.fetch))).json()).toEqual({ on: true, sitekey: 'site-key', resting: true, perIp: 10, perAccount: 10 })
  // Resting isn't a reader's use: nothing counted.
  expect(ledger.day()?.readers ?? {}).toEqual({})
  // A mark whose time is past is no mark.
  kv.set(`fishid:key:${await keyHash(C)}`, { v: JSON.stringify({ until: Date.now() - 1, why: 'rate' }) })
  expect((await run(post(), e, deps(fake.fetch))).status).toBe(200)
  expect(fake.calls.map(c => c.key)).toEqual([C])
  const dead = claude({ [A]: () => apiError(402, 'billing_error', 'x'), [B]: () => apiError(403, 'permission_error', 'x'), [C]: () => apiError(402, 'billing_error', 'x') })
  const r2 = await run(post(), env().e, deps(dead.fetch))
  expect(await r2.json()).toEqual({ error: 'resting' })
})

test('limits: a reader\'s 11th of the day and the site\'s day are refused before any call', async () => {
  const { e } = env()
  const fake = claude({})
  for (let i = 0; i < 10; i++) expect((await run(post(), e, deps(fake.fetch))).status).toBe(200)
  const r = await run(post(), e, deps(fake.fetch))
  expect(r.status).toBe(429)
  expect(await r.json()).toEqual({ error: 'rate', limit: 10 })
  expect(fake.calls).toHaveLength(10)
  // Another reader still can; the site's own limit (here 2) then stops everyone.
  const { e: e2 } = env({ FISH_ID_PER_DAY: '2', FISH_ID_PER_IP: '50' })
  const site = claude({})
  for (const ip of ['198.51.100.1', '198.51.100.2']) expect((await run(post(undefined, undefined, { 'cf-connecting-ip': ip }), e2, deps(site.fetch))).status).toBe(200)
  const r2 = await run(post(undefined, undefined, { 'cf-connecting-ip': '198.51.100.3' }), e2, deps(site.fetch))
  expect(r2.status).toBe(429)
  expect(await r2.json()).toEqual({ error: 'busy' })
  expect(site.calls).toHaveLength(2)
})

test('the app: its live session stands in for Origin and Turnstile, and its day is counted per account, not per address', async () => {
  const db = testD1()
  const { e, ledger } = env({ DB: db, FISH_ID_PER_ACCOUNT: '2' })
  const fake = claude({})
  let verified = 0
  const d = deps(fake.fetch, { siteverify: async () => { verified++; return true } })
  const me = await signIn(db)
  const r = await run(appPost(me.token), e, d)
  expect(r.status).toBe(200)
  expect(await r.json()).toMatchObject({ verdict: 'fish', model: 'claude-opus-5-5' })
  expect(verified).toBe(0)
  // Counted under the account (by HMAC, never its id), and not under the address.
  const readers = ledger.day()!.readers
  expect(Object.keys(readers).filter(k => k.startsWith('fishid:acct:'))).toHaveLength(1)
  expect(Object.keys(readers).filter(k => k.startsWith('fishid:ip:'))).toEqual([])
  expect(JSON.stringify(ledger.day())).not.toContain(me.id)
  expect(Object.values(readers)).toEqual([1])
  // The same form the page sends works too, without its token.
  expect((await run(post(undefined, { lang: 'vi' }, { authorization: `Bearer ${me.token}`, origin: '' }), e, d)).status).toBe(200)
  const third = await run(appPost(me.token), e, d)
  expect(third.status).toBe(429)
  expect(await third.json()).toEqual({ error: 'rate', limit: 2 })
  // Another account behind the same carrier address still can.
  expect((await run(appPost((await signIn(db)).token), e, d)).status).toBe(200)
  expect(fake.calls).toHaveLength(3)
  // The tool's state says both days' limits.
  expect(await (await run(new Request('https://x.test/api/fish-id'), e, d)).json()).toEqual({ on: true, sitekey: 'site-key', resting: false, perIp: 10, perAccount: 2 })
})

test('the app: a bearer with no live app session is 401 session, even with a Turnstile token: never the page\'s way', async () => {
  const db = testD1()
  const { e } = env({ DB: db })
  const fake = claude({})
  const web = await signIn(db, 'web')
  const expired = await signIn(db, 'app', new Date(Date.now() - 400 * 86_400_000))
  for (const req of [
    appPost('not-a-token'),
    appPost(web.token), // a browser's session, sent as a bearer
    appPost(expired.token),
    post(undefined, { token: 't', lang: 'vi' }, { authorization: 'Bearer not-a-token' }),
    post(undefined, { token: 't', lang: 'vi' }, { authorization: '' }),
  ]) {
    const r = await run(req, e, deps(fake.fetch))
    expect(r.status).toBe(401)
    expect(await r.json()).toEqual({ error: 'session' })
  }
  expect(fake.calls).toHaveLength(0)
})

test('refused before any call: not an image, too big, no file, another site, Turnstile failed', async () => {
  const { e } = env()
  const fake = claude({})
  const status = async (req: Request, d = deps(fake.fetch)) => (await run(req, e, d)).status
  expect(await status(post(new Blob([new TextEncoder().encode('<svg onload=x>')])))).toBe(415)
  expect(await status(post(new Blob([JPEG, new Uint8Array(1.6 * 1024 * 1024)])))).toBe(413)
  expect(await status(new Request('https://x.test/api/fish-id', { method: 'POST', body: new FormData(), headers: { origin: 'https://x.test' } }))).toBe(400)
  expect(await status(post(undefined, undefined, { origin: 'https://evil.test' }))).toBe(403)
  expect(await status(post(), deps(fake.fetch, { siteverify: async () => false }))).toBe(403)
  expect(await status(post(undefined, { lang: 'vi' }))).toBe(403) // no token
  expect(fake.calls).toHaveLength(0)
  // JSON with the photo as base64 (the app's way) works the same.
  const json = new Request('https://x.test/api/fish-id', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: btoa(String.fromCharCode(...JPEG)), token: 't', lang: 'th' }) })
  expect(await status(json)).toBe(200)
  expect(fake.calls).toHaveLength(1)
})

test('off without the keys, or with none readable: the page is told it is off; an identification answers 503 fish_id_off', async () => {
  const fake = claude({})
  for (const keys of [undefined, '', '\n# none yet\n', 'not a key line']) {
    const { e } = env({ ANTHROPIC_KEYS: keys })
    // The page's question as it loads: off, said plainly (no error status for the browser to log).
    const get = await run(new Request('https://x.test/api/fish-id'), e, deps(fake.fetch))
    expect(get.status).toBe(200)
    expect(await get.json()).toEqual({ on: false })
    const r = await run(post(), e, deps(fake.fetch))
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ error: 'fish_id_off' })
  }
  expect(await (await run(new Request('https://x.test/api/fish-id'), env({ TURNSTILE_SECRET: undefined }).e, deps(fake.fetch))).json()).toEqual({ on: false })
  expect((await run(post(), env({ COMMENT_HMAC_KEY: undefined }).e, deps(fake.fetch))).status).toBe(503)
  expect(fake.calls).toHaveLength(0)
})

test('every POST writes one Analytics Engine point: outcome, model, key hash, tokens, cost, the top guess and its page; never the photo, a key, the IP, the token or a cookie', async () => {
  const { e, points } = env()
  const fake = claude({})
  const token = 'turnstile-token-0123456789'
  const r = await run(post(undefined, { token, lang: 'vi', from: 'page' }, { cookie: 'aq_session=cookie-value-42' }), e, deps(fake.fetch))
  expect(r.status).toBe(200)
  expect(points).toHaveLength(1)
  const ok = fields(points[0]!)
  // Opus 5.5 at $4 / $20 per million: 1,500 in and 120 out.
  expect(ok).toMatchObject({ outcome: 'ok', index: 'ok', model: 'claude-opus-5-5', key: await keyHash(A), verdict: 'fish', top: 'Paracheirodon innesi', page: 'paracheirodon-innesi', lang: 'vi', from: 'page', country: '', input: 1500, output: 120, attempts: 1, confidence: 0.92, guesses: 3 })
  expect(ok.cost).toBeCloseTo(0.0084, 10)
  expect(ok.ms).toBeGreaterThanOrEqual(0)
  const logged = JSON.stringify(points)
  for (const secret of [A, B, C, 'wrkspc_orgA', '203.0.113.7', token, 'cookie-value-42', btoa(String.fromCharCode(...JPEG))]) expect(logged).not.toContain(secret)

  // Refused by Claude: paid for, no verdict. The tank's editor says where it came from; an unknown source is ''.
  const refused = claude({ [A]: () => message('I can\'t help with that.', 'refusal') })
  const r2 = env()
  await run(post(undefined, { token: 't', lang: 'th', from: 'tank' }), r2.e, deps(refused.fetch))
  expect(fields(r2.points[0]!)).toMatchObject({ outcome: 'refused', verdict: '', top: '', page: '', lang: 'th', from: 'tank', input: 1500, output: 120, attempts: 1 })
  expect(fields(r2.points[0]!).cost).toBeGreaterThan(0)
  const u = env()
  await run(post(undefined, { token: 't', lang: 'vi', from: 'somewhere-else' }), u.e, deps(fake.fetch))
  expect(fields(u.points[0]!).from).toBe('')

  // A guess with no page: the page is ''.
  const ember = claude({ [A]: () => message({ verdict: 'fish', guesses: [NEON.guesses[2]] }) })
  const m = env()
  await run(post(), m.e, deps(ember.fetch))
  expect(fields(m.points[0]!)).toMatchObject({ outcome: 'ok', top: 'Hyphessobrycon amandae', page: '', confidence: 0.4, guesses: 1 })

  // An answer that can't be read was still paid for.
  const cut = claude({ [A]: () => message('{"verdict":"fi', 'max_tokens') })
  const c = env()
  expect((await run(post(), c.e, deps(cut.fetch))).status).toBe(502)
  expect(fields(c.points[0]!)).toMatchObject({ outcome: 'unreadable', input: 1500, output: 120, attempts: 1 })
})

test('the log: a limit or another refusal before any call has no key, call or tokens; a failure names the last key tried', async () => {
  const { e, points } = env({ FISH_ID_PER_IP: '1' })
  const fake = claude({})
  await run(post(), e, deps(fake.fetch))
  await run(post(), e, deps(fake.fetch))
  expect(points.map(p => p.blobs[0])).toEqual(['ok', 'rate'])
  expect(fields(points[1]!)).toMatchObject({ outcome: 'rate', index: 'rate', key: '', lang: 'vi', input: 0, output: 0, cost: 0, attempts: 0, guesses: 0 })
  // Refused before the form is read: no language yet.
  const pre = env()
  await run(post(undefined, undefined, { origin: 'https://evil.test' }), pre.e, deps(fake.fetch))
  await run(post(), pre.e, deps(fake.fetch, { siteverify: async () => false }))
  await run(post(new Blob([new TextEncoder().encode('<svg onload=x>')])), pre.e, deps(fake.fetch))
  expect(pre.points.map(fields).map(f => [f.outcome, f.lang, f.attempts])).toEqual([['cross-origin', '', 0], ['turnstile', 'vi', 0], ['not an image', 'vi', 0]])
  // Every key failing for now: each tried once, the last one named, nothing paid.
  const allBusy = claude({ [A]: () => apiError(529, 'overloaded_error', 'x'), [B]: () => apiError(500, 'api_error', 'x'), [C]: () => apiError(529, 'overloaded_error', 'x') })
  const f = env()
  expect((await run(post(), f.e, deps(allBusy.fetch))).status).toBe(503)
  expect(fields(f.points[0]!)).toMatchObject({ outcome: 'unavailable', key: await keyHash(C), attempts: 3, input: 0, output: 0, cost: 0 })
  // Our request refused: 'request'.
  const bad = claude({ [A]: () => apiError(400, 'invalid_request_error', 'messages.0.content.0.source: invalid base64 data') })
  const b = env()
  await run(post(), b.e, deps(bad.fetch))
  expect(fields(b.points[0]!)).toMatchObject({ outcome: 'request', key: await keyHash(A), attempts: 1 })
  // Off: logged too. No log binding: nothing breaks.
  const off = env({ ANTHROPIC_KEYS: undefined })
  await run(post(), off.e, deps(fake.fetch))
  expect(fields(off.points[0]!).outcome).toBe('fish_id_off')
  const none = env()
  delete (none.e as { FISHID_LOG?: unknown }).FISHID_LOG
  expect((await run(post(), none.e, deps(fake.fetch))).status).toBe(200)
})

test('the log never fails a reader\'s request: a write that throws is only reported', async () => {
  const { e } = env()
  ;(e as unknown as { FISHID_LOG: unknown }).FISHID_LOG = { writeDataPoint: () => { throw new Error('quota') } }
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    expect((await run(post(), e, deps(claude({}).fetch))).status).toBe(200)
    expect(err).toHaveBeenCalledWith('fish-id log:', expect.any(Error))
  } finally {
    err.mockRestore()
  }
})

test('the owner\'s dashboard: each key by number and hash, its state and today\'s calls; never the key', async () => {
  const { e, kv } = env()
  const fake = claude({ [A]: () => apiError(402, 'billing_error', 'x') })
  await run(post(), e, deps(fake.fetch))
  const status = (await fishIdStatus(e as never, new Date()))!
  // Calls count every attempt with a key; answered, the ones Claude answered.
  expect(status.rows.map(r => [r.n, r.hash, r.state, r.calls, r.answered, r.workspace])).toEqual([
    [1, await keyHash(A), 'credit', 1, 0, true], [2, await keyHash(B), 'ok', 1, 1, false], [3, await keyHash(C), 'ok', 0, 0, false],
  ])
  expect(status.today).toBe(1)
  const html = fishIdPage({ now: new Date(), stats: unset('AE'), keys: status, pages: new Map() })
  expect(html).toContain('Out of credit')
  // The tool counts by UTC day: the column says when that day began, in the viewer's time (7:00 in Vietnam).
  expect(html).toMatch(/Since 7:00( yesterday)?</)
  expect(html).toContain('all answered')
  expect(html).toContain(await keyHash(A))
  for (const k of [A, B, C, 'wrkspc_orgA']) expect(html).not.toContain(k)
  expect(kv.size).toBeGreaterThan(0)
})

// A JPEG as a phone might send it: JFIF, Exif with a GPS position, IPTC, a comment, a table, then the scan.
const seg = (marker: number, body: number[]) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body]
const ascii = (t: string) => [...new TextEncoder().encode(t)]
const SCAN = [0xff, 0xda, 0, 4, 1, 2, 9, 9, 9, 0xff, 0xd9]
const PHONE_JPEG = new Uint8Array([0xff, 0xd8, ...seg(0xe0, ascii('JFIF\0')), ...seg(0xe1, ascii('Exif\0\0GPS 10.77N 106.70E')), ...seg(0xed, ascii('Photoshop 3.0\0IPTC')), ...seg(0xfe, ascii('my tank')), ...seg(0xdb, [0, 1, 2, 3]), ...SCAN])
const accounts = contract('accounts.openapi.json')
/** The bucket's kept photos (fish-id/), not the runs' transcripts beside them (fish-id-runs/, fishid/transcript.ts). */
const keptKeys = (r2: ReturnType<typeof memoryR2>) => [...r2.m.keys()].filter(k => k.startsWith('fish-id/'))
const keepEnv = async () => {
  const db = testD1()
  const r2 = memoryR2()
  return { db, r2, ...env({ DB: db, UPLOADS: r2.bucket, ACCOUNTS: 'on', ACCOUNT_HMAC_KEY: 'a' }) }
}
const appJson = (token: string | undefined, extra: Record<string, unknown> = {}, image = PHONE_JPEG) => new Request('https://x.test/api/fish-id', {
  method: 'POST',
  headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', ...READER },
  body: JSON.stringify({ image: btoa(String.fromCharCode(...image)), lang: 'vi', token: 't', ...extra }),
})

test('a kept JPEG loses its Exif, XMP, IPTC and comments and keeps its image; anything else is not walked', () => {
  const out = stripJpeg(PHONE_JPEG)!
  const text = new TextDecoder().decode(out)
  expect(text).toContain('JFIF')
  for (const gone of ['GPS', 'Exif', 'IPTC', 'my tank']) expect(text).not.toContain(gone)
  expect([...out.slice(out.length - SCAN.length)]).toEqual(SCAN)
  expect(out.length).toBe(PHONE_JPEG.length - 3 * 4 - ascii('Exif\0\0GPS 10.77N 106.70E').length - ascii('Photoshop 3.0\0IPTC').length - ascii('my tank').length)
  expect(stripJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBeNull()
  expect(stripJpeg(PHONE_JPEG.slice(0, 12))).toBeNull()
})

test('keeping: a ticked photo is kept under the app\'s account with its result, its metadata cut; listed and deleted with the bearer; unticked, nothing is', async () => {
  const { e, db, r2 } = await keepEnv()
  const d = deps(claude({}).fetch)
  const me = await signIn(db)
  // Unticked: nothing stored, and no `kept` in the answer.
  expect(await (await run(appJson(me.token), e, d)).json()).not.toHaveProperty('kept')
  expect(keptKeys(r2)).toHaveLength(0)
  expect(await (await run(appJson(me.token, { keep: true }), e, d)).json()).toMatchObject({ verdict: 'fish', kept: true })
  const key = keptKeys(r2)[0]!
  const o = r2.m.get(key)!
  expect(key).toMatch(new RegExp(`^fish-id/${me.id}/[0-9a-f-]{36}$`))
  expect(new TextDecoder().decode(o.bytes)).not.toContain('GPS')
  expect(o.customMetadata).toEqual({ created: expect.any(String), verdict: 'fish', guesses: expect.any(String), model: 'claude-opus-5-5', lang: 'vi', run: expect.stringMatching(/^[0-9a-f-]{36}$/) })
  // It names its run, whose transcript is kept beside it (the photo isn't in the transcript).
  expect(r2.m.has(`fish-id-runs/${o.customMetadata!.created!.slice(0, 10)}/${o.customMetadata!.run}.json`)).toBe(true)
  expect(JSON.parse(o.customMetadata!.guesses!).map((g: { scientificName: string }) => g.scientificName)).toEqual(['Paracheirodon innesi', 'Hyphessobrycon amandae', 'Paracheirodon simulans'])
  expect(JSON.stringify([...r2.m.keys(), o.customMetadata])).not.toContain('203.0.113.7')
  // The account's list: the date and the result, never the image.
  const bearer = { authorization: `Bearer ${me.token}` }
  const list = await accounts.answer('/api/v1/fish-id/photos', 'get', await run(new Request('https://x.test/api/v1/fish-id/photos', { headers: bearer }), e, d)) as { photos: { id: string; verdict: string; guesses: unknown[] }[] }
  expect(list.photos).toEqual([{ id: key.split('/')[2], created: o.customMetadata!.created, verdict: 'fish', guesses: JSON.parse(o.customMetadata!.guesses!) }])
  // In the account's export too.
  expect(await (await run(new Request('https://x.test/api/v1/account/export', { headers: bearer }), e, d)).json()).toMatchObject({ fishIdPhotos: list.photos })
  // Another account can't delete it, nor anyone signed out; its own bearer does, once.
  const other = await signIn(db)
  const del = (h: Record<string, string>) => run(new Request(`https://x.test/api/v1/fish-id/photos/${list.photos[0]!.id}`, { method: 'DELETE', headers: h }), e, d)
  expect((await accounts.answer('/api/v1/fish-id/photos/{id}', 'delete', await del({ authorization: `Bearer ${other.token}` }))).error).toBe('not_found')
  expect((await accounts.answer('/api/v1/fish-id/photos', 'get', await run(new Request('https://x.test/api/v1/fish-id/photos'), e, d))).error).toBe('signed_out')
  expect((await del(bearer)).status).toBe(204)
  expect(keptKeys(r2)).toHaveLength(0)
  expect((await del(bearer)).status).toBe(404)
})

test('keeping on the page: under the signed-in reader\'s cookie, or signed out tied to no one; a PNG is not kept but still identified', async () => {
  const { e, db, r2 } = await keepEnv()
  const d = deps(claude({}).fetch)
  const reader = await signIn(db, 'web')
  const page = (fields: Record<string, string>, headers: Record<string, string> = {}, file = new Blob([PHONE_JPEG])) => post(file, { token: 't', lang: 'vi', ...fields }, headers)
  expect(await (await run(page({ keep: '1' }, { cookie: `${COOKIE}=${reader.token}` }), e, d)).json()).toMatchObject({ kept: true })
  expect(await (await run(page({ keep: '1' }), e, d)).json()).toMatchObject({ kept: true })
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  expect(await (await run(page({ keep: '1' }, {}, new Blob([PNG])), e, d)).json()).toMatchObject({ verdict: 'fish', kept: false })
  expect(keptKeys(r2).map(k => k.split('/').slice(0, 2).join('/')).sort()).toEqual(['fish-id/anon', `fish-id/${reader.id}`].sort())
  // Without the bucket: identified, not kept.
  const bare = env({ DB: db })
  expect(await (await run(page({ keep: '1' }), bare.e, d)).json()).toMatchObject({ verdict: 'fish', kept: false })
  // A refusal is kept too, as unclear.
  expect(await (await run(page({ keep: '1' }), e, deps(claude({ [A]: () => message('{}', 'refusal') }).fetch))).json()).toMatchObject({ refused: true, kept: true })
})

test('kept photos go with their account, and from everyone 6 months on (the daily cron)', async () => {
  const { e, db, r2 } = await keepEnv()
  const d = deps(claude({}).fetch)
  const [a, b] = [await signIn(db), await signIn(db)]
  const now = Date.now()
  r2.setNow(() => new Date(now - KEEP_DAYS * 86_400_000 - 60_000))
  await run(appJson(a.token, { keep: true }), e, d)
  r2.setNow(() => new Date(now - 10 * 86_400_000))
  await run(appJson(b.token, { keep: true }), e, d)
  await run(appJson(a.token, { keep: true }), e, d)
  expect(keptKeys(r2)).toHaveLength(3)
  expect(await sweepKept(r2.bucket, new Date(now))).toBe(1)
  expect(keptKeys(r2)).toHaveLength(2)
  await deleteUser(db, a.id, { UPLOADS: r2.bucket })
  expect(keptKeys(r2).every(k => k.startsWith(`fish-id/${b.id}/`))).toBe(true)
  // Across R2's pages of a listing.
  const paged = memoryR2(2)
  for (let i = 0; i < 5; i++) await paged.bucket.put(`fish-id/anon/${crypto.randomUUID()}`, PHONE_JPEG)
  expect(await sweepKept(paged.bucket, new Date(now + (KEEP_DAYS + 1) * 86_400_000))).toBe(5)
})
