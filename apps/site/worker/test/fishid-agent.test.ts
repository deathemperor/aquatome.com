import { expect, test, vi } from 'vitest'
import { handle, type Env } from '../index'
import type { Catalog } from '../fishid/catalog'
import { fishIdStatus, type FishIdDeps } from '../fishid/api'
import { costOf, PRICES, worstCost } from '../fishid/claude'
import { LIMITS } from '../agent/loop'
import { keyHash } from '../fishid/keys'
import { contract } from './contract'
import { testD1 } from './d1'
import { memoryLedger } from './ledger'
import { emptyDay } from '../fishid/ledger'
import { memoryR2 } from './r2'

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
  const ledger = memoryLedger()
  const points: Point[] = []
  const e = {
    FISHID_LOG: { writeDataPoint: (p: Point) => { points.push(p) } },
    ASSETS: { fetch: async (r: Request) => (new URL(r.url).pathname === '/app/fish-id.json' ? Response.json(CATALOG) : new Response('nope', { status: 404 })) },
    AB: store.ns,
    TURNSTILE_SECRET: 's', TURNSTILE_SITEKEY: 'site-key', COMMENT_HMAC_KEY: 'h',
    ANTHROPIC_KEYS: KEYS,
    DB: testD1(),
    FISHID_LEDGER: ledger.ns,
    ...extra,
  } as unknown as Env
  return { e, kv: store.m, points, ledger }
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
const fields = (p: Point) => ({ outcome: p.blobs[0], key: p.blobs[2], stopped: p.blobs[9], input: p.doubles[0], output: p.doubles[1], cost: p.doubles[2], attempts: p.doubles[4], turns: p.doubles[7], tools: p.doubles[8], refs: p.doubles[9], rechecked: p.doubles[10] })
const today = () => new Date().toISOString().slice(0, 10)
/** Each reader's count today, in the ledger. */
const readerCount = (l: ReturnType<typeof memoryLedger>) => Object.values(l.day()?.readers ?? {})
const usage3 = { input_tokens: 300, output_tokens: 150, cache_read_input_tokens: 2000, cache_creation_input_tokens: 600 }
const neonLink = { id: 'paracheirodon-innesi', kind: 'species', name: 'Cá neon xanh', sci: 'Paracheirodon innesi', url: '/vi/ca/ca-neon-xanh/', img: 'https://media.aquatome.com/neon-480.webp' }
const axelLink = { id: 'paracheirodon-axelrodi', kind: 'species', name: 'Cá neon vua', sci: 'Paracheirodon axelrodi', url: '/vi/ca/ca-neon-vua/' }

test('the agent on: it searches the handbook, opens two pages and their photos, then answers; the answer is today\'s plus its steps, linked to the pages it checked', async () => {
  const { e, kv, points, ledger } = agentEnv()
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
  expect(ledger.day()!.usd).toBeCloseTo(cost, 10)
  expect(readerCount(ledger)).toEqual([1])
})

