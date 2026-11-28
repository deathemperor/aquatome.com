import { existsSync } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test, vi } from 'vitest'
import { clientFor } from '../../../apps/site/worker/fishid/claude'
import { memoryHealth } from '../../../apps/site/worker/fishid/keys'
import { Billed, BilledLimit, BILLED_STEP, billedCost, billedWorst } from '../src/billed'
import { CEILINGS, type Ceilings } from '../src/ceiling'
import { boardSender, tokensOf } from '../scripts/board-stream'

// The board's sender (chat-board.ts) on a fake transport: a real client whose requests go to a fetch of the test's, so
// nothing leaves this Mac, and a billed log of the test's own (Codex's read of the billed line, 17 Nov).
const NOW = new Date('2026-11-17T05:00:00Z')
const line = (cap: number): Ceilings => ({ clock: CEILINGS.clock, tables: CEILINGS.tables, api: { tables: [{ from: '2026-11-15T00:00:00+07:00', default: 0, backstop: 15, steps: { [BILLED_STEP]: cap } }] } })
const KEYS = [{ key: 'sk-ant-a', hash: 'ha' }, { key: 'sk-ant-b', hash: 'hb' }]
const BODY = { model: 'claude-haiku-5-5', max_tokens: 100, messages: [{ role: 'user', content: 'Cá neon nuôi thế nào?' }] }
const OPTS = { timeoutMs: 5_000, call: 1 }
const logIn = async () => join(await mkdtemp(join(tmpdir(), 'board-sender-')), 'aquatome-billed.jsonl')
const rows = async (log: string) => (await readFile(log, 'utf8')).split('\n').filter(Boolean).map(l => JSON.parse(l))
const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
const usage = { input_tokens: 1000, output_tokens: 1 }
const opening = ev('message_start', { message: { id: 'm', type: 'message', role: 'assistant', model: BODY.model, content: [], stop_reason: null, stop_sequence: null, usage } })
  + ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }) + ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: '{"text":"Nuôi' } })
const ending = ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: ' theo đàn."}' } }) + ev('content_block_stop', { index: 0 })
  + ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } }) + ev('message_stop', {})
const sse = (body: BodyInit) => new Response(body, { headers: { 'content-type': 'text/event-stream' } })
const send = (billed: Billed, fetch: typeof globalThis.fetch, onCost?: (usd: number) => void, healthy = KEYS) =>
  boardSender({ billed, healthy, store: memoryHealth(), clientFor: k => clientFor(k, fetch), onCost })

