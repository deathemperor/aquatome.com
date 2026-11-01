import { accountsOn, type AccountsEnv } from '../accounts/api'
import { allow } from '../accounts/ratelimit'
import { sameSiteOk, sessionOf, tokenOf } from '../accounts/session'
import { tuyaCloud, TuyaError, type TuyaCloud } from './tuya'

/**
 * /api/v1/plugs/*: a reader's smart plugs (protocols/plugs.openapi.json, docs/smart-plugs.md). Needs a signed-in account,
 * as the rest of /api/v1. Switches an outlet only when asked to here: nothing switches on its own.
 *
 * Tuya: the project's keys (TUYA_HOST, TUYA_ACCESS_ID, TUYA_ACCESS_SECRET). Linking for every reader isn't open yet: a
 * link is a plug_links row made by hand for a Smart Life account linked to the project in Tuya's console.
 * eWeLink: not yet (its developer account is under review).
 */
export type PlugsEnv = AccountsEnv & { TUYA_HOST?: string; TUYA_ACCESS_ID?: string; TUYA_ACCESS_SECRET?: string }
/** `wait`: between read-backs; `makerMs`: a maker's time to answer (tests shorten both). */
export type PlugsDeps = { tuya?: TuyaCloud; wait?: (ms: number) => Promise<void>; makerMs?: number }

export function plugsDeps(env: PlugsEnv): PlugsDeps {
  return env.TUYA_HOST && env.TUYA_ACCESS_ID && env.TUYA_ACCESS_SECRET
    ? { tuya: tuyaCloud({ host: env.TUYA_HOST, id: env.TUYA_ACCESS_ID, secret: env.TUYA_ACCESS_SECRET }) }
    : {}
}

/** A maker's time to answer, before it counts as unreachable. */
const MAKER_MS = 8_000
/** After a switch: read the outlet back this often (eWeLink allows a call per 500 ms), for up to this long. */
const READ_EVERY_MS = 600, READ_FOR_MS = 3_000

const PROVIDERS = ['tuya', 'ewelink'] as const
type ProviderId = (typeof PROVIDERS)[number]
const MINUTE_MS = 60_000
/** A maker failed: its code only (an expired trial or wrong keys look like an outage otherwise), never ids or tokens. */
const logFailure = (e: unknown) => console.error('plugs: tuya', e instanceof TuyaError ? e.code : (e as Error)?.name)
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } })
const fail = (error: string, status: number) => json({ error }, status)