test('every run is kept a year as text: the agent asks for its thinking summarised; its turns and the answer under the day; never the photo, the reader\'s address or a key; today\'s call too, its request as before', async () => {
  const r2 = memoryR2()
  const { e } = agentEnv({ UPLOADS: r2.bucket })
  const c = claude([() => asks([['get_entry', { id: 'paracheirodon-innesi' }]]), () => message(CHECKED, 'end_turn', usage3)])
  const waits: Promise<unknown>[] = []
  await (await handle(post(), e, p => { waits.push(p) }, undefined, deps(c.fetch))).json()
  await Promise.all(waits)
  for (const x of c.calls) expect(x.body.thinking).toEqual({ type: 'adaptive', display: 'summarized' })
  const runs = [...r2.m].filter(([k]) => k.startsWith('fish-id-runs/'))
  expect(runs).toHaveLength(1)
  const [key, o] = runs[0]!
  expect(key).toMatch(new RegExp(`^fish-id-runs/${new Date().toISOString().slice(0, 10)}/[0-9a-f-]{36}\\.json$`))
  const text = new TextDecoder().decode(o.bytes)
  const r = JSON.parse(text)
  expect(r).toMatchObject({ v: 1, lang: 'vi', from: '', model: 'claude-opus-5-5', outcome: 'ok', agent: { calls: 2, tools: 1, photos: 2, stopped: 'answer' }, verdict: 'fish',
    results: [{ scientificName: 'Paracheirodon innesi', confidence: 0.92, reason: 'Sọc xanh ánh kim, nửa sau thân đỏ.', page: 'paracheirodon-innesi' }, { scientificName: 'Paracheirodon axelrodi', page: 'paracheirodon-axelrodi' }] })
  expect(key).toContain(r.id)
  expect(r.turns).toHaveLength(2)
  expect(r.turns[0].tools).toEqual([{ name: 'get_entry', input: { id: 'paracheirodon-innesi' }, result: expect.stringMatching(/^paracheirodon-innesi \(species\): Cá neon xanh[\s\S]*The other 1 species of Paracheirodon/), photos: ['https://media.aquatome.com/neon-480.webp', 'https://media.aquatome.com/neon-2-480.webp'] }])
  expect(r.turns[1].text).toBe(JSON.stringify(CHECKED))
  for (const never of [btoa(String.fromCharCode(...JPEG)), '203.0.113.7', A, B, 'iPhone']) expect(text).not.toContain(never)

  // Today's single call (the agent off): its answer kept the same way, its request unchanged (no thinking asked for).
  const r2b = memoryR2()
  const { e: off } = env({ UPLOADS: r2b.bucket })
  const d = claude([() => message(NEON)])
  const waits2: Promise<unknown>[] = []
  await (await handle(post(), off, p => { waits2.push(p) }, undefined, deps(d.fetch))).json()
  await Promise.all(waits2)
  expect(d.calls[0]!.body).toStrictEqual(TODAY_REQUEST)
  const single = JSON.parse(new TextDecoder().decode([...r2b.m.values()][0]!.bytes))
  expect(single).toMatchObject({ outcome: 'ok', turns: [{ text: JSON.stringify(NEON) }] })
  expect(single).not.toHaveProperty('agent')
  // Streamed (the app's progress): the same, one record when the run ends.
  const r2c = memoryR2()
  const { e: s3 } = agentEnv({ UPLOADS: r2c.bucket })
  const waits3: Promise<unknown>[] = []
  expect(await (await handle(streamed(), s3, p => { waits3.push(p) }, undefined, deps(claude([() => message(CHECKED, 'end_turn', usage3)]).fetch))).text()).toContain('event: result')
  await Promise.all(waits3)
  expect([...r2c.m.keys()].filter(k => k.startsWith('fish-id-runs/'))).toHaveLength(1)
  // A bucket that fails to save: the reader's answer as ever, the error logged.
  const { e: broken } = agentEnv({ UPLOADS: { put: async () => { throw new Error('r2 down') } } })
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const waits4: Promise<unknown>[] = []
  const res4 = await handle(post(), broken, p => { waits4.push(p) }, undefined, deps(claude([() => message(CHECKED)]).fetch))
  expect(res4.status).toBe(200)
  await Promise.all(waits4)
  expect(errors.mock.calls.some(c => c[0] === 'fish-id transcript:')).toBe(true)
  errors.mockRestore()
  // No bucket: the identification as before, nothing kept.
  const { e: bare } = agentEnv()
  expect((await run(post(), bare, deps(claude([() => message(CHECKED)]).fetch))).status).toBe(200)
})

test('the agent on: a page the answer names without checking still links by its name, and a guess with no page stays unlinked', async () => {
  const { e } = agentEnv()
  const c = claude([() => message({ verdict: 'fish', guesses: [{ ...NEON.guesses[0], id: null }, { scientificName: 'Nannostomus beckfordi', commonName: 'Golden pencilfish', variety: null, confidence: 0.1, reason: 'Sọc dọc.', id: 'no-such-page' }] })])
  const body = await (await run(post(), e, deps(c.fetch))).json() as { steps?: unknown; results: { page?: { id: string } }[] }
  expect(body.steps).toBeUndefined()
  expect(body.results.map(r => r.page?.id ?? null)).toEqual(['paracheirodon-innesi', null])
})

