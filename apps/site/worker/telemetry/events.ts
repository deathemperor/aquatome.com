import { LANGS, SEGMENTS } from '@aq/schema/langs'
import { readCapped } from '../comments/api'
import { VI_SECTIONS, withoutVi } from '../paths'
import { allowed, countryOf, done, fail, gate, isOurCopy, metaOf, objectOf, type Meta, type TelemetryEnv } from './shared'

/** POST /api/v1/app/events (protocols/app-telemetry.openapi.json): a batch of one session's events, each a data point. */

export const MAX_BODY = 64 * 1024
/** Within Analytics Engine's 250 data points a request. */
export const MAX_EVENTS = 100
export const ACTIONS = ['light.connect', 'light.write', 'plug.switch', 'fishid', 'tank.add', 'post.comment', 'post.photo'] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/**
 * A handbook page's path (protocols/app-telemetry.openapi.json "Path"): a Vietnamese page at the root or under the old
 * /vi/ the app index still gives, or another language's. Built from the Vietnamese sections, so nothing else at the
 * root (/app/, /go/, /api/…) passes; the contract's pattern is this one's source (a test keeps them equal).
 */
export const PAGE_PATH = new RegExp(`^/(?:(?:vi/)?(?:(?:${VI_SECTIONS.join('|')})/(?:[A-Za-z0-9_-]+/)*)?|(?:${SEGMENTS})/(?:[A-Za-z0-9_-]+/)*)$`)
/** Stored as the site's address, a Vietnamese page by its root path, so a page's views join across the app's switch. */
const pageOf = (v: unknown) => (typeof v === 'string' && v.length <= 200 && PAGE_PATH.test(v) ? withoutVi(v) : '')
const SCREEN = /^[a-z][a-z0-9-]{0,23}$/
const SHOP = /^[a-z0-9-]{1,24}$/
const HREF = /^\/go\/([a-z0-9-]{1,24})\/(?:\?[A-Za-z0-9%._~&=+,-]*)?$/
const KIND = /^[a-z0-9][a-z0-9 _:.-]{0,39}$/
// The site beacon's marks (layouts/Base.astro), so the app's reading compares with the site's.
const DEPTHS = [50, 90]
const SECONDS = [30, 60, 180]
const MAX_AT = 30 * 86_400_000

export type AppEvent = { t: 'view' | 'scroll' | 'time' | 'aff' | 'action'; at: number; path: string; screen: string; shop: string; href: string; name: string; kind: string; value: number }
export type Batch = Meta & { lang: string; session: string; events: AppEvent[]; dropped: number }

const int = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max

/** One event as the contract describes it, else null: an unknown `t`, a field it doesn't list, a value out of range. */
export function parseEvent(x: unknown): AppEvent | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  const e = x as Record<string, unknown>
  if (!int(e.at, 0, MAX_AT)) return null
  const only = (...keys: string[]) => Object.keys(e).every(k => k === 't' || k === 'at' || keys.includes(k))
  const path = pageOf(e.path)
  const base = { at: e.at, path, screen: '', shop: '', href: '', name: '', kind: '', value: 1 }
  switch (e.t) {
    case 'view':
      if (only('path') && path) return { ...base, t: 'view' }
      if (only('screen') && typeof e.screen === 'string' && SCREEN.test(e.screen)) return { ...base, t: 'view', screen: e.screen }
      return null
    case 'scroll':
      return only('path', 'depth') && path && DEPTHS.includes(e.depth as number) ? { ...base, t: 'scroll', value: e.depth as number } : null
    case 'time':
      return only('path', 'seconds') && path && SECONDS.includes(e.seconds as number) ? { ...base, t: 'time', value: e.seconds as number } : null
    case 'aff': {
      const net = typeof e.href === 'string' && e.href.length <= 300 ? HREF.exec(e.href)?.[1] : undefined
      return only('path', 'shop', 'href') && path && typeof e.shop === 'string' && SHOP.test(e.shop) && net === e.shop
        ? { ...base, t: 'aff', shop: e.shop, href: e.href as string } : null
    }
    case 'action': {
      if (!only('name', 'ok', 'kind') || !ACTIONS.includes(e.name as (typeof ACTIONS)[number]) || typeof e.ok !== 'boolean') return null
      if (e.kind !== undefined && (typeof e.kind !== 'string' || !KIND.test(e.kind))) return null
      return { ...base, t: 'action', name: e.name as string, kind: (e.kind as string | undefined) ?? '', value: e.ok ? 1 : 0 }
    }
  }
  return null
}

/** The envelope as the contract describes it, else null (nothing is stored); its events that break it are dropped and counted. */
export function parseBatch(text: string): Batch | null {
  const b = objectOf(text, ['app', 'os', 'device', 'lang', 'session', 'events'])
  const meta = b && metaOf(b)
  if (!b || !meta) return null
  if (typeof b.lang !== 'string' || !(LANGS as readonly string[]).includes(b.lang) || typeof b.session !== 'string' || !UUID.test(b.session)) return null
  if (!Array.isArray(b.events) || b.events.length < 1 || b.events.length > MAX_EVENTS) return null
  const events = b.events.map(parseEvent).filter((e): e is AppEvent => e !== null)
  return { ...meta, lang: b.lang, session: b.session.toLowerCase(), events, dropped: b.events.length - events.length }
}

export const eventPoint = (b: Batch, e: AppEvent, country: string, test: boolean) => ({
  blobs: [e.t, e.path, e.screen, e.shop, e.href, e.name, e.kind, b.app, b.os, b.device, b.lang, country, b.session, test ? '1' : '', ''],
  doubles: [e.value, e.at],
  indexes: [b.session],
})

export async function appEventsRoute(req: Request, env: TelemetryEnv, now: Date): Promise<Response> {
  const refused = gate(req, Boolean(env.APP_EVENTS && env.DB && env.ACCOUNT_HMAC_KEY))
  if (refused) return refused
  const text = await readCapped(req, MAX_BODY)
  if (text === null) return fail(413, 'too_large')
  const batch = parseBatch(text)
  if (!batch) return fail(400, 'bad_request')
  if (!(await allowed(req, env, 'events', now))) return fail(429, 'rate_limited')
  const country = countryOf(req)
  const test = isOurCopy(req)
  for (const e of batch.events) env.APP_EVENTS!.writeDataPoint(eventPoint(batch, e, country, test))
  return done({ stored: batch.events.length, dropped: batch.dropped })
}
