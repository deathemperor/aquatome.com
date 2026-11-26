import { readCapped } from './comments/api'

export const CSP_REPORT_PATH = '/api/csp-report'
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
}
const CSP = `base-uri 'self'; object-src 'none'; report-uri ${CSP_REPORT_PATH}`
const DIRECTIVES = new Set(['base-uri', 'object-src'])

/** Worker responses get the same defaults as the static assets in public/_headers. */
export function browserHeaders(response: Response, reportCsp: boolean): Response {
  const out = new Response(response.body, response)
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!out.headers.has(key)) out.headers.set(key, value)
  }
  if (reportCsp && out.headers.get('Content-Type')?.includes('text/html') && !out.headers.has('Content-Security-Policy-Report-Only')) {
    out.headers.set('Content-Security-Policy-Report-Only', CSP)
  }
  return out
}

/** Count the known directives only. A report’s URLs and other browser data are never written. */
export async function cspReport(req: Request, events?: AnalyticsEngineDataset): Promise<Response> {
  const reply = (status: number) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } })
  if (req.method !== 'POST') return reply(405)
  const origin = req.headers.get('Origin')
  const site = req.headers.get('Sec-Fetch-Site')
  if ((origin && origin !== new URL(req.url).origin) || (site && site !== 'same-origin')) return reply(403)
  if (req.headers.get('Content-Type')?.split(';')[0] !== 'application/csp-report') return reply(415)
  const body = await readCapped(req, 8192)
  if (body === null) return reply(413)
  let directive: string | undefined
  try {
    const report = JSON.parse(body) as { 'csp-report'?: { 'effective-directive'?: string } } | null
    directive = report?.['csp-report']?.['effective-directive']
  } catch { return reply(400) }
  if (directive && DIRECTIVES.has(directive)) {
    events?.writeDataPoint({ indexes: ['csp-report'], blobs: ['csp-report', directive] })
  }
  return reply(204)
}
