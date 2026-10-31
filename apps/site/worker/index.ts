import { upsertProducts } from './affiliate/admin'
import { runChecks } from './affiliate/check'
import { parseGo, recordClick, resolveGo } from './affiliate/go'
import { searchTarget, type AffEnv } from './affiliate/networks'
import { applyDecisions, listComments, moderationQueue, postComment, purgeRemoved, type CommentsEnv } from './comments/api'
import { isBot } from './bots'
import { apiCatalog, DISCOVERY_LINK } from './agents'
import { affSummary, authorise, renderDashboard, renderLogin, renderReaders, safeEqual } from './dashboard'
import { parseEvent, toDataPoint } from './events'
import { queryReaders } from './readers'
import { redirectFor } from './redirects'
import { gonePage, isHidden, loadHidden, pagePath, updateHidden } from './hidden'
import { OWNER_COOKIE } from './owner'
import { prefersMarkdown } from './markdown'
import { deleteRoute, listPhotos, photosAdmin, photosLive, postPhoto, recentPhotos, removePhoto } from './photos'

export interface Env {
  ASSETS: Fetcher
  AB: KVNamespace
  /** Optional until Analytics Engine is enabled on the account; events are accepted and dropped without it. */
  EVENTS?: AnalyticsEngineDataset
  STAGING?: string
  /** Production host; any other host (www, the old staging domain) 301s here. */
  CANONICAL_HOST?: string
  AB_DASH_TOKEN?: string
  AE_API_TOKEN?: string
  CF_ACCOUNT_ID?: string
  /** Hidden pages when deployed (scripts/deploy.sh), space-separated: what an isolate goes by until it has read KV. */
  HIDDEN_PAGES?: string
  /** Affiliate catalog, click counts and comments; optional until D1 is provisioned (links go to search, comments stay off). */
  DB?: D1Database
  /** Reader photos: raw uploads (private) and the public media bucket (media.aquatome.com) the screened copies go to. */
  UPLOADS?: R2Bucket
  MEDIA?: R2Bucket
}
type FullEnv = Env & AffEnv & CommentsEnv
const MAX_EVENT_BYTES = 4096

function finish(res: Response, env: Env, extra: Record<string, string> = {}): Response {
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries(extra)) out.headers.append(k, v)
  if (env.STAGING === '1') out.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return out
}

/** Beacon intake: same-origin only, bots and the owner dropped, small bodies only. */
async function events(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405 })
  if (Number(req.headers.get('content-length') ?? 0) > MAX_EVENT_BYTES) return new Response(null, { status: 413 })
  const origin = req.headers.get('origin')
  const site = req.headers.get('sec-fetch-site')
  if ((origin && origin !== new URL(req.url).origin) || (site && site !== 'same-origin')) return new Response(null, { status: 403 })
  if (isBot(req.headers.get('user-agent'), req.headers.get('accept-language'))) return new Response(null, { status: 204 })
  if (/(?:^|;\s*)aq_owner=1/.test(req.headers.get('cookie') ?? '')) return new Response(null, { status: 204 }) // the owner's own visits
  const e = parseEvent((await req.text()).slice(0, MAX_EVENT_BYTES + 1))
  if (!e) return new Response(null, { status: 400 })
  env.EVENTS?.writeDataPoint(toDataPoint(e, String((req as { cf?: { country?: string } }).cf?.country ?? '')))
  return new Response(null, { status: 204 })
}

/** /go/:network/?k=&c=&e= → 302 to the best affiliate target; click counted after the response. */
async function goRoute(req: Request, url: URL, env: FullEnv, wait: (p: Promise<unknown>) => void): Promise<Response> {
  const p = parseGo(url)
  if (!p) return finish(new Response('Not found', { status: 404 }), env)
  const now = new Date()
  let target = { location: searchTarget(p.network, p.keyword, env), productId: 'search' }
  // The catalog is an upgrade, never a dependency: any D1 problem falls back to the search link.
  if (env.DB) target = await resolveGo(p, env.DB, env, now).catch(() => target)
  const { location, productId } = target
  const human = req.method === 'GET' && !isBot(req.headers.get('user-agent'), req.headers.get('accept-language'))
  if (env.DB && human) wait(recordClick(env.DB, p, productId, now).catch(() => {}))
  return finish(new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } }), env)
}

