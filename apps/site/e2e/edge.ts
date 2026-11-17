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
