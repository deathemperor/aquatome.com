import { catalogOf, fishIdStatus, type FishIdEnv } from './fishid/api'
import { loadHidden, updateHidden } from './hidden'
import { OWNER_COOKIE } from './owner'
import { photosLive, recentPhotos, removePhoto, type PhotosEnv } from './photos'
import { queryReaderDays, queryReaders } from './readers'
import { accountStats, clicksByDay, listWanted, livePhotos } from './admin/data'
import { queryFishId, queryFishIdDays } from './admin/fishid'
import { accountsPage, affiliatePage, fishIdPage, hiddenPage, overviewPage, photosPage, readersPage, wantedPage, type AffSummary } from './admin/pages'
import { loginPage, soft, unset, type AdminPath } from './admin/shell'

/**
 * The owner's dashboard, /_ab/: one page per part (admin/pages.ts), each behind the ab_token cookie, noindex and never
 * stored. Each part loads on its own and says so in its place when it can't.
 */
export type AdminEnv = FishIdEnv & PhotosEnv & { DB?: D1Database; AB_DASH_TOKEN?: string; AE_API_TOKEN?: string; CF_ACCOUNT_ID?: string }
export type { AffSummary }

export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

/** Token from ?token= or the ab_token cookie. Returns the cookie to set on first valid visit. */
export function authorise(req: Request, secret: string | undefined): { ok: boolean; setCookie?: string } {
  if (!secret) return { ok: false }
  const q = new URL(req.url).searchParams.get('token')
  const c = req.headers.get('cookie')?.match(/(?:^|;\s*)ab_token=([^;]+)/)?.[1]
  if (q && safeEqual(q, secret)) return { ok: true, setCookie: `ab_token=${q}; Path=/_ab; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict` }
  return { ok: !!c && safeEqual(c, secret) }
}

/** The dashboard token as a Bearer header: the build and the home machine's scripts. */
export const bearerOk = (req: Request, secret: string | undefined) => {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  return Boolean(secret) && safeEqual(token, secret!)
}

/** Last 14 days of affiliate clicks + catalog health, straight from D1. */
export async function affSummary(db: D1Database, now: Date): Promise<AffSummary> {
  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10)
  const [byNetwork, top, status, last] = await Promise.all([
    db.prepare('SELECT network, category, SUM(n) AS n FROM clicks_daily WHERE date >= ? GROUP BY network, category ORDER BY n DESC LIMIT 30').bind(since).all<AffSummary['byNetwork'][number]>(),
    db.prepare("SELECT entity_ref, SUM(n) AS n FROM clicks_daily WHERE date >= ? AND entity_ref != '' GROUP BY entity_ref ORDER BY n DESC LIMIT 10").bind(since).all<AffSummary['top'][number]>(),
    db.prepare('SELECT status, COUNT(*) AS n FROM products GROUP BY status').all<AffSummary['status'][number]>(),
    db.prepare('SELECT MAX(at) AS at FROM checks').first<{ at: string | null }>(),
  ])
  return { byNetwork: byNetwork.results, top: top.results, status: status.results, lastCheck: last?.at ?? null }
}

