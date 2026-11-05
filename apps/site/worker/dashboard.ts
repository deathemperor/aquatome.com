import { sessionOf, tokenOf } from './accounts/session'
import { catalogOf, fishIdStatus, type FishIdEnv } from './fishid/api'
import { deleteKept, keptImage, recentKept } from './fishid/kept'
import { loadHidden, updateHidden } from './hidden'
import { OWNER_COOKIE } from './owner'
import { approveByOwner, photosLive, recentPhotos, removePhoto, waitingPhotos, waitingUpload, type PhotosEnv } from './photos'
import { queryReaderDays, queryReaders } from './readers'
import { queryAsks } from './lang-ask'
import { accountStats, clicksByDay, listWanted, livePhotos, moderationWaiting } from './admin/data'
import { queryAppWeeks, queryBeacon, queryChecks, queryCommunity, scoreboardPage, summariseScoreboard, weeksTo, windowStart, type Scoreboard } from './admin/scoreboard'
import { clicksByKind, listSnapshots, loadContentStats, queryContentReads, talkByPage } from './admin/content'
import { contentPage, contentSection } from './admin/content-page'
import { queryFishId, queryFishIdDays } from './admin/fishid'
import { appPage, appSection, queryApp } from './admin/app'
import type { Section } from './admin/blocks'
import {
  accountsPage, accountsSection, affiliatePage, affiliateSection, fishIdPage, fishIdSection, hiddenPage, hiddenSection, keptPage, keptSection, overviewPage,
  photosPage, photosSection, readersPage, readersSection, wantedPage, wantedSection, type AffSummary, type Overview,
} from './admin/pages'
import { isFailed, loginPage, NAV, REPORT_PATH, SCOREBOARD_PATH, soft, unset, type AdminPath, type Soft, type WebPath } from './admin/shell'
import { HOME_TZ, localDay, viewerZone } from './admin/time'
import { loadReports, reportPage, reportsPage, reportsSection, SETTINGS_FORM } from './daily/page'
import type { PushEnv } from './daily/push'
import { setSettings, type ReportSettings } from './daily/settings'

/**
 * The owner's dashboard, /_ab/: one page per part (admin/pages.ts), each open only to the owner signed in to the site,
 * noindex and never stored; anyone else gets the site's sign-in in its place (signInPage). Each part loads on its own and
 * says so in its place when it can't. The iOS app reads the same pages as JSON (owner-api.ts), each from the same load.
 * OWNER_ACCOUNTS (a Worker secret): the owner's account ids, comma-separated. AB_DASH_TOKEN, as a bearer token, is the
 * build's and the scripts' key to /_ab/hidden.json; it no longer opens the dashboard, since a token can leak or be shared.
 */
export type AdminEnv = FishIdEnv & PhotosEnv & PushEnv & { DB?: D1Database; AB_DASH_TOKEN?: string; OWNER_ACCOUNTS?: string; AE_API_TOKEN?: string; CF_ACCOUNT_ID?: string; ASSETS?: Fetcher }
export type { AffSummary }

export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

const owners = (env: AdminEnv) => (env.OWNER_ACCOUNTS ?? '').split(',').map(id => id.trim()).filter(Boolean)
/**
 * Who opens the dashboard: the owner (a browser signed in to the site, the way readers sign in, to an account
 * OWNER_ACCOUNTS names), another account, or nobody signed in. Only a browser's session cookie counts: an app's bearer
 * session doesn't open these pages, whose forms rely on the cookie's SameSite.
 */
export async function visitor(req: Request, env: AdminEnv, now: Date): Promise<'owner' | 'other' | 'none'> {
  if (!env.DB || tokenOf(req)?.via !== 'cookie') return 'none'
  const session = await sessionOf(req, env.DB, now)
  if (!session) return 'none'
  return owners(env).includes(session.userId) ? 'owner' : 'other'
}
/**
 * Who the app is (owner-api.ts, and the dashboard's images): the owner (a bearer token for a live app session,
 * accounts/session.ts, of an account OWNER_ACCOUNTS names), another account's app, or no app session at all (none, one
 * that ended, a web session's token, the dashboard token, a cookie). Never the cookie.
 */
