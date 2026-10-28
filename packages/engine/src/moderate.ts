import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { Llm } from './claude'

const TEMPLATE = readFileSync(new URL('./prompts/moderate.md', import.meta.url), 'utf8')
const BATCH = 50

export type QueueItem = { id: string; entity_ref: string; name: string; body: string; status: 'approved' | 'held'; reason: string | null; created_at: string }
const Decision = z.object({ id: z.string(), action: z.enum(['approve', 'remove', 'keep_held']), helpful: z.boolean(), reason: z.string() })
export type Decision = z.infer<typeof Decision>
const Output = z.object({ decisions: z.array(Decision) })
const SCHEMA = (() => {
  const s = z.toJSONSchema(Output, { target: 'draft-07' }) as Record<string, unknown>
  delete s.$schema
  return s
})()

/** Site admin API; `queue` returns null when comments are off (no D1 yet). */
export type CommentsAdmin = { queue: () => Promise<QueueItem[] | null>; decide: (d: Decision[]) => Promise<{ applied: number; ignored: number }> }

async function decideBatch(llm: Llm, items: QueueItem[]): Promise<Decision[]> {
  const ids = new Set(items.map(i => i.id))
  const prompt = `${TEMPLATE}\n\n${JSON.stringify(items.map(i => ({ id: i.id, page: i.entity_ref, name: i.name, body: i.body, status: i.status, rule: i.reason })), null, 1)}`
  for (let attempt = 0; attempt < 2; attempt++) {
    const parsed = Output.safeParse(await llm({ system: 'You are a careful, fair community moderator. Reply only with JSON.', prompt, schema: SCHEMA }))
    // Only ids we asked about; a comment left out simply waits for the next run.
    if (parsed.success) return parsed.data.decisions.filter(d => ids.has(d.id))
  }
  return []
}

export async function moderate(api: CommentsAdmin, llm: Llm): Promise<{ off: true } | { off: false; queued: number; applied: number; ignored: number }> {
  const queue = await api.queue()
  if (!queue) return { off: true }
  let applied = 0
  let ignored = 0
  for (let i = 0; i < queue.length; i += BATCH) {
    const decisions = await decideBatch(llm, queue.slice(i, i + BATCH))
    if (!decisions.length) continue
    const r = await api.decide(decisions)
    applied += r.applied
    ignored += r.ignored
  }
  return { off: false, queued: queue.length, applied, ignored }
}

/** The Worker's /_c/admin routes, authorised with the dashboard token. */
export function httpAdmin(base: string, token: string): CommentsAdmin {
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  return {
    async queue() {
      const r = await fetch(`${base}/_c/admin/queue`, { headers })
      if (r.status === 503) return null
      if (!r.ok) throw new Error(`queue: HTTP ${r.status}`)
      return (await r.json()) as QueueItem[]
    },
    async decide(d) {
      const r = await fetch(`${base}/_c/admin/decisions`, { method: 'POST', headers, body: JSON.stringify(d) })
      if (!r.ok) throw new Error(`decisions: HTTP ${r.status}`)
      return (await r.json()) as { applied: number; ignored: number }
    },
  }
}
