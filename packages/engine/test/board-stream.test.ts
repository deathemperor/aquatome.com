import type Anthropic from '@anthropic-ai/sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clientFor } from '../../../apps/site/worker/fishid/claude'
import { memoryHealth, rotate } from '../../../apps/site/worker/fishid/keys'
import { type Cut, noAnswer, streamOnce } from '../scripts/board-stream'

/** A wait that ends as the SDK's stream does when its signal aborts. */
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((done, fail) => {
  const t = setTimeout(done, ms)
  signal.addEventListener('abort', () => { clearTimeout(t); fail(new Error('Request was aborted.')) })
})
type Piece = { after: number; delta: { type: string; text?: string; partial_json?: string } }
const text = (after: number, t: string): Piece => ({ after, delta: { type: 'text_delta', text: t } })
/** A stream that sends each piece after its wait, then waits `tail` before it ends. */
const stream = (pieces: Piece[], tail = 0) => (signal: AbortSignal) => Object.assign((async function* () {
  for (const p of pieces) { await wait(p.after, signal); yield { type: 'content_block_delta', index: 0, delta: p.delta } }
  await wait(tail, signal)
})(), { finalMessage: async () => ({ content: [{ type: 'text', text: pieces.map(p => p.delta.text ?? '').join('') }] }) })
const failing = (e: unknown) => () => Object.assign((async function* () { throw e })(), { finalMessage: async () => ({}) })

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('a board call our own timer ends is named as ours, not as no key answering', () => {
  it('cut before its answer began, at the wait', async () => {
    const cut: Cut = {}
    const r = expect(streamOnce(stream([], 10_000), 150, { writingMs: 300 }, cut)).rejects.toMatchObject({ message: 'Request timed out.', status: undefined })
    await vi.advanceTimersByTimeAsync(149)
    expect(cut.by).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    await r
    expect(cut.by).toBe('before writing')
    expect(noAnswer(cut, 'unavailable')).toBe('out of time: our timer cut the call before writing')
  })
  it('cut while its answer was written, at the writing time counted from the call\'s start', async () => {
    const cut: Cut = {}, seen: string[] = []
    const r = expect(streamOnce(stream([text(100, '{"text":"Nư')], 10_000), 150, { writingMs: 300, onText: x => seen.push(x) }, cut)).rejects.toMatchObject({ status: undefined })
    await vi.advanceTimersByTimeAsync(299)
    expect(cut.by).toBeUndefined()
    expect(seen).toEqual(['{"text":"Nư'])
    await vi.advanceTimersByTimeAsync(1)
    await r
    expect(cut.by).toBe('while writing')
    expect(noAnswer(cut, 'unavailable')).toBe('out of time: our timer cut the call while writing')
  })
  it('a tool\'s input streaming isn\'t the answer being written', async () => {
    const cut: Cut = {}
    const r = expect(streamOnce(stream([{ after: 50, delta: { type: 'input_json_delta', partial_json: '{"query":' } }], 10_000), 150, { writingMs: 300 }, cut)).rejects.toMatchObject({ status: undefined })
    await vi.advanceTimersByTimeAsync(150)
    await r
    expect(cut.by).toBe('before writing')
  })
  it('the SDK\'s own timeout counts as ours', async () => {
    const SDK = (await clientFor({ key: 'not-a-key', hash: 'h' })).constructor as typeof Anthropic
    const cut: Cut = {}
    await expect(streamOnce(failing(new SDK.APIConnectionTimeoutError()), 1000, {}, cut)).rejects.toBeInstanceOf(SDK.APIConnectionTimeoutError)
    expect(cut.by).toBe('before writing')
  })
  it('a failure that isn\'t a time limit of ours stays the key\'s or the network\'s', async () => {
    const SDK = (await clientFor({ key: 'not-a-key', hash: 'h' })).constructor as typeof Anthropic
    for (const e of [Object.assign(new Error('Overloaded'), { status: 529 }), new SDK.APIConnectionError({ message: 'Connection error.' }), new SDK.APIUserAbortError()]) {
      const cut: Cut = {}
      await expect(streamOnce(failing(e), 1000, {}, cut)).rejects.toBeDefined()
      expect(cut.by).toBeUndefined()
      expect(noAnswer(cut, 'unavailable')).toBe('no key answered: unavailable')
    }
  })
  it('each try sets it afresh: a later try that fails otherwise isn\'t named a cut', async () => {
    const cut: Cut = { by: 'before writing' }
    await expect(streamOnce(failing(Object.assign(new Error('Overloaded'), { status: 529 })), 1000, {}, cut)).rejects.toMatchObject({ status: 529 })
    expect(cut.by).toBeUndefined()
  })
  it('an answer in time comes back whole, with nothing cut', async () => {
    const cut: Cut = {}
    const m = streamOnce(stream([text(5, '{"text":'), text(5, '"ok"}')]), 200, {}, cut)
    await vi.advanceTimersByTimeAsync(20)
    expect(await m).toEqual({ content: [{ type: 'text', text: '{"text":"ok"}' }] })
    expect(cut.by).toBeUndefined()
  })
  it('the key rotation reads a cut as no key answering, which is why the board names it', async () => {
    const cut: Cut = {}
    const r = rotate([{ key: 'not-a-key', hash: 'h' }], memoryHealth(), (_k, left) => streamOnce(stream([], 10_000), left, {}, cut), { budgetMs: 1500 })
    await vi.advanceTimersByTimeAsync(1500)
    const out = await r
    expect(out).toMatchObject({ ok: false, reason: 'unavailable' })
    expect(noAnswer(cut, out.ok ? '' : out.reason)).toBe('out of time: our timer cut the call before writing')
  })
})
