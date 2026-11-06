import type { PushOutcome } from './push'

/**
 * The daily reports as they were composed, in KV `AB` for 90 days, one key a run: the run's id is the idempotency key, so
 * a report is found by it. The fields the log page lists ride in the key's metadata (well under KV's 1 KB), so listing
 * reads no bodies. No recipient here, ever: `why` is a code.
 */
export const LOG_PREFIX = 'daily-report:'
export const LOG_TTL = 90 * 86_400

/**
 * `sent`: the mail went out; `why`, when it didn't: `email_off` (the owner's setting, daily/settings.ts), `no_recipient`,
 * `no_binding`, or Cloudflare's error code. `push`: the phones' notification (daily/push.ts), absent on reports made
 * before it. `care`: how many items need care.
 */
export type ReportMeta = { when: string; subject: string; sent: boolean; why?: string; push?: PushOutcome; care: number }
/** `first`: the first thing that needs care, which the notification says. */
export type Report = ReportMeta & { text: string; html: string; first?: string }

const keyOf = (id: string) => `${LOG_PREFIX}${id}`
export const getReport = (kv: KVNamespace, id: string) => kv.get<Report>(keyOf(id), 'json')

export async function putReport(kv: KVNamespace, id: string, r: Report): Promise<void> {
  const { when, subject, sent, why, push, care } = r
  await kv.put(keyOf(id), JSON.stringify(r), { expirationTtl: LOG_TTL, metadata: { when, subject, sent, ...(why ? { why } : {}), ...(push ? { push } : {}), care } })
}

/** Every report kept, newest first. Up to 1000 keys a call: 90 days hold about 90, plus the runs started by hand. */
export async function listReports(kv: KVNamespace): Promise<(ReportMeta & { id: string })[]> {
  const { keys } = await kv.list<ReportMeta>({ prefix: LOG_PREFIX })
  return keys.flatMap(k => (k.metadata ? [{ id: k.name.slice(LOG_PREFIX.length), ...k.metadata }] : [])).sort((a, b) => b.when.localeCompare(a.when))
}
