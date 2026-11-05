import { decodeProtectedHeader, jwtVerify } from 'jose'
import { afterEach, expect, test, vi } from 'vitest'
import { addDevice, devices, notification, providerToken, pushReport, removeDevices, TOKENS_KEY, type Device } from '../daily/push'
import { DEFAULT_SETTINGS, getSettings, setSettings, settingsChange, SETTINGS_KEY } from '../daily/settings'

afterEach(() => { vi.restoreAllMocks() })

const NOW = new Date('2026-11-06T00:00:05Z')
const A = 'a1'.repeat(32)
const B = 'b2'.repeat(32)
const C = 'c3'.repeat(32)

function kv() {
  const m = new Map<string, string>()
  const ns = {
    get: async (k: string, t?: string) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)!) : m.get(k)) : null),
    put: async (k: string, v: string) => { m.set(k, v) },
  } as unknown as KVNamespace
  return { m, ns }
}
/** A P-256 key made for the test, as Apple's .p8 holds one (PKCS #8, PEM). */
async function p8() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')
  return { pem: `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`, pub: pair.publicKey }
}

// ——— Settings ———

test('the settings: email on and push off until set; one or both switches at a time, nothing else', async () => {
  const k = kv()
  expect(await getSettings(k.ns)).toEqual({ email: true, push: false })
  expect(DEFAULT_SETTINGS).toEqual({ email: true, push: false })
  expect(await setSettings(k.ns, { push: true })).toEqual({ settings: { email: true, push: true }, changed: true })
  expect(await setSettings(k.ns, { push: true })).toEqual({ settings: { email: true, push: true }, changed: false })
  expect(await setSettings(k.ns, { email: false, push: false })).toEqual({ settings: { email: false, push: false }, changed: true })
  expect(JSON.parse(k.m.get(SETTINGS_KEY)!)).toEqual({ email: false, push: false })
  // A stored value of another shape reads as the defaults, switch by switch.
  k.m.set(SETTINGS_KEY, JSON.stringify({ email: 'no', push: true }))
  expect(await getSettings(k.ns)).toEqual({ email: true, push: true })
  for (const ok of [{ email: true }, { push: false }, { email: false, push: true }]) expect(settingsChange(ok)).toEqual(ok)
  for (const bad of [undefined, null, 'x', [], {}, { email: 1 }, { push: 'true' }, { email: true, quiet: true }]) expect(settingsChange(bad), JSON.stringify(bad)).toBeUndefined()
})

// ——— Phones ———

test('a phone\'s token: kept once, its time moved at each launch; past ten phones the one seen longest ago goes; removed by DELETE or APNs', async () => {
  const k = kv()
  expect(await addDevice(k.ns, A, 'production', NOW)).toBe(true)
  expect(await addDevice(k.ns, A, 'production', new Date(NOW.getTime() + 60_000))).toBe(false)
  expect(await devices(k.ns)).toEqual({ [A]: { environment: 'production', seen: '2026-11-06T00:01:05.000Z' } })
  for (let i = 0; i < 11; i++) await addDevice(k.ns, i.toString(16).padStart(2, '0').repeat(32), 'sandbox', new Date(NOW.getTime() + (i + 2) * 60_000))
  const kept = await devices(k.ns)
  expect(Object.keys(kept)).toHaveLength(10)
  expect(kept).not.toHaveProperty([A])
  expect(kept).not.toHaveProperty(['00'.repeat(32)])
  expect(await removeDevices(k.ns, ['0a'.repeat(32), C])).toBe(true)
  expect(await removeDevices(k.ns, [C])).toBe(false)
  expect(Object.keys(await devices(k.ns))).toHaveLength(9)
})

// ——— What APNs gets ———

test('the provider token: ES256 with the key\'s id, the team as issuer and the time, nothing else; signed by the .p8', async () => {
  const { pem, pub } = await p8()
  const jwt = await providerToken({ teamId: 'TEAM123456', keyId: 'KEY1234567', key: pem }, NOW)
  expect(decodeProtectedHeader(jwt)).toEqual({ alg: 'ES256', kid: 'KEY1234567' })
  const { payload } = await jwtVerify(jwt, pub, { algorithms: ['ES256'] })
  expect(payload).toEqual({ iss: 'TEAM123456', iat: Math.floor(NOW.getTime() / 1000) })
  // JWS's raw r‖s, 64 bytes, as APNs reads ES256.
  expect(Buffer.from(jwt.split('.')[2]!, 'base64url')).toHaveLength(64)
})

test('the notification: "AquaTome", the subject and the first thing that needs care, one thread, and the report\'s page on aquatome.com', () => {
  expect(notification({ subject: 'AquaTome daily · 6 Nov · 2 need care', first: 'engine.yml failing since 5 Nov' }, '1001')).toEqual({
    aps: { alert: { title: 'AquaTome', body: 'AquaTome daily · 6 Nov · 2 need care\nengine.yml failing since 5 Nov' }, 'thread-id': 'daily-report' },
    url: 'https://aquatome.com/_ab/bao-cao/1001/',
  })
  expect(notification({ subject: 'AquaTome daily · 6 Nov · nothing needs care' }, '7').aps.alert.body).toBe('AquaTome daily · 6 Nov · nothing needs care')
  const long = notification({ subject: 's', first: 'x'.repeat(1000) }, '7').aps.alert.body
  expect([long.length, long.endsWith('…')]).toEqual([400, true])
})

type Call = { url: string; init: RequestInit }
function apns(answer: (token: string) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return answer(url.split('/').at(-1)!)
  })
  return { calls, fetcher }
}
const phones = async (k: ReturnType<typeof kv>, xs: [string, Device['environment']][]) => { for (const [t, e] of xs) await addDevice(k.ns, t, e, NOW) }
const REPORT = { subject: 'AquaTome daily · 6 Nov · 2 need care', first: 'engine.yml failing' }