test('with no allowance left no request leaves: the run stops at the line before any key is asked', async () => {
  const log = await logIn()
  const fetch = vi.fn(async () => sse(opening + ending))
  const billed = new Billed(BILLED_STEP, log, line(0), () => NOW)
  await expect(send(billed, fetch)(BODY, OPTS)).rejects.toBeInstanceOf(BilledLimit)
  expect(fetch).not.toHaveBeenCalled()
  expect(existsSync(log)).toBe(false)
  expect(billed.stopped).toMatch(/billed calls stopped at chat-board-billed's line/)
})

test('ledger contention past the turn deadline sends nothing and holds nothing', async () => {
  const log = await logIn()
  const lock = new DatabaseSync(`${log}.lock.sqlite`)
  lock.exec('BEGIN IMMEDIATE')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  try {
    const fetch = vi.fn(async () => sse(opening + ending))
    let entered!: () => void
    const entering = new Promise<void>(resolve => { entered = resolve })
    const billed = new Billed(BILLED_STEP, log, line(10), () => NOW)
    const sender = boardSender({
      billed, healthy: KEYS, store: memoryHealth(),
      clientFor: async k => { entered(); return clientFor(k, fetch) },
    })
    const settled = sender(BODY, { ...OPTS, writingMs: 8000 }).catch((e: unknown) => e)
    await entering
    await new Promise<void>(resolve => setImmediate(resolve))
    vi.setSystemTime(NOW.getTime() + OPTS.timeoutMs + 1)
    const out = await settled
    expect(out).toBeInstanceOf(Error)
    expect((out as Error).message).toMatch(/out of time/)
    expect(fetch).not.toHaveBeenCalled()
    expect(existsSync(log)).toBe(false)
    expect(billed.stopped).toBeUndefined()
  } finally {
    vi.useRealTimers()
    lock.close()
  }
})

test('missing usage counts at the held amount, while explicit zeros may settle at zero', async () => {
  const log = await logIn()
  const billed = new Billed(BILLED_STEP, log, line(10), () => NOW)
  for (const usage of [{}, { input_tokens: 1 }, { output_tokens: 1 }, { input_tokens: 0, output_tokens: 0 }]) {
    await billed.call({ body: BODY }, async () => ({ value: 'ok', tokens: tokensOf(usage) }))
  }
  const worst = billedWorst(BODY)
  expect((await rows(log)).filter(r => r.settles).map(r => r.cost)).toEqual([worst, worst, worst, 0])
})

test('every key it tries is a billed call: held before its request, settled after, a refusal at nothing', async () => {
  const log = await logIn()
  let asked = 0
  // The first key: overloaded (529), refused before anything ran; the next answers.
  const fetch = vi.fn(async () => (++asked === 1 ? Response.json({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, { status: 529 }) : sse(opening + ending)))
  const reported: number[] = []
  const m = await send(new Billed(BILLED_STEP, log, line(10), () => NOW), fetch, cost => reported.push(cost))(BODY, OPTS)
  expect(m.content).toMatchObject([{ type: 'text', text: '{"text":"Nuôi theo đàn."}' }])
  const r = await rows(log)
  // Whichever key the rotation tries first (its order isn't fixed), each try is held, then settled, in turn.
  const [first, second] = r.filter(x => x.held).map(x => x.key)
  expect([first, second].sort()).toEqual(['ha', 'hb'])
  expect(r.map(x => [x.held ? 'held' : 'settles', x.key])).toEqual([['held', first], ['settles', first], ['held', second], ['settles', second]])
  expect(r.filter(x => x.held).map(x => x.usd)).toEqual([billedWorst(BODY), billedWorst(BODY)])
  expect(r.filter(x => x.settles).map(x => [x.cost, x.error])).toEqual([[0, true], [billedCost(BODY.model, { input: 1000, output: 20, cacheRead: 0, cacheWrite: 0 }), false]])
  expect(reported).toEqual(r.filter(x => x.settles).map(x => x.cost))
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('a stream keeps its hold until it ends, or fails, and only then is settled', async () => {
  for (const how of ['ends', 'fails'] as const) {
    const log = await logIn()
    let ctl!: ReadableStreamDefaultController<Uint8Array>
    let sent!: () => void
    const begun = new Promise<void>(r => { sent = r })
    const fetch = vi.fn(async () => sse(new ReadableStream<Uint8Array>({ start: c => { ctl = c; c.enqueue(new TextEncoder().encode(opening)); sent() } })))
    const call = send(new Billed(BILLED_STEP, log, line(10), () => NOW), fetch, undefined, KEYS.slice(0, 1))(BODY, OPTS).catch((e: unknown) => e)
    await Promise.race([begun, call.then(cause => { throw new Error('The call ended before it opened the stream', { cause }) })])
    await new Promise(r => setTimeout(r, 50))
    // Writing: held, not settled.
    expect((await rows(log)).map(x => (x.held ? 'held' : 'settles'))).toEqual(['held'])
    if (how === 'ends') { ctl.enqueue(new TextEncoder().encode(ending)); ctl.close() } else ctl.error(new TypeError('network connection lost'))
    const out = await call
    const r = await rows(log)
    expect(r.slice(0, 2).map(x => (x.held ? 'held' : 'settles')), how).toEqual(['held', 'settles'])
    if (how === 'ends') expect([r.length, (out as { content: unknown[] }).content.length, r[1].error, r[1].worst]).toEqual([2, 1, false, undefined])
    // Cut mid-stream it may have been billed: at its worst.
    else expect([out instanceof Error, r[1].error, r[1].cost]).toEqual([true, true, billedWorst(BODY)])
  }
})
