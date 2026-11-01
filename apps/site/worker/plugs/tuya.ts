/**
 * Tuya's cloud, for Smart Life and Tuya Smart strips (docs/smart-plugs.md): signed requests with the project's keys, a
 * token kept while it lasts, a linked user's plugs with their outlets, and switching one outlet.
 * Signing: https://developer.tuya.com/en/docs/iot/new-singnature (the tests use its two worked examples).
 * Nothing here logs: errors carry Tuya's code only, never a token, a body or an id.
 */
export type TuyaKeys = { host: string; id: string; secret: string }
export type Outlet = { code: string; on: boolean | null }
export type Plug = { provider: 'tuya'; id: string; name: string; model?: string; online: boolean; outlets: Outlet[] }

/** Tuya refused or failed. `code`: Tuya's error code, or 0 when the answer wasn't Tuya's. */
export class TuyaError extends Error {
  constructor(readonly code: number) { super(`tuya ${code}`) }
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
const enc = new TextEncoder()

/** Tuya's request signature: HMAC-SHA256 of client id, token (not for token requests), time, nonce and the request. */
export async function sign(o: { id: string; secret: string; t: string; nonce: string; token?: string; method: string; path: string; body?: string; headers?: [string, string][] }): Promise<string> {
  const [p, q] = o.path.split('?') as [string, string | undefined]
  const query = q ? `?${q.split('&').sort((a, b) => (a.split('=')[0]! < b.split('=')[0]! ? -1 : 1)).join('&')}` : ''
  const stringToSign = [
    o.method,
    hex(await crypto.subtle.digest('SHA-256', enc.encode(o.body ?? ''))),
    (o.headers ?? []).map(([k, v]) => `${k}:${v}\n`).join(''),
    p + query,
  ].join('\n')
  const key = await crypto.subtle.importKey('raw', enc.encode(o.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(o.id + (o.token ?? '') + o.t + o.nonce + stringToSign))).toUpperCase()
}

/** An outlet's switch: switch, switch_1…, switch_usb1… (not switch_led, a plug's indicator light). */
const OUTLET = /^switch(?:_\d+|_usb\d+)?$/
const outletsOf = (status: unknown): Outlet[] =>
  (Array.isArray(status) ? status : [])
    .filter((s): s is { code: string; value: boolean } => OUTLET.test(String(s?.code)) && typeof s?.value === 'boolean')
    .map(s => ({ code: s.code, on: s.value }))

/** Tokens by project, kept across requests while this worker instance lives. */
const tokens = new Map<string, { value: string; until: number }>()
/**
 * Plug lists by project and user, kept this long: the makers limit calls (docs/smart-plugs.md). A switch through
 * AquaTome forgets its user's list.
 */
const KEEP_MS = 15_000
const lists = new Map<string, { plugs: Plug[]; at: number }>()

/** Token expired, invalid, or in an invalid state: get a new one and ask again (once). Tuya refuses these before acting. */
const STALE_TOKEN = new Set([1010, 1011, 1012])

export function tuyaCloud(keys: TuyaKeys, o: { fetch?: typeof fetch; now?: () => number; nonce?: () => string } = {}) {
  const fetcher = o.fetch ?? fetch
  const now = o.now ?? Date.now
  const nonce = o.nonce ?? (() => crypto.randomUUID().replaceAll('-', ''))

  async function send<T>(method: string, path: string, body: unknown, token?: string): Promise<T> {
    const t = String(now()), n = nonce(), text = body === undefined ? '' : JSON.stringify(body)
    const headers: Record<string, string> = {
      client_id: keys.id, t, nonce: n, sign_method: 'HMAC-SHA256',
      sign: await sign({ id: keys.id, secret: keys.secret, t, nonce: n, token, method, path, body: text }),
      ...(token ? { access_token: token } : {}),
      ...(text ? { 'content-type': 'application/json' } : {}),
    }
    const res = await fetcher(keys.host + path, { method, headers, ...(text ? { body: text } : {}) })
    const j = (await res.json().catch(() => undefined)) as { success?: boolean; result?: T; code?: number } | undefined
    if (!j?.success) throw new TuyaError(Number(j?.code) || 0)
    return j.result as T
  }

  async function token(): Promise<string> {
    const kept = tokens.get(keys.id)
    if (kept && kept.until > now()) return kept.value
    const r = await send<{ access_token: string; expire_time: number }>('GET', '/v1.0/token?grant_type=1', undefined)
    // A minute's margin, so a token isn't used as it runs out.
    tokens.set(keys.id, { value: r.access_token, until: now() + (r.expire_time - 60) * 1000 })
    return r.access_token
  }

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      return await send<T>(method, path, body, await token())
    } catch (e) {
      if (!(e instanceof TuyaError) || !STALE_TOKEN.has(e.code)) throw e
      tokens.delete(keys.id)
      return send<T>(method, path, body, await token())
    }
  }

  return {
    /**
     * The plugs of a Tuya user (a Smart Life account linked to the project): devices with at least one outlet. Kept for
     * KEEP_MS; `fresh` asks Tuya now.
     */
    async plugs(uid: string, o: { fresh?: boolean } = {}): Promise<Plug[]> {
      const key = `${keys.id}|${uid}`, kept = lists.get(key)
      if (!o.fresh && kept && now() - kept.at < KEEP_MS) return kept.plugs
      const list = await call<Record<string, unknown>[]>('GET', `/v1.0/users/${encodeURIComponent(uid)}/devices`)
      const plugs = (Array.isArray(list) ? list : []).flatMap(d => {
        const outlets = outletsOf(d.status)
        if (!outlets.length || typeof d.id !== 'string') return []
        const model = d.product_name ?? d.productName
        return [{ provider: 'tuya' as const, id: d.id, name: String(d.name ?? ''), ...(typeof model === 'string' && model ? { model } : {}), online: Boolean(d.online ?? d.isOnline), outlets }]
      })
      lists.set(key, { plugs, at: now() })
      return plugs
    },
    /** Drops a user's kept list (after a switch). */
    forget(uid: string) { lists.delete(`${keys.id}|${uid}`) },
    /** An outlet's state as the device last reported it; null when it isn't in the device's status. */
    async outlet(deviceId: string, code: string): Promise<boolean | null> {
      const status = await call<unknown>('GET', `/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/status`)
      return outletsOf(status).find(x => x.code === code)?.on ?? null
    },
    /** Sends one switch command. Tuya accepting it doesn't mean the plug switched: read the outlet back. */
    async switchOutlet(deviceId: string, code: string, on: boolean): Promise<void> {
      await call('POST', `/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/commands`, { commands: [{ code, value: on }] })
    },
  }
}
export type TuyaCloud = ReturnType<typeof tuyaCloud>
