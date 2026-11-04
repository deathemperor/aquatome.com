import { expect, test } from 'vitest'
import { handle, type Env } from '../index'
import type { Catalog } from '../fishid/catalog'
import type { FishIdDeps } from '../fishid/api'
import { keyHash } from '../fishid/keys'
import { contract } from './contract'
import { testD1 } from './d1'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8])
const A = 'sk-ant-api03-aaaaaaaaaaaa'
const B = 'sk-ant-api03-bbbbbbbbbbbb'
const KEYS = `${A} wrkspc_orgA\n${B}\n`

const CATALOG: Catalog = {
  version: 1,
  shards: 1,
  entries: [
    { id: 'betta-splendens', kind: 'species', sci: 'Betta splendens', name: { vi: 'Cá betta' }, url: { vi: '/vi/ca/ca-betta/' }, img: 'https://media.aquatome.com/betta-480.webp' },
    { id: 'halfmoon-betta', kind: 'breed', basedOn: 'betta-splendens', name: { vi: 'Cá betta Halfmoon (Halfmoon betta)' }, alt: ['Betta HM', 'Half moon betta'], url: { vi: '/vi/ca/ca-betta-halfmoon/' } },
    { id: 'paracheirodon-innesi', kind: 'species', sci: 'Paracheirodon innesi', name: { vi: 'Cá neon xanh', id: 'Ikan neon' }, url: { vi: '/vi/ca/ca-neon-xanh/', id: '/id/ikan/ikan-neon/' }, img: 'https://media.aquatome.com/neon-480.webp' },
    { id: 'paracheirodon-axelrodi', kind: 'species', sci: 'Paracheirodon axelrodi', name: { vi: 'Cá neon vua' }, url: { vi: '/vi/ca/ca-neon-vua/' } },
  ],
}
const NEON = { verdict: 'fish', guesses: [
  { scientificName: 'Paracheirodon innesi', commonName: 'Neon tetra', variety: null, confidence: 0.92, reason: 'Sọc xanh ánh kim, nửa sau thân đỏ.' },
  { scientificName: 'Paracheirodon axelrodi', commonName: 'Cardinal tetra', variety: null, confidence: 0.05, reason: 'Đỏ cả bụng.' },
] }

const message = (answer: unknown, stop = 'end_turn', usage = { input_tokens: 1500, output_tokens: 120 }) => Response.json({
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: stop, stop_sequence: null,
  content: [{ type: 'text', text: typeof answer === 'string' ? answer : JSON.stringify(answer) }], usage,
})

/** A fake Claude that answers each call in turn from `replies` (the last one again past the end); every call it saw. */
function claude(replies: ((body: Record<string, unknown>) => Response | Promise<Response>)[]) {
  const calls: { key: string; body: Record<string, unknown> }[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init)
    const body = await req.json() as Record<string, unknown>
    calls.push({ key: req.headers.get('authorization')?.replace(/^Bearer /, '') ?? req.headers.get('x-api-key') ?? '', body })
    return replies[Math.min(calls.length, replies.length) - 1]!(body)
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
  const points: Point[] = []
  const e = {
    FISHID_LOG: { writeDataPoint: (p: Point) => { points.push(p) } },
    ASSETS: { fetch: async (r: Request) => (new URL(r.url).pathname === '/app/fish-id.json' ? Response.json(CATALOG) : new Response('nope', { status: 404 })) },
    AB: store.ns,
    TURNSTILE_SECRET: 's', TURNSTILE_SITEKEY: 'site-key', COMMENT_HMAC_KEY: 'h',
    ANTHROPIC_KEYS: KEYS,
    DB: testD1(),
    ...extra,
  } as unknown as Env
  return { e, kv: store.m, points }
}
const READER = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', 'accept-language': 'vi-VN,vi;q=0.9' }
const post = (headers: Record<string, string> = {}) => {
  const f = new FormData()
  f.set('file', new Blob([JPEG]), 'photo.jpg')
  f.set('token', 't')
  f.set('lang', 'vi')
  return new Request('https://x.test/api/fish-id', { method: 'POST', body: f, headers: { origin: 'https://x.test', 'cf-connecting-ip': '203.0.113.7', ...READER, ...headers } })
}
const deps = (fetch: typeof globalThis.fetch, extra: Partial<FishIdDeps> = {}): FishIdDeps => ({ fetch, random: () => 0, siteverify: async () => true, log: () => {}, ...extra })
const { answer } = contract('fishid.openapi.json')
async function run(req: Request, e: Env, d: FishIdDeps): Promise<Response> {
  const res = await handle(req, e, undefined, undefined, d)
  await answer('/api/fish-id', 'post', res.clone())
  return res
}