test('the agent on: an answer under 0.6 sure is sent back once with its genus\'s species; the answer after it is the reader\'s, logged as rechecked', async () => {
  const { e, points } = agentEnv()
  const unsure = { verdict: 'fish', guesses: [{ scientificName: 'Betta splendens', commonName: 'Betta', variety: null, confidence: 0.4, reason: 'Thân đỏ.', id: null }] }
  const sure = { verdict: 'fish', guesses: [{ ...unsure.guesses[0], confidence: 0.85, id: 'betta-splendens' }] }
  const c = claude([() => message(unsure, 'end_turn', CACHED), () => message(sure, 'end_turn', CACHED)])
  const body = await (await run(post(), e, deps(c.fetch))).json() as { results: { confidence: number; page?: { id: string } }[] }
  expect(body.results.map(r => [r.page?.id, r.confidence])).toEqual([['betta-splendens', 0.85]])
  expect(c.calls).toHaveLength(2)
  const messages = (c.calls[1]!.body as { messages: { role: string; content: { type: string; text?: string }[] }[] }).messages
  expect(messages.map(m => m.role)).toEqual(['user', 'assistant', 'user'])
  const sent = messages[2]!.content[0]!.text!
  expect(sent).toMatch(/^Your top guess is only 0\.40 sure\./)
  expect(sent).toContain('"betta-splendens"')
  expect(sent).not.toContain('halfmoon-betta')
  expect(fields(points[0]!)).toMatchObject({ outcome: 'ok', stopped: 'answer', turns: 2, rechecked: 1 })

  // Sure enough: one call, logged as not rechecked.
  const { e: e2, points: p2 } = agentEnv()
  const d = claude([() => message(sure, 'end_turn', CACHED)])
  await run(post(), e2, deps(d.fetch))
  expect(d.calls).toHaveLength(1)
  expect(fields(p2[0]!)).toMatchObject({ turns: 1, rechecked: 0 })
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
  const { e, kv, points, ledger } = agentEnv()
  const c = claude([() => asks([['search_handbook', { query: 'neon', genus: null }]]), () => apiError(529, 'overloaded_error', 'Overloaded')])
  const res = await run(post(), e, deps(c.fetch, { limits: { ms: 9_000, lastCallMs: 0 } }))
  expect(res.status).toBe(503)
  expect(await res.json()).toEqual({ error: 'unavailable' })
  expect(c.calls).toHaveLength(2)
  expect(readerCount(ledger)).toEqual([0])
  expect(fields(points[0]!)).toMatchObject({ outcome: 'unavailable', stopped: 'error', turns: 2, tools: 1 })
  expect(fields(points[0]!).cost).toBeGreaterThan(0) // the first call was paid for
})

test('the agent on: an answer that isn\'t the schema\'s is failed, and still counted (the reader\'s photo, not our side); a refusal is the calm can\'t-tell answer, with its steps', async () => {
  const { e, kv, ledger } = agentEnv()
  const bad = claude([() => asks([['get_entry', { id: 'betta-splendens' }]]), () => message('not json')])
  const res = await run(post(), e, deps(bad.fetch))
  expect([res.status, await res.json()]).toEqual([502, { error: 'failed' }])
  expect(readerCount(ledger)).toEqual([1])
  const refused = claude([() => asks([['get_entry', { id: 'betta-splendens' }]]), () => message('', 'refusal')])
  const r2 = await run(post(), e, deps(refused.fetch))
  expect(await r2.json()).toEqual({ verdict: 'unclear', results: [], refused: true, model: 'claude-opus-5-5', steps: [{ kind: 'look', page: { id: 'betta-splendens', kind: 'species', name: 'Cá betta', sci: 'Betta splendens', url: '/vi/ca/ca-betta/', img: 'https://media.aquatome.com/betta-480.webp' } }] })
  expect(readerCount(ledger)).toEqual([2])
})

