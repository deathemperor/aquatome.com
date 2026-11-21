/**
 * One streamed call of the board's (chat-board.ts), timed as the Worker times it (chat/api.ts `callClaude`): `timeoutMs`
 * until the answer begins, then `writingMs` from the call's start, if that's longer. A call our timer ends fails as a
 * timeout does, with no status, which the key rotation counts as the network's (fishid/keys.ts `classify`); with the
 * call's time spent, the rotation then reports no key answered (17 Nov: two nights' "no key answered" were our own limit).
 *
 * `cut` says our timer ended the call, and when: before the answer's text began or while it was being written. Only our
 * timer sets it. The SDK's own timeout is given the same time and starts after ours, so ours always ends the call first;
 * a timeout the SDK reports before that is the network's (a connection that timed out), and leaves it empty, as any
 * other failure does (17 Nov, Codex's read). Writing is the answer's text, as the Worker counts it: thinking and a
 * tool's input aren't. Each try sets it afresh, so after a rotation it is the last try's.
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
    if (e?.name === 'TimeoutError' || /aborted/i.test(String(e?.message))) throw Object.assign(new Error('Request timed out.'), { status: undefined })
    throw e
  } finally { clearTimeout(timer) }
}

/** Why a call got no answer, as the run records it. */
export const noAnswer = (cut: Cut, reason: string) => (cut.by ? `out of time: our timer cut the call ${cut.by}` : `no key answered: ${reason}`)