/** Today's answer to NEON, byte for byte, as main gave it before the agent existed. */
const TODAY = '{"verdict":"fish","results":[{"scientificName":"Paracheirodon innesi","commonName":"Neon tetra","variety":null,"confidence":0.92,"reason":"Sọc xanh ánh kim, nửa sau thân đỏ.","page":{"id":"paracheirodon-innesi","kind":"species","name":"Cá neon xanh","sci":"Paracheirodon innesi","url":"/vi/ca/ca-neon-xanh/","img":"https://media.aquatome.com/neon-480.webp"},"sameGenus":[{"id":"paracheirodon-axelrodi","kind":"species","name":"Cá neon vua","sci":"Paracheirodon axelrodi","url":"/vi/ca/ca-neon-vua/"}]},{"scientificName":"Paracheirodon axelrodi","commonName":"Cardinal tetra","variety":null,"confidence":0.05,"reason":"Đỏ cả bụng.","page":{"id":"paracheirodon-axelrodi","kind":"species","name":"Cá neon vua","sci":"Paracheirodon axelrodi","url":"/vi/ca/ca-neon-vua/"},"sameGenus":[{"id":"paracheirodon-innesi","kind":"species","name":"Cá neon xanh","sci":"Paracheirodon innesi","url":"/vi/ca/ca-neon-xanh/","img":"https://media.aquatome.com/neon-480.webp"}]}],"model":"claude-opus-5-5"}'
/** Today's request to Claude for that photo, as main sent it. */
const TODAY_REQUEST = { model: 'claude-opus-5-5', max_tokens: 4096, output_config: { effort: 'low', format: { type: 'json_schema', schema: expect.any(Object) } }, system: expect.stringMatching(/^You identify aquarium fish/), messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: btoa(String.fromCharCode(...JPEG)) } }, { type: 'text', text: 'Which fish, aquatic animal or plant is this? The reader\'s language: Vietnamese.' }] }] }

test('the agent off (unset, or anything but 1): today\'s one call and today\'s answer, byte for byte, headers too', async () => {
  for (const flag of [undefined, '0', 'true']) {
    const { e } = env(flag === undefined ? {} : { FISH_ID_AGENT: flag })
    const c = claude([() => message(NEON)])
    const res = await run(post(), e, deps(c.fetch))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.text()).toBe(TODAY)
    expect(c.calls).toHaveLength(1)
    expect(c.calls[0]!.body).toStrictEqual(TODAY_REQUEST)
    expect(Object.keys((c.calls[0]!.body.output_config as { format: { schema: { properties: { guesses: { items: { properties: object } } } } } }).format.schema.properties.guesses.items.properties)).toEqual(['scientificName', 'commonName', 'variety', 'confidence', 'reason'])
  }
})

