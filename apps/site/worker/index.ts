import { allocate } from './allocate'
import { resolveSkin } from './assign'
import { authorise, renderDashboard, type Snapshot } from './dashboard'
import { parseEvent, toDataPoint } from './events'
import { EQUAL, type Weights } from './skins'
import { queryStats } from './stats'

export interface Env {
  ASSETS: Fetcher
  AB: KVNamespace
  EVENTS: AnalyticsEngineDataset
  STAGING?: string
  AFFILIATE_CLICK_VALUE_VND?: string
  AB_DASH_TOKEN?: string
  AE_API_TOKEN?: string
  CF_ACCOUNT_ID?: string
}

function finish(res: Response, env: Env, extra: Record<string, string> = {}): Response {
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries(extra)) out.headers.append(k, v)
  if (env.STAGING === '1') out.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return out
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/_e') {
      if (req.method !== 'POST') return new Response(null, { status: 405 })
      const e = parseEvent(await req.text())
      if (!e) return new Response(null, { status: 400 })
      env.EVENTS.writeDataPoint(toDataPoint(e))
      return new Response(null, { status: 204 })
    }
    if (url.pathname === '/_ab' || url.pathname === '/_ab/') {
      const auth = authorise(req, env.AB_DASH_TOKEN)
      if (!auth.ok) return finish(new Response('Not found', { status: 404 }), env)
      const snap = await env.AB.get<Snapshot>('ab:stats', 'json')
      const headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' }
      if (auth.setCookie) headers['set-cookie'] = auth.setCookie
      return new Response(renderDashboard(snap, Number(env.AFFILIATE_CLICK_VALUE_VND ?? 2000)), { headers })
    }

    const res = await env.ASSETS.fetch(req)
    if (!res.headers.get('content-type')?.includes('text/html')) return finish(res, env)
    const weights = (await env.AB.get<Weights>('ab:weights', { type: 'json', cacheTtl: 300 })) ?? EQUAL
    const { skin, setCookie } = resolveSkin(req, weights, Math.random())
    const body = skin === 'mix' ? res : new HTMLRewriter().on('html', { element: el => { el.setAttribute('data-skin', skin) } }).transform(res)
    const extra: Record<string, string> = { Vary: 'Cookie' }
    if (setCookie) extra['Set-Cookie'] = setCookie
    const out = finish(body, env, extra)
    out.headers.set('Cache-Control', 'private, max-age=0, must-revalidate')
    return out
  },

  /** Daily: recompute traffic allocation from the last 14 days of events. */
  async scheduled(_: ScheduledController, env: Env): Promise<void> {
    if (!env.AE_API_TOKEN || !env.CF_ACCOUNT_ID) return
    const stats = await queryStats(env.CF_ACCOUNT_ID, env.AE_API_TOKEN)
    const weights = allocate(stats, Math.random)
    await env.AB.put('ab:weights', JSON.stringify(weights))
    await env.AB.put('ab:stats', JSON.stringify({ updatedAt: new Date().toISOString(), weights, stats } satisfies Snapshot))
  },
} satisfies ExportedHandler<Env>
