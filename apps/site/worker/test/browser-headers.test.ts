import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import worker, { type Env } from '../index'

const ORIGIN = 'https://aquatome.com'
const SECURITY = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
}
const CSP = "base-uri 'self'; object-src 'none'; report-uri /api/csp-report"
function setup(extra: Record<string, string> = {}) {
  const points: unknown[] = []
  const env = {
    ASSETS: { fetch: async () => new Response('<main>Test</main>', { headers: { 'Content-Type': 'text/html', ...extra } }) },
    AB: { get: async () => null },
    EVENTS: { writeDataPoint: (point: unknown) => points.push(point) },
    CANONICAL_HOST: new URL(ORIGIN).hostname,
  } as unknown as Env
  const ctx = { waitUntil: () => {} } as unknown as ExecutionContext
  const request = (path: string, options?: RequestInit) => worker.fetch(new Request(ORIGIN + path, options), env, ctx)
  return { request, points }
}

test('public static and Worker pages send the security headers and a report-only CSP', async () => {
  const rules = readFileSync(fileURLToPath(new URL('../../public/_headers', import.meta.url).href), 'utf8').trim().split(/\r?\n\r?\n/)
  const site = rules.find(r => r.startsWith('https://aquatome.com/*\n'))
  expect(site).toBeDefined()
  const response = await setup().request('/ca/')
  expect(response.status).toBe(200)
  for (const [key, value] of Object.entries({ ...SECURITY, 'Content-Security-Policy-Report-Only': CSP })) {
    expect(site).toContain(`\n  ${key}: ${value}`)
    expect(response.headers.get(key), key).toBe(value)
  }
  expect(response.headers.has('Content-Security-Policy')).toBe(false)
})

test('route-specific enforced CSP and referrer policy are kept', async () => {
  const response = await setup({ 'Content-Security-Policy': "script-src 'none'", 'Referrer-Policy': 'no-referrer' }).request('/ca/')
  expect(response.headers.get('Content-Security-Policy')).toBe("script-src 'none'")
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
})

test('CSP reporting records only the directive and ignores unrelated violation payloads', async () => {
  const { request, points } = setup()
  const post = (body: unknown, origin = ORIGIN) => request('/api/csp-report', {
    method: 'POST', headers: { 'Content-Type': 'application/csp-report', Origin: origin }, body: JSON.stringify(body),
  })
  const report = { 'csp-report': { 'effective-directive': 'base-uri', 'document-uri': ORIGIN + '/ca/?private=1', 'blocked-uri': 'https://example.com/' } }
  expect((await post(report)).status).toBe(204)
  expect(points).toEqual([{ indexes: ['csp-report'], blobs: ['csp-report', 'base-uri'] }])
  expect((await post({ 'csp-report': { 'effective-directive': 'script-src' } })).status).toBe(204)
  expect((await post(report, 'https://example.com')).status).toBe(403)
  expect((await post({ ...report, padded: 'x'.repeat(10_000) })).status).toBe(413)
  expect((await request('/api/csp-report')).status).toBe(405)
  expect(points).toHaveLength(1)
})
