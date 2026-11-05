import { upsertProducts } from './affiliate/admin'
import { runChecks } from './affiliate/check'
import { parseGo, recordClick, resolveGo } from './affiliate/go'
import { searchTarget, type AffEnv } from './affiliate/networks'
import { applyDecisions, listComments, moderationQueue, postComment, purgeRemoved, type CommentsEnv } from './comments/api'
import { isBot } from './bots'
import { apiCatalog, DISCOVERY_LINK } from './agents'
import { adminRoute, bearerOk as dashBearer } from './dashboard'
import { ownerApi } from './owner-api'
import { recordSnapshot } from './admin/content'
import { parseEvent, toDataPoint } from './events'
import { redirectFor } from './redirects'
import { isViPage, withoutVi } from './paths'
import { gonePage, isHidden, pagePath } from './hidden'
import { prefersMarkdown } from './markdown'
import { deleteRoute, listPhotos, minePhotos, photosAdmin, postPhoto } from './photos'
import { reportRoute } from './report'
import { accounts, depsFor, type AccountDeps, type AccountsEnv } from './accounts/api'
import { APP_SITE_ASSOCIATION } from './accounts/passkey'
import { purgeExpired } from './accounts/ratelimit'
import { wantedRoute } from './wanted'
import { fishId, type FishIdDeps, type FishIdEnv } from './fishid/api'
import { appEventsRoute } from './telemetry/events'
import { appDiagnosticsRoute } from './telemetry/diagnostics'
import { countryOf } from './telemetry/shared'
import { asksLang, chooserPage, langCookie, langPoint, pickedLang, pickResponse } from './lang-ask'
import { homeOf, LANGS, langOfCountry, langOfTag, prefixedLang, type Lang } from '@aq/schema/langs'
import { sweepKept } from './fishid/kept'

