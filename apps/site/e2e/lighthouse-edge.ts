/**
 * Cloudflare's script monitor (client-side security) adds a report-only policy to a sample of the live site's HTML
 * responses: `script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; report-uri …/cdn-cgi/script_monitor/report?…`
 * (developers.cloudflare.com/client-side-security/reference/csp-header/). It blocks nothing, but every script file and
 * every request of the page breaks it, and Chrome logs each break as an issue, so Lighthouse's best-practices score drops
 * to 96 on that load: live checks 43558404985 and 43564278975, 14 Nov 2026, on 3 of 34 loads, and the same response three
 * times running once. The site sends no policy of its own. These read which policy a load had, so that the monitor's
 * breaks don't count against the page and the page's own issues still do (lighthouse.spec.ts). Where a load can't be
 * read for certain, nothing is excused.
 *
 * A real sampled load (live check 43963219496, 16 Nov, /ca/ on a phone, best-practices 96) had one more directive than
 * the page documents, `report-to cf-csp-endpoint`, and a `reporting-endpoints` header naming that group's address:
 * Cloudflare's report address again.
 */
import { documentHeaders } from './lighthouse-headers'

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

const REPORT_PATH = '/cdn-cgi/script_monitor/report'
const REPORT_ONLY = 'content-security-policy-report-only'
/**
 * The script monitor's policy on a document, its report address cut to its path (the address's query is the zone's), or
 * nothing. It is the monitor's only when it is the whole report-only header, directive for directive as Cloudflare
 * documents it, reporting to Cloudflare's host or the page's own, with no policy enforced beside it. It may also name
 * one group with `report-to`, as the live responses do, when the `reporting-endpoints` header gives that group the same
 * kind of address.
 */
export function monitorPolicy(headers: Record<string, string>, pageUrl: string): string | undefined {
  const header = headers[REPORT_ONLY]
  if (!header || headers['content-security-policy']) return undefined
  // Two of a header come joined, by a comma or (in the protocol's log) a new line: a second policy isn't the monitor's.
  if (/[,\n]/.test(header)) return undefined
  // Only printable ASCII and the space or tab between words: CSP splits on ASCII whitespace alone, so a no-break space
  // between two keywords makes one invalid source in Chrome that a wider split would read as the monitor's two (Codex's
  // read of 950192592).
  if (/[^\t\x20-\x7e]/.test(header)) return undefined
  const directives = header.split(';').map(d => d.trim().split(/[ \t]+/)).filter(d => d[0])
  const named = new Map(directives.map(([name, ...values]) => [name!.toLowerCase(), values]))
  const group = named.get('report-to')
  const count = group ? 4 : 3
  if (directives.length !== count || named.size !== count) return undefined
  const script = named.get('script-src'), connect = named.get('connect-src'), report = named.get('report-uri')
  if (script?.length !== 2 || !script.includes("'unsafe-inline'") || !script.includes("'unsafe-eval'")) return undefined
  if (connect?.length !== 1 || connect[0] !== "'none'" || report?.length !== 1) return undefined
  const host = (() => { try { return new URL(pageUrl).host } catch { return undefined } })()
  const reportHost = (address: string | undefined) => {
    let to: URL
    try { to = new URL(address ?? '', pageUrl) } catch { return undefined }
    const ok = address !== undefined && to.protocol === 'https:' && to.pathname === REPORT_PATH && (to.host === 'csp-reporting.cloudflare.com' || to.host === host)
    return ok ? to.host : undefined
  }
  const to = reportHost(report[0])
  if (!to) return undefined
  if (!group) return `script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; report-uri https://${to}${REPORT_PATH}`
  // The group's address, from `reporting-endpoints` in the one shape the live site sends (endpoints()): named once there.
  // A field in any other shape, or the name twice (the later one would win, Codex's read of 8d0b99747): not the monitor's.
  const listed = endpoints(headers['reporting-endpoints'] ?? '')
  const found = (listed ?? []).filter(([name]) => name === group[0])
  if (group.length !== 1 || !listed || found.length !== 1 || reportHost(found[0]![1]) !== to) return undefined
  return `script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; report-uri https://${to}${REPORT_PATH}; report-to ${group[0]}`
}

/** A member of `reporting-endpoints` as the live site writes it: a lower-case name, `=`, an address quoted plainly. */
const MEMBER = '([a-z*][a-z0-9_.*-]*)="([\\x20\\x21\\x23-\\x5b\\x5d-\\x7e]*)"'
/**
 * `reporting-endpoints` read in the one shape the live site sends (16 Nov: `cf-csp-endpoint="https://…"`): members
 * `name="address"` by commas, or by the new line that joins two fields in the protocol's log, with no parameters and no
 * escapes in an address. Its grammar (RFC 8941) allows more, and each more is a way to be read two ways (Codex's reads of
 * 8d0b99747, 825cf2c25 and bb58fbba8), so any other shape is a field not read for certain: undefined, and nothing excused.
 */
export function endpoints(field: string): [string, string][] | undefined {
  if (!new RegExp(`^[ \\t]*(?:${MEMBER}(?:[ \\t]*[,\\n][ \\t]*${MEMBER})*)?[ \\t]*$`).test(field)) return undefined
  return [...field.matchAll(new RegExp(MEMBER, 'g'))].map(([, name, address]) => [name!, address!])
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
  const others = new Map<string | undefined, Event[]>()
  for (const e of log) {
    if ((e.method !== 'Network.responseReceived' && e.method !== 'Network.responseReceivedExtraInfo') || of(e).requestId === of(main!).requestId) continue
    others.set(of(e).requestId, [...(others.get(of(e).requestId) ?? []), e])
  }
  // Every report-only policy logged is judged on the headers it came in, never merged with another event's, so none can
  // hide one (Codex's reads of 825cf2c25 and bb58fbba8): each of another request's, and the page's own at its final
  // status (a redirect's hop never applied to a document). Only its report group's address may come from beside it: a
  // frame the monitor sampled can have its policy in its response and `reporting-endpoints` in the headers logged beside
  // it at the same status (Codex's read of 8d0b99747), and that address is taken when every event there gives the same one.
  const status = (e: Event) => (e.method === 'Network.responseReceived' ? of(e).response?.status : of(e).statusCode)
  const headersOf = (e: Event) => lower(e.method === 'Network.responseReceived' ? of(e).response?.headers : of(e).headers)
  const own = log.filter(e => (e.method === 'Network.responseReceived' || e.method === 'Network.responseReceivedExtraInfo') && of(e).requestId === of(main!).requestId && status(e) === of(main!).response?.status)
  const foreign = [...others.values(), own].some(events => events.some(e => {
    const headers = headersOf(e)
    if (headers[REPORT_ONLY] === undefined) return false
    // Its own `reporting-endpoints` and those beside it at its status must agree: one given elsewhere for the same
    // response could be the one the browser used (Codex's read of c377661b0).
    const given = [...new Set(events.filter(x => status(x) === status(e)).map(x => headersOf(x)['reporting-endpoints']).filter(v => v !== undefined))]
    if (given.length > 1) return true
    return monitorPolicy({ ...headers, ...(given.length ? { 'reporting-endpoints': given[0]! } : {}) }, page) === undefined
  }))
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
