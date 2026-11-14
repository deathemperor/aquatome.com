import { expect, test } from 'vitest'
import { documentHeaders, loadPolicy, monitorPolicy, onlyMonitorBreaks, policyNames, scoreWith, type Issues, type Lhr } from '../e2e/lighthouse-edge'

// Live checks 43558404985 and 43564278975, 14 Nov 2026: on loads Cloudflare's script monitor sampled, every script file
// and request of a page broke the monitor's report-only policy, Chrome logged each, and best-practices read 96 against a
// budget of 100. The fish ID page failed all three tries on one response. The site sends no policy of its own.
const MONITOR = "script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; report-uri https://csp-reporting.cloudflare.com/cdn-cgi/script_monitor/report?m=zone-key&s=sample"
const CUT = "script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; report-uri https://csp-reporting.cloudflare.com/cdn-cgi/script_monitor/report"
const PAGE = 'https://aquatome.com/cong-cu/nhan-dien-ca/'
const response = (requestId: string, url: string, type: string, headers: Record<string, string>, status = 200) =>
  ({ method: 'Network.responseReceived', params: { requestId, type, response: { url, status, headers } } })
const extra = (requestId: string, statusCode: number, headers: Record<string, string>) =>
  ({ method: 'Network.responseReceivedExtraInfo', params: { requestId, statusCode, headers } })

