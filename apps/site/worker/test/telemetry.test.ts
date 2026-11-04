import { expect, test } from 'vitest'
import { handle, type Env } from '../index'
import { parseEvent } from '../telemetry/events'
import { measure, summarise, parseReport } from '../telemetry/diagnostics'
import { PER_HOUR } from '../telemetry/shared'
import { contract } from './contract'
import { testD1 } from './d1'

const { misfits, answer } = contract('app-telemetry.openapi.json')
const schema = (name: string) => ({ $ref: `#/components/schemas/${name}` })

type Point = { blobs: string[]; doubles: number[]; indexes: string[] }
function env(over: Partial<Record<string, unknown>> = {}) {
  const points: Point[] = []
  const objects = new Map<string, { body: string; type?: string }>()
  const e = {
    ASSETS: { fetch: async () => new Response('x') }, AB: { get: async () => null, put: async () => {} },
    APP_EVENTS: { writeDataPoint: (p: Point) => { points.push(p) } },
    UPLOADS: { put: async (key: string, body: string, o?: { httpMetadata?: { contentType?: string } }) => { objects.set(key, { body, type: o?.httpMetadata?.contentType }) } },
    DB: testD1(), ACCOUNT_HMAC_KEY: 'test-key', ...over,
  } as unknown as Env
  return { e, points, objects }
}
const APP_UA = 'AquaTome/114 CFNetwork/3860.100.1 Darwin/25.0.0'
const OURS_UA = 'AquaTome-iOS AquaTomeCheck/1'
function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  const r = new Request(`https://x.test${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', 'user-agent': APP_UA, 'cf-connecting-ip': '203.0.113.7', ...headers } })
  return Object.assign(r, { cf: { country: 'VN' } })
}
const EVENTS = '/api/v1/app/events'
const DIAGNOSTICS = '/api/v1/app/diagnostics'

const SESSION = 'E621E1F8-C36C-495A-93FC-0C247A3E6E5F'
const SHOP_LINK = `/go/shopee/?${new URLSearchParams({ k: 'cá neon', c: 'thuc-an', e: 'species:paracheirodon-axelrodi' })}`
/** One of each event the contract describes. */
const EACH = [
  { t: 'view', at: 0, path: '/vi/ca/ca-neon-vua/' },
  { t: 'view', at: 1200, screen: 'lights' },
  { t: 'scroll', at: 4000, path: '/vi/ca/ca-neon-vua/', depth: 50 },
  { t: 'time', at: 30_000, path: '/vi/ca/ca-neon-vua/', seconds: 30 },
  { t: 'aff', at: 31_000, path: '/vi/ca/ca-neon-vua/', shop: 'shopee', href: SHOP_LINK },
  { t: 'action', at: 40_000, name: 'light.connect', ok: false, kind: 'timeout' },
  { t: 'action', at: 41_000, name: 'fishid', ok: true, kind: 'fish' },
  { t: 'action', at: 42_000, name: 'tank.add', ok: true },
  { t: 'view', at: 43_000, path: '/th/video/channel/PLrlvf56gZy-guXb--pBvqVYxFP2mJBQjR/' }, // a video series' id keeps its case
]
const BATCH = { app: '1.0 (114)', os: '26.5', device: 'iPhone17,3', lang: 'vi', session: SESSION, events: EACH }

test('every sample in this file is what the contract describes, and its refusals are not', () => {
  expect(misfits(BATCH, schema('Batch'))).toEqual([])
  for (const e of EACH) expect(misfits(e, schema('Event')), JSON.stringify(e)).toEqual([])
  expect(misfits(METRIC, schema('Report'))).toEqual([])
  expect(misfits(DIAGNOSTIC, schema('Report'))).toEqual([])
  expect(misfits({ telemetry: true, fish: [] }, schema('AppConfig'))).toEqual([])
  // A shop that isn't the link's: the contract says so in words, the Worker checks it.
  for (const bad of BAD_EVENTS.filter(b => b !== OTHER_SHOP)) expect(misfits(bad, schema('Event')), JSON.stringify(bad)).not.toEqual([])
  for (const bad of [{ ...BATCH, events: [] }, { ...BATCH, events: Array(101).fill(EACH[0]) }, { ...BATCH, country: 'VN' }, { ...BATCH, session: 'abc' }])
    expect(misfits(bad, schema('Batch'))).not.toEqual([])
})

const OTHER_SHOP = { t: 'aff', at: 0, path: '/vi/', shop: 'lazada', href: SHOP_LINK }
/** Events the Worker drops one by one, as the contract refuses them. */
const BAD_EVENTS = [
  { t: 'view', at: 0 }, // neither path nor screen
  { t: 'view', at: 0, path: '/vi/', screen: 'lights' }, // both
  { t: 'view', at: 0, path: 'https://evil.example/vi/' },
  { t: 'view', at: 0, path: '/en/fish/' },
  { t: 'view', at: 0, path: '/vi/ca/x/?q=1' },
  { t: 'view', at: 0, path: `/vi/${'a'.repeat(200)}/` },
  { t: 'view', at: 0, screen: 'Lights' },
  { t: 'view', at: 0, screen: 'a-screen-name-far-too-long' },
  { t: 'view', at: -1, path: '/vi/' },
  { t: 'view', at: 1.5, path: '/vi/' },
  { t: 'view', path: '/vi/' },
  { t: 'view', at: 0, path: '/vi/', user: 'x' }, // a field the contract doesn't list
  { t: 'scroll', at: 0, path: '/vi/', depth: 60 },
  { t: 'scroll', at: 0, path: '/vi/', depth: 75 }, // the site's marks only: 50 and 90
  { t: 'time', at: 0, path: '/vi/', seconds: 0 },
  { t: 'time', at: 0, path: '/vi/', seconds: 45 }, // the site's marks only: 30, 60, 180
  OTHER_SHOP,
  { t: 'aff', at: 0, path: '/vi/', shop: 'shopee', href: 'https://shopee.vn/x' },
  { t: 'aff', at: 0, path: '/vi/', shop: 'shopee', href: '/go/shopee/?k=<script>' },
  { t: 'action', at: 0, name: 'light.delete', ok: true },
  { t: 'action', at: 0, name: 'fishid', ok: 'yes' },
  { t: 'action', at: 0, name: 'fishid', ok: false, kind: 'x'.repeat(41) },
  { t: 'action', at: 0, name: 'fishid', ok: false, kind: 'Timeout' },
  { t: 'buy', at: 0, path: '/vi/' },
  null, 'view', [],
]

test('events: each a data point with the app, its country and its session; nothing tied to a cookie or an account', async () => {
  const { e, points } = env()
  const r = await handle(post(EVENTS, BATCH, { cookie: '__Host-aq_session=abcdefghijklmnopqrstuvwxyz', authorization: 'Bearer abcdefghijklmnopqrstuvwxyz' }), e)
  expect(await answer(EVENTS, 'post', r)).toEqual({ stored: EACH.length, dropped: 0 })
  expect(r.status).toBe(202)
  expect(r.headers.get('set-cookie')).toBeNull()
  const s = SESSION.toLowerCase()
  const meta = ['1.0 (114)', '26.5', 'iPhone17,3', 'vi', 'VN', s, '', '']
  expect(points.map(p => [p.blobs.slice(0, 7), p.doubles, p.indexes])).toEqual([
    [['view', '/vi/ca/ca-neon-vua/', '', '', '', '', ''], [1, 0], [s]],
    [['view', '', 'lights', '', '', '', ''], [1, 1200], [s]],
    [['scroll', '/vi/ca/ca-neon-vua/', '', '', '', '', ''], [50, 4000], [s]],
    [['time', '/vi/ca/ca-neon-vua/', '', '', '', '', ''], [30, 30_000], [s]],
    [['aff', '/vi/ca/ca-neon-vua/', '', 'shopee', SHOP_LINK, '', ''], [1, 31_000], [s]],
    [['action', '', '', '', '', 'light.connect', 'timeout'], [0, 40_000], [s]],
    [['action', '', '', '', '', 'fishid', 'fish'], [1, 41_000], [s]],
    [['action', '', '', '', '', 'tank.add', ''], [1, 42_000], [s]],
    [['view', '/th/video/channel/PLrlvf56gZy-guXb--pBvqVYxFP2mJBQjR/', '', '', '', '', ''], [1, 43_000], [s]],
  ])
  for (const p of points) {
    expect(p.blobs.slice(7)).toEqual(meta)
    expect(p.blobs).toHaveLength(15) // Analytics Engine takes 20 at most
    expect(p.blobs.join('').length).toBeLessThan(16_000)
  }
})

test('events: one that breaks the contract is dropped alone and counted; the others are kept', async () => {
  for (const bad of BAD_EVENTS) expect(parseEvent(bad), JSON.stringify(bad)).toBeNull()
  const { e, points } = env()
  const r = await handle(post(EVENTS, { ...BATCH, events: [EACH[0], ...BAD_EVENTS, EACH[1]] }), e)
  expect(await answer(EVENTS, 'post', r)).toEqual({ stored: 2, dropped: BAD_EVENTS.length })
  expect(points.map(p => p.blobs[0])).toEqual(['view', 'view'])
})

test('events: an envelope the contract doesn\'t describe is refused whole, and nothing is written', async () => {
  const { e, points } = env()
  const bad: unknown[] = [
    'not json', 'null', '[]', { ...BATCH, events: [] }, { ...BATCH, events: Array(101).fill(EACH[0]) }, { ...BATCH, events: 'x' },
    { ...BATCH, country: 'VN' }, { ...BATCH, user: 'a@b.c' }, { ...BATCH, session: 'not-a-uuid' }, { ...BATCH, lang: 'en' },
    { ...BATCH, app: '1.0' }, { ...BATCH, os: 'iOS 26.5' }, { ...BATCH, device: 'iPhone 17 Pro' }, { app: BATCH.app },
  ]
  for (const body of bad) {
    const r = await handle(post(EVENTS, body), e)
    expect(await answer(EVENTS, 'post', r), String(JSON.stringify(body)).slice(0, 80)).toEqual({ error: 'bad_request' })
  }
  // 100 events is the most a batch takes (Analytics Engine: 250 points a request).
  const full = await handle(post(EVENTS, { ...BATCH, events: Array(100).fill(EACH[0]) }), e)
  expect(await answer(EVENTS, 'post', full)).toEqual({ stored: 100, dropped: 0 })
  expect(points).toHaveLength(100)
})

test('events and reports: only the app\'s way in (a POST of JSON, no Origin), body size capped, off without the server\'s parts', async () => {
  const { e, points, objects } = env()
  for (const path of [EVENTS, DIAGNOSTICS]) {
    const body = path === EVENTS ? BATCH : METRIC
    expect(await answer(path, 'post', await handle(post(path, body, { origin: 'https://evil.example' }), e))).toEqual({ error: 'cross_origin' })
    expect(await answer(path, 'post', await handle(post(path, body, { origin: 'https://x.test' }), e))).toEqual({ error: 'cross_origin' })
    expect(await answer(path, 'post', await handle(post(path, body, { 'content-type': 'text/plain' }), e))).toEqual({ error: 'json' })
    expect(await answer(path, 'post', await handle(new Request(`https://x.test${path}`), e))).toEqual({ error: 'method' })
    for (const off of ['APP_EVENTS', 'DB', 'ACCOUNT_HMAC_KEY', ...(path === DIAGNOSTICS ? ['UPLOADS'] : [])])
      expect(await answer(path, 'post', await handle(post(path, body), env({ [off]: undefined }).e)), off).toEqual({ error: 'telemetry_off' })
  }
  // Over the cap, whether or not the client says its length.
  const padded = JSON.stringify({ ...BATCH, events: Array(100).fill({ ...EACH[4], href: `/go/shopee/?k=${'a'.repeat(290)}` }) }) + ' '.repeat(40_000)
  expect(padded.length).toBeGreaterThan(64 * 1024)
  expect(await answer(EVENTS, 'post', await handle(post(EVENTS, padded), e))).toEqual({ error: 'too_large' })
  const stream = (s: string) => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(s)); c.close() } })
  const chunked = new Request(`https://x.test${EVENTS}`, { method: 'POST', body: stream(padded), headers: { 'content-type': 'application/json' }, duplex: 'half' } as RequestInit)
  expect(await answer(EVENTS, 'post', await handle(chunked, e))).toEqual({ error: 'too_large' })
  const huge = JSON.stringify({ ...METRIC, payload: { ...METRIC.payload, pad: 'x'.repeat(1024 * 1024) } })
  expect(await answer(DIAGNOSTICS, 'post', await handle(post(DIAGNOSTICS, huge), e))).toEqual({ error: 'too_large' })
  expect(points).toEqual([])
  expect(objects.size).toBe(0)
})

