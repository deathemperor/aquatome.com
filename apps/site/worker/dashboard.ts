import { sessionOf, tokenOf } from './accounts/session'
import { catalogOf, fishIdStatus, type FishIdEnv } from './fishid/api'
import { loadHidden, updateHidden } from './hidden'
import { OWNER_COOKIE } from './owner'
import { photosLive, recentPhotos, removePhoto, type PhotosEnv } from './photos'
import { queryReaderDays, queryReaders } from './readers'
import { accountStats, clicksByDay, listWanted, livePhotos, moderationWaiting } from './admin/data'
import { clicksByKind, listSnapshots, loadContentStats, queryContentReads, talkByPage } from './admin/content'
import { contentPage } from './admin/content-page'
import { queryFishId, queryFishIdDays } from './admin/fishid'
import { accountsPage, affiliatePage, fishIdPage, hiddenPage, overviewPage, photosPage, readersPage, wantedPage, type AffSummary } from './admin/pages'
import { isFailed, loginPage, soft, unset, type AdminPath, type Soft } from './admin/shell'
import { viewerZone } from './admin/time'

/**
 * The owner's dashboard, /_ab/: one page per part (admin/pages.ts), each open only to the owner signed in to the site,
 * noindex and never stored; anyone else gets the site's sign-in in its place (signInPage). Each part loads on its own and
 * says so in its place when it can't.
 * OWNER_ACCOUNTS (a Worker secret): the owner's account ids, comma-separated. AB_DASH_TOKEN, as a bearer token, is the
 * build's and the scripts' key to /_ab/hidden.json; it no longer opens the dashboard, since a token can leak or be shared.
 */
export type AdminEnv = FishIdEnv & PhotosEnv & { DB?: D1Database; AB_DASH_TOKEN?: string; OWNER_ACCOUNTS?: string; AE_API_TOKEN?: string; CF_ACCOUNT_ID?: string; ASSETS?: Fetcher }
export type { AffSummary }

export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

/**
 * Who opens the dashboard: the owner (a browser signed in to the site, the way readers sign in, to an account
 * OWNER_ACCOUNTS names), another account, or nobody signed in. Only a browser's session cookie counts: an app's bearer
 * session doesn't open these pages.
 */
