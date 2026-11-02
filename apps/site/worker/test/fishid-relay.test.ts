import { expect, test } from 'vitest'
import { handle, type Env } from '../index'
import { classify, memoryHealth, rotate, type KeyEntry } from '../fishid/keys'
import { FishIdRelay, relayFetch } from '../fishid/relay'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8])
const A = 'sk-ant-api03-aaaaaaaaaaaa'
const answer = { verdict: 'fish', guesses: [{ scientificName: 'Betta splendens', commonName: 'Siamese fighting fish', variety: null, confidence: 0.9, reason: 'Vây dài.' }] }
const message = () => Response.json({
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
  content: [{ type: 'text', text: JSON.stringify(answer) }], usage: { input_tokens: 1500, output_tokens: 120 },
})
const REGION = { status: 403, type: 'forbidden', error: { error: { type: 'forbidden', message: 'Request not allowed' } }, message: '403 Request not allowed' }

/** A namespace whose one object answers with `reply`, recording how it was reached and what it was sent. */
function namespace(reply: (req: Request) => Promise<Response> | Response) {
  const seen: { name?: string; hint?: string; url: string; workspace: string | null }[] = []
  const ns = {
    idFromName: (name: string) => ({ name }),
    get: (id: { name: string }, o?: { locationHint?: string }) => ({
      fetch: async (req: Request) => { seen.push({ name: id.name, hint: o?.locationHint, url: req.url, workspace: req.headers.get('anthropic-workspace-id') }); return reply(req) },
    }),
  } as unknown as DurableObjectNamespace
  return { ns, seen }
}
function kv() {
  const m = new Map<string, string>()
  return { m, ns: { get: async (k: string, t?: string) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)!) : m.get(k)) : null), put: async (k: string, v: string) => { m.set(k, v) } } as unknown as KVNamespace }
}
const post = () => {
  const f = new FormData()
  f.set('file', new Blob([JPEG]), 'photo.jpg'); f.set('token', 't'); f.set('lang', 'vi')
  return new Request('https://x.test/api/fish-id', { method: 'POST', body: f, headers: { origin: 'https://x.test', 'cf-connecting-ip': '203.0.113.7' } })
}

test('the relay forwards to the Claude API only', async () => {
  const relay = new FishIdRelay()
  expect((await relay.fetch(new Request('https://example.com/v1/messages', { method: 'POST' }))).status).toBe(400)
  expect((await relay.fetch(new Request('http://api.anthropic.com/v1/messages', { method: 'POST' }))).status).toBe(400)
})

test('with the relay bound, the Worker\'s Claude call goes through the one object in eastern North America', async () => {
  const { ns, seen } = namespace(() => message())
  const store = kv()
  const env = {
    ASSETS: { fetch: async () => Response.json({ version: 1, entries: [{ id: 'betta-splendens', kind: 'species', sci: 'Betta splendens', name: { vi: 'Cá betta' }, url: { vi: '/vi/ca/ca-betta/' } }] }) },
    AB: store.ns, TURNSTILE_SECRET: 's', TURNSTILE_SITEKEY: 'k', COMMENT_HMAC_KEY: 'h',
    ANTHROPIC_KEYS: `${A} wrkspc_orgA`, FISHID_RELAY: ns,
  } as unknown as Env
  const r = await handle(post(), env, undefined, undefined, { siteverify: async () => true, random: () => 0, log: () => {} })
  expect(r.status).toBe(200)
  expect(((await r.json()) as { results: { page?: { id: string } }[] }).results[0]!.page?.id).toBe('betta-splendens')
  expect(seen).toEqual([{ name: 'claude-us', hint: 'enam', url: 'https://api.anthropic.com/v1/messages', workspace: 'wrkspc_orgA' }])
  // And the relay's fetch is what the SDK is handed: any URL goes to the same object.
  await relayFetch(ns)('https://api.anthropic.com/v1/models')
  expect(seen[1]).toMatchObject({ name: 'claude-us', hint: 'enam' })
})

test('refused for where the call comes from: the next key, and no key set aside (every key would get the same)', async () => {
  expect(classify(REGION)).toEqual({ next: true })
  const keys: KeyEntry[] = [{ key: 'a', hash: 'aaaaaaaa' }, { key: 'b', hash: 'bbbbbbbb' }, { key: 'c', hash: 'cccccccc' }]
  const health = memoryHealth()
  const out = await rotate(keys, health, async () => { throw REGION }, { random: () => 0 })
  expect(out).toMatchObject({ ok: false, reason: 'unavailable' })
  expect(out.attempts).toHaveLength(3)
  for (const k of keys) expect(await health.get(k.hash)).toBeNull()
  // A real refused key (403 permission_error) is still set aside.
  expect(classify({ status: 403, type: 'permission_error', error: { error: { type: 'permission_error', message: 'Missing permissions.' } } })).toMatchObject({ mark: { why: 'auth' } })
})
