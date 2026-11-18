import { expect, test } from 'vitest'
import { ask, SITE } from '../../../scripts/chat-tester.mjs'

// scripts/chat-tester.mjs, the chief of staff's way to ask the live chat as its test account: it signs in by the Mac's
// code and asks once. Whatever happens, nothing it prints holds the bearer, the code, the flow or the session.
const BEARER = 'b'.repeat(32)
const FLOW = 'f'.repeat(43)
const CODE = '493817'
const TOKEN = 't'.repeat(43)
const SECRETS = [BEARER, FLOW, CODE, TOKEN]

const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('')

/** The site as the script meets it: each step's answer, or `fail` for one of them. */
function site(o: { fail?: 'code' | 'verify' | 'chat' | 'stream' | 'throw' } = {}) {
  const seen: { path: string; auth: string | null; body: unknown }[] = []
  const fetch = async (url: string, init: RequestInit) => {
    const path = url.replace(SITE, '')
    const headers = new Headers(init.headers)
    seen.push({ path, auth: headers.get('authorization'), body: JSON.parse(init.body as string) })
    if (o.fail === 'throw') throw new Error('network down')
    if (path === '/api/v1/chat-tester/code') return o.fail === 'code' ? Response.json({ error: 'not_found' }, { status: 404 }) : Response.json({ flow: FLOW, code: CODE })
    if (path === '/api/v1/auth/email/verify') return o.fail === 'verify' ? Response.json({ error: 'bad_code' }, { status: 401 }) : Response.json({ user: { id: 'chat-tester' }, token: TOKEN })
    if (o.fail === 'chat') return Response.json({ error: 'rate', limit: 20 }, { status: 429 })
    const events: [string, unknown][] = o.fail === 'stream'
      ? [['opening', { text: 'Mình đang tra cẩm nang xem cá betta của bạn bỏ ăn.' }], ['error', { error: `unavailable ${TOKEN}` }]]
      : [['opening', { text: 'Mình đang tra cẩm nang xem cá betta của bạn bỏ ăn.' }], ['step', { kind: 'read' }], ['text', { text: 'Cá ' }], ['text', { text: 'betta…' }], ['done', { n: 1, text: 'Cá betta bỏ ăn thường do nước lạnh.', blocks: [] }]]
    return new Response(sse(events), { headers: { 'content-type': 'text/event-stream' } })
  }
  return { fetch: fetch as unknown as typeof globalThis.fetch, seen }
}

test('the script signs in by the Mac\'s code, asks once as the test account, and prints the first line and the answer', async () => {
  const { fetch, seen } = site()
  const said: string[] = []
  let t = 0
  await ask({ question: 'Cá betta bỏ ăn 3 hôm?', lang: 'vi', bearer: BEARER, fetch, say: l => said.push(l), clock: () => (t += 500) })
  expect(seen.map(s => [s.path, s.auth])).toEqual([
    ['/api/v1/chat-tester/code', `Bearer ${BEARER}`],
    ['/api/v1/auth/email/verify', null],
    ['/api/chat', `Bearer ${TOKEN}`],
  ])
  expect(seen[1]!.body).toEqual({ flow: FLOW, code: CODE, client: 'app' })
  expect(seen[2]!.body).toMatchObject({ question: 'Cá betta bỏ ăn 3 hôm?', lang: 'vi' })
  expect(said[0]).toMatch(/^first line, [\d.]+ s: Mình đang tra cẩm nang xem cá betta của bạn bỏ ăn\.$/)
  expect(said.at(-1)).toMatch(/^answer, [\d.]+ s:\nCá betta bỏ ăn thường do nước lạnh\.$/)
  for (const s of SECRETS) expect(said.join('\n')).not.toContain(s)
})

test('when a step fails, what the script says holds no secret either', async () => {
  for (const fail of ['code', 'verify', 'chat', 'stream', 'throw'] as const) {
    const { fetch } = site({ fail })
    const said: string[] = []
    const err = await ask({ question: 'Hỏi', bearer: BEARER, fetch, say: l => said.push(l) }).then(() => undefined, e => e as Error)
    expect(err, fail).toBeInstanceOf(Error)
    for (const s of SECRETS) expect(`${err!.message}\n${said.join('\n')}`, fail).not.toContain(s)
  }
})
