import { describe, expect, it } from 'vitest'
import { type Cut, noAnswer, streamOnce } from '../scripts/board-stream'

/** A wait that ends as the SDK's stream does when its signal aborts. */
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((done, fail) => {
  const t = setTimeout(done, ms)
  signal.addEventListener('abort', () => { clearTimeout(t); fail(new Error('Request was aborted.')) })
})
/** A stream that sends each piece of text after its wait, then waits `tail` before it ends. */
const stream = (pieces: { after: number; text: string }[], tail = 0) => (signal: AbortSignal) => Object.assign((async function* () {
  for (const p of pieces) { await wait(p.after, signal); yield { type: 'content_block_delta', delta: { type: 'text_delta', text: p.text } } }
  await wait(tail, signal)
})(), { finalMessage: async () => ({ content: [{ type: 'text', text: pieces.map(p => p.text).join('') }] }) })

describe('a board call our own timer ends is named as ours, not as no key answering', () => {
  it('cut before its answer began', async () => {
    const cut: Cut = {}
    await expect(streamOnce(stream([], 1000), 30, {}, cut)).rejects.toMatchObject({ message: 'Request timed out.', status: undefined })
    expect(cut.by).toBe('before writing')
    expect(noAnswer(cut, 'unavailable')).toBe('out of time: our timer cut the call before writing')
  })
  it('cut while its answer was written, at the writing time rather than the wait', async () => {
    const cut: Cut = {}, seen: string[] = [], t = Date.now()
    await expect(streamOnce(stream([{ after: 10, text: '{"text":"Nư' }], 1000), 30, { writingMs: 90, onText: x => seen.push(x) }, cut)).rejects.toMatchObject({ status: undefined })
    expect(Date.now() - t).toBeGreaterThanOrEqual(80)
    expect(seen).toEqual(['{"text":"Nư'])
    expect(cut.by).toBe('while writing')
    expect(noAnswer(cut, 'unavailable')).toBe('out of time: our timer cut the call while writing')
  })
  it('the SDK\'s own timeout counts as ours too', async () => {
    const cut: Cut = {}
    const timedOut = () => Object.assign((async function* () { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }) })(), { finalMessage: async () => ({}) })
    await expect(streamOnce(timedOut, 1000, {}, cut)).rejects.toMatchObject({ status: undefined })
    expect(cut.by).toBe('before writing')
  })
  it('a failure that isn\'t our timer stays the key\'s or the moment\'s', async () => {
    const cut: Cut = {}
    const overloaded = () => Object.assign((async function* () { throw Object.assign(new Error('Overloaded'), { status: 529 }) })(), { finalMessage: async () => ({}) })
    await expect(streamOnce(overloaded, 1000, {}, cut)).rejects.toMatchObject({ status: 529 })
    expect(cut.by).toBeUndefined()
    expect(noAnswer(cut, 'unavailable')).toBe('no key answered: unavailable')
  })
  it('an answer in time comes back whole, with nothing cut', async () => {
    const cut: Cut = {}
    const m = await streamOnce(stream([{ after: 5, text: '{"text":' }, { after: 5, text: '"ok"}' }]), 200, {}, cut)
    expect(m).toEqual({ content: [{ type: 'text', text: '{"text":"ok"}' }] })
    expect(cut.by).toBeUndefined()
  })
})