const FACTS = { version: 1, entries: [
  { id: 'betta-splendens', kind: 'species', sci: 'Betta splendens', family: 'Osphronemidae', photos: ['https://media.aquatome.com/betta-480.webp'] },
  { id: 'halfmoon-betta', kind: 'breed', basedOn: 'betta-splendens', names: ['Betta HM', 'Half moon betta'], text: 'Đuôi xòe tròn 180 độ.', photos: [] },
  { id: 'paracheirodon-innesi', kind: 'species', sci: 'Paracheirodon innesi', family: 'Characidae', sizeCm: '4', from: ['south-america', 'amazon'], text: 'Sexually mature females are rounder-bodied.', photos: ['https://media.aquatome.com/neon-480.webp', 'https://media.aquatome.com/neon-2-480.webp'] },
  { id: 'paracheirodon-axelrodi', kind: 'species', sci: 'Paracheirodon axelrodi', photos: [] },
] }
/** The agent on, with the build's page list and its one facts shard. */
const agentEnv = (extra: Record<string, unknown> = {}) => env({
  FISH_ID_AGENT: '1',
  ASSETS: { fetch: async (r: Request) => {
    const path = new URL(r.url).pathname
    return path === '/app/fish-id.json' ? Response.json(CATALOG) : path === '/app/fish-id/facts-0.json' ? Response.json(FACTS) : new Response('nope', { status: 404 })
  } },
  ...extra,
})
let seq = 0
const CACHED = { input_tokens: 300, output_tokens: 150, cache_read_input_tokens: 2000, cache_creation_input_tokens: 600 }
/** Claude asking for tools (a thinking block first, as Opus 5.5 sends). */
const asks = (uses: [string, Record<string, unknown>][], usage = CACHED) => Response.json({
  id: `msg_${++seq}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'tool_use', stop_sequence: null, usage,
  content: [{ type: 'thinking', thinking: '', signature: `sig_${seq}` }, ...uses.map(([name, input], i) => ({ type: 'tool_use', id: `toolu_${seq}_${i}`, name, input }))],
})
const CHECKED = { verdict: 'fish', guesses: [
  { ...NEON.guesses[0], id: 'paracheirodon-innesi' },
  { ...NEON.guesses[1], id: null },
] }
const apiError = (status: number, type: string, msg: string, headers: Record<string, string> = {}) => Response.json({ type: 'error', error: { type, message: msg } }, { status, headers })
const fields = (p: Point) => ({ outcome: p.blobs[0], key: p.blobs[2], stopped: p.blobs[9], input: p.doubles[0], output: p.doubles[1], cost: p.doubles[2], attempts: p.doubles[4], turns: p.doubles[7], tools: p.doubles[8], refs: p.doubles[9] })
const today = () => new Date().toISOString().slice(0, 10)
const readerCount = (m: Map<string, { v: string }>) => [...m].filter(([k]) => k.startsWith('fishid:ip:') || k.startsWith('fishid:acct:')).map(([, e]) => Number(e.v))
const usage3 = { input_tokens: 300, output_tokens: 150, cache_read_input_tokens: 2000, cache_creation_input_tokens: 600 }
const neonLink = { id: 'paracheirodon-innesi', kind: 'species', name: 'Cá neon xanh', sci: 'Paracheirodon innesi', url: '/vi/ca/ca-neon-xanh/', img: 'https://media.aquatome.com/neon-480.webp' }
const axelLink = { id: 'paracheirodon-axelrodi', kind: 'species', name: 'Cá neon vua', sci: 'Paracheirodon axelrodi', url: '/vi/ca/ca-neon-vua/' }

test('the agent on: it searches the handbook, opens two pages and their photos, then answers; the answer is today\'s plus its steps, linked to the pages it checked', async () => {
  const { e, kv, points } = agentEnv()
  const c = claude([
    () => asks([['search_handbook', { query: null, genus: 'Paracheirodon' }]]),
    () => asks([['get_entry', { id: 'paracheirodon-innesi' }], ['get_entry', { id: 'paracheirodon-axelrodi' }]]),
    () => message(CHECKED, 'end_turn', usage3),
  ])
  const res = await run(post(), e, deps(c.fetch))
  expect(res.status).toBe(200)
  const body = await res.json() as { steps: unknown[]; results: { page?: { id: string }; id?: string }[] }
  expect(body.steps).toEqual([{ kind: 'search', query: 'Paracheirodon' }, { kind: 'look', page: neonLink }, { kind: 'look', page: axelLink }])
  expect(body.results.map(r => r.page?.id)).toEqual(['paracheirodon-innesi', 'paracheirodon-axelrodi'])
  expect(body.results.some(r => 'id' in r)).toBe(false)
  // Three calls, all with the key the first one got (A: the random pick lands on it).
  expect(c.calls.map(x => x.key)).toEqual([A, A, A])
  const [b1, b2, b3] = c.calls.map(x => x.body as { system: string; tools: { name: string; strict: boolean }[]; tool_choice: { type: string }; messages: { role: string; content: Record<string, unknown>[] }[]; output_config: { effort: string; format: { schema: { properties: { guesses: { items: { required: string[] } } } } } } })
  expect(b1!.system).toMatch(/^You identify aquarium fish[\s\S]*search_handbook/)
  expect(b1!.tools.map(t => [t.name, t.strict])).toEqual([['search_handbook', true], ['get_entry', true]])
  expect(b1!.output_config.effort).toBe('low')
  expect(b1!.output_config.format.schema.properties.guesses.items.required).toContain('id')
  expect(b1!.messages[0]!.content[0]).toMatchObject({ type: 'image', cache_control: { type: 'ephemeral' } })
  // The search's pages as JSON, text only; each page opened: its facts, then its photos by address (none for a page without).
  const searched = b2!.messages[2]!.content[0] as { content: string }
  expect(JSON.parse(searched.content)).toEqual([
    { id: 'paracheirodon-axelrodi', kind: 'species', sci: 'Paracheirodon axelrodi', name: 'Cá neon vua' },
    { id: 'paracheirodon-innesi', kind: 'species', sci: 'Paracheirodon innesi', name: 'Cá neon xanh' },
  ])
  const [neon, axel] = b3!.messages[4]!.content as { content: { type: string; text?: string; source?: { url: string } }[] }[]
  expect(neon!.content[0]!.text).toMatch(/Paracheirodon innesi[\s\S]*Family: Characidae[\s\S]*Adult size: 4 cm[\s\S]*Reference photos: 2, below\./)
  expect(neon!.content.slice(1).map(b => b.source?.url)).toEqual(['https://media.aquatome.com/neon-480.webp', 'https://media.aquatome.com/neon-2-480.webp'])
  expect(axel!.content.map(b => b.text)).toEqual([expect.stringMatching(/Reference photos: none on this page\.$/)])
  // The log: its calls, tool calls and photos, why it stopped, and every token at its price (cache reads and writes too).
  const cost = (3 * (300 * 4 + 150 * 20 + 2000 * 0.2 + 600 * 5)) / 1e6
  expect(fields(points[0]!)).toMatchObject({ outcome: 'ok', stopped: 'answer', turns: 3, tools: 3, refs: 2, attempts: 3, input: 3 * 2900, output: 450 })
  expect(fields(points[0]!).cost).toBeCloseTo(cost, 10)
  expect(JSON.parse(kv.get(`fishid:day:${today()}`)!.v).usd).toBeCloseTo(cost, 10)
  expect(readerCount(kv)).toEqual([1])
})

test('the agent on: a page the answer names without checking still links by its name, and a guess with no page stays unlinked', async () => {
  const { e } = agentEnv()
  const c = claude([() => message({ verdict: 'fish', guesses: [{ ...NEON.guesses[0], id: null }, { scientificName: 'Nannostomus beckfordi', commonName: 'Golden pencilfish', variety: null, confidence: 0.1, reason: 'Sọc dọc.', id: 'no-such-page' }] })])
  const body = await (await run(post(), e, deps(c.fetch))).json() as { steps?: unknown; results: { page?: { id: string } }[] }
  expect(body.steps).toBeUndefined()
  expect(body.results.map(r => r.page?.id ?? null)).toEqual(['paracheirodon-innesi', null])
})

test('the agent on: a call after the first fails → its key set aside as the rotation would, and today\'s single call answers on the next key', async () => {
  const { e, kv, points } = agentEnv()
  const c = claude([
    () => asks([['search_handbook', { query: 'Paracheirodon innesi', genus: null }]]),
    () => apiError(429, 'rate_limit_error', 'slow down', { 'retry-after': '30' }),
    () => message(NEON),
  ])
  const res = await run(post(), e, deps(c.fetch))
  expect(res.status).toBe(200)
  const body = await res.json() as { steps: unknown[]; results: { page?: { id: string } }[] }
  expect(body.steps).toEqual([{ kind: 'search', query: 'Paracheirodon innesi' }])
  expect(body.results[0]!.page?.id).toBe('paracheirodon-innesi')
  expect(c.calls.map(x => x.key)).toEqual([A, A, B])
  expect(c.calls[2]!.body.tools).toBeUndefined() // today's call, as the flag off would send it
  expect(JSON.parse(kv.get(`fishid:key:${await keyHash(A)}`)!.v)).toMatchObject({ why: 'rate' })
  expect(kv.has(`fishid:key:${await keyHash(B)}`)).toBe(false)
  expect(fields(points[0]!)).toMatchObject({ outcome: 'ok', stopped: 'fallback', turns: 3, tools: 1, attempts: 3 })
})

test('the agent on: a failed call with under 10 s left answers unavailable, and the reader\'s count is given back', async () => {
  const { e, kv, points } = agentEnv()
  const c = claude([() => asks([['search_handbook', { query: 'neon', genus: null }]]), () => apiError(529, 'overloaded_error', 'Overloaded')])
  const res = await run(post(), e, deps(c.fetch, { limits: { ms: 9_000, lastCallMs: 0 } }))
  expect(res.status).toBe(503)
  expect(await res.json()).toEqual({ error: 'unavailable' })
  expect(c.calls).toHaveLength(2)
  expect(readerCount(kv)).toEqual([0])
  expect(fields(points[0]!)).toMatchObject({ outcome: 'unavailable', stopped: 'error', turns: 2, tools: 1 })
  expect(fields(points[0]!).cost).toBeGreaterThan(0) // the first call was paid for
})

test('the agent on: an answer that isn\'t the schema\'s is failed, with the count given back; a refusal is the calm can\'t-tell answer, with its steps', async () => {
  const { e, kv } = agentEnv()
  const bad = claude([() => asks([['get_entry', { id: 'betta-splendens' }]]), () => message('not json')])
  const res = await run(post(), e, deps(bad.fetch))
  expect([res.status, await res.json()]).toEqual([502, { error: 'failed' }])
  expect(readerCount(kv)).toEqual([0])
  const refused = claude([() => asks([['get_entry', { id: 'betta-splendens' }]]), () => message('', 'refusal')])
  const r2 = await run(post(), e, deps(refused.fetch))
  expect(await r2.json()).toEqual({ verdict: 'unclear', results: [], refused: true, model: 'claude-opus-5-5', steps: [{ kind: 'look', page: { id: 'betta-splendens', kind: 'species', name: 'Cá betta', sci: 'Betta splendens', url: '/vi/ca/ca-betta/', img: 'https://media.aquatome.com/betta-480.webp' } }] })
  expect(readerCount(kv)).toEqual([1])
})

test('the agent off: no result gives the reader\'s count back too (a failed call used to count); a result keeps it', async () => {
  const { e, kv } = env()
  const down = claude([() => apiError(529, 'overloaded_error', 'Overloaded')])
  const res = await run(post(), e, deps(down.fetch))
  expect([res.status, await res.json()]).toEqual([503, { error: 'unavailable' }])
  expect(readerCount(kv)).toEqual([0])
  await run(post(), e, deps(claude([() => message(NEON)]).fetch))
  expect(readerCount(kv)).toEqual([1])
})

test('the site\'s spend a day: past FISH_ID_USD_PER_DAY (default $15) the next photo is busy before any call; each answer adds its cost', async () => {
  const { e, kv } = env()
  kv.set(`fishid:day:${today()}`, { v: JSON.stringify({ calls: 3, keys: {}, usd: 15 }) })
  const c = claude([() => message(NEON)])
  const res = await run(post(), e, deps(c.fetch))
  expect([res.status, await res.json()]).toEqual([429, { error: 'busy' }])
  expect(c.calls).toHaveLength(0)
  expect(readerCount(kv)).toEqual([])
  const { e: e2, kv: kv2 } = env({ FISH_ID_USD_PER_DAY: '20' })
  kv2.set(`fishid:day:${today()}`, { v: JSON.stringify({ calls: 3, keys: {}, usd: 15 }) })
  expect((await run(post(), e2, deps(c.fetch))).status).toBe(200)
  expect(JSON.parse(kv2.get(`fishid:day:${today()}`)!.v)).toMatchObject({ calls: 4, usd: 15.0084 })
})

const slowly = (r: () => Response, ms = 25) => async () => { await new Promise(res => setTimeout(res, ms)); return r() }
const streamed = (headers: Record<string, string> = {}) => post({ accept: 'text/event-stream', ...headers })

test('progress: with Accept text/event-stream, the steps as they happen, a ping while Claude works, then the result; the log is written when the run ends', async () => {
  const { e, points } = agentEnv()
  const c = claude([
    slowly(() => asks([['search_handbook', { query: null, genus: 'Paracheirodon' }]])),
    slowly(() => asks([['get_entry', { id: 'paracheirodon-innesi' }], ['get_entry', { id: 'paracheirodon-axelrodi' }]])),
    slowly(() => message(CHECKED, 'end_turn', usage3)),
  ])
  const res = await handle(streamed(), e, undefined, undefined, deps(c.fetch, { pingMs: 10 }))
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8')
  const text = await res.clone().text()
  const events = text.split('\n\n').filter(Boolean).map(b => b.startsWith(':') ? b : b.split('\n')[0])
  expect(events.filter(x => x !== ': ping')).toEqual(['event: step', 'event: step', 'event: step', 'event: result'])
  expect(events).toContain(': ping')
  expect(events.at(-1)).toBe('event: result')
  const result = await answer('/api/fish-id', 'post', res) as { steps: unknown[] }
  expect(result.steps).toHaveLength(3)
  expect(points.map(p => fields(p).outcome)).toEqual(['ok'])
})

test('progress with the agent off: no steps, then the result, the same body as the JSON answer', async () => {
  const { e } = env()
  const res = await run(streamed(), e, deps(claude([() => message(NEON)]).fetch))
  expect(await res.text()).toBe(`event: result\ndata: ${TODAY}\n\n`)
})

test('progress: every refusal before the photo is admitted is still the JSON error with its status', async () => {
  const { e, kv } = agentEnv()
  for (let i = 0; i < 10; i++) await run(post(), e, deps(claude([() => message(NEON)]).fetch))
  const res = await run(streamed(), e, deps(claude([() => message(NEON)]).fetch))
  expect(res.status).toBe(429)
  expect(res.headers.get('content-type')).toBe('application/json')
  expect(await res.json()).toEqual({ error: 'rate', limit: 10 })
  expect(readerCount(kv)).toEqual([10])
  const off = await run(streamed({ origin: 'https://evil.test' }), e, deps(claude([]).fetch))
  expect([off.status, off.headers.get('content-type')]).toEqual([403, 'application/json'])
})

test('progress: an error after the stream began is an error event, and the reader\'s count is given back', async () => {
  const { e, kv } = agentEnv()
  const c = claude([() => asks([['search_handbook', { query: 'neon', genus: null }]]), () => apiError(400, 'invalid_request_error', 'Bad image'), () => apiError(400, 'invalid_request_error', 'Bad image')])
  const res = await run(streamed(), e, deps(c.fetch))
  expect(res.status).toBe(200)
  const text = await res.text()
  expect(text).toBe('event: step\ndata: {"kind":"search","query":"neon"}\n\nevent: error\ndata: {"error":"failed"}\n\n')
  expect(readerCount(kv)).toEqual([0])
})

test('retries: the same Idempotency-Key gets the kept result, as JSON or one result event, with no new call and no new count', async () => {
  const { e, kv, points } = env()
  const c = claude([() => message(NEON)])
  const key = { 'idempotency-key': '3F2504E0-4F89-41D3-9A0C-0305E82C3301' }
  const first = await run(post(key), e, deps(c.fetch))
  expect(await first.text()).toBe(TODAY)
  expect([...kv].find(([k]) => k.startsWith('fishid:run:'))?.[1].ttl).toBe(900)
  const again = await run(post(key), e, deps(c.fetch))
  expect(await again.text()).toBe(TODAY)
  const stream = await run(streamed(key), e, deps(c.fetch))
  expect(await stream.text()).toBe(`event: result\ndata: ${TODAY}\n\n`)
  expect(c.calls).toHaveLength(1)
  expect(readerCount(kv)).toEqual([1])
  expect(points.map(p => p.blobs[0])).toEqual(['ok', 'retry', 'retry'])
  // Another key, or none, is a new identification.
  await run(post({ 'idempotency-key': '3f2504e0-4f89-41d3-9a0c-0305e82c3302' }), e, deps(c.fetch))
  await run(post({ 'idempotency-key': 'not-a-uuid' }), e, deps(c.fetch))
  expect(c.calls).toHaveLength(3)
  expect(readerCount(kv)).toEqual([3])
})