test('the agent off: no result gives the reader\'s count back too (a failed call used to count); a result keeps it', async () => {
  const { e, kv, ledger } = env()
  const down = claude([() => apiError(529, 'overloaded_error', 'Overloaded')])
  const res = await run(post(), e, deps(down.fetch))
  expect([res.status, await res.json()]).toEqual([503, { error: 'unavailable' }])
  expect(readerCount(ledger)).toEqual([0])
  expect(await fishIdStatus(e as never, new Date())).toMatchObject({ counts: { refunds: 1 }, mostRefunds: 1 })
  await run(post(), e, deps(claude([() => message(NEON)]).fetch))
  expect(readerCount(ledger)).toEqual([1])
})

test('the site\'s spend a day: past FISH_ID_USD_PER_DAY (default $50, chat\'s too) the next photo is busy before any call; each answer adds its cost', async () => {
  const { e, ledger } = env()
  const spent = { ...emptyDay(), calls: 3, usd: 50 }
  ledger.storage.m.set(`day:${today()}`, spent)
  const c = claude([() => message(NEON)])
  const res = await run(post(), e, deps(c.fetch))
  expect([res.status, await res.json()]).toEqual([429, { error: 'busy' }])
  expect(c.calls).toHaveLength(0)
  expect(readerCount(ledger)).toEqual([])
  const { e: e2, ledger: l2 } = env({ FISH_ID_USD_PER_DAY: '60' })
  l2.storage.m.set(`day:${today()}`, spent)
  expect((await run(post(), e2, deps(c.fetch))).status).toBe(200)
  expect(l2.day()).toMatchObject({ calls: 4, runs: {} })
  expect(l2.day()!.usd).toBeCloseTo(50.0084, 10)
  // The owner's dashboard reads today's and yesterday's spend and the cap (admin/pages.ts flags a day past 80% of it).
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  expect(await fishIdStatus(e2 as never, new Date())).toMatchObject({ cap: 60, spend: [{ day: today(), usd: l2.day()!.usd }, { day: yesterday, usd: 0 }] })
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
  const { e, kv, ledger } = agentEnv()
  for (let i = 0; i < 10; i++) await run(post(), e, deps(claude([() => message(NEON)]).fetch))
  const res = await run(streamed(), e, deps(claude([() => message(NEON)]).fetch))
  expect(res.status).toBe(429)
  expect(res.headers.get('content-type')).toBe('application/json')
  expect(await res.json()).toEqual({ error: 'rate', limit: 10 })
  expect(readerCount(ledger)).toEqual([10])
  const off = await run(streamed({ origin: 'https://evil.test' }), e, deps(claude([]).fetch))
  expect([off.status, off.headers.get('content-type')]).toEqual([403, 'application/json'])
})

test('progress: an error after the stream began is an error event; the API refusing our request (502) still counts against the reader', async () => {
  const { e, ledger } = agentEnv()
  const c = claude([() => asks([['search_handbook', { query: 'neon', genus: null }]]), () => apiError(400, 'invalid_request_error', 'Bad image'), () => apiError(400, 'invalid_request_error', 'Bad image')])
  const res = await run(streamed(), e, deps(c.fetch))
  expect(res.status).toBe(200)
  const text = await res.text()
  expect(text).toBe('event: step\ndata: {"kind":"search","query":"neon"}\n\nevent: error\ndata: {"error":"failed"}\n\n')
  // The later call's 400 left the key usable: today's call on it was the fallback, and failed the same way.
  expect(c.calls.map(x => x.key)).toEqual([A, A, A])
  expect(readerCount(ledger)).toEqual([1])
  expect(ledger.day()!.counts).toMatchObject({ later400: 1, refunds: 0 })
})

test('retries: the same Idempotency-Key gets the kept result, as JSON or one result event, with no new call and no new count', async () => {
  const { e, kv, points, ledger } = env()
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
  expect(readerCount(ledger)).toEqual([1])
  expect(points.map(p => p.blobs[0])).toEqual(['ok', 'retry', 'retry'])
  // Another key, or none, is a new identification; a key that isn't a UUID is refused before any call or count.
  await run(post({ 'idempotency-key': '3f2504e0-4f89-41d3-9a0c-0305e82c3302' }), e, deps(c.fetch))
  await run(post(), e, deps(c.fetch))
  const bad = await run(post({ 'idempotency-key': 'not-a-uuid' }), e, deps(c.fetch))
  expect([bad.status, await bad.json()]).toEqual([400, { error: 'bad idempotency-key' }])
  expect(c.calls).toHaveLength(3)
  expect(readerCount(ledger)).toEqual([3])
})

