#!/usr/bin/env node
// Google Search Console's figures for the content page's quality score (search-console.yml, apps/site/worker/admin/quality.ts):
// per page, the last 28 days Google has (it runs two days behind) and the 28 before them, and the top page-and-query rows,
// POSTed to the site, which keeps the latest. Read through a service account that is a restricted (read-only) user of
// sc-domain:aquatome.com. GSC_SERVICE_ACCOUNT is its key's JSON, or GSC_SERVICE_ACCOUNT_FILE the key's path (on the Mac,
// ~/.config/aquatome/gsc-service-account.json). AB_DASH_TOKEN is the dashboard token. DRY_RUN=1 prints a summary instead.
import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const SITE = 'sc-domain:aquatome.com'
const POST_URL = 'https://aquatome.com/_ab/search-console'
const DAYS = 28
/** Google's figures are final about two days after. */
const LAG = 2
/** The page-and-query rows kept, by impressions: the gaps list reads the top ones, and the site takes up to 2 MB. */
const MAX_QUERIES = 5000
const DAY_MS = 86_400_000
const ROW_LIMIT = 25_000

const isoDay = ms => new Date(ms).toISOString().slice(0, 10)
/** The two windows, by UTC day: the last DAYS days ending LAG days ago, and the DAYS days before them. */
export function windows(now = Date.now()) {
  const to = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()) - LAG * DAY_MS
  const from = to - (DAYS - 1) * DAY_MS
  return { from: isoDay(from), to: isoDay(to), prevFrom: isoDay(from - DAYS * DAY_MS), prevTo: isoDay(from - DAY_MS) }
}

/**
 * A result's address as the site's path: any scheme or www, no query or hash, and an old /vi/… address as the page's
 * address now (apps/site/worker/paths.ts withoutVi), so both count for one page. Null for another host.
 */
export function sitePath(address) {
  let u
  try { u = new URL(address) } catch { return null }
  if (u.hostname !== 'aquatome.com' && u.hostname !== 'www.aquatome.com') return null
  let p = u.pathname
  if (/^\/vi(?=\/|$)/.test(p)) p = p.slice(3) || '/'
  return p.endsWith('/') || /\.[a-z0-9]+$/i.test(p) ? p : `${p}/`
}

/** Rows that land on one key, summed, with the position weighted by impressions (Google's own average). */
function add(m, key, impr, clicks, pos) {
  const x = m.get(key) ?? { impr: 0, clicks: 0, posW: 0 }
  x.impr += impr
  x.clicks += clicks
  x.posW += pos * impr
  m.set(key, x)
}
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d
const posOf = x => (x.impr ? round(x.posW / x.impr) : 0)

/** The site's payload (quality.ts Gsc) from Search Console's rows: `pages` and `before` by page, `pairs` by page and query. */
export function payload(w, pages, before, pairs, at = new Date().toISOString()) {
  const now = new Map()
  const prev = new Map()
  for (const r of pages) { const p = sitePath(r.keys[0]); if (p) add(now, p, r.impressions, r.clicks, r.position) }
  for (const r of before) { const p = sitePath(r.keys[0]); if (p) add(prev, p, r.impressions, r.clicks, r.position) }
  const out = {}
  for (const p of new Set([...now.keys(), ...prev.keys()])) {
    const a = now.get(p) ?? { impr: 0, clicks: 0, posW: 0 }
    const b = prev.get(p) ?? { impr: 0, clicks: 0, posW: 0 }
    out[p] = [a.impr, a.clicks, posOf(a), b.impr, b.clicks]
  }
  const q = new Map()
  for (const r of pairs) { const p = sitePath(r.keys[0]); if (p && r.keys[1]) add(q, `${p}\n${r.keys[1]}`, r.impressions, r.clicks, r.position) }
  const queries = [...q].sort((a, b) => b[1].impr - a[1].impr || a[0].localeCompare(b[0])).slice(0, MAX_QUERIES)
    .map(([k, x]) => { const [p, query] = k.split('\n'); return [query.slice(0, 200), p, x.impr, x.clicks, posOf(x)] })
  return { v: 1, at, ...w, pages: out, queries }
}

const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')
async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000)
  const head = b64({ alg: 'RS256', typ: 'JWT' })
  const claim = b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key, 'base64url')
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }) })
  const j = await r.json()
  // Google's error code only: its description can quote the request.
  if (!j.access_token) throw new Error(`Google sign-in failed: ${r.status} ${j.error ?? ''}`)
  return j.access_token
}

async function query(token, body) {
  const rows = []
  for (let startRow = 0; ; startRow += ROW_LIMIT) {
    const r = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...body, rowLimit: ROW_LIMIT, startRow }),
    })
    if (!r.ok) throw new Error(`Search Console ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const page = (await r.json()).rows ?? []
    rows.push(...page)
    if (page.length < ROW_LIMIT) return rows
  }
}

async function main() {
  const key = process.env.GSC_SERVICE_ACCOUNT || (process.env.GSC_SERVICE_ACCOUNT_FILE && readFileSync(process.env.GSC_SERVICE_ACCOUNT_FILE, 'utf8'))
  if (!key) throw new Error('GSC_SERVICE_ACCOUNT (or GSC_SERVICE_ACCOUNT_FILE) is not set')
  const token = await accessToken(JSON.parse(key))
  const w = windows()
  const [pages, before, pairs] = await Promise.all([
    query(token, { startDate: w.from, endDate: w.to, dimensions: ['page'] }),
    query(token, { startDate: w.prevFrom, endDate: w.prevTo, dimensions: ['page'] }),
    query(token, { startDate: w.from, endDate: w.to, dimensions: ['page', 'query'] }),
  ])
  const body = JSON.stringify(payload(w, pages, before, pairs))
  const summary = `${w.from} to ${w.to}: ${pages.length} page rows, ${before.length} before, ${pairs.length} page-and-query rows, ${body.length} bytes`
  if (process.env.DRY_RUN) { console.log(summary); return }
  if (!process.env.AB_DASH_TOKEN) throw new Error('AB_DASH_TOKEN is not set')
  const r = await fetch(POST_URL, { method: 'POST', headers: { authorization: `Bearer ${process.env.AB_DASH_TOKEN}`, 'content-type': 'application/json' }, body })
  if (!r.ok) throw new Error(`the site answered ${r.status}: ${(await r.text()).slice(0, 200)}`)
  console.log(`${summary}; stored: ${await r.text()}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch(e => { console.error(e.message); process.exit(1) })
