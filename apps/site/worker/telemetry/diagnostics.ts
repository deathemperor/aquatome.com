import { readCapped } from '../comments/api'
import { allowed, APP, countryOf, done, fail, gate, isOurCopy, metaOf, objectOf, type Meta, type TelemetryEnv } from './shared'

/**
 * POST /api/v1/app/diagnostics (protocols/app-telemetry.openapi.json): one MetricKit payload in the app's wrapper. The
 * request is kept as received in the private uploads bucket (diagnostics/, deleted after 30 days by the bucket's
 * lifecycle rule), and its summary goes to Analytics Engine for the dashboard.
 */

export const MAX_BODY = 1024 * 1024
export type Report = Meta & { kind: 'metric' | 'diagnostic'; payload: Record<string, unknown> }

export function parseReport(text: string): Report | null {
  const r = objectOf(text, ['kind', 'app', 'os', 'device', 'payload'])
  const meta = r && metaOf(r)
  if (!r || !meta || (r.kind !== 'metric' && r.kind !== 'diagnostic')) return null
  const payload = obj(r.payload)
  return payload ? { ...meta, kind: r.kind, payload } : null
}

const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined)

/** Units to milliseconds, and to megabytes (Foundation's: a kB is 1000 bytes). Lower case. */
const MS: Record<string, number> = { µs: 0.001, us: 0.001, ms: 1, msec: 1, s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000, min: 60_000, h: 3_600_000, hr: 3_600_000 }
const MB: Record<string, number> = { b: 1e-6, byte: 1e-6, bytes: 1e-6, kb: 1e-3, mb: 1, gb: 1000 }

/** "200,000", "1.5", "1,5", "1.234,5" → a number: the last of a dot and a comma is the decimal mark; a comma before three digits groups. */
function decimal(s: string): number | undefined {
  let t = s.replace(/[\s  ]/g, '')
  const dot = t.lastIndexOf('.')
  const comma = t.lastIndexOf(',')
  if (dot >= 0 && comma >= 0) t = dot > comma ? t.replace(/,/g, '') : t.replace(/\./g, '').replace(',', '.')
  else if (comma >= 0) t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.')
  const n = Number(t)
  return t && Number.isFinite(n) && n >= 0 ? n : undefined
}

/** A MetricKit measurement in `units`' base unit: a number (already in it), or a string such as "1,000 ms", "20 sec", "200,000 kB". */
export function measure(v: unknown, units: Record<string, number>): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : undefined
  const m = typeof v === 'string' ? /^\s*(\d[\d.,\s  ]*?)\s*([^\d\s.,]*)\s*$/.exec(v) : null
  if (!m) return undefined
  const factor = m[2] ? units[m[2].toLowerCase()] : 1
  const n = decimal(m[1]!)
  return factor === undefined || n === undefined ? undefined : n * factor
}

/** A histogram's median (the middle of the bucket it falls in, ms) and its count. Buckets come as an object of "0", "1"… or a list. */
function histogram(h: unknown): { median: number; count: number } | undefined {
  const raw = obj(h)?.histogramValue
  const buckets = (Array.isArray(raw) ? raw : Object.values(obj(raw) ?? {})).flatMap(b => {
    const o = obj(b)
    const n = Number(o?.bucketCount)
    const start = measure(o?.bucketStart, MS)
    const end = measure(o?.bucketEnd, MS)
    return n > 0 && start !== undefined && end !== undefined ? [{ n, start, mid: (start + end) / 2 }] : []
  }).sort((a, b) => a.start - b.start)
  const count = buckets.reduce((s, b) => s + b.n, 0)
  let seen = 0
  for (const b of buckets) if ((seen += b.n) >= count / 2) return { median: b.mid, count }
  return undefined
}

export type Summary = { app: string; test: boolean; crashes: number; hangs: number; launchMs: number; launches: number; peakMB: number; exits: number }
const DIAGNOSTICS = ['crashDiagnostics', 'hangDiagnostics', 'cpuExceptionDiagnostics', 'diskWriteExceptionDiagnostics', 'appLaunchDiagnostics']
const count = (v: unknown) => (Array.isArray(v) ? v.length : 0)

/**
 * What the dashboard needs from a payload, read defensively (names and units vary between iOS versions; 0 for what it
 * doesn't say). The version is the payload's own when it gives one (a crash delivered after an update is the old
 * version's), else the app's.
 */
export function summarise(r: Report): Summary {
  const p = r.payload
  const first = DIAGNOSTICS.flatMap(k => (Array.isArray(p[k]) ? (p[k] as unknown[]) : [])).map(obj)[0]
  const meta = r.kind === 'metric' ? obj(p.metaData) : obj(first?.diagnosticMetaData)
  const own = `${p.appVersion ?? meta?.appVersion} (${meta?.appBuildVersion})`
  const launch = obj(p.applicationLaunchMetrics) ?? {}
  const draws = Object.keys(launch).filter(k => /timetofirstdraw/i.test(k))
  const firstDraw = histogram(launch[draws.find(k => !/optimized/i.test(k)) ?? draws[0] ?? ''])
  const foreground = obj(obj(p.applicationExitMetrics)?.foregroundExitData) ?? {}
  return {
    app: APP.test(own) ? own : r.app,
    test: meta?.isTestFlightApp === true,
    crashes: count(p.crashDiagnostics),
    hangs: count(p.hangDiagnostics),
    launchMs: firstDraw?.median ?? 0,
    launches: firstDraw?.count ?? 0,
    peakMB: measure(obj(p.memoryMetrics)?.peakMemoryUsage, MB) ?? 0,
    exits: Object.entries(foreground).filter(([k]) => /exitcount$/i.test(k) && !/normalappexit/i.test(k)).reduce((s, [, v]) => s + (measure(v, {}) ?? 0), 0),
  }
}

export const reportPoint = (r: Report, s: Summary, id: string, key: string, country: string, test: boolean) => ({
  blobs: [r.kind, '', '', '', '', '', '', s.app, r.os, r.device, '', country, '', test || s.test ? '1' : '', key],
  doubles: [1, 0, s.crashes, s.hangs, s.launchMs, s.launches, s.peakMB, s.exits],
  indexes: [id],
})

export async function appDiagnosticsRoute(req: Request, env: TelemetryEnv, now: Date): Promise<Response> {
  const refused = gate(req, Boolean(env.APP_EVENTS && env.UPLOADS && env.DB && env.ACCOUNT_HMAC_KEY))
  if (refused) return refused
  const text = await readCapped(req, MAX_BODY)
  if (text === null) return fail(413, 'too_large')
  const report = parseReport(text)
  if (!report) return fail(400, 'bad_request')
  if (!(await allowed(req, env, 'diagnostics', now))) return fail(429, 'rate_limited')
  const id = crypto.randomUUID()
  const key = `diagnostics/${now.toISOString().slice(0, 10)}/${report.kind}/${id}.json`
  await env.UPLOADS!.put(key, text, { httpMetadata: { contentType: 'application/json' } })
  env.APP_EVENTS!.writeDataPoint(reportPoint(report, summarise(report), id, key, countryOf(req), isOurCopy(req)))
  return done({ id })
}
