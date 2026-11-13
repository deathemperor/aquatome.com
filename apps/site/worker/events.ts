/**
 * `tank`, `src`: a click on "add to tank" or a page's source link (the beacon's click hook, src/lib/beacon.ts).
 * `tip`, `tipmore`: a tap that showed a glossary term's card, and its link followed (src/scripts/glossary-tip.ts).
 */
export type EventType = 'view' | 'scroll' | 'time' | 'aff' | 'tank' | 'src' | 'tip' | 'tipmore'
/**
 * `r`: the referring site's host on a page's view, '' when none; the Worker keeps one of our own pages as '=' (ownReferrer).
 * `u`: the browser's visitor code (src/lib/beacon.ts), kept only with the visitor switch on (visitorOf).
 * `d`: the device, one word the browser works out (src/lib/beacon.ts); '' when it can't tell, missing on a page cached from before it was sent.
 * `x`: on a tip's two events and no other, the glossary term's page (TERM_PAGE).
 */
export type Device = 'phone' | 'tablet' | 'desktop'
export type AbEvent = { p: string; t: EventType; v: number; sid: string; r?: string; u?: string; d?: Device; x?: string }
const TYPES = new Set<string>(['view', 'scroll', 'time', 'aff', 'tank', 'src', 'tip', 'tipmore'])
const DEVICES = new Set<unknown>(['phone', 'tablet', 'desktop'])
/** A glossary term's page, as any language writes it (test/glossary-tip.test.ts): all a tip's event may name. */
export const TERM_PAGE = /^\/(?:(?:id|th|ms)\/)?(?:thuat-ngu|istilah|glossary)\/[a-z0-9-]+\/$/

/** Validate a beacon payload; anything unexpected is dropped. */
export function parseEvent(body: string): AbEvent | null {
  if (body.length > 4096) return null
  let e: Record<string, unknown>
  try { e = JSON.parse(body) } catch { return null }
  if (!e || typeof e !== 'object') return null
  const { p, t, v, sid, r, u, d, x } = e
  if (typeof t !== 'string' || !TYPES.has(t)) return null
  if (typeof p !== 'string' || !p.startsWith('/') || p.length > 200) return null
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e6) return null
  if (typeof sid !== 'string' || !/^[a-z0-9]{12}$/.test(sid)) return null
  if (r !== undefined && (typeof r !== 'string' || !/^[a-z0-9.-]{0,100}$/.test(r))) return null
  if (u !== undefined && (typeof u !== 'string' || !/^(?:[a-z0-9]{4,12})?$/.test(u))) return null
  if (d !== undefined && d !== '' && !DEVICES.has(d)) return null
  if (t === 'tip' || t === 'tipmore' ? typeof x !== 'string' || !TERM_PAGE.test(x) : x !== undefined) return null
  return { p, t: t as EventType, v, sid, ...(r ? { r } : {}), ...(u ? { u } : {}), ...(d ? { d: d as Device } : {}), ...(x ? { x: x as string } : {}) }
}

/**
 * Analytics Engine layout: blob1 who, when not a reader (us.ts: owner, team, net, app; '' for a reader; the A/B skin
 * until 2026-10), blob2 type, blob3 path, blob4 session, blob5 referrer host ('=' our own site), blob6 country, blob7 visitor
 * code ('' without one), blob8 device ('' on rows from before it was sent), blob9 a tip's term; double1 value; index session.
 */
/** A view whose referrer is this site (a tab a reader opened from one of our pages) keeps '=': a referrer, but not a source. */
export const ownReferrer = (e: AbEvent, host: string): AbEvent => (e.r && e.r === host ? { ...e, r: '=' } : e)
export const toDataPoint = (e: AbEvent, country = '', who = '') => ({ blobs: [who, e.t, e.p, e.sid, e.r ?? '', country, e.u ?? '', e.d ?? '', e.x ?? ''], doubles: [e.v], indexes: [e.sid] })
/**
 * The event as kept: its visitor code only with the visitor switch on (stats-switch.ts), and never from a browser that
 * sends Global Privacy Control (a page cached from before it was turned on still honours it).
 */
export const visitorOf = (e: AbEvent, req: Request, on: boolean): AbEvent => {
  if (!e.u || (on && req.headers.get('sec-gpc') !== '1')) return e
  const { u: _, ...rest } = e
  return rest
}