test('events and reports: our own copies (debug and TestFlight builds) are stored, marked as tests', async () => {
  const { e, points } = env()
  await handle(post(EVENTS, BATCH, { 'user-agent': OURS_UA }), e)
  await handle(post(DIAGNOSTICS, DIAGNOSTIC, { 'user-agent': OURS_UA }), e)
  await handle(post(EVENTS, BATCH), e)
  await handle(post(DIAGNOSTICS, DIAGNOSTIC), e)
  expect(points.map(p => p.blobs[13])).toEqual([...EACH.map(() => '1'), '1', ...EACH.map(() => ''), ''])
  // A report iOS says comes from a TestFlight build is a test too, whatever the User-Agent.
  const tf = { ...METRIC, payload: { ...METRIC.payload, metaData: { ...METRIC.payload.metaData, isTestFlightApp: true } } }
  await handle(post(DIAGNOSTICS, tf), e)
  expect(points.at(-1)!.blobs[13]).toBe('1')
})

test('events and reports: each address has its hour (an IPv6 /64 is one), apart from the other route\'s and the other addresses\'', async () => {
  const { e, points } = env()
  const one = { ...BATCH, events: [EACH[0]] }
  const v6 = (n: number) => ({ 'cf-connecting-ip': `2001:db8:1:2::${n}` })
  for (let i = 0; i < PER_HOUR.events; i++) expect((await handle(post(EVENTS, one, v6(i)), e)).status).toBe(202)
  expect(await answer(EVENTS, 'post', await handle(post(EVENTS, one, v6(9999)), e))).toEqual({ error: 'rate_limited' })
  expect(points).toHaveLength(PER_HOUR.events)
  expect((await handle(post(EVENTS, one, { 'cf-connecting-ip': '2001:db8:1:3::1' }), e)).status).toBe(202)
  expect((await handle(post(DIAGNOSTICS, METRIC, v6(1)), e)).status).toBe(202)
  // An hour later, the address starts again.
  const later = new Date(Date.now() + 3_600_001)
  const { appEventsRoute } = await import('../telemetry/events')
  expect((await appEventsRoute(post(EVENTS, one, v6(1)), e, later)).status).toBe(202)
  // Reports: 60 an hour.
  for (let i = 1; i < PER_HOUR.diagnostics; i++) expect((await handle(post(DIAGNOSTICS, METRIC, v6(i)), e)).status).toBe(202)
  expect(await answer(DIAGNOSTICS, 'post', await handle(post(DIAGNOSTICS, METRIC, v6(1)), e))).toEqual({ error: 'rate_limited' })
})