export async function appVisitor(req: Request, env: AdminEnv, now: Date): Promise<'owner' | 'other' | 'none'> {
  if (!env.DB || tokenOf(req)?.via !== 'bearer') return 'none'
  const session = await sessionOf(req, env.DB, now)
  if (!session) return 'none'
  return owners(env).includes(session.userId) ? 'owner' : 'other'
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
async function signInPage(env: AdminEnv, url: URL, key: WebPath, other: boolean): Promise<Response> {
  const status = other ? 403 : 200
  const res = await env.ASSETS?.fetch(new Request(new URL(SIGN_IN, url))).catch(() => undefined)
  const html = res?.ok && res.headers.get('content-type')?.includes('text/html') ? await res.text() : ''
  if (!html.includes(PANEL) || (other && !html.includes(NOT_OWNER))) return new Response(loginPage(other), { status, headers: HTML })
  const page = html.replace(PANEL, `${PANEL} data-next="${key}"`)
  return new Response(other ? page.replace(NOT_OWNER, 'id="acc-not-owner"') : page, { status, headers: SIGN_IN_HEADERS })
}

const FONT = /^\/_ab\/fonts\/[a-z0-9-]+\.woff2$/
/** A waiting reader photo's upload, shown on /_ab/anh-ban-doc/. */
const WAITING_PHOTO = /^\/_ab\/anh\/([0-9a-f-]{36})$/
const NO_AE = 'AE_API_TOKEN và CF_ACCOUNT_ID'
/** This deploy's content.json (scripts/content-stats.ts): a build without it is a part that didn't load. */
const contentOf = async (env: AdminEnv, origin: string) => {
  if (!env.ASSETS) return unset('ASSETS')
  const s = await soft('content', loadContentStats(env.ASSETS, origin))
  return s === undefined ? { failed: 'Bản build này chưa có content.json.' } : s
}
export const ae = (env: AdminEnv) => (env.AE_API_TOKEN && env.CF_ACCOUNT_ID ? { account: env.CF_ACCOUNT_ID, token: env.AE_API_TOKEN } : undefined)

type Load<T> = (env: AdminEnv, url: URL, now: Date, tz: string) => Promise<T>
/** A dashboard section: its HTML page, and the same page as blocks for the app, both from one load. */
type View = { html: Load<string>; json: Load<Section> }
const view = <T>(load: Load<T>, html: (d: T) => string, json: (d: T) => Section): View => ({
  html: async (...a) => html(await load(...a)),
  json: async (...a) => json(await load(...a)),
})

/** The overview's parts, side by side, each failing on its own: the page draws them, the app's GET /api/owner/dashboard reads them. */
export const loadOverview: Load<Overview> = async (env, url, now, tz) => {
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
  return { now, tz, readers, clicks, fish, keys, photos, waiting, wanted, accounts, hidden, content, snapshots }
}

const overviewHtml: Load<string> = async (...a) => overviewPage(await loadOverview(...a))

/**
 * The scoreboard's data (admin/scoreboard.ts), each part failing on its own, its weeks Vietnam's whoever asks: the page,
 * /_ab/thanh-cong.json and the daily report all read this.
 */
export async function loadScoreboard(env: AdminEnv, url: URL, now: Date): Promise<Scoreboard> {
  const a = ae(env)
  const db = env.DB
  const from = windowStart(now)
  // clicks_daily keeps days, so as many as the window has, today included.
  const clickDays = Math.round((Date.parse(`${localDay(now, HOME_TZ)}T00:00:00Z`) - Date.parse(`${weeksTo(now)[0]}T00:00:00Z`)) / 86_400_000) + 1
  const [beacon, app, community, clicks, content, snapshots, checks] = await Promise.all([
    a ? soft('scoreboard beacon', queryBeacon(a.account, a.token, from)) : unset(NO_AE),
    a ? soft('scoreboard app', queryAppWeeks(a.account, a.token, from)) : unset(NO_AE),
    db ? soft('scoreboard community', queryCommunity(db, from)) : unset('D1'),
    db ? soft('scoreboard clicks', clicksByDay(db, now, clickDays)) : unset('D1'),
    contentOf(env, url.origin),
    soft('snapshots', listSnapshots(env.AB)),
    soft('scoreboard checks', queryChecks(from)),
  ])
  return summariseScoreboard({ now, owners: owners(env), beacon, app, community, clicks, content, snapshots, checks })
}
const scoreboardHtml: Load<string> = async (env, url, now, tz) => scoreboardPage(await loadScoreboard(env, url, now), tz)
/** One daily report as it was sent (daily/page.ts), under the log's section: a page of the web dashboard alone. */
const REPORT_PAGE = new RegExp(`^${REPORT_PATH}(\\d{1,20})/$`)
const reportHtml = (id: string): Load<string | undefined> => (env, _url, now, tz) => reportPage(env.AB, id, now, tz)
/** Each section: its loaders, side by side, each failing on its own; days and times in the viewer's zone `tz` (admin/time.ts). */
const PAGES: Record<Exclude<AdminPath, '/_ab/'>, View> = {
  '/_ab/noi-dung/': view(async (env, url, now, tz) => {
    const a = ae(env)
    const [stats, snapshots] = await Promise.all([contentOf(env, url.origin), soft('snapshots', listSnapshots(env.AB))])
    const off = (what: string): Soft<never> => (isFailed(stats) ? { failed: 'Không có content.json.' } : unset(what))
    const [reads, talk, clicks] = await Promise.all([
      a && !isFailed(stats) ? soft('content reads', queryContentReads(a.account, a.token, stats, 30)) : off(NO_AE),
      env.DB && !isFailed(stats) ? soft('content talk', talkByPage(env.DB, stats)) : off('D1'),
      env.DB && !isFailed(stats) ? soft('content clicks', clicksByKind(env.DB, stats, now)) : off('D1'),
    ])
    return { now, tz, stats, reads, talk, clicks, snapshots }
  }, contentPage, contentSection),
  '/_ab/doc-gia/': view(async (env, _url, now, tz) => {
    const a = ae(env)
    const [r, asks] = a ? await Promise.all([soft('readers', queryReaders(a.account, a.token, 14, tz)), soft('language asks', queryAsks(a.account, a.token, 14))]) : []
    return { now, tz, r, asks }
  }, d => readersPage(d.now, d.r, d.tz, d.asks), d => readersSection(d.now, d.r, d.tz, d.asks)),
  '/_ab/ung-dung/': view(async (env, url, now, tz) => {
    const a = ae(env)
    const test = url.searchParams.get('test') === '1'
    return { now, tz, test, s: a ? await soft('app', queryApp(a.account, a.token, test)) : unset(NO_AE) }
  }, d => appPage(d.now, d.test, d.s, d.tz), d => appSection(d.test, d.s)),
  '/_ab/nhan-dien-ca/': view(async (env, url, now, tz) => {
    const a = ae(env)
    const [stats, keys, catalog] = await Promise.all([
      a ? soft('fish-id', queryFishId(a.account, a.token, now, tz)) : unset(NO_AE),
      soft('fish-id keys', fishIdStatus(env, now)),
      catalogOf(env, url.origin),
    ])
    // A guess's page by its id, from the catalog the tool links with; never an address from the log itself.
    const pages = new Map((catalog?.entries ?? []).map(e => [e.id, e.url.vi]))
    return { now, tz, stats, keys, pages }
  }, fishIdPage, fishIdSection),
  '/_ab/anh-nhan-dien/': view(async (env, _url, now, tz) => ({ now, tz, xs: env.UPLOADS ? await soft('kept', recentKept(env.UPLOADS)) : undefined }),
    d => keptPage(d.xs, d.now, d.tz), d => keptSection(d.xs, d.now, d.tz)),
  '/_ab/affiliate/': view(async (env, _url, now, tz) => {
    if (!env.DB) return { now, tz, clicks: unset('D1'), summary: unset('D1') }
    const [clicks, summary] = await Promise.all([soft('clicks', clicksByDay(env.DB, now)), soft('affiliate', affSummary(env.DB, now))])
    return { now, tz, clicks, summary }
  }, d => affiliatePage(d.clicks, d.summary, d.now, d.tz), d => affiliateSection(d.clicks, d.summary, d.now, d.tz)),
  '/_ab/muon-co/': view(async (env, _url, now, tz) => ({ now, tz, w: await soft('wanted', listWanted(env.AB)) }), d => wantedPage(d.now, d.w, d.tz), d => wantedSection(d.now, d.w, d.tz)),
  '/_ab/anh-ban-doc/': view(async (env, _url, now, tz) => {
    const [xs, waiting] = await Promise.all([soft('photos', recentPhotos(env)), soft('waiting photos', waitingPhotos(env))])
    return { now, tz, xs, waiting }
  }, d => photosPage(d.xs, d.waiting, d.now, d.tz), d => photosSection(d.xs, d.waiting, d.now, d.tz)),
  '/_ab/an-trang/': view(async (env, _url, now, tz) => ({ now, tz, h: await soft('hidden', loadHidden(env.AB, true)) }), d => hiddenPage(d.h, d.now, d.tz), d => hiddenSection(d.h, d.now, d.tz)),
  '/_ab/tai-khoan/': view(async (env, _url, now, tz) => ({ now, tz, a: env.DB ? await soft('accounts', accountStats(env.DB, now, tz)) : unset('D1') }),
    d => accountsPage(d.a, d.now, d.tz), d => accountsSection(d.a, d.now, d.tz)),
  '/_ab/bao-cao/': view((env, _url, now, tz) => loadReports(env, now, tz), reportsPage, reportsSection),
}
export const ADMIN_PAGES: AdminPath[] = ['/_ab/', ...(Object.keys(PAGES) as (keyof typeof PAGES)[])]

/** A dashboard page's key, its path's name: /_ab/noi-dung/ → noi-dung. */
export const sectionKey = (path: AdminPath) => path.slice('/_ab/'.length, -1)
/** Every page but the overview, as the app reads them (GET /api/owner/sections/{key}), in the dashboard's order and with its names. */
export const SECTIONS = NAV.flatMap(([path, name]) => (path === '/_ab/' ? [] : [{ key: sectionKey(path), name, path }]))
/** A section as blocks, from the same load as its page; undefined for a key that isn't one. */
export async function sectionJson(key: string, env: AdminEnv, url: URL, now: Date, tz: string): Promise<Section | undefined> {
  const path = SECTIONS.find(x => x.key === key)?.path
  return path ? PAGES[path].json(env, url, now, tz) : undefined
}

/** Every /_ab path: the pages, the owner's actions, a waiting photo, and the hidden list the build reads. */
export async function adminRoute(req: Request, url: URL, env: AdminEnv, now = new Date()): Promise<Response> {
  const path = url.pathname
  const owner = async () => (await visitor(req, env, now)) === 'owner'
  // The two private images the app shows too: the owner's app session as a bearer, or the owner's cookie.
  const ownerOrApp = async () => (await appVisitor(req, env, now)) === 'owner' || (await owner())
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
  if (path === '/_ab/thanh-cong.json') {
    // The scoreboard as data, for the site lead (Bearer token) as for the owner; only its counts, nobody's details.
    if (req.method !== 'GET' || (!bearerOk(req, env.AB_DASH_TOKEN) && !(await owner()))) return notFound()
    return Response.json(await loadScoreboard(env, url, now), { headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } })
  }
  // The owner's alone (the page's cookie or the app's bearer, never the dashboard token), never stored, and only while it
  // waits: the upload is private until published.
  const photo = WAITING_PHOTO.exec(path)
  if (photo) {
    if (req.method !== 'GET' || !(await ownerOrApp()) || !photosLive(env)) return notFound()
    const o = await waitingUpload(env, photo[1]!)
    if (!o) return notFound()
    return new Response(o.body, { headers: { 'content-type': o.httpMetadata?.contentType ?? 'application/octet-stream', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow' } })
  }
  if (path === '/_ab/photos') {
    if (req.method !== 'POST' || !(await owner()) || !photosLive(env)) return notFound()
    const form = await req.formData().catch(() => null)
    if (!form) return badForm()
    const id = String(form.get('id') ?? '')
    // Duyệt: the next moderation pass publishes it; Gỡ (any other action): removed now.
    if (form.get('action') === 'approve') await approveByOwner(env, id, now)
    else await removePhoto(env, id, 'removed by owner', now)
    return see('/_ab/anh-ban-doc/')
  }
  // A kept fish-ID photo: shown only to the owner (the page or the app), deleted from the page here (fishid/kept.ts).
  const shot = /^\/_ab\/anh-nhan-dien\/anh\/([0-9a-z-]+)\/([0-9a-f-]{36})$/.exec(path)
  if (shot) {
    if (req.method !== 'GET' || !env.UPLOADS || !(await ownerOrApp())) return notFound()
    const o = await keptImage(env.UPLOADS, shot[1] === 'anon' ? undefined : shot[1], shot[2]!)
    return o ? new Response(o.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' } }) : notFound()
  }
  if (path === '/_ab/anh-nhan-dien/xoa') {
    if (req.method !== 'POST' || !env.UPLOADS || !(await owner())) return notFound()
    const form = await req.formData().catch(() => null)
    if (!form) return badForm()
    const who = String(form.get('who') ?? '')
    await deleteKept(env.UPLOADS, who === 'anon' ? undefined : who, String(form.get('id') ?? ''))
    return see('/_ab/anh-nhan-dien/')
  }
  // How the daily report goes out (daily/settings.ts): one switch a button, email=0|1 or push=0|1.
  if (path === SETTINGS_FORM) {
    if (req.method !== 'POST' || !(await owner())) return notFound()
    const form = await req.formData().catch(() => null)
    const change: Partial<ReportSettings> = {}
    for (const k of ['email', 'push'] as const) {
      const v = form?.get(k)
      if (v === '0' || v === '1') change[k] = v === '1'
    }
    if (!Object.keys(change).length) return badForm()
    await setSettings(env.AB, change)
    return see(REPORT_PATH)
  }
  if (path === '/_ab/hidden') {
    if (req.method !== 'POST' || !(await owner())) return notFound()
    const form = await req.formData().catch(() => null)
    if (!form) return badForm()
    const err = await updateHidden(env.AB, form, now)
    if (err) return new Response(err, { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
    return see('/_ab/an-trang/')
  }

  const key = (path.endsWith('/') ? path : `${path}/`) as WebPath
  const report = REPORT_PAGE.exec(key)
  const render: Load<string | undefined> | undefined = key === '/_ab/' ? overviewHtml : key === SCOREBOARD_PATH ? scoreboardHtml : Object.hasOwn(PAGES, key) ? PAGES[key as keyof typeof PAGES].html : report ? reportHtml(report[1]!) : undefined
  if (!render) return notFound()
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' } })
  const who = await visitor(req, env, now)
  // Not the owner: the sign-in, on this page's address (and that this account isn't the owner's).
  if (who !== 'owner') return signInPage(env, url, key, who === 'other')
  // Refreshes the owner flag so the on-page hide button keeps showing (see owner.ts), and drops the old token cookie.
  const headers = new Headers(HTML)
  for (const c of [OWNER_COOKIE, OLD_TOKEN_COOKIE]) headers.append('set-cookie', c)
  const html = req.method === 'HEAD' ? null : await render(env, url, now, viewerZone(req))
  return html === undefined ? notFound() : new Response(html, { headers })
}