export async function visitor(req: Request, env: AdminEnv, now: Date): Promise<'owner' | 'other' | 'none'> {
  if (!env.DB || tokenOf(req)?.via !== 'cookie') return 'none'
  const session = await sessionOf(req, env.DB, now)
  if (!session) return 'none'
  const owners = (env.OWNER_ACCOUNTS ?? '').split(',').map(id => id.trim()).filter(Boolean)
  return owners.includes(session.userId) ? 'owner' : 'other'
}
/** The token cookie the dashboard used to set (Path=/_ab): cleared when the owner signs in the new way. */
const OLD_TOKEN_COOKIE = 'ab_token=; Path=/_ab; Max-Age=0; HttpOnly; Secure; SameSite=Strict'

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
const badForm = () => new Response('expected a form', { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } })
const see = (location: string, cookies: string[] = []) => {
  const h = new Headers({ location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' })
  for (const c of cookies) h.append('set-cookie', c)
  return new Response(null, { status: 303, headers: h })
}

/** The site's sign-in page (src/pages/dang-nhap/), and the two places in it the dashboard fills in. */
const SIGN_IN = '/dang-nhap/'
const PANEL = '<section id="tai-khoan"'
const NOT_OWNER = 'id="acc-not-owner" hidden'
/**
 * The sign-in page's headers: never stored, noindex. Its referrer is this site's origin alone, never the /_ab/ path:
 * Google's button and Turnstile read it to know the site they're on, and the dashboard's no-referrer would hide it.
 * Nothing else on /_ab/ restricts what the page loads (the site sends no CSP).
 */
const SIGN_IN_HEADERS = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'strict-origin' }

/**
 * Nobody signed in, or (`other`) an account that isn't the owner's, which the page then says: the site's sign-in in this
 * dashboard page's place, so the owner signs in here and lands back on it (the panel's data-next, scripts/sync.ts
 * nextPath). The old page that points to "Bể của tôi" when this build can't serve it.
 */
async function signInPage(env: AdminEnv, url: URL, key: AdminPath, other: boolean): Promise<Response> {
  const status = other ? 403 : 200
  const res = await env.ASSETS?.fetch(new Request(new URL(SIGN_IN, url))).catch(() => undefined)
  const html = res?.ok && res.headers.get('content-type')?.includes('text/html') ? await res.text() : ''
  if (!html.includes(PANEL) || (other && !html.includes(NOT_OWNER))) return new Response(loginPage(other), { status, headers: HTML })
  const page = html.replace(PANEL, `${PANEL} data-next="${key}"`)
  return new Response(other ? page.replace(NOT_OWNER, 'id="acc-not-owner"') : page, { status, headers: SIGN_IN_HEADERS })
}

const FONT = /^\/_ab\/fonts\/[a-z0-9-]+\.woff2$/
const NO_AE = 'AE_API_TOKEN và CF_ACCOUNT_ID'
/** This deploy's content.json (scripts/content-stats.ts): a build without it is a part that didn't load. */
const contentOf = async (env: AdminEnv, origin: string) => {
  if (!env.ASSETS) return unset('ASSETS')
  const s = await soft('content', loadContentStats(env.ASSETS, origin))
  return s === undefined ? { failed: 'Bản build này chưa có content.json.' } : s
}
const ae = (env: AdminEnv) => (env.AE_API_TOKEN && env.CF_ACCOUNT_ID ? { account: env.CF_ACCOUNT_ID, token: env.AE_API_TOKEN } : undefined)

/** Each page: its loaders, side by side, each failing on its own; days and times in the viewer's zone `tz` (admin/time.ts). */
const PAGES: Record<AdminPath, (env: AdminEnv, url: URL, now: Date, tz: string) => Promise<string>> = {
  '/_ab/': async (env, url, now, tz) => {
    const a = ae(env)
    const db = env.DB
    const [readers, clicks, fish, keys, photos, waiting, wanted, accounts, hidden, content, snapshots] = await Promise.all([
      a ? soft('readers', queryReaderDays(a.account, a.token, 31, tz)) : unset(NO_AE),
      db ? soft('clicks', clicksByDay(db, now, 31)) : unset('D1'),
      a ? soft('fish-id', queryFishIdDays(a.account, a.token, now, tz)) : unset(NO_AE),
      soft('fish-id keys', fishIdStatus(env, now)),
      photosLive(env) ? soft('photos', livePhotos(env.DB!)) : unset('ảnh bạn đọc (D1, R2, Turnstile)'),
      db ? soft('moderation', moderationWaiting(db)) : unset('D1'),
      soft('wanted', listWanted(env.AB)),
      db ? soft('accounts', accountStats(db, now, tz)) : unset('D1'),
      soft('hidden', loadHidden(env.AB, true)),
      contentOf(env, url.origin),
      soft('snapshots', listSnapshots(env.AB)),
    ])
    return overviewPage({ now, tz, readers, clicks, fish, keys, photos, waiting, wanted, accounts, hidden, content, snapshots })
  },
  '/_ab/noi-dung/': async (env, url, now, tz) => {
    const a = ae(env)
    const [stats, snapshots] = await Promise.all([contentOf(env, url.origin), soft('snapshots', listSnapshots(env.AB))])
    const off = (what: string): Soft<never> => (isFailed(stats) ? { failed: 'Không có content.json.' } : unset(what))
    const [reads, talk, clicks] = await Promise.all([
      a && !isFailed(stats) ? soft('content reads', queryContentReads(a.account, a.token, stats, 30)) : off(NO_AE),
      env.DB && !isFailed(stats) ? soft('content talk', talkByPage(env.DB, stats)) : off('D1'),
      env.DB && !isFailed(stats) ? soft('content clicks', clicksByKind(env.DB, stats, now)) : off('D1'),
    ])
    return contentPage({ now, tz, stats, reads, talk, clicks, snapshots })
  },
  '/_ab/doc-gia/': async (env, _url, now, tz) => {
    const a = ae(env)
    return readersPage(now, a ? await soft('readers', queryReaders(a.account, a.token, 14, tz)) : undefined, tz)
  },
  '/_ab/nhan-dien-ca/': async (env, url, now, tz) => {
    const a = ae(env)
    const [stats, keys, catalog] = await Promise.all([
      a ? soft('fish-id', queryFishId(a.account, a.token, now, tz)) : unset(NO_AE),
      soft('fish-id keys', fishIdStatus(env, now)),
      catalogOf(env, url.origin),
    ])
    // A guess's page by its id, from the catalog the tool links with; never an address from the log itself.
    const pages = new Map((catalog?.entries ?? []).map(e => [e.id, e.url.vi]))
    return fishIdPage({ now, tz, stats, keys, pages })
  },
  '/_ab/affiliate/': async (env, _url, now, tz) => {
    if (!env.DB) return affiliatePage(unset('D1'), unset('D1'), now, tz)
    const [clicks, summary] = await Promise.all([soft('clicks', clicksByDay(env.DB, now)), soft('affiliate', affSummary(env.DB, now))])
    return affiliatePage(clicks, summary, now, tz)
  },
  '/_ab/muon-co/': async (env, _url, now, tz) => wantedPage(now, await soft('wanted', listWanted(env.AB)), tz),
  '/_ab/anh-ban-doc/': async (env, _url, now, tz) => photosPage(await soft('photos', recentPhotos(env)), now, tz),
  '/_ab/an-trang/': async (env, _url, now, tz) => hiddenPage(await soft('hidden', loadHidden(env.AB, true)), now, tz),
  '/_ab/tai-khoan/': async (env, _url, now, tz) => accountsPage(env.DB ? await soft('accounts', accountStats(env.DB, now, tz)) : unset('D1'), now, tz),
}
export const ADMIN_PAGES = Object.keys(PAGES) as AdminPath[]

/** Every /_ab path: the pages, the owner's two actions, and the hidden list the build reads. */
export async function adminRoute(req: Request, url: URL, env: AdminEnv, now = new Date()): Promise<Response> {
  const path = url.pathname
  const owner = async () => (await visitor(req, env, now)) === 'owner'
  // The site's two faces for these pages (scripts/admin-fonts.ts): public, like the site's own copies.
  if (FONT.test(path) && env.ASSETS) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return notFound()
    const res = await env.ASSETS.fetch(new Request(url, { method: req.method }))
    if (!res.ok) return notFound()
    return new Response(res.body, { headers: { 'content-type': 'font/woff2', 'cache-control': 'public, max-age=604800' } })
  }
  // The old token form's address: the dashboard signs in with the site's accounts now.
  if (path === '/_ab/login') return see('/_ab/')
  if (path === '/_ab/hidden.json') {
    // The build reads this (Bearer token) to drop hidden pages from lists, sitemap and search.
    if (req.method !== 'GET' || (!bearerOk(req, env.AB_DASH_TOKEN) && !(await owner()))) return notFound()
    return Response.json(await loadHidden(env.AB, true), { headers: { 'cache-control': 'no-store' } })
  }
  if (path === '/_ab/photos') {
    if (req.method !== 'POST' || !(await owner()) || !photosLive(env)) return notFound()
    const form = await req.formData().catch(() => null)
    if (!form) return badForm()
    await removePhoto(env, String(form.get('id') ?? ''), 'removed by owner', now)
    return see('/_ab/anh-ban-doc/')
  }
  if (path === '/_ab/hidden') {
    if (req.method !== 'POST' || !(await owner())) return notFound()
    const form = await req.formData().catch(() => null)
    if (!form) return badForm()
    const err = await updateHidden(env.AB, form, now)
    if (err) return new Response(err, { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
    return see('/_ab/an-trang/')
  }

  const key = (path.endsWith('/') ? path : `${path}/`) as AdminPath
  const render = Object.hasOwn(PAGES, key) ? PAGES[key] : undefined
  if (!render) return notFound()
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' } })
  const who = await visitor(req, env, now)
  // Not the owner: the sign-in, on this page's address (and that this account isn't the owner's).
  if (who !== 'owner') return signInPage(env, url, key, who === 'other')
  // Refreshes the owner flag so the on-page hide button keeps showing (see owner.ts), and drops the old token cookie.
  const headers = new Headers(HTML)
  for (const c of [OWNER_COOKIE, OLD_TOKEN_COOKIE]) headers.append('set-cookie', c)
  return new Response(req.method === 'HEAD' ? null : await render(env, url, now, viewerZone(req)), { headers })
}
