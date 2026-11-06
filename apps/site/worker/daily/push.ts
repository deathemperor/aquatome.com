import { importPKCS8, SignJWT } from 'jose'
import { REPORT_PATH } from '../admin/shell'
import { dashboardUrl } from '../paths'

/**
 * The daily report as a notification on the owner's phones, through Apple's push service (APNs). The app registers each
 * phone (POST /api/owner/push-token, the owner's app session only); the tokens live in KV `AB` under one key with the
 * environment the app was built for, the last time the phone said so, and the session it said so in (sessions.id, the
 * bearer's hash, never the bearer). A session can end without the app saying so (it expires, it's signed out on the
 * web, the phone is offline at sign-out), so each report first drops the phones whose session isn't the owner's live
 * app session any more, as /api/owner/* would judge it. APNs answering 410, or 400 BadDeviceToken, drops one too.
 *
 * Sent from the Worker's fetch. APNs takes HTTP/2 only, and workerd has no HTTP/2 client, but in production a Worker's
 * subrequest goes through Cloudflare's proxy, which speaks HTTP/2 to the origin (workerd issue #4841, from the runtime's
 * lead; users report APNs working from deployed Workers). Cloudflare's docs don't say so, and `wrangler dev` can't reach
 * APNs; the log row of each report says what APNs answered.
 *
 * The key: an APNs auth key (.p8, the Worker secret APNS_KEY) and its id (APNS_KEY_ID), with the team the site's Apple
 * sign-in already names (APPLE_TEAM_ID). Without them nothing is sent, and the log says so. Neither a key nor a token
 * is ever logged.
 */
export type PushEnv = { APNS_KEY?: string; APNS_KEY_ID?: string; APPLE_TEAM_ID?: string }
export type Environment = 'sandbox' | 'production'
/** `session`: the id (sessions.id) of the app session that registered it last. */
export type Device = { environment: Environment; seen: string; session: string }
/**
 * What a report's push did: how many phones took it; how many were dropped (their session ended, or APNs no longer knows
 * them), which isn't a refusal; and why not (or why not all) when that's so.
 */
export type PushOutcome = { sent: number; dropped?: number; why?: string }
/** Which of these sessions are still the owner's live app sessions (dashboard.ts liveOwnerApps). */
export type LiveSessions = (ids: string[]) => Promise<Set<string>>
type ApnsKeys = { teamId: string; keyId: string; key: string }

export const TOKENS_KEY = 'push-tokens'
/** The app's bundle id, the topic of its notifications. */
export const TOPIC = 'com.aquatome.app'
/** The owner's phones and tablets: past this many, the one seen longest ago goes. */
const MAX_DEVICES = 10
/** A device token as the app sends it: lowercase hex, of a length Apple doesn't fix (32 bytes today). */
const TOKEN = /^(?:[0-9a-f]{2}){16,100}$/
const HOST: Record<Environment, string> = { production: 'https://api.push.apple.com', sandbox: 'https://api.sandbox.push.apple.com' }
const MAX_BODY = 400

export const apnsKeys = (env: PushEnv): ApnsKeys | undefined =>
  env.APNS_KEY && env.APNS_KEY_ID && env.APPLE_TEAM_ID ? { teamId: env.APPLE_TEAM_ID, keyId: env.APNS_KEY_ID, key: env.APNS_KEY } : undefined

export async function devices(kv: KVNamespace): Promise<Record<string, Device>> {
  return (await kv.get<Record<string, Device>>(TOKENS_KEY, 'json')) ?? {}
}

/** POST's body: a token and its environment; DELETE's: the token alone. Undefined when it isn't that. */
export function tokenBody(body: unknown, withEnvironment: boolean): { token: string; environment?: Environment } | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined
  const { token, environment, ...rest } = body as Record<string, unknown>
  if (Object.keys(rest).length || typeof token !== 'string' || !TOKEN.test(token)) return undefined
  if (!withEnvironment) return environment === undefined ? { token } : undefined
  return environment === 'sandbox' || environment === 'production' ? { token, environment } : undefined
}

/**
 * A phone's token, as the app sends it at each launch while its row is on: kept once, with the time and the session it
 * came in (a new session's post moves it there). `changed`: a token new here, or its environment or session changed;
 * false when only the time moved.
 */
export async function addDevice(kv: KVNamespace, token: string, environment: Environment, session: string, now: Date): Promise<boolean> {
  const all = await devices(kv)
  const was = all[token]
  const changed = was?.environment !== environment || was.session !== session
  all[token] = { environment, seen: now.toISOString(), session }
  const kept = Object.entries(all).sort((a, b) => b[1].seen.localeCompare(a[1].seen)).slice(0, MAX_DEVICES)
  await kv.put(TOKENS_KEY, JSON.stringify(Object.fromEntries(kept)))
  return changed
}