/** Polls until `ok` holds (the ledger's writes land a few turns after the call that made them). */
async function until(ok: () => boolean) {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise(r => setTimeout(r, 0))
  expect(ok()).toBe(true)
}
/** Today's agent turn at CACHED / usage3: 300 in, 150 out, 2,000 read and 600 written on Opus 5.5. */
const TURN = (300 * 4 + 150 * 20 + 2000 * 0.2 + 600 * 5) / 1e6

test('a reader\'s photos Claude refuses (502) still count against their day: past it, rate, though none was answered', async () => {
  const { e, ledger } = env({ FISH_ID_PER_IP: '2' })
  const c = claude([() => apiError(400, 'invalid_request_error', 'Could not process image')])
  for (let i = 0; i < 2; i++) {
    const r = await run(post(), e, deps(c.fetch))
    expect([r.status, await r.json()]).toEqual([502, { error: 'failed' }])
  }
  const r = await run(post(), e, deps(c.fetch))
  expect([r.status, await r.json()]).toEqual([429, { error: 'rate', limit: 2 }])
  expect(c.calls).toHaveLength(2)
  expect(readerCount(ledger)).toEqual([2])
  expect(ledger.day()!.counts.refunds).toBe(0)
})

test('parallel photos from one reader at the limit: one admitted, the rest refused before any call', async () => {
  const { e, ledger } = env({ FISH_ID_PER_IP: '1' })
  const c = claude([() => message(NEON)])
  const res = await Promise.all(Array.from({ length: 5 }, () => run(post(), e, deps(c.fetch))))
  expect(res.map(r => r.status).sort()).toEqual([200, 429, 429, 429, 429])
  expect(c.calls).toHaveLength(1)
  expect(readerCount(ledger)).toEqual([1])
})

test('a reader who drops mid-run: the run goes on (waitUntil), each call\'s spend is in the ledger as it lands, the run settles with no refund, and a retry gets its result', async () => {
  const { e, ledger } = agentEnv()
  let release!: () => void
  const held = new Promise<void>(r => { release = r })
  const c = claude([() => asks([['get_entry', { id: 'paracheirodon-innesi' }]]), async () => { await held; return message(CHECKED, 'end_turn', usage3) }])
  const key = { 'idempotency-key': '0b5e8c1a-2f3d-4e5f-8a9b-0c1d2e3f4a5b' }
  const waits: Promise<unknown>[] = []
  const res = await handle(streamed(key), e, p => { waits.push(p) }, undefined, deps(c.fetch))
  const reader = res.body!.getReader()
  expect(new TextDecoder().decode((await reader.read()).value)).toMatch(/^event: step\n/)
  // The second call is out: the first one's cost is already in the ledger, on the open run (a cut-off here keeps it).
  await until(() => c.calls.length === 2 && Object.values(ledger.day()!.runs).some(r => r.spent > 0))
  expect(Object.values(ledger.day()!.runs).map(r => r.spent)).toEqual([expect.closeTo(TURN, 10)])
  await reader.cancel()
  release()
  await Promise.all(waits)
  const day = ledger.day()!
  expect(day.runs).toEqual({})
  expect(day.usd).toBeCloseTo(2 * TURN, 10)
  expect(readerCount(ledger)).toEqual([1])
  expect(day.counts.refunds).toBe(0)
  const again = await run(post(key), e, deps(c.fetch))
  expect((await again.json() as { results: { page?: { id: string } }[] }).results[0]!.page?.id).toBe('paracheirodon-innesi')
  expect(c.calls).toHaveLength(2)
})

test('a retry key is its reader\'s own: another reader sending the same key gets a run of their own, never the first reader\'s result', async () => {
  const { e } = env()
  const c = claude([() => message(NEON), () => message({ verdict: 'other', guesses: [] })])
  const key = { 'idempotency-key': '7d444840-9dc0-11d1-b245-5ffdce74fad2' }
  expect(await (await run(post(key), e, deps(c.fetch))).text()).toBe(TODAY)
  const theirs = await run(post({ ...key, 'cf-connecting-ip': '198.51.100.9' }), e, deps(c.fetch))
  expect(await theirs.json()).toMatchObject({ verdict: 'other', results: [] })
  expect(c.calls).toHaveLength(2)
})

