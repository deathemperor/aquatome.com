/**
 * Cloudflare's script monitor (client-side security) adds a report-only policy to a sample of the live site's HTML
 * responses: `script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; report-uri …/cdn-cgi/script_monitor/report?…`
 * (developers.cloudflare.com/client-side-security/reference/csp-header/). It blocks nothing, but every script file and
 * every request of the page breaks it, and Chrome logs each break as an issue, so Lighthouse's best-practices score drops
 * to 96 on that load: live checks 43558404985 and 43564278975, 14 Nov 2026, on 3 of 34 loads, and the same response three
 * times running once. The site sends no policy of its own. These read which policy a load had, so that the monitor's
 * breaks don't count against the page and the page's own issues still do (lighthouse.spec.ts).
 */
type Event = { method: string; params?: unknown }
type Params = { requestId?: string; type?: string; frameId?: string; response?: { url?: string; headers?: Record<string, string> }; headers?: Record<string, string> }
type Audit = { score: number | null; scoreDisplayMode: string; details?: unknown }
/** The part of a Lighthouse result these read. */
export type Lhr = { categories: Record<string, { auditRefs: { id: string; weight: number }[] } | undefined>; audits: Record<string, Audit | undefined> }

const lower = (h: Record<string, string> = {}) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]))

/**
 * The main document's response headers, names lower-cased, from Lighthouse's protocol log (`artifacts.DevtoolsLog`): the
 * response to `url` of type Document (a frame's own document, as a Turnstile widget's, is another URL), with the headers
 * the network sent beside it (`responseReceivedExtraInfo`) where there are some.
 */
export function documentHeaders(log: readonly Event[], url: string): Record<string, string> {
  const of = (e: Event) => (e.params ?? {}) as Params
  const doc = log.find(e => e.method === 'Network.responseReceived' && of(e).type === 'Document' && of(e).response?.url === url)
  if (!doc) return {}
  const extra = log.find(e => e.method === 'Network.responseReceivedExtraInfo' && of(e).requestId === of(doc).requestId)
  return { ...lower(of(doc).response?.headers), ...(extra ? lower(of(extra).headers) : {}) }
}

const MONITOR = /\/cdn-cgi\/script_monitor\/report/
/**
 * The script monitor's policy on a document, its report address cut to its path (the address's query is the zone's), or
 * nothing: no report-only policy, one of the site's own, or a policy enforced beside it.
 */
export function monitorPolicy(headers: Record<string, string>): string | undefined {
  const policy = headers['content-security-policy-report-only']
  if (!policy || headers['content-security-policy']) return undefined
  // Two of a header come joined, by a comma or (in the protocol's log) a new line.
  if (!policy.split(/[,\n]/).every(p => MONITOR.test(p))) return undefined
  return policy.replace(/(\/cdn-cgi\/script_monitor\/report)\S*/g, '$1')
}

/**
 * Whether every issue Chrome logged on the load (Lighthouse's `inspector-issues`) is a break of a policy, while the only
 * policy on the document is the monitor's: then none of them is the page's.
 */
export function onlyMonitorBreaks(lhr: Lhr, policy: string | undefined): boolean {
  const items = (lhr.audits['inspector-issues']?.details as { items?: { issueType?: string }[] } | undefined)?.items ?? []
  return !!policy && items.length > 0 && items.every(i => i.issueType === 'Content security policy')
}

/**
 * A category's score, 0–100, as Lighthouse counts it (the weighted mean of its audits, those not applicable, manual or
 * informative left out, an audit that errored as 0), with the audits in `passed` taken as passed.
 */
export function scoreWith(lhr: Lhr, category: string, passed: readonly string[] = []): number {
  let sum = 0, weight = 0
  for (const r of lhr.categories[category]?.auditRefs ?? []) {
    const a = lhr.audits[r.id]
    if (!a || !r.weight || ['notApplicable', 'manual', 'informative'].includes(a.scoreDisplayMode)) continue
    sum += (passed.includes(r.id) ? 1 : (a.score ?? 0)) * r.weight
    weight += r.weight
  }
  return weight ? Math.round((sum / weight) * 100) : 0
}