// ——— MetricKit ———

/** An MXMetricPayload's jsonRepresentation(), as iOS writes it: numbers as strings with units and thousands commas. */
const METRIC_PAYLOAD = {
  appVersion: '1.0', timeStampBegin: '2026-11-03 00:00:00', timeStampEnd: '2026-11-03 23:59:00', includesMultipleApplicationVersions: false,
  metaData: { appBuildVersion: '113', osVersion: 'iPhone OS 26.5 (23F79)', deviceType: 'iPhone17,3', platformArchitecture: 'arm64e', regionFormat: 'VN', isTestFlightApp: false, lowPowerModeEnabled: false, bundleIdentifier: 'com.aquatome.app' },
  applicationLaunchMetrics: {
    histogrammedOptimizedTimeToFirstDraw: { histogramNumBuckets: 1, histogramValue: { 0: { bucketCount: 9, bucketStart: '100 ms', bucketEnd: '110 ms' } } },
    histogrammedTimeToFirstDrawKey: { histogramNumBuckets: 3, histogramValue: {
      0: { bucketCount: 2, bucketStart: '1,000 ms', bucketEnd: '1,010 ms' },
      2: { bucketCount: '1', bucketStart: '2 sec', bucketEnd: '2.01 sec' },
      1: { bucketCount: 4, bucketStart: '1,200 ms', bucketEnd: '1,210 ms' },
    } },
    histogrammedApplicationResumeTime: { histogramNumBuckets: 1, histogramValue: { 0: { bucketCount: 30, bucketStart: '200 ms', bucketEnd: '210 ms' } } },
  },
  memoryMetrics: { peakMemoryUsage: '182,345 kB', averageSuspendedMemory: { averageValue: '100,000 kB', standardDeviation: 0, sampleCount: 500 } },
  applicationExitMetrics: {
    foregroundExitData: { cumulativeNormalAppExitCount: 40, cumulativeAbnormalExitCount: 2, cumulativeBadAccessExitCount: '1', cumulativeAppWatchdogExitCount: 1, cumulativeMemoryResourceLimitExitCount: 0 },
    backgroundExitData: { cumulativeMemoryPressureExitCount: 7, cumulativeNormalAppExitCount: 9 },
  },
}
const METRIC = { kind: 'metric', app: '1.0 (114)', os: '26.5', device: 'iPhone17,3', payload: METRIC_PAYLOAD }
/** An MXDiagnosticPayload's: a crash and two hangs, each with its own metadata. */
const crash = { version: '1.0.0', callStackTree: { callStacks: [], callStackPerThread: true }, diagnosticMetaData: { appVersion: '1.0', appBuildVersion: '112', osVersion: 'iPhone OS 26.5 (23F79)', deviceType: 'iPhone17,3', exceptionType: 1, signal: 11, exceptionCode: 0, isTestFlightApp: false } }
const hang = { version: '1.0.0', callStackTree: { callStacks: [] }, diagnosticMetaData: { appVersion: '1.0', appBuildVersion: '112', hangDuration: '3.5 sec' } }
const DIAGNOSTIC = { kind: 'diagnostic', app: '1.0 (114)', os: '26.5', device: 'iPhone17,3', payload: { timeStampBegin: '2026-11-03 10:00:00', timeStampEnd: '2026-11-03 10:00:00', crashDiagnostics: [crash], hangDiagnostics: [hang, hang] } }

