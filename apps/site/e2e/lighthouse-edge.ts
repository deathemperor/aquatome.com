/**
 * Cloudflare's script monitor (client-side security) adds a report-only policy to a sample of the live site's HTML
 * responses: `script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; report-uri …/cdn-cgi/script_monitor/report?…`
 * (developers.cloudflare.com/client-side-security/reference/csp-header/). It blocks nothing, but every script file and
 * every request of the page breaks it, and Chrome logs each break as an issue, so Lighthouse's best-practices score drops
 * to 96 on that load: live checks 43558404985 and 43564278975, 14 Nov 2026, on 3 of 34 loads, and the same response three
 * times running once. The site sends no policy of its own. These read which policy a load had, so that the monitor's
 * breaks don't count against the page and the page's own issues still do (lighthouse.spec.ts). Where a load can't be
 * read for certain, nothing is excused.
 */
type Event = { method: string; params?: unknown }
type Params = {
  requestId?: string; type?: string; frameId?: string; statusCode?: number
  response?: { url?: string; status?: number; headers?: Record<string, string> }; headers?: Record<string, string>
}
type Audit = { score: number | null; scoreDisplayMode: string; details?: unknown }
/** The part of a Lighthouse result these read. */
export type Lhr = { categories: Record<string, { auditRefs: { id: string; weight: number }[] } | undefined>; audits: Record<string, Audit | undefined> }
/** The issues Chrome logged on the load, by kind, as Lighthouse gathers them (`artifacts.InspectorIssues`). */
export type Issues = Partial<Record<string, readonly unknown[]>>
type CspIssue = { isReportOnly?: boolean; violatedDirective?: string; contentSecurityPolicyViolationType?: string }

const lower = (h: Record<string, string> = {}) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]))

/**
 * The main document's response headers, names lower-cased, from Lighthouse's protocol log (`artifacts.DevtoolsLog`): the
 * response to `url` of type Document (a frame's own document, as a Turnstile widget's, is another URL), with the headers
 * the network sent beside it (`responseReceivedExtraInfo`). A redirect keeps its request's id and logs its own headers
 * under it, so only the ones with the final response's status are read, the last of them. Two documents at that URL:
 * nothing.
 */
export function documentHeaders(log: readonly Event[], url: string): Record<string, string> {
  const of = (e: Event) => (e.params ?? {}) as Params
  const docs = log.filter(e => e.method === 'Network.responseReceived' && of(e).type === 'Document' && of(e).response?.url === url)
  if (docs.length !== 1) return {}
  const doc = of(docs[0]!)
  const extra = log.filter(e => e.method === 'Network.responseReceivedExtraInfo' && of(e).requestId === doc.requestId && of(e).statusCode === doc.response?.status).at(-1)
  return { ...lower(doc.response?.headers), ...(extra ? lower(of(extra).headers) : {}) }
}

const REPORT_PATH = '/cdn-cgi/script_monitor/report'
const REPORT_ONLY = 'content-security-policy-report-only'
/**
 * The script monitor's policy on a document, its report address cut to its path (the address's query is the zone's), or
 * nothing. It is the monitor's only when it is the whole report-only header, directive for directive as Cloudflare
 * documents it, reporting to Cloudflare's host or the page's own, with no policy enforced beside it.
 */
export function monitorPolicy(headers: Record<string, string>, pageUrl: string): string | undefined {
  const header = headers[REPORT_ONLY]
  if (!header || headers['content-security-policy']) return undefined
  // Two of a header come joined, by a comma or (in the protocol's log) a new line: a second policy isn't the monitor's.
  if (/[,\n]/.test(header)) return undefined
  const directives = header.split(';').map(d => d.trim().split(/\s+/)).filter(d => d[0])
  const named = new Map(directives.map(([name, ...values]) => [name!.toLowerCase(), values]))
  if (directives.length !== 3 || named.size !== 3) return undefined
  const script = named.get('script-src'), connect = named.get('connect-src'), report = named.get('report-uri')
  if (script?.length !== 2 || !script.includes("'unsafe-inline'") || !script.includes("'unsafe-eval'")) return undefined
  if (connect?.length !== 1 || connect[0] !== "'none'" || report?.length !== 1) return undefined
  let to: URL
  try { to = new URL(report[0]!, pageUrl) } catch { return undefined }
  const host = (() => { try { return new URL(pageUrl).host } catch { return undefined } })()
  if (to.protocol !== 'https:' || to.pathname !== REPORT_PATH || (to.host !== 'csp-reporting.cloudflare.com' && to.host !== host)) return undefined
  return `script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; report-uri https://${to.host}${REPORT_PATH}`
}

