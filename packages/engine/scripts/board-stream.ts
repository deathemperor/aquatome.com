import { type HealthStore, type KeyEntry, rotate } from '../../../apps/site/worker/fishid/keys'
import { type Billed, BilledDeadline, BilledLimit, type Tokens } from '../src/billed'

/**
 * One streamed call of the board's (chat-board.ts), timed as the Worker times it (chat/api.ts `callClaude`): `timeoutMs`
 * until the answer begins, then `writingMs` from the call's start, if that's longer. A call our timer ends fails as a
 * timeout does, with no status, which the key rotation counts as the network's (fishid/keys.ts `classify`); with the
 * call's time spent, the rotation then reports no key answered (17 Nov: two nights' "no key answered" were our own limit).
 *
 * `cut` says the time limit was ours, and when. Ours is our timer, or the SDK's own timeout (the `timeout` we give it,
 * which ends only a call that hasn't begun); any other failure leaves it empty. When: before the answer's text began or
 * while it was being written. Writing is the answer's text, as the Worker counts it: thinking and a tool's input aren't.
 * Each try sets it afresh, so after a rotation it is the last try's.
 */
export type Cut = { by?: 'before writing' | 'while writing' }
type Stream<M> = AsyncIterable<any> & { finalMessage(): Promise<M> }

export async function streamOnce<M>(open: (signal: AbortSignal) => Stream<M>, timeoutMs: number, o: { writingMs?: number; onText?: (text: string) => void }, cut: Cut): Promise<M> {
  cut.by = undefined
  const stop = new AbortController(), t0 = Date.now()
  let began = false
  const when = () => (began ? 'while writing' : 'before writing')
  const expire = () => { cut.by = when(); stop.abort() }
  let timer = setTimeout(expire, timeoutMs)
  try {
    const stream = open(stop.signal)
    for await (const e of stream) {
      if (e.type === 'content_block_delta' && e.delta.type === 'text_delta') {
        if (!began && o.writingMs && o.writingMs > timeoutMs) { clearTimeout(timer); timer = setTimeout(expire, o.writingMs - (Date.now() - t0)) }
        began = true
        o.onText?.(e.delta.text)
      }
    }
    return await stream.finalMessage()
  } catch (e: any) {
    if (e?.constructor?.name === 'APIConnectionTimeoutError') cut.by ??= when()
    if (e?.name === 'TimeoutError' || /aborted/i.test(String(e?.message))) throw Object.assign(new Error('Request timed out.'), { status: undefined })
    throw e
  } finally { clearTimeout(timer) }
}

/** Why a call got no answer, as the run records it. */
export const noAnswer = (cut: Cut, reason: string) => (cut.by ? `out of time: our timer cut the call ${cut.by}` : `no key answered: ${reason}`)

/** Both required counts must be present. Incomplete usage keeps the call's full hold. */
export function tokensOf(u?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | null): Tokens | undefined {
  if (typeof u?.input_tokens !== 'number' || typeof u.output_tokens !== 'number') return undefined
  return { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 }
}
/** One call of the board's as its log keeps it: when it began and how long it took, from the run's start. */
export type CallLog = { call: number; at: number; ms: number; out?: number; tools?: number; failed?: boolean; cut?: string }
type SendOptions = { call: number; timeoutMs: number; writingMs?: number; onText?: (text: string) => void }

/**
 * The board's send, as the Worker sends: each call through the keys in turn (fishid/keys.ts `rotate`), and each try on a
 * key a billed call (billed.ts), held to the line before its request leaves and settled once its stream ends or fails.
 * Stopped at the line, no request leaves. Each call's timing goes to `log`.
 */
export function boardSender(o: { billed: Billed; healthy: KeyEntry[]; store: HealthStore; clientFor: (k: KeyEntry) => Promise<any>; log?: CallLog[]; t0?: number; onCost?: (usd: number) => void }) {
  const log = o.log ?? [], t0 = o.t0 ?? Date.now()
  return async (b: any, opts: SendOptions) => {
    if (o.billed.stopped) throw new BilledLimit(o.billed.stopped)
    const at = Date.now(), cut: Cut = {}
    const deadline = at + opts.timeoutMs
    const r = await rotate(o.healthy, o.store, async k => {
      const c = await o.clientFor(k)
      return o.billed.call({ body: b, key: k.hash, deadline, onCost: o.onCost }, async () => {
        const now = Date.now()
        const timeout = deadline - now
        if (timeout <= 0) throw new BilledDeadline()
        const writingMs = opts.writingMs === undefined ? undefined : at + opts.writingMs - now
        const m = await streamOnce<any>(signal => c.messages.stream(b, { timeout, signal }), timeout, { writingMs, onText: opts.onText }, cut)
        return { value: m, tokens: tokensOf(m.usage) }
      })
    }, { budgetMs: opts.timeoutMs }).catch(error => {
      if (error instanceof BilledDeadline) log.push({ call: opts.call, at: at - t0, ms: Date.now() - at, failed: true })
      throw error
    })
    if (!r.ok && o.billed.stopped) throw new BilledLimit(o.billed.stopped)
    if (!r.ok) { log.push({ call: opts.call, at: at - t0, ms: Date.now() - at, failed: true, ...(cut.by ? { cut: cut.by } : {}) }); throw new Error(noAnswer(cut, r.reason)) }
    log.push({ call: opts.call, at: at - t0, ms: Date.now() - at, out: r.value.usage?.output_tokens, tools: r.value.content.filter((x: any) => x.type === 'tool_use').length })
    return r.value
  }
}