test('MetricKit measurements: numbers with their units in any of the forms iOS writes', () => {
  const MS = { ms: 1, sec: 1000, s: 1000 }
  const MB = { kb: 1e-3, mb: 1, gb: 1000 }
  expect(measure('1,000 ms', MS)).toBe(1000)
  expect(measure('2.5 sec', MS)).toBe(2500)
  expect(measure('20s', MS)).toBe(20_000)
  expect(measure('1 000 ms', MS)).toBe(1000)
  expect(measure('182,345 kB', MB)).toBeCloseTo(182.345)
  expect(measure('1,5 MB', MB)).toBe(1.5)
  expect(measure('1.234,5 kB', MB)).toBeCloseTo(1.2345)
  expect(measure('1,234.5 KB', MB)).toBeCloseTo(1.2345)
  expect(measure(42, MS)).toBe(42)
  for (const bad of ['', 'fast', '12 parsecs', '-3 ms', null, undefined, {}, NaN]) expect(measure(bad, MS), String(bad)).toBeUndefined()
})

test('MetricKit payloads: what the dashboard needs, read defensively; the version a crash happened in is its own', () => {
  expect(summarise(parseReport(JSON.stringify(METRIC))!)).toEqual({
    app: '1.0 (113)', test: false, crashes: 0, hangs: 0,
    launchMs: 1205, launches: 7, // the cold launch's histogram, not the optimized one's: the 4th of 7 falls in 1,200–1,210 ms
    peakMB: 182.345, exits: 4, // foreground only, every exit but the normal ones
  })
  expect(summarise(parseReport(JSON.stringify(DIAGNOSTIC))!)).toMatchObject({ app: '1.0 (112)', crashes: 1, hangs: 2, launchMs: 0, peakMB: 0, exits: 0 })
  // Nothing recognised: zeros, and the app's own version.
  expect(summarise(parseReport(JSON.stringify({ ...METRIC, payload: { something: 'new', memoryMetrics: { peakMemoryUsage: 'lots' }, applicationLaunchMetrics: { histogrammedTimeToFirstDrawKey: { histogramValue: [{ bucketCount: 'x' }] } } } }))!))
    .toEqual({ app: '1.0 (114)', test: false, crashes: 0, hangs: 0, launchMs: 0, launches: 0, peakMB: 0, exits: 0 })
  for (const bad of [{ ...METRIC, kind: 'log' }, { ...METRIC, payload: [] }, { ...METRIC, payload: 'x' }, { ...METRIC, session: SESSION }, { ...METRIC, device: '' }, (({ app: _, ...m }) => m)(METRIC)])
    expect(parseReport(JSON.stringify(bad)), JSON.stringify(bad).slice(0, 60)).toBeNull()
})