/**
 * The policy a load ran under, when it is the monitor's: the page's own response has it (monitorPolicy), and no other
 * response of the load (a frame's document, a worker's script) has a report-only policy that isn't the monitor's too.
 * Chrome's issues don't say which policy they break, so another policy anywhere on the load leaves them unattributed:
 * nothing. A redirect's own headers, under the page's request, never applied to a document.
 */
export function loadPolicy(log: readonly Event[], page: string): string | undefined {
  const of = (e: Event) => (e.params ?? {}) as Params
  const policy = monitorPolicy(documentHeaders(log, page), page)
  if (!policy) return undefined
  const main = log.find(e => e.method === 'Network.responseReceived' && of(e).type === 'Document' && of(e).response?.url === page)
  const others = log.filter(e => (e.method === 'Network.responseReceived' || e.method === 'Network.responseReceivedExtraInfo') && of(e).requestId !== of(main!).requestId)
  const foreign = others.some(e => {
    const headers = lower(e.method === 'Network.responseReceived' ? of(e).response?.headers : of(e).headers)
    return headers[REPORT_ONLY] !== undefined && monitorPolicy(headers, page) === undefined
  })
  return foreign ? undefined : policy
}

// CSP's directives (w3c.github.io/webappsec-csp, with those of Trusted Types, Fenced Frames and the older ones).
const DIRECTIVES = new Set([
  'default-src', 'script-src', 'script-src-elem', 'script-src-attr', 'style-src', 'style-src-elem', 'style-src-attr', 'img-src',
  'connect-src', 'font-src', 'object-src', 'media-src', 'frame-src', 'child-src', 'worker-src', 'manifest-src', 'prefetch-src',
  'fenced-frame-src', 'base-uri', 'form-action', 'frame-ancestors', 'navigate-to', 'report-uri', 'report-to', 'sandbox',
  'upgrade-insecure-requests', 'block-all-mixed-content', 'require-trusted-types-for', 'trusted-types', 'plugin-types',
  'require-sri-for', 'webrtc',
])
/**
 * A report-only policy for the log: its directives' names only, any other word as "?". Nothing of its values is written,
 * since a report address's query is the zone's, and a comma or a semicolon in it would split it anywhere.
 */
export const policyNames = (header: string): string =>
  header.split(';').map(d => d.trim().split(/\s+/)[0]!.toLowerCase()).filter(Boolean).map(n => (DIRECTIVES.has(n) ? n : '?')).join(' ')

// The kinds of issue Lighthouse's `inspector-issues` audit fails on (core/audits/dobetterweb/inspector-issues.js, 13.6).
const COUNTED = ['mixedContentIssue', 'cookieIssue', 'blockedByResponseIssue', 'heavyAdIssue', 'contentSecurityPolicyIssue']
// What the monitor's policy can be broken on: a script file (script-src, read as script-src-elem or, for a worker,
// worker-src) or a request (connect-src). Inline scripts and eval it allows.
const MONITOR_BREAKS = ['script-src', 'script-src-elem', 'worker-src', 'connect-src']

/**
 * Whether every issue Chrome logged on the load is a break of a report-only policy that only the monitor's could be,
 * while the monitor's is the only report-only policy on the load (loadPolicy): then none of them is the page's. An issue of another kind, a
 * policy enforced (as one in a `<meta>` would be), or a break the monitor's policy can't make: they are the page's.
 */
export function onlyMonitorBreaks(issues: Issues | undefined, policy: string | undefined): boolean {
  if (!policy || !issues) return false
  if (COUNTED.some(k => k !== 'contentSecurityPolicyIssue' && (issues[k]?.length ?? 0) > 0)) return false
  const csp = (issues.contentSecurityPolicyIssue ?? []) as readonly CspIssue[]
  return csp.length > 0 && csp.every(i => i.isReportOnly === true && i.contentSecurityPolicyViolationType === 'kURLViolation' && MONITOR_BREAKS.includes(i.violatedDirective ?? ''))
}

/**
 * A category's score, 0–100, as Lighthouse counts it (core/scoring.js: the weighted mean of its audits, those not
 * applicable, manual or informative left out, rounded to two places), with the audits in `passed` taken as passed. An
 * audit that errored (no score) leaves the category with none, as in Lighthouse: null.
 */
export function scoreWith(lhr: Lhr, category: string, passed: readonly string[] = []): number | null {
  let sum = 0, weight = 0
  for (const r of lhr.categories[category]?.auditRefs ?? []) {
    const a = lhr.audits[r.id]
    if (!a || !(r.weight > 0) || ['notApplicable', 'manual', 'informative'].includes(a.scoreDisplayMode)) continue
    const score = passed.includes(r.id) ? 1 : a.score
    if (score === null) return null
    sum += score * r.weight
    weight += r.weight
  }
  const mean = Math.min(1, Math.max(0, Math.round((sum / weight || 0) * 100) / 100))
  return Math.round(mean * 100)
}
