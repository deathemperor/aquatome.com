import { hmac } from './accounts/session'
import { ipOf } from './accounts/ratelimit'
import { bearerOk } from './dashboard'
import { isOwnerVisit } from './owner'

/**
 * Who a beacon event (/_e) comes from, when it isn't a reader. It's kept in the event (blob1) instead of being dropped,
 * so the readers page counts what it leaves out (readers.ts). One marked event makes its whole tab ours (ae.ts WHO_RANK):
 * no reader count reads a tab with a mark.
 * - owner: the owner's flag cookie (owner.ts).
 * - team: a browser of ours that has been marked (`/_e?us=on`: the preview panel, the leads' Chrome profiles), or a page
 *   opened with `aqcheck=1` in its address (what our app copies hand to Safari, apps/ios OwnCopy): the beacon's request
 *   carries the page's address as its Referer, and that view marks its tab. Nothing is set in the browser, so a shared
 *   link with it costs one tab, not a reader.
 * - net: our own network, the Mac the agents, simulators and preview browser run on, as its scheduled job last reported
 *   it (scripts/install-our-network-schedule.sh). Only a keyed hash of the address is kept, in KV, and only while the job
 *   keeps reporting it: the Mac is a laptop, so a network it leaves is a reader's again within NET_FOR_MS.
 * - app: a web page inside the App Store app (its web view says AquaTomeApp/): a reader, counted with the app's reads.
 * Our own automated checks (AquaTomeCheck/) are dropped with the bots (bots.ts), as before.
 */
export type Who = '' | 'owner' | 'team' | 'net' | 'app'
export const US_REASONS = ['owner', 'team', 'net'] as const

export const US_COOKIE_NAME = 'aq_us'
const US_COOKIE = `${US_COOKIE_NAME}=1; Path=/; Max-Age=31536000; Secure; SameSite=Lax`
const US_CLEAR = `${US_COOKIE_NAME}=; Path=/; Max-Age=0; Secure; SameSite=Lax`
/** The mark in a page's address, `aqcheck=1` in its query: the beacon's request carries the page's address as its Referer. */
export const US_PARAM = ['aqcheck', '1'] as const

/**
 * The KV key for our network's hashes, and how long one stays ours after the job last reported it: more than its 10
 * minutes between reports, KV's 5-minute read cache and a minute to spread, and short, as a café's address isn't ours long.
 */
export const NET_KEY = 'us:networks'
export const NET_FOR_MS = 25 * 60_000
type Nets = { h: string; seen: number }[]
export type UsEnv = { AB?: KVNamespace; ACCOUNT_HMAC_KEY?: string; AB_DASH_TOKEN?: string }

const netHash = (req: Request, key: string) => hmac(key, `our-network|${ipOf(req)}`)
const markedPage = (referer: string | null) => {
  try { return referer ? new URL(referer).searchParams.get(US_PARAM[0]) === US_PARAM[1] : false } catch { return false }
}
const hasUsCookie = (req: Request) => new RegExp(`(?:^|;\\s*)${US_COOKIE_NAME}=1`).test(req.headers.get('cookie') ?? '')

async function ourNetworks(env: UsEnv, now: number): Promise<string[]> {
  const nets = await env.AB?.get<Nets>(NET_KEY, { type: 'json', cacheTtl: 300 }).catch(() => null)
  return (nets ?? []).filter(n => now - n.seen < NET_FOR_MS).map(n => n.h)
}

/** The mark of an event that isn't a reader's (above), or '' for a reader's. */
export async function whoIs(req: Request, env: UsEnv, now = Date.now()): Promise<Who> {
  if (isOwnerVisit(req)) return 'owner'
  if (hasUsCookie(req) || markedPage(req.headers.get('referer'))) return 'team'
  if (env.ACCOUNT_HMAC_KEY) {
    const nets = await ourNetworks(env, now)
    if (nets.length && nets.includes(await netHash(req, env.ACCOUNT_HMAC_KEY))) return 'net'
  }
  if (/\bAquaTomeApp\//.test(req.headers.get('user-agent') ?? '')) return 'app'
  return ''
}

/**
 * POST /_ab/our-network (the dashboard token as a bearer): the Mac's scheduled job says "this address is ours". The
 * address is the request's own; only its keyed hash is kept, with when it was last reported: a KV write a report, six an hour.
 */
export async function ourNetworkRoute(req: Request, env: UsEnv, now = Date.now()): Promise<Response> {
  const json = (status: number, body: unknown) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
  if (req.method !== 'POST' || !bearerOk(req, env.AB_DASH_TOKEN)) return new Response('Not found', { status: 404 })
  if (!env.AB || !env.ACCOUNT_HMAC_KEY) return json(503, { error: 'not_configured' })
  const h = await netHash(req, env.ACCOUNT_HMAC_KEY)
  const nets = ((await env.AB.get<Nets>(NET_KEY, { type: 'json' })) ?? []).filter(n => now - n.seen < NET_FOR_MS)
  const others = nets.filter(n => n.h !== h)
  await env.AB.put(NET_KEY, JSON.stringify([...others, { h, seen: now }]), { expirationTtl: Math.ceil(NET_FOR_MS / 1000) + 60 })
  return json(200, { ours: true, networks: others.length + 1 })
}

const PAGE = (on: boolean) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>AquaTome: this browser</title>
<body style="font:16px/1.5 system-ui;margin:2rem auto;max-width:34rem;padding:0 1rem"><h1>${on ? 'This browser is marked as ours' : 'This browser is no longer marked'}</h1>
<p>${on ? 'Its visits to aquatome.com are left out of the reader count, and shown on the dashboard as ours. The mark lasts a year in this browser.' : 'Its visits count as a reader’s again.'}</p>
<p><a href="/_e?us=${on ? 'off' : 'on'}">${on ? 'Remove the mark' : 'Mark it again'}</a> · <a href="/">aquatome.com</a></p></body></html>`

/** GET /_e?us=on (or off): marks this browser as one of ours (the cookie above), for browsers no other mark reaches. */
export function usLinkRoute(url: URL): Response | null {
  const v = url.searchParams.get('us')
  if (v !== 'on' && v !== 'off') return null
  return new Response(PAGE(v === 'on'), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'set-cookie': v === 'on' ? US_COOKIE : US_CLEAR } })
}