const bearerOk = (req: Request, env: Env) => {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  return Boolean(env.AB_DASH_TOKEN) && safeEqual(token, env.AB_DASH_TOKEN!)
}

/** POST /_aff/products (Bearer dashboard token): upsert concrete listings once network accounts exist. */
async function affAdmin(req: Request, env: FullEnv): Promise<Response> {
  if (req.method !== 'POST' || !bearerOk(req, env)) return new Response('Not found', { status: 404 })
  if (!env.DB) return new Response('D1 not configured', { status: 503 })
  const body = await req.json().catch(() => null)
  if (!Array.isArray(body) || body.length > 500) return new Response('expected a JSON array (≤500)', { status: 400 })
  return Response.json(await upsertProducts(env.DB, body, new Date()))
}

/** /_c/admin/{queue,decisions} (Bearer dashboard token): the daily Claude moderation pass on the home machine. */
async function commentsAdmin(req: Request, url: URL, env: FullEnv): Promise<Response> {
  const route = url.pathname === '/_c/admin/queue' && req.method === 'GET' ? 'queue' : url.pathname === '/_c/admin/decisions' && req.method === 'POST' ? 'decisions' : null
  if (!route || !bearerOk(req, env)) return new Response('Not found', { status: 404 })
  if (!env.DB) return Response.json({ error: 'comments_off' }, { status: 503 })
  if (route === 'queue') return Response.json(await moderationQueue(env.DB, new Date()), { headers: { 'cache-control': 'no-store' } })
  const body = await req.json().catch(() => null)
  if (!Array.isArray(body) || body.length > 500) return new Response('expected a JSON array (≤500)', { status: 400 })
  return Response.json(await applyDecisions(env.DB, body, new Date()))
}

const ADMIN_HEADERS = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' }

/** The site language a browser ranks highest among ours (Accept-Language, q order); Vietnamese when none. */
export function rootLang(header: string | null): 'vi' | 'id' | 'th' {
  const ranked = (header ?? '').split(',').map((part, i) => {
    const [tag, ...params] = part.trim().toLowerCase().split(';')
    const q = Number(params.find(p => p.trim().startsWith('q='))?.split('=')[1] ?? 1)
    return { base: tag!.split('-')[0]!.replace(/^in$/, 'id'), q: Number.isFinite(q) ? q : 0, i }
  }).filter(x => x.q > 0).sort((a, b) => b.q - a.q || a.i - b.i)
  const hit = ranked.find(x => x.base === 'vi' || x.base === 'id' || x.base === 'th')
  return (hit?.base as 'vi' | 'id' | 'th' | undefined) ?? 'vi'
}