test('the agent on: a later call the API refuses as our request (a reference photo it can\'t fetch) falls back to today\'s call on the same key, logged and counted; with no time for it, failed (502), not unavailable', async () => {
  const lines: Record<string, unknown>[] = []
  const { e, ledger } = agentEnv()
  const refused = () => apiError(400, 'invalid_request_error', 'Unable to download the file. Please verify the URL and try again.')
  const c = claude([() => asks([['get_entry', { id: 'paracheirodon-innesi' }]]), refused, () => message(NEON)])
  const res = await run(post(), e, deps(c.fetch, { log: l => { lines.push(l) } }))
  expect(res.status).toBe(200)
  expect(c.calls.map(x => x.key)).toEqual([A, A, A])
  expect(c.calls[2]!.body.tools).toBeUndefined()
  expect(lines[0]).toMatchObject({ fishId: 'ok', stopped: 'fallback', later400: expect.stringMatching(/Unable to download the file/) })
  expect(ledger.day()!.counts).toMatchObject({ later400: 1, fallback: 1, refunds: 0 })
  const late = claude([() => asks([['get_entry', { id: 'paracheirodon-innesi' }]]), refused])
  const r2 = await run(post(), e, deps(late.fetch, { limits: { ms: 9_000, lastCallMs: 0 } }))
  expect([r2.status, await r2.json()]).toEqual([502, { error: 'failed' }])
  expect(ledger.day()!.counts).toMatchObject({ later400: 2, fallback: 1, refunds: 0 })
})

test('the agent on: a facts shard that can\'t be read: get_entry says so and the run goes on; the error is logged and counted', async () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    // Another origin: the shards a test before read are kept per origin.
    const { e, ledger } = agentEnv({ ASSETS: { fetch: async (r: Request) => (new URL(r.url).pathname === '/app/fish-id.json' ? Response.json(CATALOG) : new Response('down', { status: 500 })) } })
    const c = claude([() => asks([['get_entry', { id: 'paracheirodon-innesi' }]]), () => message(CHECKED, 'end_turn', usage3)])
    const req = new Request('https://elsewhere.test/api/fish-id', { method: 'POST', body: await post().formData(), headers: { origin: 'https://elsewhere.test', 'cf-connecting-ip': '203.0.113.7', ...READER } })
    expect((await run(req, e, deps(c.fetch))).status).toBe(200)
    const opened = (c.calls[1]!.body.messages as { content: { content: { text?: string }[] }[] }[])[2]!.content[0]!.content
    expect(opened).toEqual([{ type: 'text', text: expect.stringMatching(/^paracheirodon-innesi \(species\)[\s\S]*can't be read just now/) }])
    expect(err).toHaveBeenCalledWith('fish-id facts: shard 0 of 1 unreadable')
    expect(ledger.day()!.counts.facts).toBe(1)
  } finally {
    err.mockRestore()
  }
})

test('a model the price list doesn\'t know is priced as the dearest there, never $0; the reservation covers the agent\'s limits', () => {
  const dearest = Math.max(...Object.values(PRICES).map(p => p.input))
  expect(costOf('claude-next', { input: 1e6, output: 0 })).toBe(dearest)
  expect(costOf('claude-next', { input: 0, output: 0, cacheWrite: 1e6 })).toBe(Math.max(...Object.values(PRICES).map(p => p.cacheWrite)))
  expect(worstCost('claude-next')).toBeGreaterThanOrEqual(worstCost('claude-opus-5-5'))
  // Four calls of 4,096 out, 60,000 in written to cache, and the single call it may fall back to.
  expect(worstCost('claude-opus-5-5', LIMITS)).toBeCloseTo((60_000 * 5 + 4 * 4096 * 20) / 1e6 + worstCost('claude-opus-5-5'), 10)
  expect(worstCost('claude-opus-5-5')).toBeCloseTo((6000 * 4 + 4096 * 20) / 1e6, 10)
})
