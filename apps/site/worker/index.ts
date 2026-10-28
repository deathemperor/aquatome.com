import { allocate } from './allocate'
import { isBot, resolveSkin, skinCookie } from './assign'
import { authorise, renderDashboard, type Snapshot } from './dashboard'
import { parseEvent, toDataPoint } from './events'
import { EQUAL, type Weights } from './skins'
import { queryStats } from './stats'

export interface Env {
  ASSETS: Fetcher
  AB: KVNamespace
  /** Optional until Analytics Engine is enabled on the account; events are accepted and dropped without it. */
  EVENTS?: AnalyticsEngineDataset
  STAGING?: string
  AFFILIATE_CLICK_VALUE_VND?: string
  AB_DASH_TOKEN?: string
  AE_API_TOKEN?: string
  CF_ACCOUNT_ID?: string
}
type Rewrite = (res: Response, skin: string) => Response | Promise<Response>

const htmlRewrite: Rewrite = (res, skin) => new HTMLRewriter().on('html', { element: el => { el.setAttribute('data-skin', skin) } }).transform(res)
const MAX_EVENT_BYTES = 4096

function finish(res: Response, env: Env, extra: Record<string, string> = {}): Response {
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries(extra)) out.headers.append(k, v)
  if (env.STAGING === '1') out.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return out
}

/** Beacon intake: same-origin only, skin must match the visitor's cookie, bots dropped, small bodies only. */
async function events(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405 })
  if (Number(req.headers.get('content-length') ?? 0) > MAX_EVENT_BYTES) return new Response(null, { status: 413 })
  const origin = req.headers.get('origin')
  const site = req.headers.get('sec-fetch-site')
  if ((origin && origin !== new URL(req.url).origin) || (site && site !== 'same-origin')) return new Response(null, { status: 403 })
  if (isBot(req.headers.get('user-agent'), req.headers.get('accept-language'))) return new Response(null, { status: 204 })
  const e = parseEvent((await req.text()).slice(0, MAX_EVENT_BYTES + 1))
  if (!e || e.s !== (skinCookie(req) ?? 'mix')) return new Response(null, { status: 400 })
  env.EVENTS?.writeDataPoint(toDataPoint(e))
  return new Response(null, { status: 204 })
}

export async function handle(req: Request, env: Env, rewrite: Rewrite = htmlRewrite): Promise<Response> {
  const url = new URL(req.url)
  if (url.pathname === '/_e') return events(req, env)
  if (url.pathname === '/_ab' || url.pathname === '/_ab/') {
    const auth = authorise(req, env.AB_DASH_TOKEN)
    if (!auth.ok) return finish(new Response('Not found', { status: 404 }), env)
    // Token arrived in the URL: move it into an HttpOnly cookie and drop it from the address bar/history.
    if (auth.setCookie) return new Response(null, { status: 303, headers: { location: '/_ab/', 'set-cookie': auth.setCookie, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } })
    const snap = await env.AB.get<Snapshot>('ab:stats', 'json')
    const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' }
    return new Response(renderDashboard(snap, Number(env.AFFILIATE_CLICK_VALUE_VND ?? 2000)), { headers })
  }

  // HTML is personalised: never let the browser revalidate it against the shared static ETag.
  const plain = new Request(req)
  plain.headers.delete('if-none-match')
  plain.headers.delete('if-modified-since')
  const res = await env.ASSETS.fetch(plain)
  if (!res.headers.get('content-type')?.includes('text/html')) return finish(res, env)
  const weights = async () => (await env.AB.get<Weights>('ab:weights', { type: 'json', cacheTtl: 300 })) ?? EQUAL
  const { skin, setCookie } = await resolveSkin(req, weights, Math.random())
  const body = skin === 'mix' ? res : await rewrite(res, skin)
  const extra: Record<string, string> = { Vary: 'Cookie' }
  if (setCookie) extra['Set-Cookie'] = setCookie
  const out = finish(body, env, extra)
  out.headers.set('Cache-Control', 'private, max-age=0, must-revalidate')
  out.headers.delete('etag')
  out.headers.delete('last-modified')
  return out
}

export default {
  fetch: (req: Request, env: Env) => handle(req, env),

  /** Daily: recompute traffic allocation from the last 14 days of events. */
  async scheduled(_: ScheduledController, env: Env): Promise<void> {
    if (!env.AE_API_TOKEN || !env.CF_ACCOUNT_ID) return
    const stats = await queryStats(env.CF_ACCOUNT_ID, env.AE_API_TOKEN)
    const weights = allocate(stats, Math.random)
    await env.AB.put('ab:weights', JSON.stringify(weights))
    await env.AB.put('ab:stats', JSON.stringify({ updatedAt: new Date().toISOString(), weights, stats } satisfies Snapshot))
  },
} satisfies ExportedHandler<Env>
