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
  const directives = header.split(';').map(d => d.trim().split(/\s+/)).filter(d => d[0])
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
  // The group's address, from `reporting-endpoints`, read whole: named once there, as a string. A field that can't be read,
  // or the name twice (the later one would win, Codex's read of 8d0b99747), and it isn't the monitor's.
  const endpoints = dictionary(headers['reporting-endpoints'] ?? '')
  const found = (endpoints ?? []).filter(([name]) => name === group[0])
  if (group.length !== 1 || !endpoints || found.length !== 1 || reportHost(found[0]![1]) !== to) return undefined
  return `script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; report-uri https://${to}${REPORT_PATH}; report-to ${group[0]}`
}

/**
 * A structured header's dictionary (RFC 8941, as `reporting-endpoints` is): each member's name and its value when that is
 * a string, in order, duplicates kept; its parameters read and set aside. Two fields joined by a new line (the protocol's
 * log) are one list. A field it can't read whole: undefined.
 */
export function dictionary(field: string): [string, string | undefined][] | undefined {
  const out: [string, string | undefined][] = []
  let i = 0
  const ows = () => { while (field[i] === ' ' || field[i] === '\t') i++ }
  const key = () => { const m = /^[a-z*][a-z0-9_.*-]*/.exec(field.slice(i)); if (m) i += m[0].length; return m?.[0] }
  // A string's text; undefined for another kind of item (a token, a number); null for one it can't read.
  const item = (): string | undefined | null => {
    if (field[i] !== '"') { const m = /^[^\s;,"]+/.exec(field.slice(i)); if (!m) return null; i += m[0].length; return undefined }
    let text = ''
    for (i++; i < field.length; ) {
      const c = field[i++]!
      if (c === '"') return text
      if (c === '\\') { const n = field[i++]; if (n !== '"' && n !== '\\') return null; text += n } else text += c
    }
    return null
  }
  ows()
  while (i < field.length) {
    const name = key()
    if (!name) return undefined
    let value: string | undefined
    if (field[i] === '=') { i++; const v = item(); if (v === null) return undefined; value = v }
    while (field[i] === ';') { i++; ows(); if (!key()) return undefined; if (field[i] === '=') { i++; if (item() === null) return undefined } }
    out.push([name, value])
    ows()
    if (i >= field.length) break
    if (field[i] !== ',' && field[i] !== '\n') return undefined
    i++
    ows()
    if (i >= field.length) return undefined
  }
  return out
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
  // Each other response's headers read as the page's are (lighthouse-headers.ts): its own with those the network logged
  // beside it at its status, so a frame the monitor sampled, its policy in one and the group's address in the other, is
  // the monitor's (Codex's read of 8d0b99747). Anything else logged under it (a redirect's hop, a response not logged) is
  // read alone, as before: a policy there that isn't the monitor's leaves the load unattributed.
  const foreign = [...others.values()].some(events => {
    const res = events.filter(e => e.method === 'Network.responseReceived').at(-1)
    const status = res && of(res).response?.status
    const beside = events.filter(e => e.method === 'Network.responseReceivedExtraInfo')
    const final = res ? beside.filter(e => of(e).statusCode === status).at(-1) : undefined
    const read = [
      ...(res ? [{ ...lower(of(res).response?.headers), ...(final ? lower(of(final).headers) : {}) }] : []),
      ...beside.filter(e => e !== final).map(e => lower(of(e).headers)),
    ]
    return read.some(headers => headers[REPORT_ONLY] !== undefined && monitorPolicy(headers, page) === undefined)
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