test('a report pushed: one alert to each phone, at its environment\'s host, with the provider token, the app\'s topic and the report as its collapse id', async () => {
  const { pem, pub } = await p8()
  const env = { APNS_KEY: pem, APNS_KEY_ID: 'KEY1234567', APPLE_TEAM_ID: 'TEAM123456' }
  const k = kv()
  await phones(k, [[A, 'production'], [B, 'sandbox']])
  const a = apns(() => new Response(null, { status: 200 }))
  expect(await pushReport(env, k.ns, REPORT, '1001', NOW, a.fetcher)).toEqual({ sent: 2 })
  expect(a.calls.map(c => c.url).sort()).toEqual([`https://api.push.apple.com/3/device/${A}`, `https://api.sandbox.push.apple.com/3/device/${B}`])
  for (const c of a.calls) {
    const h = c.init.headers as Record<string, string>
    expect(c.init.method).toBe('POST')
    expect({ ...h, authorization: undefined }).toEqual({ authorization: undefined, 'apns-topic': 'com.aquatome.app', 'apns-push-type': 'alert', 'apns-collapse-id': 'daily-report-1001', 'content-type': 'application/json' })
    expect(h.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/)
    await jwtVerify(h.authorization!.slice('bearer '.length), pub)
    expect(JSON.parse(c.init.body as string)).toEqual(notification(REPORT, '1001'))
  }
  // One token for the whole report.
  expect(new Set(a.calls.map(c => (c.init.headers as Record<string, string>).authorization)).size).toBe(1)
})

test('no key, a key that can\'t be read, or no phone: nothing sent, and why', async () => {
  const k = kv()
  const a = apns(() => new Response(null, { status: 200 }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await phones(k, [[A, 'production']])
  for (const env of [{}, { APNS_KEY: 'k', APNS_KEY_ID: 'K' }, { APNS_KEY: 'k', APPLE_TEAM_ID: 'T' }, { APNS_KEY_ID: 'K', APPLE_TEAM_ID: 'T' }]) {
    expect(await pushReport(env, k.ns, REPORT, '1', NOW, a.fetcher), JSON.stringify(env)).toEqual({ sent: 0, why: 'no_apns_key' })
  }
  expect(await pushReport({ APNS_KEY: 'not a key', APNS_KEY_ID: 'K', APPLE_TEAM_ID: 'T' }, k.ns, REPORT, '1', NOW, a.fetcher)).toEqual({ sent: 0, why: 'bad_apns_key' })
  const { pem } = await p8()
  expect(await pushReport({ APNS_KEY: pem, APNS_KEY_ID: 'K', APPLE_TEAM_ID: 'T' }, kv().ns, REPORT, '1', NOW, a.fetcher)).toEqual({ sent: 0, why: 'no_device' })
  expect(a.fetcher).not.toHaveBeenCalled()
})

test('APNs\' answers: 410 and BadDeviceToken drop the phone; another refusal keeps it and says why; neither a token nor the key reaches the log', async () => {
  const { pem } = await p8()
  const env = { APNS_KEY: pem, APNS_KEY_ID: 'KEY1234567', APPLE_TEAM_ID: 'TEAM123456' }
  const lines: unknown[][] = []
  for (const m of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation((...x: unknown[]) => { lines.push(x) })
  const reason = (status: number, r: string) => Response.json({ reason: r }, { status })

  // One gone, one with a token for the other environment, one taken.
  const k = kv()
  await phones(k, [[A, 'production'], [B, 'production'], [C, 'sandbox']])
  const a = apns(t => (t === A ? reason(410, 'Unregistered') : t === B ? reason(400, 'BadDeviceToken') : new Response(null, { status: 200 })))
  expect(await pushReport(env, k.ns, REPORT, '1', NOW, a.fetcher)).toEqual({ sent: 1 })
  expect(Object.keys(await devices(k.ns))).toEqual([C])

  // Every phone gone: no phone left.
  const a2 = apns(() => reason(410, 'Unregistered'))
  expect(await pushReport(env, k.ns, REPORT, '1', NOW, a2.fetcher)).toEqual({ sent: 0, why: 'no_device' })
  expect(k.m.get(TOKENS_KEY)).toBe('{}')

  // Refused for another reason, no reason, or no answer: kept, and why.
  for (const [answer, why] of [[() => reason(403, 'InvalidProviderToken'), 'InvalidProviderToken'], [() => new Response('<html>', { status: 502 }), 'http_502'], [() => reason(400, `bad ${A}`), 'http_400'], [() => Promise.reject(new Error(`down ${A}`)), 'network']] as [() => Promise<Response>, string][]) {
    const x = kv()
    await phones(x, [[A, 'production'], [B, 'production']])
    const f = apns(t => (t === B ? new Response(null, { status: 200 }) : answer()))
    expect(await pushReport(env, x.ns, REPORT, '1', NOW, f.fetcher), why).toEqual({ sent: 1, why })
    expect(Object.keys(await devices(x.ns)), why).toEqual([A, B])
  }
  // Dropping a phone that can't be written: what was sent is still said.
  const y = kv()
  await phones(y, [[A, 'production'], [B, 'production']])
  const ro = Object.assign(Object.create(y.ns), { put: async () => { throw new Error('KV down') } }) as KVNamespace
  expect(await pushReport(env, ro, REPORT, '1', NOW, apns(t => (t === A ? reason(410, 'Unregistered') : new Response(null, { status: 200 }))).fetcher)).toEqual({ sent: 1 })

  const logged = JSON.stringify(lines)
  for (const secret of [A, B, C, pem.split('\n')[1]!]) expect(logged).not.toContain(secret)
})
