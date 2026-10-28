import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { moderate, type CommentsAdmin, type Decision, type QueueItem } from '../src/moderate'

const item = (id: string, status: QueueItem['status'] = 'held'): QueueItem => ({ id, entity_ref: 'species:x', name: 'A', body: 'b', status, reason: null, created_at: '2026-10-29T00:00:00Z' })
function admin(queue: QueueItem[] | null) {
  const sent: Decision[][] = []
  const api: CommentsAdmin = { queue: async () => queue, decide: async d => { sent.push(d); return { applied: d.length, ignored: 0 } } }
  return { api, sent }
}
const fixed = (...outs: unknown[]): Llm & { calls: number } => {
  const f = (async () => outs[Math.min(f.calls++, outs.length - 1)]) as unknown as Llm & { calls: number }
  f.calls = 0
  return f
}

test('comments off (no D1) → nothing to do, no LLM call', async () => {
  const llm = fixed({ decisions: [] })
  expect(await moderate(admin(null).api, llm)).toEqual({ off: true })
  expect(llm.calls).toBe(0)
})

test('decisions are posted; unknown ids from the model are dropped', async () => {
  const { api, sent } = admin([item('a'), item('b', 'approved')])
  const llm = fixed({ decisions: [
    { id: 'a', action: 'remove', helpful: false, reason: 'spam' },
    { id: 'b', action: 'approve', helpful: true, reason: 'good answer' },
    { id: 'zzz', action: 'approve', helpful: false, reason: 'invented' },
  ] })
  expect(await moderate(api, llm)).toEqual({ off: false, queued: 2, applied: 2, ignored: 0 })
  expect(sent[0]!.map(d => d.id)).toEqual(['a', 'b'])
})

test('invalid output is retried once, then the batch waits for the next run', async () => {
  const good = { decisions: [{ id: 'a', action: 'approve', helpful: false, reason: 'fine' }] }
  const retry = fixed({ decisions: [{ id: 'a', action: 'ban' }] }, good)
  const one = admin([item('a')])
  await moderate(one.api, retry)
  expect(retry.calls).toBe(2)
  expect(one.sent).toHaveLength(1)
  const never = fixed('nonsense')
  const two = admin([item('a')])
  expect(await moderate(two.api, never)).toEqual({ off: false, queued: 1, applied: 0, ignored: 0 })
  expect(never.calls).toBe(2)
  expect(two.sent).toHaveLength(0)
})

test('batches of 50', async () => {
  const items = Array.from({ length: 120 }, (_, i) => item(`c${i}`))
  const { api } = admin(items)
  const llm = fixed({ decisions: [] })
  await moderate(api, llm)
  expect(llm.calls).toBe(3)
})