/** Drops tokens; true when one of them was kept. */
export async function removeDevices(kv: KVNamespace, tokens: string[]): Promise<boolean> {
  const all = await devices(kv)
  const there = tokens.filter(t => Object.hasOwn(all, t))
  if (!there.length) return false
  for (const t of there) delete all[t]
  await kv.put(TOKENS_KEY, JSON.stringify(all))
  return true
}

/** APNs' provider token: ES256 over the team and the time, the key's id in its header. Good for an hour; one a report. */
export async function providerToken(k: ApnsKeys, now: Date): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: k.keyId })
    .setIssuer(k.teamId)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .sign(await importPKCS8(k.key, 'ES256'))
}

/** The notification: the report's subject and the first thing that needs care; a tap opens the report on the dashboard. */
export function notification(r: { subject: string; first?: string }, id: string) {
  const body = [r.subject, r.first].filter(Boolean).join('\n')
  return {
    aps: { alert: { title: 'AquaTome', body: body.length > MAX_BODY ? `${body.slice(0, MAX_BODY - 1)}…` : body }, 'thread-id': 'daily-report' },
    url: dashboardUrl(`${REPORT_PATH}${id}/`),
  }
}

/** APNs' reason (`BadDeviceToken`…), or the status when it gives none: nothing else of an answer reaches the log. */
const reasonOf = (reason: unknown, status: number) => (typeof reason === 'string' && /^[A-Za-z]{1,40}$/.test(reason) ? reason : `http_${status}`)
type Fetch = (url: string, init: RequestInit) => Promise<Response>

/**
 * Sends one alert to each phone registered in a live session of the owner's. `id`: the report's, which also collapses a
 * second send of it into the first. Phones whose session ended, and those APNs no longer knows, are dropped and counted
 * so, not as refused.
 */
export async function pushReport(env: PushEnv, kv: KVNamespace, r: { subject: string; first?: string }, id: string, now: Date, live: LiveSessions, fetcher: Fetch = (u, i) => fetch(u, i)): Promise<PushOutcome> {
  const keys = apnsKeys(env)
  if (!keys) return { sent: 0, why: 'no_apns_key' }
  const all = Object.entries(await devices(kv))
  if (!all.length) return { sent: 0, why: 'no_device' }
  let alive: Set<string>
  try {
    alive = await live([...new Set(all.map(([, d]) => d.session).filter(Boolean))])
  } catch {
    console.error('daily report push: the sessions could not be read')
    return { sent: 0, why: 'sessions_unread' }
  }
  const ended = all.filter(([, d]) => !alive.has(d.session)).map(([t]) => t)
  const phones = all.filter(([, d]) => alive.has(d.session))
  if (!phones.length) return finish(kv, 0, ended, [], 'no_device')
  let jwt: string
  try {
    jwt = await providerToken(keys, now)
  } catch {
    console.error('daily report push: the APNs key could not be read')
    return { sent: 0, why: 'bad_apns_key' }
  }
  const body = JSON.stringify(notification(r, id))
  const results = await Promise.all(phones.map(async ([token, d]) => {
    try {
      const res = await fetcher(`${HOST[d.environment]}/3/device/${token}`, {
        method: 'POST', body,
        headers: { authorization: `bearer ${jwt}`, 'apns-topic': TOPIC, 'apns-push-type': 'alert', 'apns-collapse-id': `daily-report-${id}`, 'content-type': 'application/json' },
      })
      if (res.ok) return { token, ok: true }
      const reason = reasonOf(await res.json().then(b => (b as { reason?: unknown })?.reason, () => undefined), res.status)
      return { token, ok: false, gone: res.status === 410 || reason === 'BadDeviceToken', why: reason }
    } catch {
      return { token, ok: false, why: 'network' }
    }
  }))
  const sent = results.filter(x => x.ok).length
  const refused = results.filter(x => !x.ok && !x.gone)
  if (refused.length) console.error('daily report push refused:', refused.map(x => x.why).join(', '))
  return finish(kv, sent, ended, results.filter(x => x.gone).map(x => x.token), refused[0]?.why ?? (sent ? undefined : 'no_device'))
}

/** Drops the phones whose session ended or APNs no longer knows, and says what the push did. */
async function finish(kv: KVNamespace, sent: number, ended: string[], gone: string[], why: string | undefined): Promise<PushOutcome> {
  const dropped = [...ended, ...gone]
  // Sent is sent: a token not dropped now is dropped by the next report.
  if (dropped.length) await removeDevices(kv, dropped).catch(() => console.error('daily report push: dropped phones not removed'))
  return { sent, ...(dropped.length ? { dropped: dropped.length } : {}), ...(why ? { why } : {}) }
}
