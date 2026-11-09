import { LANGS } from '@aq/schema/langs'
import { allow } from './accounts/ratelimit'
import { sameSiteOk, sessionOf, tokenOf } from './accounts/session'
import { bearerOk, type AdminEnv } from './dashboard'
import { MAX_BYTES, sniff } from './photos'

/**
 * What the owner sends from a page or an app screen: their words, a screenshot and what they were looking at
 * (protocols/owner-feedback.openapi.json). It waits here, in the private bucket, until the job on the owner's Mac collects
 * it with the dashboard token and delivers it to the thread that runs the project (scripts/owner-feedback-deliver.mjs).
 * That thread takes instructions, so only the owner's signed-in account can put a report here: the dashboard token
 * reads and clears the queue and can't add to it, and the owner bar's flag grants nothing.
 *
 * Only the words are free text. Everything else is checked field by field, so what a page or address says can't pass for
 * something the owner said: a field that fails is left out, and the report still goes.
 */
export type FeedbackEnv = AdminEnv & { ACCOUNT_HMAC_KEY?: string }

const REPORTS = 'owner-feedback/'
const IMAGES = 'owner-feedback-images/'
const HOUR_MS = 3_600_000
const PER_HOUR = 30
const MAX_WORDS = 4000
const PAGE = 20
const ID = /^[0-9]{17}-[0-9a-f-]{36}$/
const ONE = /^\/_ab\/feedback\/([^/]+)$/
const IMAGE = /^\/_ab\/feedback\/([^/]+)\/image$/

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' }
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS })
const fail = (status: number, error: string) => reply({ error }, status)
const notFound = () => fail(404, 'not_found')

const owners = (env: AdminEnv) => (env.OWNER_ACCOUNTS ?? '').split(',').map(id => id.trim()).filter(Boolean)

/** One line of each kind of field, as the contract's Where has it. Anything else is left out. */
const FIELDS: Record<string, RegExp> = {
  screen: /^[A-Za-z0-9 _./-]{1,80}$/,
  kind: /^[a-z-]{1,20}$/,
  item: /^[A-Za-z0-9_.:-]{1,120}$/,
  section: /^[A-Za-z0-9_.:-]{1,120}$/,
  version: /^[A-Za-z0-9 _.+()-]{1,60}$/,
  textSize: /^[A-Za-z0-9 _.%-]{1,30}$/,
  device: /^[A-Za-z0-9 _.,:;()/+@-]{1,160}$/,
  viewport: /^[0-9]{2,5}x[0-9]{2,5}(@[0-9.]{1,4}x)?$/,
  notDrawn: /^[0-9]{1,3}$/,
}
const CHOICES: Record<string, readonly string[]> = {
  source: ['web', 'app'],
  lang: LANGS,
  theme: ['light', 'dark'],
  picture: ['drawn', 'picked', 'screen'],
}

/** A query's part that can't hold a sentence: a short word for a short word, as a filter or a one-word search has. */
const QUERY_PART = /^[A-Za-z0-9_-]{1,24}=[A-Za-z0-9.,_-]{0,24}$/

/**
 * An address on this site, kept to what an address needs: anyone can send the owner a link, and what it holds reaches the
 * thread that takes instructions. So a path of plain characters and no more than 200 of them, and a query only when every
 * part is a short word (a search of several words goes, and the screenshot shows it). Its fragment goes; null for anything
 * else. What a hyphenated path can still spell reaches the thread in code quotes, over a line saying it's no instruction.
 */
function ownAddress(value: unknown, host: string): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null
  let u: URL
  try { u = new URL(value) } catch { return null }
  if (u.protocol !== 'https:' || u.host !== host || u.username || u.password) return null
  if (u.pathname.length > 200 || !/^[A-Za-z0-9/_.~-]+$/.test(u.pathname)) return null
  const query = u.search.slice(1).split('&').filter(Boolean)
  const kept = query.length <= 6 && query.every(p => QUERY_PART.test(p)) ? query : []
  return `https://${host}${u.pathname}${kept.length ? `?${kept.join('&')}` : ''}`
}

function cleanWhere(raw: unknown, host: string): Record<string, string> {
  const where: Record<string, string> = {}
  if (!raw || typeof raw !== 'object') return where
  const r = raw as Record<string, unknown>
  for (const [k, allowed] of Object.entries(CHOICES)) {
    const v = r[k]
    if (typeof v === 'string' && allowed.includes(v)) where[k] = v
  }
  for (const [k, re] of Object.entries(FIELDS)) {
    const v = r[k]
    if (typeof v === 'string' && re.test(v)) where[k] = v
  }
  const url = ownAddress(r.url, host)
  if (url) where.url = url
  return where
}

