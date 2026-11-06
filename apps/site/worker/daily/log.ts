/**
 * The daily reports as they were composed, in KV `AB` for 90 days, one key a run: the run's id is the idempotency key, so
 * a report is found by it. The fields the log page lists ride in the key's metadata (well under KV's 1 KB), so listing
 * reads no bodies. No recipient here, ever: `why` is a code.
 */
export const LOG_PREFIX = 'daily-report:'
export const LOG_TTL = 90 * 86_400

/** `why`, when not sent: `no_recipient`, `no_binding`, or Cloudflare's error code. `care`: how many items need care. */
export type ReportMeta = { when: string; subject: string; sent: boolean; why?: string; care: number }
export type Report = ReportMeta & { text: string; html: string }

const keyOf = (id: string) => `${LOG_PREFIX}${id}`
export const getReport = (kv: KVNamespace, id: string) => kv.get<Report>(keyOf(id), 'json')

export async function putReport(kv: KVNamespace, id: string, r: Report): Promise<void> {
  const { when, subject, sent, why, care } = r
  await kv.put(keyOf(id), JSON.stringify(r), { expirationTtl: LOG_TTL, metadata: { when, subject, sent, ...(why ? { why } : {}), care } })
}

/** Every report kept, newest first. Up to 1000 keys a call: 90 days hold about 90, plus the runs started by hand. */
export async function listReports(kv: KVNamespace): Promise<(ReportMeta & { id: string })[]> {
  const { keys } = await kv.list<ReportMeta>({ prefix: LOG_PREFIX })
  return keys.flatMap(k => (k.metadata ? [{ id: k.name.slice(LOG_PREFIX.length), ...k.metadata }] : [])).sort((a, b) => b.when.localeCompare(a.when))
}
