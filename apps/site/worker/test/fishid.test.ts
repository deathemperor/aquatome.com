import { expect, test, vi } from 'vitest'
import { handle, type Env } from '../index'
import type { Catalog } from '../fishid/catalog'
import { fishIdStatus, type FishIdDeps } from '../fishid/api'
import { keyHash, loadKeys, parseKeys } from '../fishid/keys'
import { renderDashboard } from '../dashboard'

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
function env(extra: Record<string, string | undefined> = {}) {
  const store = kv()
  const e = {
    ASSETS: { fetch: async (r: Request) => (new URL(r.url).pathname === '/app/fish-id.json' ? Response.json(CATALOG) : new Response('nope', { status: 404 })) },
    AB: store.ns,
    TURNSTILE_SECRET: 's', TURNSTILE_SITEKEY: 'site-key', COMMENT_HMAC_KEY: 'h', AB_DASH_TOKEN: 'tok',
    ANTHROPIC_KEYS: KEYS,
    ...extra,
  } as unknown as Env
  return { e, kv: store.m }
}

const post = (file: Blob = new Blob([JPEG]), fields: Record<string, string> = { token: 't', lang: 'vi' }, headers: Record<string, string> = {}) => {
  const f = new FormData()
  f.set('file', file, 'photo.jpg')
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return new Request('https://x.test/api/fish-id', { method: 'POST', body: f, headers: { origin: 'https://x.test', 'cf-connecting-ip': '203.0.113.7', ...headers } })
}
// The random pick lands on the first healthy key: key A, while it is healthy.
const deps = (fetch: typeof globalThis.fetch, extra: Partial<FishIdDeps> = {}): FishIdDeps & { lines: Record<string, unknown>[] } => {
  const lines: Record<string, unknown>[] = []
  return { fetch, random: () => 0, siteverify: async () => true, log: l => { lines.push(l) }, lines, ...extra }
}
const run = (req: Request, e: Env, d: FishIdDeps) => handle(req, e, undefined, undefined, d)
type Body = { verdict?: string; error?: string; refused?: boolean; results?: { scientificName: string; page?: { id: string; url?: string; name: string }; species?: { id: string }; sameGenus?: { id: string }[] }[] }

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
  const { e, kv } = env()
  const fake = claude({})
  const d = deps(fake.fetch)
  const r = await run(post(), e, d)
  expect(r.status).toBe(200)
  const body = (await r.json()) as Body
  expect(body.verdict).toBe('fish')
  // Sorted by confidence; the neon tetra links its page, the green neon has a genus-mate only, the ember tetra nothing.
  expect(body.results!.map(x => x.scientificName)).toEqual(['Paracheirodon innesi', 'Hyphessobrycon amandae', 'Paracheirodon simulans'])
  expect(body.results![0]!.page).toMatchObject({ id: 'paracheirodon-innesi', url: '/vi/ca/ca-neon-xanh/', name: 'Cá neon xanh' })
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
  // Counted: the reader's day and the site's, with the key's call.
  expect(JSON.parse(kv.get(`fishid:day:${new Date().toISOString().slice(0, 10)}`)!.v)).toEqual({ calls: 1, keys: { [await keyHash(A)]: 1 } })
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
  for (const [answer, headers] of [[harlequin(0.4), {}], [NEON, {}], [harlequin(0.85), { cookie: 'aq_owner=1' }]] as const) {
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
  const { e, kv } = env()
  const until = Date.now() + 3_600_000
  for (const k of [A, B, C]) kv.set(`fishid:key:${await keyHash(k)}`, { v: JSON.stringify({ until, why: 'credit' }) })
  const fake = claude({})
  const r = await run(post(), e, deps(fake.fetch))
  expect(r.status).toBe(503)
  expect(await r.json()).toEqual({ error: 'resting' })
  expect(fake.calls).toHaveLength(0)
  expect(await (await run(new Request('https://x.test/api/fish-id'), e, deps(fake.fetch))).json()).toEqual({ on: true, sitekey: 'site-key', resting: true, perIp: 10 })
  // Resting isn't a reader's use: nothing counted.
  expect([...kv.keys()].some(k => k.startsWith('fishid:ip:'))).toBe(false)
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

test('the owner\'s dashboard: each key by number and hash, its state and today\'s calls; never the key', async () => {
  const { e, kv } = env()
  const fake = claude({ [A]: () => apiError(402, 'billing_error', 'x') })
  await run(post(), e, deps(fake.fetch))
  const status = (await fishIdStatus(e as never, new Date()))!
  expect(status.rows.map(r => [r.n, r.hash, r.state, r.calls, r.workspace])).toEqual([
    [1, await keyHash(A), 'credit', 1, true], [2, await keyHash(B), 'ok', 1, false], [3, await keyHash(C), 'ok', 0, false],
  ])
  expect(status.today).toBe(1)
  const html = renderDashboard(undefined, {}, undefined, status)
  expect(html).toContain('hết credit')
  expect(html).toContain(await keyHash(A))
  for (const k of [A, B, C, 'wrkspc_orgA']) expect(html).not.toContain(k)
  expect(kv.size).toBeGreaterThan(0)
})