/** The owner's words as they said them, without control characters but their line ends; cut at the limit. */
const cleanWords = (raw: unknown) => (typeof raw === 'string' ? raw : '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, MAX_WORDS)

/**
 * A time that sorts as it reads, then a uuid: R2 lists keys in order, so the queue comes oldest first. A report sent in
 * the millisecond of the one before takes the next millisecond: on the uuid alone, the two would sort at random (the
 * report's `at` keeps its own time).
 */
let lastMs = 0
const newId = (now: Date) => {
  lastMs = Math.max(now.getTime(), lastMs + 1)
  return `${new Date(lastMs).toISOString().replace(/[^0-9]/g, '')}-${crypto.randomUUID()}`
}

const MEDIA_KEY = /^\/api\/feedback\/media\/((?:[a-z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:webp|jpe?g|png|gif|avif))$/

/**
 * GET /api/feedback/media/<key>: a photo of the site, for the owner's screenshot. The photo host sends no CORS header, and
 * a picture drawn from the page can't hold one it can't read. The owner's browser session alone; it opens nothing a
 * reader can't see, but no one else has a use for it.
 */
async function mediaForCapture(req: Request, url: URL, env: FeedbackEnv, now: Date): Promise<Response> {
  const key = MEDIA_KEY.exec(url.pathname)?.[1]
  if (req.method !== 'GET' || !key || !env.DB || !env.MEDIA || tokenOf(req)?.via !== 'cookie') return notFound()
  const session = await sessionOf(req, env.DB, now)
  if (!session || !owners(env).includes(session.userId)) return notFound()
  const o = await env.MEDIA.get(key)
  if (!o) return notFound()
  return new Response(o.body, { headers: { 'content-type': o.httpMetadata?.contentType ?? 'application/octet-stream', 'cache-control': 'private, max-age=300', 'x-robots-tag': 'noindex, nofollow' } })
}

/** POST /api/feedback, and the owner's photos for the screenshot. Who it is comes first, so nobody else learns anything from the rest. */
export async function sendFeedback(req: Request, url: URL, env: FeedbackEnv, now: Date): Promise<Response> {
  if (url.pathname.startsWith('/api/feedback/')) return mediaForCapture(req, url, env, now)
  if (req.method !== 'POST') return fail(405, 'method')
  const db = env.DB
  if (!db || !tokenOf(req)) return fail(401, 'signed_out')
  try {
    const session = await sessionOf(req, db, now)
    if (!session) return fail(401, 'signed_out')
    if (!owners(env).includes(session.userId)) return fail(404, 'not_found')
    if (!sameSiteOk(req, session.via === 'cookie')) return fail(403, 'cross_site')
    if (!env.UPLOADS || !env.ACCOUNT_HMAC_KEY) return fail(503, 'unavailable')
    const length = Number(req.headers.get('content-length') ?? 0)
    if (length > MAX_BYTES + 64 * 1024) return fail(413, 'too_large')
    if (!(await allow(db, env.ACCOUNT_HMAC_KEY, `feedback|${session.userId}`, PER_HOUR, HOUR_MS, now))) return fail(429, 'rate_limited')
    const form = await req.formData().catch(() => null)
    const json = form?.get('report')
    if (!form || typeof json !== 'string' || json.length > 64 * 1024) return fail(400, 'bad_request')
    let report: { words?: unknown; where?: unknown }
    try { report = JSON.parse(json) } catch { return fail(400, 'bad_request') }
    const file = form.get('image')
    let image: { bytes: Uint8Array; type: string } | null = null
    if (file && typeof file !== 'string') {
      if (file.size > MAX_BYTES) return fail(413, 'too_large')
      const bytes = new Uint8Array(await file.arrayBuffer())
      const type = sniff(bytes)
      if (!type) return fail(400, 'bad_request')
      image = { bytes, type }
    }
    const words = cleanWords(report.words)
    if (!words && !image) return fail(400, 'bad_request')

    const id = newId(now)
    const stored = { id, at: now.toISOString(), words, where: cleanWhere(report.where, new URL(req.url).host), image: image ? { type: image.type, size: image.bytes.length } : null }
    // The image first: a report in the queue always has what it names.
    if (image) await env.UPLOADS.put(`${IMAGES}${id}`, image.bytes, { httpMetadata: { contentType: image.type } })
    try {
      await env.UPLOADS.put(`${REPORTS}${id}.json`, JSON.stringify(stored), { httpMetadata: { contentType: 'application/json' } })
    } catch (e) {
      if (image) await env.UPLOADS.delete(`${IMAGES}${id}`).catch(() => {})
      throw e
    }
    const { objects } = await env.UPLOADS.list({ prefix: REPORTS, limit: 100 })
    return reply({ id, waiting: Math.max(objects.length, 1) }, 201)
  } catch (e) {
    console.error('feedback:', e instanceof Error ? e.message : 'failed')
    return fail(503, 'unavailable')
  }
}

/** /_ab/feedback, the queue as the Mac's job reads it: the dashboard token and nothing else. */
export async function feedbackQueue(req: Request, url: URL, env: FeedbackEnv): Promise<Response> {
  if (!bearerOk(req, env.AB_DASH_TOKEN) || !env.UPLOADS) return notFound()
  const bucket = env.UPLOADS
  if (url.pathname === '/_ab/feedback') {
    if (req.method !== 'GET') return notFound()
    const { objects } = await bucket.list({ prefix: REPORTS, limit: PAGE })
    const reports = await Promise.all(objects.map(async o => (await bucket.get(o.key))?.json()))
    return reply({ reports: reports.filter(Boolean) })
  }
  const image = IMAGE.exec(url.pathname)
  if (image) {
    if (req.method !== 'GET' || !ID.test(image[1]!)) return notFound()
    const o = await bucket.get(`${IMAGES}${image[1]}`)
    if (!o) return notFound()
    return new Response(o.body, { headers: { 'content-type': o.httpMetadata?.contentType ?? 'application/octet-stream', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } })
  }
  const one = ONE.exec(url.pathname)
  if (one && req.method === 'DELETE' && ID.test(one[1]!)) {
    // The image first: while the report is listed, what it names may be gone only after a delete that the job repeats.
    await bucket.delete(`${IMAGES}${one[1]}`)
    await bucket.delete(`${REPORTS}${one[1]}.json`)
    return reply({ deleted: true })
  }
  return notFound()
}