export async function plugs(req: Request, url: URL, env: PlugsEnv, now: Date, deps: PlugsDeps = plugsDeps(env)): Promise<Response> {
  if (!accountsOn(env, req)) return fail('accounts_off', 404)
  const db = env.DB
  const parts = url.pathname.replace(/\/$/, '').split('/').slice(4) // after /api/v1/plugs
  const provider = parts[0] as ProviderId | undefined
  if (provider !== undefined && !PROVIDERS.includes(provider)) return fail('unknown_provider', 404)

  // The maker's sign-in page sends the reader back here, without AquaTome's session. No maker lets every account
  // link yet, so no link was started and no state can match: back to the site's "Bể của tôi" (the contract's
  // always-redirect rule), with the result.
  if (req.method === 'GET' && parts.length === 2 && parts[1] === 'callback') {
    return new Response(null, { status: 302, headers: { location: `/vi/cong-cu/be-cua-toi/?provider=${provider}&result=failed`, 'cache-control': 'no-store' } })
  }

  const session = await sessionOf(req, db, now)
  if (!session) return fail('signed_out', 401)
  if (req.method !== 'GET' && !sameSiteOk(req, tokenOf(req)?.via === 'cookie')) return fail('cross_site', 403)
  const linkOf = (p: ProviderId) =>
    db.prepare(`SELECT provider_uid FROM plug_links WHERE user_id = ? AND provider = ?`).bind(session.userId, p).first<{ provider_uid: string }>()
  const timeLimit = <T>(p: Promise<T>) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    return Promise.race([p, new Promise<never>((_, no) => { timer = setTimeout(() => no(new TuyaError(0)), deps.makerMs ?? MAKER_MS) })]).finally(() => clearTimeout(timer))
  }

  if (req.method === 'GET' && parts.length === 0) {
    if (!(await allow(db, env.ACCOUNT_HMAC_KEY, `plugs|${session.userId}`, 60, MINUTE_MS, now))) return fail('rate_limited', 429)
    const providers = [], all = []
    for (const p of PROVIDERS) {
      const link = await linkOf(p)
      // Linking isn't open to every account for either maker yet (docs/smart-plugs.md).
      const out: { id: ProviderId; linked: boolean; available: boolean; problem?: 'unreachable' } = { id: p, linked: Boolean(link), available: false }
      if (link) {
        const cloud = p === 'tuya' ? deps.tuya : undefined
        try {
          if (!cloud) throw new TuyaError(0)
          all.push(...(await timeLimit(cloud.plugs(link.provider_uid))))
        } catch (e) {
          logFailure(e)
          out.problem = 'unreachable'
        }
      }
      providers.push(out)
    }
    return json({ providers, plugs: all })
  }

  if (parts.length === 2 && parts[1] === 'link' && provider) {
    if (req.method === 'DELETE') {
      await db.prepare(`DELETE FROM plug_links WHERE user_id = ? AND provider = ?`).bind(session.userId, provider).run()
      return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
    }
    // Linking (or linking again) isn't open to every account for either maker yet (docs/smart-plugs.md).
    if (req.method === 'POST') return provider === 'tuya' && deps.tuya ? fail('not_available', 403) : fail('not_configured', 503)
  }
  // The app finishing a link: no link can have been started yet, so no ticket is good.
  if (req.method === 'POST' && parts.length === 3 && parts[1] === 'link' && parts[2] === 'complete') return fail('bad_ticket', 400)

  // POST /api/v1/plugs/{provider}/devices/{device}/outlets/{code} {on}
  if (req.method === 'POST' && parts.length === 5 && parts[1] === 'devices' && parts[3] === 'outlets' && provider) {
    let deviceId = '', code = ''
    try { deviceId = decodeURIComponent(parts[2]!); code = decodeURIComponent(parts[4]!) } catch { return fail('bad_request', 400) }
    const body = await req.json().catch(() => undefined) as { on?: unknown } | undefined
    if (typeof body?.on !== 'boolean' || !deviceId || deviceId.length > 64 || !code || code.length > 40) return fail('bad_request', 400)
    if (provider !== 'tuya' || !deps.tuya) return fail('not_configured', 503)
    const link = await linkOf(provider)
    if (!link) return fail('not_linked', 404)
    if (!(await allow(db, env.ACCOUNT_HMAC_KEY, `plug-switch|${session.userId}`, 30, MINUTE_MS, now))) return fail('rate_limited', 429)
    const tuya = deps.tuya
    try {
      // Only this account's plugs, as they are now, and only an outlet the plug has.
      const plug = (await timeLimit(tuya.plugs(link.provider_uid, { fresh: true }))).find(d => d.id === deviceId)
      if (!plug) return fail('no_such_plug', 404)
      if (!plug.outlets.some(x => x.code === code)) return fail('no_such_outlet', 404)
      if (!plug.online) return fail('offline', 409)
      await timeLimit(tuya.switchOutlet(deviceId, code, body.on))
    } catch (e) {
      logFailure(e)
      return fail('maker_error', 502)
    } finally {
      tuya.forget(link.provider_uid)
    }
    // Read back until the plug reports the state asked for, or READ_FOR_MS passes; null if it can't be read.
    const wait = deps.wait ?? (ms => new Promise(r => setTimeout(r, ms)))
    let on: boolean | null = null
    for (let waited = 0; ; waited += READ_EVERY_MS) {
      await wait(READ_EVERY_MS)
      on = await tuya.outlet(deviceId, code).catch(() => null)
      if (on === body.on || waited + READ_EVERY_MS >= READ_FOR_MS) break
    }
    return json({ outlet: { code, on }, confirmed: on === body.on })
  }

  return fail('not_found', 404)
}
