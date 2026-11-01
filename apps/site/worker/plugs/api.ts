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
export type PlugsDeps = { tuya?: TuyaCloud }

export function plugsDeps(env: PlugsEnv): PlugsDeps {
  return env.TUYA_HOST && env.TUYA_ACCESS_ID && env.TUYA_ACCESS_SECRET
    ? { tuya: tuyaCloud({ host: env.TUYA_HOST, id: env.TUYA_ACCESS_ID, secret: env.TUYA_ACCESS_SECRET }) }
    : {}
}

const PROVIDERS = ['tuya', 'ewelink'] as const
type ProviderId = (typeof PROVIDERS)[number]
const MINUTE_MS = 60_000
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } })
const fail = (error: string, status: number) => json({ error }, status)

export async function plugs(req: Request, url: URL, env: PlugsEnv, now: Date, deps: PlugsDeps = plugsDeps(env)): Promise<Response> {
  if (!accountsOn(env, req)) return fail('accounts_off', 404)
  const db = env.DB
  const parts = url.pathname.replace(/\/$/, '').split('/').slice(4) // after /api/v1/plugs
  const provider = parts[0] as ProviderId | undefined
  if (provider !== undefined && !PROVIDERS.includes(provider)) return fail('unknown_provider', 404)

  // The maker's sign-in page sends the reader back here, without AquaTome's session. No maker lets every account
  // link yet, so no link was started: there is no state to match.
  if (req.method === 'GET' && parts.length === 2 && parts[1] === 'callback') return fail('bad_state', 400)

  const session = await sessionOf(req, db, now)
  if (!session) return fail('signed_out', 401)
  if (req.method !== 'GET' && !sameSiteOk(req, tokenOf(req)?.via === 'cookie')) return fail('cross_site', 403)
  const linkOf = (p: ProviderId) =>
    db.prepare(`SELECT provider_uid FROM plug_links WHERE user_id = ? AND provider = ?`).bind(session.userId, p).first<{ provider_uid: string }>()

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
          all.push(...(await cloud.plugs(link.provider_uid)))
        } catch {
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
    if (req.method === 'POST') {
      if (provider !== 'tuya' || !deps.tuya) return fail('not_configured', 503)
      if (await linkOf(provider)) return fail('already_linked', 409)
      return fail('not_available', 403)
    }
  }

  // POST /api/v1/plugs/{provider}/devices/{device}/outlets/{code} {on}
  if (req.method === 'POST' && parts.length === 5 && parts[1] === 'devices' && parts[3] === 'outlets' && provider) {
    const deviceId = decodeURIComponent(parts[2]!), code = decodeURIComponent(parts[4]!)
    const body = await req.json().catch(() => undefined) as { on?: unknown } | undefined
    if (typeof body?.on !== 'boolean' || !deviceId || deviceId.length > 64 || !code || code.length > 40) return fail('bad_request', 400)
    if (provider !== 'tuya' || !deps.tuya) return fail('not_configured', 503)
    const link = await linkOf(provider)
    if (!link) return fail('not_linked', 404)
    if (!(await allow(db, env.ACCOUNT_HMAC_KEY, `plug-switch|${session.userId}`, 30, MINUTE_MS, now))) return fail('rate_limited', 429)
    const tuya = deps.tuya
    try {
      // Only this account's plugs, and only an outlet the plug has.
      const plug = (await tuya.plugs(link.provider_uid)).find(d => d.id === deviceId)
      if (!plug) return fail('no_such_plug', 404)
      if (!plug.outlets.some(x => x.code === code)) return fail('no_such_outlet', 404)
      if (!plug.online) return fail('offline', 409)
      await tuya.switchOutlet(deviceId, code, body.on)
    } catch {
      return fail('maker_error', 502)
    }
    // What the plug reports now, which may not have caught up yet; null if it can't be read.
    const on = await tuya.outlet(deviceId, code).catch(() => null)
    return json({ outlet: { code, on } })
  }

  return fail('not_found', 404)
}