test('reports: kept as received in the private bucket under diagnostics/<day>/<kind>/, with one data point each', async () => {
  // The public media bucket is never written to.
  const { e, points, objects } = env({ MEDIA: { put: async () => { throw new Error('the public bucket') } } })
  const body = JSON.stringify(DIAGNOSTIC)
  const r = await handle(post(DIAGNOSTICS, body), e)
  const { id } = await answer(DIAGNOSTICS, 'post', r) as { id: string }
  const key = `diagnostics/${new Date().toISOString().slice(0, 10)}/diagnostic/${id}.json`
  expect([...objects]).toEqual([[key, { body, type: 'application/json' }]])
  expect(points).toEqual([{
    blobs: ['diagnostic', '', '', '', '', '', '', '1.0 (112)', '26.5', 'iPhone17,3', '', 'VN', '', '', key],
    doubles: [1, 0, 1, 2, 0, 0, 0, 0],
    indexes: [id],
  }])
  await handle(post(DIAGNOSTICS, METRIC), e)
  expect(points[1]!.blobs[0]).toBe('metric')
  expect(points[1]!.doubles).toEqual([1, 0, 0, 0, 1205, 7, 182.345, 4])
  expect([...objects.keys()][1]).toMatch(/^diagnostics\/\d{4}-\d\d-\d\d\/metric\/[0-9a-f-]{36}\.json$/)
  for (const bad of ['{', JSON.stringify({ ...METRIC, kind: 'crash' })])
    expect(await answer(DIAGNOSTICS, 'post', await handle(post(DIAGNOSTICS, bad), e))).toEqual({ error: 'bad_request' })
})