test("the main document's headers are read from Lighthouse's log: its own response, not a frame's or a script's", () => {
  const log = [
    { method: 'Network.requestWillBeSent', params: { requestId: '1' } },
    response('1', PAGE, 'Document', { 'Content-Type': 'text/html', 'CF-Cache-Status': 'HIT' }),
    extra('1', 200, { 'content-security-policy-report-only': MONITOR }),
    response('2', 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x', 'Document', { 'content-security-policy': "default-src 'none'" }),
    response('3', 'https://aquatome.com/_astro/fish-id-client.js', 'Script', { 'content-type': 'text/javascript' }),
  ]
  expect(documentHeaders(log, PAGE)).toEqual({ 'content-type': 'text/html', 'cf-cache-status': 'HIT', 'content-security-policy-report-only': MONITOR })
  expect(documentHeaders(log, 'https://aquatome.com/other/')).toEqual({})
  // Two documents at the page's address: which one is the page's isn't certain, so neither is read.
  expect(documentHeaders([...log, response('4', PAGE, 'Document', {})], PAGE)).toEqual({})
})

test("a redirect's headers, logged under the same request, aren't taken for the page's", () => {
  // The old address answers 301 with the monitor's policy; the page itself answers 200 with none.
  const log = [
    { method: 'Network.requestWillBeSent', params: { requestId: '1' } },
    extra('1', 301, { location: PAGE, 'content-security-policy-report-only': MONITOR }),
    { method: 'Network.requestWillBeSent', params: { requestId: '1', redirectResponse: { status: 301 } } },
    response('1', PAGE, 'Document', { 'content-type': 'text/html' }),
    extra('1', 200, { 'content-type': 'text/html', 'cf-cache-status': 'HIT' }),
  ]
  expect(documentHeaders(log, PAGE)).toEqual({ 'content-type': 'text/html', 'cf-cache-status': 'HIT' })
  expect(monitorPolicy(documentHeaders(log, PAGE), PAGE)).toBeUndefined()
})

test("the script monitor's policy is told from any other: the whole header, directive for directive, to Cloudflare or the page's host", () => {
  expect(monitorPolicy({ 'content-security-policy-report-only': MONITOR }, PAGE)).toBe(CUT)
  // Reports to the site's own host, as Cloudflare offers; directives in another order, with a trailing semicolon.
  expect(monitorPolicy({ 'content-security-policy-report-only': "connect-src 'none'; script-src 'unsafe-eval' 'unsafe-inline'; report-uri https://aquatome.com/cdn-cgi/script_monitor/report?x;" }, PAGE))
    .toBe("script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; report-uri https://aquatome.com/cdn-cgi/script_monitor/report")
  // Not the monitor's: none; one of the site's own; the monitor's beside one of ours, joined; a policy enforced beside it.
  expect(monitorPolicy({}, PAGE)).toBeUndefined()
  expect(monitorPolicy({ 'content-security-policy-report-only': "script-src 'self'; report-uri /csp" }, PAGE)).toBeUndefined()
  expect(monitorPolicy({ 'content-security-policy-report-only': `${MONITOR}\nscript-src 'self'; report-uri /csp` }, PAGE)).toBeUndefined()
  expect(monitorPolicy({ 'content-security-policy-report-only': `${MONITOR}, script-src 'self'` }, PAGE)).toBeUndefined()
  expect(monitorPolicy({ 'content-security-policy-report-only': MONITOR, 'content-security-policy': "script-src 'self'" }, PAGE)).toBeUndefined()
  // The monitor's report address on a policy that isn't its own: another directive, another source, one left out, or
  // the address on another host, another path or plain http.
  for (const other of [
    `${MONITOR}; img-src 'none'`,
    MONITOR.replace("'unsafe-eval'", "'self'"),
    MONITOR.replace("connect-src 'none'; ", ''),
    MONITOR.replace("connect-src 'none'", "connect-src 'none' https://aquatome.com"),
    MONITOR.replace('csp-reporting.cloudflare.com', 'reports.example.com'),
    MONITOR.replace('/cdn-cgi/script_monitor/report', '/csp/cdn-cgi/script_monitor/report'),
    MONITOR.replace('https://', 'http://'),
    `${MONITOR}; report-uri https://csp-reporting.cloudflare.com/cdn-cgi/script_monitor/report`,
  ]) expect(monitorPolicy({ 'content-security-policy-report-only': other }, PAGE), other).toBeUndefined()
})

test("the monitor's policy is the load's only when no other response of it has a report-only policy of its own", () => {
  const page = [
    { method: 'Network.requestWillBeSent', params: { requestId: '1' } },
    response('1', PAGE, 'Document', { 'content-type': 'text/html' }),
    extra('1', 200, { 'content-security-policy-report-only': MONITOR }),
    response('3', 'https://aquatome.com/_astro/fish-id-client.js', 'Script', { 'content-type': 'text/javascript' }),
  ]
  expect(loadPolicy(page, PAGE)).toBe(CUT)
  // A frame whose own report-only policy Chrome's issues could be breaking (they don't say which policy): nothing, from
  // either the frame's response or the headers logged beside it. The same for a worker's script.
  const frame = 'https://widget.example/frame/'
  expect(loadPolicy([...page, response('2', frame, 'Document', { 'content-security-policy-report-only': "connect-src 'self'; report-uri /csp" })], PAGE)).toBeUndefined()
  expect(loadPolicy([...page, response('2', frame, 'Document', {}), extra('2', 200, { 'Content-Security-Policy-Report-Only': "connect-src 'self'" })], PAGE)).toBeUndefined()
  expect(loadPolicy([...page, response('4', 'https://aquatome.com/worker.js', 'Script', { 'content-security-policy-report-only': "connect-src 'self'" })], PAGE)).toBeUndefined()
  // A frame of the site's that the monitor sampled too, a frame with an enforced policy only (whose breaks aren't
  // report-only, so they're never excused), and a redirect before the page with a policy of its own: still the monitor's.
  expect(loadPolicy([...page, response('2', 'https://aquatome.com/embed/', 'Document', { 'content-security-policy-report-only': MONITOR })], PAGE)).toBe(CUT)
  expect(loadPolicy([...page, response('2', frame, 'Document', { 'content-security-policy': "default-src 'none'" })], PAGE)).toBe(CUT)
  expect(loadPolicy([page[0]!, extra('1', 301, { location: PAGE, 'content-security-policy-report-only': "connect-src 'self'" }), ...page.slice(1)], PAGE)).toBe(CUT)
  // No monitor on the page: nothing, whatever else the load has.
  expect(loadPolicy(page.filter(e => e.method !== 'Network.responseReceivedExtraInfo'), PAGE)).toBeUndefined()
})

test("a report-only policy is logged by its directives' names: nothing of a report address, its query split by a comma or not", () => {
  expect(policyNames(MONITOR)).toBe('script-src connect-src report-uri')
  const header = "script-src 'self'; report-uri https://reports.example/r?example=first,second&key=fictional;secret=1; img-src x"
  expect(policyNames(header)).toBe('script-src report-uri ? img-src')
  for (const word of ['example', 'first', 'second', 'fictional', 'secret', 'reports']) expect(policyNames(header)).not.toContain(word)
})

const scriptBreak = { isReportOnly: true, violatedDirective: 'script-src-elem', contentSecurityPolicyViolationType: 'kURLViolation', blockedURL: 'https://aquatome.com/_astro/a.js' }
const requestBreak = { isReportOnly: true, violatedDirective: 'connect-src', contentSecurityPolicyViolationType: 'kURLViolation', blockedURL: 'https://aquatome.com/pagefind/pagefind.js' }

test("only the monitor's own breaks are excused: report-only, of what its policy covers, and no issue of another kind", () => {
  const policy = monitorPolicy({ 'content-security-policy-report-only': MONITOR }, PAGE)
  const issues = (csp: readonly object[], more: Issues = {}): Issues => ({ mixedContentIssue: [], cookieIssue: [], contentSecurityPolicyIssue: csp, ...more })
  expect(onlyMonitorBreaks(issues([scriptBreak, requestBreak]), policy)).toBe(true)
  // The same breaks with no monitor on the document; or nothing logged.
  expect(onlyMonitorBreaks(issues([scriptBreak]), undefined)).toBe(false)
  expect(onlyMonitorBreaks(issues([]), policy)).toBe(false)
  expect(onlyMonitorBreaks(undefined, policy)).toBe(false)
  // A cookie issue beside them is the page's.
  expect(onlyMonitorBreaks(issues([scriptBreak], { cookieIssue: [{ cookieWarningReasons: ['WarnSameSiteUnspecifiedCrossSiteContext'] }] }), policy)).toBe(false)
  // A policy enforced, as one in the page's own <meta> would be, broken beside the monitor's: the page's.
  expect(onlyMonitorBreaks(issues([scriptBreak, { ...scriptBreak, isReportOnly: false }]), policy)).toBe(false)
  // Breaks the monitor's policy can't make: an image (it has no img-src), an inline script or eval (it allows both).
  expect(onlyMonitorBreaks(issues([{ ...scriptBreak, violatedDirective: 'img-src' }]), policy)).toBe(false)
  expect(onlyMonitorBreaks(issues([{ ...scriptBreak, contentSecurityPolicyViolationType: 'kInlineViolation' }]), policy)).toBe(false)
  expect(onlyMonitorBreaks(issues([{ ...scriptBreak, isReportOnly: undefined }]), policy)).toBe(false)
})

// Best practices as Lighthouse 13 weighs it: an audit not applicable doesn't count.
const lhr = (issuesScore: number, more: Lhr['audits'] = {}): Lhr => ({
  categories: { 'best-practices': { auditRefs: [{ id: 'inspector-issues', weight: 1 }, { id: 'errors-in-console', weight: 1 }, { id: 'is-on-https', weight: 5 }, { id: 'deprecations', weight: 5 }, { id: 'charset', weight: 1 }, { id: 'valid-source-maps', weight: 0 }, { id: 'notification-on-start', weight: 1 }, { id: 'image-aspect-ratio', weight: 1 }, { id: 'doctype', weight: 1 }, { id: 'paste-preventing-inputs', weight: 3 }, { id: 'geolocation-on-start', weight: 1 }, { id: 'third-party-cookies', weight: 5 }] } },
  audits: {
    'inspector-issues': { score: issuesScore, scoreDisplayMode: 'binary' },
    'errors-in-console': { score: 1, scoreDisplayMode: 'binary' }, 'is-on-https': { score: 1, scoreDisplayMode: 'binary' },
    deprecations: { score: 1, scoreDisplayMode: 'binary' }, charset: { score: 1, scoreDisplayMode: 'binary' },
    'valid-source-maps': { score: 0, scoreDisplayMode: 'binary' }, 'notification-on-start': { score: 1, scoreDisplayMode: 'binary' },
    'image-aspect-ratio': { score: 1, scoreDisplayMode: 'binary' }, doctype: { score: 1, scoreDisplayMode: 'binary' },
    'paste-preventing-inputs': { score: 1, scoreDisplayMode: 'binary' }, 'geolocation-on-start': { score: 1, scoreDisplayMode: 'binary' },
    'third-party-cookies': { score: null, scoreDisplayMode: 'notApplicable' },
    ...more,
  },
})

test('a score is counted as Lighthouse counts it, with the excused audit taken as passed', () => {
  expect(scoreWith(lhr(0), 'best-practices')).toBe(95)
  expect(scoreWith(lhr(0), 'best-practices', ['inspector-issues'])).toBe(100)
  // Another audit failing still costs the page: 19 of 20 passed.
  expect(scoreWith(lhr(0, { charset: { score: 0, scoreDisplayMode: 'binary' } }), 'best-practices', ['inspector-issues'])).toBe(95)
})

test('an audit that errored leaves the category with no score, as in Lighthouse, even with the issues excused', () => {
  const errored = lhr(0, { 'errors-in-console': { score: null, scoreDisplayMode: 'error' } })
  expect(scoreWith(errored, 'best-practices', ['inspector-issues'])).toBeNull()
  expect(scoreWith(errored, 'best-practices')).toBeNull()
})
