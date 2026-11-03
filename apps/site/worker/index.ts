import { upsertProducts } from './affiliate/admin'
import { runChecks } from './affiliate/check'
import { parseGo, recordClick, resolveGo } from './affiliate/go'
import { searchTarget, type AffEnv } from './affiliate/networks'
import { applyDecisions, listComments, moderationQueue, postComment, purgeRemoved, type CommentsEnv } from './comments/api'
import { isBot } from './bots'
import { apiCatalog, DISCOVERY_LINK } from './agents'
import { adminRoute, bearerOk as dashBearer } from './dashboard'
import { recordSnapshot } from './admin/content'
import { parseEvent, toDataPoint } from './events'
import { redirectFor } from './redirects'
import { gonePage, isHidden, pagePath } from './hidden'
import { prefersMarkdown } from './markdown'
import { deleteRoute, listPhotos, photosAdmin, postPhoto } from './photos'
import { reportRoute } from './report'
import { accounts, depsFor, type AccountDeps, type AccountsEnv } from './accounts/api'
import { APP_SITE_ASSOCIATION } from './accounts/passkey'
import { purgeExpired } from './accounts/ratelimit'
import { wantedRoute } from './wanted'
import { fishId, type FishIdDeps, type FishIdEnv } from './fishid/api'
import { sweepKept } from './fishid/kept'

export interface Env {
  ASSETS: Fetcher
  AB: KVNamespace
  /** Optional until Analytics Engine is enabled on the account; events are accepted and dropped without it. */
  EVENTS?: AnalyticsEngineDataset
  STAGING?: string
  /** Production host; any other host (www, the old staging domain) 301s here. */
  CANONICAL_HOST?: string
  AB_DASH_TOKEN?: string
  /** The owner's account ids, comma-separated (a secret): the dashboard opens only to them (dashboard.ts visitor). */
  OWNER_ACCOUNTS?: string
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
type FullEnv = Env & AffEnv & CommentsEnv & AccountsEnv & FishIdEnv
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

const bearerOk = (req: Request, env: Env) => dashBearer(req, env.AB_DASH_TOKEN)

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

/** The language a reader picked in the language menu (cookie aq_lang, LangMenu.astro), if any. */
export function chosenLang(cookie: string | null): 'vi' | 'id' | 'th' | undefined {
  const v = /(?:^|;\s*)aq_lang=(vi|id|th)(?:;|$)/.exec(cookie ?? '')?.[1]
  return v as 'vi' | 'id' | 'th' | undefined
}

export async function handle(req: Request, env: FullEnv, wait: (p: Promise<unknown>) => void = p => void p, accountDeps?: AccountDeps, fishDeps?: FishIdDeps): Promise<Response> {
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
  if (url.pathname === '/.well-known/apple-app-site-association') return finish(new Response(JSON.stringify(APP_SITE_ASSOCIATION), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' } }), env)
  // The root: the language the reader picked in the language menu, else a browser that prefers Indonesian or Thai goes
  // to that language (302, by Accept-Language); everyone else, crawlers included, to /vi/ for good. The 301 is cached
  // for an hour only, so a reader who later picks another language isn't stuck on a redirect their browser kept.
  if (url.pathname === '/') {
    const chosen = chosenLang(req.headers.get('cookie'))
    const lang = chosen ?? rootLang(req.headers.get('accept-language'))
    const vary = 'Accept-Language, Cookie'
    return finish(lang === 'vi' && !chosen
      ? new Response(null, { status: 301, headers: { location: `/vi/${url.search}`, link: DISCOVERY_LINK, vary, 'cache-control': 'max-age=3600' } })
      : new Response(null, { status: 302, headers: { location: `/${lang}/${url.search}`, link: DISCOVERY_LINK, vary, 'cache-control': 'private, no-store' } }), env)
  }
  if (url.pathname === '/_e') return events(req, env)
  // Names readers keep that have no page (worker/wanted.ts): open to everyone, signed in or not, accounts on or off.
  if (url.pathname === '/api/v1/wanted' || url.pathname === '/api/v1/wanted/') return finish(await wantedRoute(req, env, new Date()), env)
  // Readers report a comment or photo (worker/report.ts): signed in or not, accounts on or off.
  if (url.pathname === '/api/v1/report') return finish(await reportRoute(req, env, new Date()), env)
  if (url.pathname === '/api/fish-id' || url.pathname === '/api/fish-id/') return finish(await fishId(req, url, env, new Date(), fishDeps), env)
  if (url.pathname.startsWith('/api/')) return finish(await accounts(req, url, env, new Date(), accountDeps ?? depsFor(env)), env)
  if (url.pathname.startsWith('/go/')) return goRoute(req, url, env, wait)
  if (url.pathname === '/_aff/products') return affAdmin(req, env)
  if (url.pathname === '/_c') return finish(req.method === 'POST' ? await postComment(req, env, new Date()) : req.method === 'GET' ? await listComments(url, env) : new Response(null, { status: 405 }), env)
  if (url.pathname.startsWith('/_c/admin/')) return commentsAdmin(req, url, env)
  if (url.pathname === '/_p') return finish(req.method === 'POST' ? await postPhoto(req, env, new Date()) : req.method === 'GET' ? await listPhotos(url, env) : new Response(null, { status: 405 }), env)
  if (url.pathname === '/_p/xoa/' || url.pathname === '/_p/xoa') return finish(await deleteRoute(req, url, env, new Date()), env)
  if (url.pathname.startsWith('/_p/admin/')) return bearerOk(req, env) ? photosAdmin(req, url, env, new Date()) : new Response('Not found', { status: 404 })
  // The owner's dashboard (worker/dashboard.ts): every /_ab path, each behind the token.
  if (url.pathname === '/_ab' || url.pathname.startsWith('/_ab/')) return adminRoute(req, url, env)

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

/** Durable Object classes the config binds (wrangler.jsonc). */
export { FishIdRelay } from './fishid/relay'

export default {
  fetch: (req: Request, env: FullEnv, ctx: ExecutionContext) => handle(req, env, p => ctx.waitUntil(p)),

  /**
   * Daily: the affiliate checker, the removed-comment purge, expired sign-in data, kept fish-ID photos past their 6
   * months (fishid/kept.ts) and the day's content totals (KV stats:YYYY-MM-DD, admin/content.ts) — independent, so one
   * failing never blocks the others.
   */
  async scheduled(_: ScheduledController, env: FullEnv): Promise<void> {
    const results = await Promise.allSettled([
      env.DB ? runChecks(env.DB, env, new Date()) : Promise.resolve(),
      env.DB ? purgeRemoved(env.DB, new Date()) : Promise.resolve(),
      env.DB ? purgeExpired(env.DB, new Date()) : Promise.resolve(),
      env.UPLOADS ? sweepKept(env.UPLOADS, new Date()) : Promise.resolve(),
      recordSnapshot(env.AB, env.ASSETS, `https://${env.CANONICAL_HOST ?? 'aquatome.com'}`, new Date()),
    ])
    for (const r of results) if (r.status === 'rejected') console.error('scheduled task failed:', r.reason)
  },
} satisfies ExportedHandler<FullEnv>
