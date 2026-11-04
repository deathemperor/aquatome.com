import { allow, ipOf } from '../accounts/ratelimit'

/**
 * The iOS app's telemetry (protocols/app-telemetry.openapi.json): its anonymous events (events.ts) and the MetricKit
 * reports iOS collects for it (diagnostics.ts). Never an account, a cookie, an IP or a name: the app sends none, and the
 * Worker reads neither the Authorization header nor the cookie. The rate limit counts a keyed hash of the address
 * (accounts/ratelimit.ts), kept until its hour is over and gone at the next daily purge.
 *
 * One Analytics Engine dataset, aquatome_app (binding APP_EVENTS), keeps both for about 3 months.
 * Events: blob1 t (view, scroll, time, aff, action), blob2 path, blob3 screen, blob4 shop, blob5 href, blob6 action
 * name, blob7 kind; double1 the value (1 for a view or a shop tap, the depth, the seconds, an action's ok as 1 or 0),
 * double2 at (ms since the session started); index the session.
 * Reports: blob1 'metric' or 'diagnostic', blob15 the raw report's key in the private bucket; double1 1, double3 crashes,
 * double4 hangs, double5 launch time (the report's median, ms), double6 launches it counted, double7 peak memory (MB),
 * double8 foreground exits that weren't normal; index the report's id. 0 where a report doesn't say.
 * Both: blob8 app ("1.0 (114)"), blob9 os, blob10 device, blob11 lang (events), blob12 country, blob13 session (events),
 * blob14 '1' for our own copies (a test build), else ''.
 * Counts read through _sample_interval, as the other datasets do.
 */
export type TelemetryEnv = { APP_EVENTS?: AnalyticsEngineDataset; DB?: D1Database; ACCOUNT_HMAC_KEY?: string; UPLOADS?: R2Bucket }

export const APP = /^\d{1,4}(\.\d{1,4}){0,3} \(\d{1,9}\)$/
const OS = /^\d{1,3}(\.\d{1,3}){0,3}$/
const DEVICE = /^[A-Za-z][A-Za-z0-9,_]{1,31}$/
export type Meta = { app: string; os: string; device: string }
/** The app's own fields, as the contract's patterns allow them. */
export function metaOf(o: Record<string, unknown>): Meta | null {
  const { app, os, device } = o
  if (typeof app !== 'string' || !APP.test(app) || typeof os !== 'string' || !OS.test(os) || typeof device !== 'string' || !DEVICE.test(device)) return null
  return { app, os, device }
}
/** A JSON object whose keys are all in `keys`, else null. */
export function objectOf(text: string, keys: readonly string[]): Record<string, unknown> | null {
  let v: unknown
  try { v = JSON.parse(text) } catch { return null }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return Object.keys(v).every(k => keys.includes(k)) ? (v as Record<string, unknown>) : null
}

/** Our own copies of the app (debug and TestFlight builds) carry this mark, as for wanted names and shop links (apps/ios OwnCopy). */
export const isOurCopy = (req: Request) => /AquaTomeCheck\//.test(req.headers.get('user-agent') ?? '')
export const countryOf = (req: Request) => String((req as { cf?: { country?: string } }).cf?.country ?? '')

export const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } })
export const done = (body: unknown) => Response.json(body, { status: 202, headers: { 'cache-control': 'no-store' } })

/** Batches of events and reports an hour per address (an IPv6 /64 is one): many phones share one carrier address. */
export const PER_HOUR = { events: 600, diagnostics: 60 } as const
const HOUR_MS = 3_600_000

/** What every request must be before its body is read: a POST, set up, from the app (no Origin), JSON. */
export function gate(req: Request, live: boolean): Response | null {
  if (req.method !== 'POST') return fail(405, 'method')
  if (!live) return fail(503, 'telemetry_off')
  if (req.headers.has('origin')) return fail(403, 'cross_origin')
  if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '')) return fail(415, 'json')
  return null
}

/** Counts the request against its address's hour; false once over. */
export const allowed = (req: Request, env: TelemetryEnv, what: keyof typeof PER_HOUR, now: Date) =>
  allow(env.DB!, env.ACCOUNT_HMAC_KEY!, `app-${what}|${ipOf(req)}`, PER_HOUR[what], HOUR_MS, now)