export interface Env {
  ASSETS: Fetcher
  AB: KVNamespace
  /** Optional until Analytics Engine is enabled on the account; events are accepted and dropped without it. */
  EVENTS?: AnalyticsEngineDataset
  /** The iOS app's events and MetricKit summaries (worker/telemetry); without it the app's routes answer 503. */
  APP_EVENTS?: AnalyticsEngineDataset
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

/** A page's address in any language: Vietnamese ones at the root, the others under their prefix (/id/, /th/). */
const isPage = (path: string) => isViPage(path) || !!prefixedLang(path)

/**
 * An old Vietnamese address (/vi/…, before the pages moved to the root) → 301 to its page, in one hop: the path without
 * /vi, with its trailing slash (force-trailing-slash would add a second hop), through redirects.json when the page was
 * renamed since, the query kept.
 */
async function fromVi(url: URL, env: Env): Promise<Response> {
  // One leading slash: "/vi//evil.test/" must not become "//evil.test/", another site's address.
  let path = withoutVi(url.pathname).replace(/^[/\\]+/, '/')
  if (!path.endsWith('/') && !/\.[a-z0-9]+$/i.test(path)) path += '/'
  const renamed = await redirectFor(env.ASSETS, url.origin, path)
  const location = !renamed ? `${path}${url.search}` : url.search ? `${renamed}${renamed.includes('?') ? '&' : '?'}${url.search.slice(1)}` : renamed
  return new Response(null, { status: 301, headers: { location } })
}

/** The site language a browser ranks highest among ours (Accept-Language, q order), if it asks for any. */
export function askedLang(header: string | null): Lang | undefined {
  const ranked = (header ?? '').split(',').map((part, i) => {
    const [tag, ...params] = part.trim().toLowerCase().split(';')
    const q = Number(params.find(p => p.trim().startsWith('q='))?.split('=')[1] ?? 1)
    return { lang: langOfTag(tag!.split('-')[0]!), q: Number.isFinite(q) ? q : 0, i }
  }).filter(x => x.q > 0).sort((a, b) => b.q - a.q || a.i - b.i)
  return ranked.find(x => x.lang)?.lang
}

/**
 * The browser's language among ours (askedLang). When it asks for none of them (a phone set to English, common in
 * Indonesia and Thailand), the country Cloudflare places it in, by the language table's countries: Indonesia's
 * Indonesian, Thailand's Thai (`country`, empty for a crawler). Vietnamese otherwise.
 */
export const rootLang = (header: string | null, country = ''): Lang =>
  askedLang(header) ?? langOfCountry(country) ?? 'vi'

const CHOSEN = new RegExp(`(?:^|;\\s*)aq_lang=(${LANGS.join('|')})(?:;|$)`)
/** The language a reader picked in the language menu (cookie aq_lang, LangMenu.astro), if any. */
export function chosenLang(cookie: string | null): Lang | undefined {
  return CHOSEN.exec(cookie ?? '')?.[1] as Lang | undefined
}

export async function handle(req: Request, env: FullEnv, wait: (p: Promise<unknown>) => void = p => void p, accountDeps?: AccountDeps, fishDeps?: FishIdDeps): Promise<Response> {
  const url = new URL(req.url)
  if (env.CANONICAL_HOST && url.hostname !== env.CANONICAL_HOST) {
    return new Response(null, { status: 301, headers: { location: `https://${env.CANONICAL_HOST}${url.pathname}${url.search}` } })
  }
  if (url.pathname === '/vi' || url.pathname.startsWith('/vi/')) return finish(await fromVi(url, env), env)
  // Pages taken down from the dashboard: 410 for HTML, markdown and index.* alike (see isHidden for how soon).
  if (isPage(url.pathname)) {
    const p = pagePath(url.pathname)
    if (p && isHidden(env.AB, p, env.HIDDEN_PAGES, wait)) return finish(gonePage(), env)
  }
  // Agents asking for text/markdown get the build-time index.md (the root: the Vietnamese home page's); no cookie.
  if (isPage(url.pathname) && url.pathname.endsWith('/') && prefersMarkdown(req.headers.get('accept'))) {
    const md = await env.ASSETS.fetch(new Request(new URL(`${url.pathname}index.md`, url)))
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
  // The root is the Vietnamese home page. A reader who picked Indonesian or Thai in the language menu goes to that
  // language's (302), and so does a browser that prefers one of them (Accept-Language) when its reader picked none, or
  // one that asks for none of ours from Indonesia or Thailand. A browser that asks for none of ours from elsewhere gets
  // the language chooser (worker/lang-ask.ts; owner, 2026-11-06), whose links (?lang=) remember the pick as the menu
  // does: Indonesian and Thai by a 302 to their home, Vietnamese by this page itself (a 302 back to / would loop to the
  // chooser where the cookie isn't kept). Everyone else, crawlers included, gets the page (below).
  let remember: string | undefined
  if (url.pathname === '/') {
    const al = req.headers.get('accept-language')
    const country = isBot(req.headers.get('user-agent'), al) ? '' : countryOf(req)
    // A page fetched ahead of a click (the Vietnamese pages prefetch /, Base.astro) is served but not counted.
    const count = country && !/prefetch/i.test(req.headers.get('sec-purpose') ?? '')
    const picked = pickedLang(url)
    if (picked && count) env.EVENTS?.writeDataPoint(langPoint(`/?lang=${picked}`, country))
    if (picked && picked !== 'vi') return finish(pickResponse(picked, url.searchParams), env)
    if (picked) remember = langCookie(picked)
    const chosen = picked ?? chosenLang(req.headers.get('cookie'))
    if (!chosen && !askedLang(al) && asksLang(country)) {
      if (count) env.EVENTS?.writeDataPoint(langPoint('/', country))
      return finish(chooserPage(url.searchParams), env)
    }
    const lang = chosen ?? rootLang(al, country)
    if (lang !== 'vi') return finish(new Response(null, { status: 302, headers: { location: `${homeOf(lang)}${url.search}`, link: DISCOVERY_LINK, vary: 'Accept-Language, Cookie', 'cache-control': 'private, no-store' } }), env)
  }
  if (url.pathname === '/_e') return events(req, env)
  // Names readers keep that have no page (worker/wanted.ts): open to everyone, signed in or not, accounts on or off.
  if (url.pathname === '/api/v1/wanted' || url.pathname === '/api/v1/wanted/') return finish(await wantedRoute(req, env, new Date()), env)
  // Readers report a comment or photo (worker/report.ts): signed in or not, accounts on or off.
  if (url.pathname === '/api/v1/report') return finish(await reportRoute(req, env, new Date()), env)
  if (url.pathname === '/api/fish-id' || url.pathname === '/api/fish-id/') return finish(await fishId(req, url, env, new Date(), fishDeps, wait), env)
  // A reader's own photos, sent from the app (worker/photos.ts): listed or taken back with its account's bearer.
  if (url.pathname.startsWith('/api/v1/talk/photos/mine')) return finish(await minePhotos(req, url, env, new Date()), env)
  // The iOS app's anonymous events and crash and performance reports (worker/telemetry): no account, no cookie.
  if (url.pathname === '/api/v1/app/events') return finish(await appEventsRoute(req, env, new Date()), env)
  if (url.pathname === '/api/v1/app/diagnostics') return finish(await appDiagnosticsRoute(req, env, new Date()), env)
  // The owner's dashboard as JSON, for the iOS app (worker/owner-api.ts): the owner's app session only.
  if (url.pathname === '/api/owner' || url.pathname.startsWith('/api/owner/')) return finish(await ownerApi(req, url, env), env)
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
  if (res.status === 404 && isPage(url.pathname)) {
    const to = await redirectFor(env.ASSETS, url.origin, url.pathname)
    if (to) return finish(new Response(null, { status: 301, headers: { location: to } }), env)
  }
  if (!res.headers.get('content-type')?.includes('text/html')) return finish(res, env)
  const extra: Record<string, string> = { Vary: 'Accept', 'Server-Timing': `asset;dur=${assetMs}` }
  // The design A/B test is over: clear its cookie from returning visitors.
  if (/(?:^|;\s*)skin=/.test(req.headers.get('cookie') ?? '')) extra['Set-Cookie'] = 'skin=; Path=/; Max-Age=0; SameSite=Lax; Secure'
  if (url.pathname === '/') Object.assign(extra, { Link: DISCOVERY_LINK, Vary: 'Accept, Accept-Language, Cookie' })
  const out = finish(res, env, extra)
  if (remember) out.headers.append('Set-Cookie', remember)
  out.headers.set('Cache-Control', 'private, max-age=0, must-revalidate')
  out.headers.delete('etag')
  out.headers.delete('last-modified')
  return out
}

/** Durable Object classes the config binds (wrangler.jsonc). */
export { FishIdRelay } from './fishid/relay'
export { FishIdLedger } from './fishid/ledger'

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