export async function handle(req: Request, env: FullEnv, wait: (p: Promise<unknown>) => void = p => void p): Promise<Response> {
  const url = new URL(req.url)
  if (env.CANONICAL_HOST && url.hostname !== env.CANONICAL_HOST) {
    return new Response(null, { status: 301, headers: { location: `https://${env.CANONICAL_HOST}${url.pathname}${url.search}` } })
  }
  // Pages taken down from the dashboard: 410 for HTML, markdown and index.* alike (see isHidden for how soon).
  if (/^\/(vi|id|th)\//.test(url.pathname)) {
    const p = pagePath(url.pathname)
    if (p && isHidden(env.AB, p, env.HIDDEN_PAGES, wait)) return finish(gonePage(), env)
  }
  // Agents asking for text/markdown get the build-time index.md (the root answers with /vi/'s); no cookie.
  const mdPath = url.pathname === '/' ? '/vi/' : url.pathname
  if (/^\/(vi|id|th)\//.test(mdPath) && mdPath.endsWith('/') && prefersMarkdown(req.headers.get('accept'))) {
    const md = await env.ASSETS.fetch(new Request(new URL(`${mdPath}index.md`, url)))
    if (md.ok) {
      const text = await md.text()
      return finish(new Response(text, { headers: {
        'content-type': 'text/markdown; charset=utf-8', vary: 'Accept', 'cache-control': 'public, max-age=3600',
        'x-markdown-tokens': String(Math.ceil(text.length / 4)), // rough estimate: ~4 characters per token
      } }), env)
    }
  }
  if (url.pathname === '/.well-known/api-catalog') return finish(apiCatalog(url.origin), env)
  // The root: a browser that prefers Indonesian or Thai goes to that language (302, by Accept-Language); everyone else,
  // crawlers included, to /vi/ for good.
  if (url.pathname === '/') {
    const lang = rootLang(req.headers.get('accept-language'))
    return finish(lang === 'vi'
      ? new Response(null, { status: 301, headers: { location: `/vi/${url.search}`, link: DISCOVERY_LINK, vary: 'Accept-Language' } })
      : new Response(null, { status: 302, headers: { location: `/${lang}/${url.search}`, link: DISCOVERY_LINK, vary: 'Accept-Language', 'cache-control': 'private, no-store' } }), env)
  }
  if (url.pathname === '/_e') return events(req, env)
  if (url.pathname.startsWith('/go/')) return goRoute(req, url, env, wait)
  if (url.pathname === '/_aff/products') return affAdmin(req, env)
  if (url.pathname === '/_c') return finish(req.method === 'POST' ? await postComment(req, env, new Date()) : req.method === 'GET' ? await listComments(url, env) : new Response(null, { status: 405 }), env)
  if (url.pathname.startsWith('/_c/admin/')) return commentsAdmin(req, url, env)
  if (url.pathname === '/_p') return finish(req.method === 'POST' ? await postPhoto(req, env, new Date()) : req.method === 'GET' ? await listPhotos(url, env) : new Response(null, { status: 405 }), env)
  if (url.pathname === '/_p/xoa/' || url.pathname === '/_p/xoa') return finish(await deleteRoute(req, url, env, new Date()), env)
  if (url.pathname.startsWith('/_p/admin/')) return bearerOk(req, env) ? photosAdmin(req, url, env, new Date()) : new Response('Not found', { status: 404 })
  if (url.pathname === '/_ab/photos' && req.method === 'POST') {
    if (!authorise(req, env.AB_DASH_TOKEN).ok || !photosLive(env)) return new Response('Not found', { status: 404 })
    await removePhoto(env, String((await req.formData()).get('id') ?? ''), 'removed by owner', new Date())
    return new Response(null, { status: 303, headers: { location: '/_ab/#anh-ban-doc', 'cache-control': 'no-store' } })
  }
  if (url.pathname === '/_ab/hidden' && req.method === 'POST') {
    if (!authorise(req, env.AB_DASH_TOKEN).ok) return new Response('Not found', { status: 404 })
    const err = await updateHidden(env.AB, await req.formData(), new Date())
    if (err) return new Response(err, { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    return new Response(null, { status: 303, headers: { location: '/_ab/#an-trang', 'cache-control': 'no-store' } })
  }
  if (url.pathname === '/_ab/hidden.json' && req.method === 'GET') {
    // The build reads this (Bearer token) to drop hidden pages from lists, sitemap and search.
    if (!bearerOk(req, env) && !authorise(req, env.AB_DASH_TOKEN).ok) return new Response('Not found', { status: 404 })
    return Response.json(await loadHidden(env.AB, true), { headers: { 'cache-control': 'no-store' } })
  }
  if (url.pathname === '/_ab/login' && req.method === 'POST') {
    // The sign-in form: same as opening /_ab/?token=…, without the token in the address bar or history.
    const token = String((await req.formData()).get('token') ?? '')
    if (!env.AB_DASH_TOKEN || !safeEqual(token, env.AB_DASH_TOKEN)) return new Response(renderLogin(true), { status: 403, headers: ADMIN_HEADERS })
    const h = new Headers({ location: '/_ab/', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' })
    h.append('set-cookie', `ab_token=${token}; Path=/_ab; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict`)
    h.append('set-cookie', OWNER_COOKIE)
    return new Response(null, { status: 303, headers: h })
  }
  if (url.pathname === '/_ab' || url.pathname === '/_ab/') {
    const auth = authorise(req, env.AB_DASH_TOKEN)
    if (!auth.ok) return new Response(renderLogin(), { headers: ADMIN_HEADERS })
    // Token arrived in the URL: move it into an HttpOnly cookie and drop it from the address bar/history.
    if (auth.setCookie) {
      const h = new Headers({ location: '/_ab/', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' })
      h.append('set-cookie', auth.setCookie)
      h.append('set-cookie', OWNER_COOKIE)
      return new Response(null, { status: 303, headers: h })
    }
    // Refreshes the owner flag so the on-page hide button keeps showing (see owner.ts).
    const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer', 'set-cookie': OWNER_COOKIE }
    const aff = env.DB ? await affSummary(env.DB, new Date()) : undefined
    return new Response(renderDashboard(aff, await loadHidden(env.AB, true), await recentPhotos(env).catch(() => undefined)), { headers })
  }
  if (url.pathname === '/_ab/doc-gia' || url.pathname === '/_ab/doc-gia/') {
    if (!authorise(req, env.AB_DASH_TOKEN).ok) return new Response(null, { status: 303, headers: { location: '/_ab/', 'cache-control': 'no-store' } })
    const readers = env.AE_API_TOKEN && env.CF_ACCOUNT_ID ? await queryReaders(env.CF_ACCOUNT_ID, env.AE_API_TOKEN).catch(e => (console.error('readers:', e), undefined)) : undefined
    return new Response(renderReaders(readers), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' } })
  }

  // HTML is never cached by the browser (a hidden page must turn 410 soon): no revalidation against the static ETag.
  const plain = new Request(req)
  plain.headers.delete('if-none-match')
  plain.headers.delete('if-modified-since')
  const t = Date.now()
  const res = await env.ASSETS.fetch(plain)
  const assetMs = Date.now() - t // Server-Timing: a cold edge fetches the page from storage (0.3–2 s), a warm one ~10 ms
  if (res.status === 404 && /^\/(vi|id|th)\//.test(url.pathname)) {
    const to = await redirectFor(env.ASSETS, url.origin, url.pathname)
    if (to) return finish(new Response(null, { status: 301, headers: { location: to } }), env)
  }
  if (!res.headers.get('content-type')?.includes('text/html')) return finish(res, env)
  const extra: Record<string, string> = { Vary: 'Accept', 'Server-Timing': `asset;dur=${assetMs}` }
  // The design A/B test is over: clear its cookie from returning visitors.
  if (/(?:^|;\s*)skin=/.test(req.headers.get('cookie') ?? '')) extra['Set-Cookie'] = 'skin=; Path=/; Max-Age=0; SameSite=Lax; Secure'
  if (url.pathname === '/vi/') extra.Link = DISCOVERY_LINK
  const out = finish(res, env, extra)
  out.headers.set('Cache-Control', 'private, max-age=0, must-revalidate')
  out.headers.delete('etag')
  out.headers.delete('last-modified')
  return out
}

export default {
  fetch: (req: Request, env: FullEnv, ctx: ExecutionContext) => handle(req, env, p => ctx.waitUntil(p)),

  /** Daily: the affiliate checker and the removed-comment purge — independent, so one failing never blocks the other. */
  async scheduled(_: ScheduledController, env: FullEnv): Promise<void> {
    const results = await Promise.allSettled([
      env.DB ? runChecks(env.DB, env, new Date()) : Promise.resolve(),
      env.DB ? purgeRemoved(env.DB, new Date()) : Promise.resolve(),
    ])
    for (const r of results) if (r.status === 'rejected') console.error('scheduled task failed:', r.reason)
  },
} satisfies ExportedHandler<FullEnv>
