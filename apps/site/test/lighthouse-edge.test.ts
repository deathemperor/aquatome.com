import { expect, test } from 'vitest'
import { documentHeaders, monitorPolicy, onlyMonitorBreaks, scoreWith, type Lhr } from '../e2e/lighthouse-edge'

// Live checks 43558404985 and 43564278975, 14 Nov 2026: on loads Cloudflare's script monitor sampled, every script file
// and request of a page broke the monitor's report-only policy, Chrome logged each, and best-practices read 96 against a
// budget of 100. The fish ID page failed all three tries on one response. The site sends no policy of its own.
const MONITOR = "script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; report-uri https://csp-reporting.cloudflare.com/cdn-cgi/script_monitor/report?m=zone-key&s=sample"
const PAGE = 'https://aquatome.com/cong-cu/nhan-dien-ca/'
const response = (requestId: string, url: string, type: string, headers: Record<string, string>) =>
  ({ method: 'Network.responseReceived', params: { requestId, type, response: { url, headers } } })

test("the main document's headers are read from Lighthouse's log: its own response, not a frame's or a script's", () => {
  const log = [
    { method: 'Network.requestWillBeSent', params: { requestId: '1' } },
    response('1', PAGE, 'Document', { 'Content-Type': 'text/html', 'CF-Cache-Status': 'HIT' }),
    { method: 'Network.responseReceivedExtraInfo', params: { requestId: '1', headers: { 'content-security-policy-report-only': MONITOR } } },
    response('2', 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x', 'Document', { 'content-security-policy': "default-src 'none'" }),
    response('3', 'https://aquatome.com/_astro/fish-id-client.js', 'Script', { 'content-type': 'text/javascript' }),
  ]
  expect(documentHeaders(log, PAGE)).toEqual({ 'content-type': 'text/html', 'cf-cache-status': 'HIT', 'content-security-policy-report-only': MONITOR })
  expect(documentHeaders(log, 'https://aquatome.com/other/')).toEqual({})
})

test("the script monitor's policy is told from the site's own, and its report address loses the zone's query", () => {
  expect(monitorPolicy({ 'content-security-policy-report-only': MONITOR })).toBe("script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; report-uri https://csp-reporting.cloudflare.com/cdn-cgi/script_monitor/report")
  // Reports to the site's own host, as Cloudflare offers.
  expect(monitorPolicy({ 'content-security-policy-report-only': "connect-src 'none'; report-uri https://aquatome.com/cdn-cgi/script_monitor/report?x" })).toContain('aquatome.com/cdn-cgi/script_monitor/report')
  // No policy; a report-only policy of the site's own; the monitor's beside one of ours, joined; a policy enforced.
  expect(monitorPolicy({})).toBeUndefined()
  expect(monitorPolicy({ 'content-security-policy-report-only': "script-src 'self'; report-uri /csp" })).toBeUndefined()
  expect(monitorPolicy({ 'content-security-policy-report-only': `${MONITOR}\nscript-src 'self'; report-uri /csp` })).toBeUndefined()
  expect(monitorPolicy({ 'content-security-policy-report-only': MONITOR, 'content-security-policy': "script-src 'self'" })).toBeUndefined()
})

// Best practices as Lighthouse 13 weighs it: an audit not applicable doesn't count.
const lhr = (issues: { issueType: string }[]): Lhr => ({
  categories: { 'best-practices': { auditRefs: [{ id: 'inspector-issues', weight: 1 }, { id: 'errors-in-console', weight: 1 }, { id: 'is-on-https', weight: 5 }, { id: 'deprecations', weight: 5 }, { id: 'charset', weight: 1 }, { id: 'valid-source-maps', weight: 0 }, { id: 'notification-on-start', weight: 1 }, { id: 'image-aspect-ratio', weight: 1 }, { id: 'doctype', weight: 1 }, { id: 'paste-preventing-inputs', weight: 3 }, { id: 'geolocation-on-start', weight: 1 }, { id: 'third-party-cookies', weight: 5 }] } },
  audits: {
    'inspector-issues': { score: issues.length ? 0 : 1, scoreDisplayMode: 'binary', details: { items: issues } },
    'errors-in-console': { score: 1, scoreDisplayMode: 'binary' }, 'is-on-https': { score: 1, scoreDisplayMode: 'binary' },
    deprecations: { score: 1, scoreDisplayMode: 'binary' }, charset: { score: 1, scoreDisplayMode: 'binary' },
    'valid-source-maps': { score: 0, scoreDisplayMode: 'binary' }, 'notification-on-start': { score: 1, scoreDisplayMode: 'binary' },
    'image-aspect-ratio': { score: 1, scoreDisplayMode: 'binary' }, doctype: { score: 1, scoreDisplayMode: 'binary' },
    'paste-preventing-inputs': { score: 1, scoreDisplayMode: 'binary' }, 'geolocation-on-start': { score: 1, scoreDisplayMode: 'binary' },
    'third-party-cookies': { score: null, scoreDisplayMode: 'notApplicable' },
  },
})

test("a load whose only issues are the monitor's policy breaks keeps its score; any other issue still counts", () => {
  const csp = lhr([{ issueType: 'Content security policy' }])
  const policy = monitorPolicy({ 'content-security-policy-report-only': MONITOR })
  expect(scoreWith(csp, 'best-practices')).toBe(95)
  expect(onlyMonitorBreaks(csp, policy)).toBe(true)
  expect(scoreWith(csp, 'best-practices', ['inspector-issues'])).toBe(100)
  // The same breaks with no monitor on the document are the page's own; a cookie issue beside them is the page's.
  expect(onlyMonitorBreaks(csp, undefined)).toBe(false)
  expect(onlyMonitorBreaks(lhr([{ issueType: 'Content security policy' }, { issueType: 'Cookie' }]), policy)).toBe(false)
  expect(onlyMonitorBreaks(lhr([]), policy)).toBe(false)
})