const HTML = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' }
const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } })
const see = (location: string, cookies: string[] = []) => {
  const h = new Headers({ location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' })
  for (const c of cookies) h.append('set-cookie', c)
  return new Response(null, { status: 303, headers: h })
}

const NO_AE = 'AE_API_TOKEN và CF_ACCOUNT_ID'
const ae = (env: AdminEnv) => (env.AE_API_TOKEN && env.CF_ACCOUNT_ID ? { account: env.CF_ACCOUNT_ID, token: env.AE_API_TOKEN } : undefined)

/** Each page: its loaders, side by side, each failing on its own. */
const PAGES: Record<AdminPath, (env: AdminEnv, url: URL, now: Date) => Promise<string>> = {
  '/_ab/': async (env, _url, now) => {
    const a = ae(env)
    const [readers, clicks, fish, photos, wanted] = await Promise.all([
      a ? soft('readers', queryReaderDays(a.account, a.token, 31)) : unset(NO_AE),
      env.DB ? soft('clicks', clicksByDay(env.DB, now)) : unset('D1'),
      a ? soft('fish-id', queryFishIdDays(a.account, a.token, now)) : unset(NO_AE),
      photosLive(env) ? soft('photos', livePhotos(env.DB!)) : unset('ảnh bạn đọc (D1, R2, Turnstile)'),
      soft('wanted', listWanted(env.AB)),
    ])
    return overviewPage({ now, readers, clicks, fish, photos, wanted })
  },
  '/_ab/doc-gia/': async (env, _url, now) => {
    const a = ae(env)
    return readersPage(now, a ? await soft('readers', queryReaders(a.account, a.token)) : undefined)
  },
  '/_ab/nhan-dien-ca/': async (env, url, now) => {
    const a = ae(env)
    const [stats, keys, catalog] = await Promise.all([
      a ? soft('fish-id', queryFishId(a.account, a.token, now)) : unset(NO_AE),
      soft('fish-id keys', fishIdStatus(env, now)),
      catalogOf(env, url.origin),
    ])
    // A guess's page by its id, from the catalog the tool links with; never an address from the log itself.
    const pages = new Map((catalog?.entries ?? []).map(e => [e.id, e.url.vi]))
    return fishIdPage({ now, stats, keys, pages })
  },
  '/_ab/affiliate/': async (env, _url, now) => {
    if (!env.DB) return affiliatePage(unset('D1'), unset('D1'))
    const [clicks, summary] = await Promise.all([soft('clicks', clicksByDay(env.DB, now)), soft('affiliate', affSummary(env.DB, now))])
    return affiliatePage(clicks, summary)
  },
  '/_ab/muon-co/': async (env, _url, now) => wantedPage(now, await soft('wanted', listWanted(env.AB))),
  '/_ab/anh-ban-doc/': async env => photosPage(await soft('photos', recentPhotos(env))),
  '/_ab/an-trang/': async env => hiddenPage(await soft('hidden', loadHidden(env.AB, true))),
  '/_ab/tai-khoan/': async (env, _url, now) => accountsPage(env.DB ? await soft('accounts', accountStats(env.DB, now)) : unset('D1')),
}
export const ADMIN_PAGES = Object.keys(PAGES) as AdminPath[]

/** Every /_ab path: the pages, the sign-in, the owner's two actions, and the hidden list the build reads. */
export async function adminRoute(req: Request, url: URL, env: AdminEnv, now = new Date()): Promise<Response> {
  const path = url.pathname
  if (path === '/_ab/login') {
    if (req.method !== 'POST') return see('/_ab/')
    // The sign-in form: same as opening /_ab/?token=…, without the token in the address bar or history.
    const token = String((await req.formData().catch(() => null))?.get('token') ?? '')
    if (!env.AB_DASH_TOKEN || !safeEqual(token, env.AB_DASH_TOKEN)) return new Response(loginPage(true), { status: 403, headers: HTML })
    return see('/_ab/', [`ab_token=${token}; Path=/_ab; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict`, OWNER_COOKIE])
  }
  if (path === '/_ab/hidden.json') {
    // The build reads this (Bearer token) to drop hidden pages from lists, sitemap and search.
    if (req.method !== 'GET' || (!bearerOk(req, env.AB_DASH_TOKEN) && !authorise(req, env.AB_DASH_TOKEN).ok)) return notFound()
    return Response.json(await loadHidden(env.AB, true), { headers: { 'cache-control': 'no-store' } })
  }
  if (path === '/_ab/photos') {
    if (req.method !== 'POST' || !authorise(req, env.AB_DASH_TOKEN).ok || !photosLive(env)) return notFound()
    await removePhoto(env, String((await req.formData()).get('id') ?? ''), 'removed by owner', now)
    return see('/_ab/anh-ban-doc/')
  }
  if (path === '/_ab/hidden') {
    if (req.method !== 'POST' || !authorise(req, env.AB_DASH_TOKEN).ok) return notFound()
    const err = await updateHidden(env.AB, await req.formData(), now)
    if (err) return new Response(err, { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
    return see('/_ab/an-trang/')
  }

  const key = (path.endsWith('/') ? path : `${path}/`) as AdminPath
  const render = Object.hasOwn(PAGES, key) ? PAGES[key] : undefined
  if (!render) return notFound()
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' } })
  const auth = authorise(req, env.AB_DASH_TOKEN)
  // Signed out: the overview asks for the token; every other page sends there first.
  if (!auth.ok) return key === '/_ab/' ? new Response(loginPage(), { headers: HTML }) : see('/_ab/')
  // Token arrived in the URL: move it into an HttpOnly cookie and drop it from the address bar and history.
  if (auth.setCookie) return see(key, [auth.setCookie, OWNER_COOKIE])
  // Refreshes the owner flag so the on-page hide button keeps showing (see owner.ts).
  return new Response(req.method === 'HEAD' ? null : await render(env, url, now), { headers: { ...HTML, 'set-cookie': OWNER_COOKIE } })
}
