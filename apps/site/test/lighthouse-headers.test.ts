import { expect, test } from 'vitest'
import { documentHeaders, headerLines } from '../e2e/lighthouse-headers'

// Watch runs 43558404985 and 43564278975, 14 Nov 2026: a few live loads read best-practices 96 on policy breaks the site
// doesn't make, and their reports keep no headers. A load that misses a budget now prints its document's own.
const PAGE = 'https://aquatome.com/cong-cu/nhan-dien-ca/'
const POLICY = "script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; report-uri https://csp-reporting.cloudflare.com/cdn-cgi/script_monitor/report?m=zone-key&s=sample"
const response = (requestId: string, url: string, type: string, headers: Record<string, string>, status = 200) =>
  ({ method: 'Network.responseReceived', params: { requestId, type, response: { url, status, headers } } })
const extra = (requestId: string, statusCode: number, headers: Record<string, string>) =>
  ({ method: 'Network.responseReceivedExtraInfo', params: { requestId, statusCode, headers } })

test("the main document's headers are read from Lighthouse's log: its own response, not a frame's or a script's", () => {
  const log = [
    { method: 'Network.requestWillBeSent', params: { requestId: '1' } },
    response('1', PAGE, 'Document', { 'Content-Type': 'text/html', 'CF-Cache-Status': 'HIT' }),
    extra('1', 200, { 'content-security-policy-report-only': POLICY }),
    response('2', 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x', 'Document', { 'content-security-policy': "default-src 'none'" }),
    response('3', 'https://aquatome.com/_astro/fish-id-client.js', 'Script', { 'content-type': 'text/javascript' }),
  ]
  expect(documentHeaders(log, PAGE)).toEqual({ 'content-type': 'text/html', 'cf-cache-status': 'HIT', 'content-security-policy-report-only': POLICY })
  expect(documentHeaders(log, 'https://aquatome.com/other/')).toEqual({})
  // Two documents at the page's address: which one is the page's isn't certain, so neither is read.
  expect(documentHeaders([...log, response('4', PAGE, 'Document', {})], PAGE)).toEqual({})
})

test("a redirect's headers, logged under the same request, aren't taken for the page's", () => {
  const log = [
    { method: 'Network.requestWillBeSent', params: { requestId: '1' } },
    extra('1', 301, { location: PAGE, 'content-security-policy-report-only': POLICY }),
    { method: 'Network.requestWillBeSent', params: { requestId: '1', redirectResponse: { status: 301 } } },
    response('1', PAGE, 'Document', { 'content-type': 'text/html' }),
    extra('1', 200, { 'content-type': 'text/html', 'cf-cache-status': 'HIT' }),
  ]
  expect(documentHeaders(log, PAGE)).toEqual({ 'content-type': 'text/html', 'cf-cache-status': 'HIT' })
})

test("the log lines keep a report address's host and path, and nothing of its query or a cookie", () => {
  const lines = headerLines({
    'set-cookie': '__cf_bm=abc; path=/',
    'content-type': 'text/html',
    'content-security-policy-report-only': POLICY,
    'report-to': '{"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=qfirst,qsecond;qthird"}],"group":"cf-nel"}',
  })
  expect(lines).toEqual([
    "  content-security-policy-report-only: script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; report-uri https://csp-reporting.cloudflare.com/cdn-cgi/script_monitor/report?…",
    '  content-type: text/html',
    '  report-to: {"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?…',
    '  set-cookie: (withheld)',
  ])
  for (const word of ['zone-key', 'sample', 'qfirst', 'qsecond', 'qthird', 'abc']) expect(lines.join('\n')).not.toContain(word)
})
