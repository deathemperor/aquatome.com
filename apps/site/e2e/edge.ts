/**
 * Where a live browser check's page came from (the chief of staff, 17 Nov). On the night of 16 Nov the live checks
 * failed five times, on far Cloudflare edges (Manchester, Tokyo, Dublin, Paris) or on dropped connections, and the
 * browser checks printed nothing to tell which: Lighthouse prints a failing load's headers (lighthouse-headers.ts), the
 * browser checks didn't. Each page a live browser check opens now prints one line (fixtures.ts): the edge that served
 * it, the cache's answer, the time to its first byte, its status and its address; a page that didn't load prints why.
 * Information only: no check reads it.
 */
export type Load = { path: string; status?: number; headers?: Record<string, string>; firstByte?: number; failure?: string }

/** The Cloudflare edge that answered, from the `cf-ray` header's suffix (a5b7e0…-ATL): its airport code, or "?". */
export const edgeOf = (headers: Record<string, string> = {}) => /-([A-Z]{3})$/.exec(headers['cf-ray'] ?? '')?.[1] ?? '?'

/** A page's address without its origin: the path and any query. */
export const pathOf = (url: string) => { const u = new URL(url); return u.pathname + u.search }

/**
 * One load as a log line, the same shape every time so a week's logs can be counted by edge: `live load: edge ATL cache
 * HIT first byte 182 ms 200 /cay/`. The time is from the request's start (Playwright's `timing().responseStart`, -1 when
 * the browser has none: "?"). A load that failed: `live load: edge ? failed net::ERR_CONNECTION_RESET /cong-cu/be-cua-toi/`.
 */
export function loadLine(load: Load): string {
  if (load.failure !== undefined) return `live load: edge ? failed ${load.failure || 'unknown'} ${load.path}`
  const firstByte = load.firstByte !== undefined && load.firstByte >= 0 ? `${Math.round(load.firstByte)} ms` : '? ms'
  return `live load: edge ${edgeOf(load.headers)} cache ${load.headers?.['cf-cache-status'] ?? '-'} first byte ${firstByte} ${load.status ?? '?'} ${load.path}`
}

/**
 * How far a Lighthouse load's route was (the chief of staff, 19 Nov). Three live runs on the night of 18 Nov missed the
 * desktop paint budget with the same pictures, bytes and machine speed as the runs that passed, on a round trip from the
 * runner to the site's hosts of 112 to 169 ms against 34 to 55 ms: Lighthouse's simulation adds the round trip it measures
 * to every request. Its log named neither the edge nor that round trip. Each page's line now ends with both: the edge
 * that served the document and the round trip Lighthouse measured to each of the site's own hosts (its `network-rtt`
 * audit), largest first: `edge ATL, round trip aquatome.com 112 ms, media.aquatome.com 108 ms`. Information only: no
 * check reads it.
 */
export function routeLine(headers: Record<string, string>, rtts: readonly { origin: string; rtt: number }[], own: string): string {
  const host = new URL(own).hostname
  const ours = rtts.map(r => ({ host: new URL(r.origin).hostname, rtt: r.rtt })).filter(r => r.host === host || r.host.endsWith(`.${host}`))
  const trips = ours.sort((a, b) => b.rtt - a.rtt).map(r => `${r.host} ${Math.round(r.rtt)} ms`).join(', ')
  return `edge ${edgeOf(headers)}, round trip ${trips || '?'}`
}

/** A request still open, for the line of a page that didn't load in time: its address, kind and how long it's been open. */
export type Open = { url: string; type: string; ms: number }

/**
 * What a page that ran out of time was still waiting on (the chief of staff, 19 Nov). Three bursts of page loads past
 * 30 s on the night of 18 Nov kept no network log to tell which request held the page's load. A live check that runs out
 * of time now prints each request still open when it ended, the longest open first, at most five:
 * `live load: waiting on /_astro/page.js (script) for 28 s`. An address on the site is its path, another's its host and
 * path; a query is cut, as it can carry a sign-in's code.
 */
export function waitingLines(open: readonly Open[], own: string): string[] {
  const where = (url: string) => {
    const u = new URL(url)
    return `${u.origin === own ? '' : u.host}${u.pathname}${u.search ? '?…' : ''}`
  }
  return [...open].sort((a, b) => b.ms - a.ms).slice(0, 5).map(r => `live load: waiting on ${where(r.url)} (${r.type}) for ${Math.round(r.ms / 1000)} s`)
}
