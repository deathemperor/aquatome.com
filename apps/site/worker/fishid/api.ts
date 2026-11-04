import { sessionOf } from '../accounts/session'
import { isBot } from '../bots'
import { accountDayKey, appAccount, ipDayKey, siteverify as realSiteverify } from '../comments/api'
import { sniff } from '../photos'
import type { Catalog, Lang } from './catalog'
import { askClaude, costOf, DEFAULT_MODEL, readAnswer, type Answer, type ImageType } from './claude'
import { healthyKeys, loadKeys, parseKeys, rotate, type Attempt, type HealthStore, type KeyEntry, type KeyHealth, type KeyProblem } from './keys'
import { keepPhoto } from './kept'
import { emptyLog, FROM, toFishIdPoint, type CallLog, type From } from './log'
import { matchGuesses, type Result } from './match'
import { relayFetch } from './relay'
import { readerOf, recordWanted } from '../wanted'

/**
 * /api/fish-id: a reader's photo → Claude's guesses → the handbook's pages for them (the page
 * /vi/cong-cu/nhan-dien-ca/, and the app: protocols/fishid.openapi.json).
 *
 * GET: whether the tool is on ({ on: false } when off), and the Turnstile site key. POST (multipart: file, token, lang;
 * or JSON: image as base64, token, lang): the identification, 503 fish_id_off when off. The app sends its session as a
 * bearer instead of Origin and Turnstile, and is counted per account instead of per address. Off without a key in the
 * ANTHROPIC_KEYS secret, Turnstile, the rate-limit key or the database. The photo is never logged, and stored only when
 * the reader ticks "keep" (`keep`): 6 months, private (kept.ts). The log has counts, timings, the model, token usage and keys by hash only.
 * Each POST also writes one data point to Analytics Engine (FISHID_LOG, log.ts) for the owner's dashboard.
 */
export type FishIdEnv = {
  AB: KVNamespace
  ASSETS: Fetcher
  /** One key per line, `<key>` or `<key> <workspaceId>` (worker/fishid/keys.ts). */
  ANTHROPIC_KEYS?: string
  FISH_ID_MODEL?: string
  /** The Durable Object the calls to Claude go out through (relay.ts); without it, straight from the Worker. */
  FISHID_RELAY?: DurableObjectNamespace
  /** Identifications per reader (IP) per day, per app account per day, and for the whole site per day (defaults 10, 10 and 300). */
  FISH_ID_PER_IP?: string
  FISH_ID_PER_ACCOUNT?: string
  FISH_ID_PER_DAY?: string
  TURNSTILE_SECRET?: string
  TURNSTILE_SITEKEY?: string
  COMMENT_HMAC_KEY?: string
  /** The app's sessions (worker/accounts). */
  DB?: D1Database
  /** The private bucket photos a reader lets us keep go to (kept.ts); without it, none is kept. */
  UPLOADS?: R2Bucket
  /** Every POST's outcome, tokens and cost (log.ts); optional, as the readers' EVENTS is. */
  FISHID_LOG?: AnalyticsEngineDataset
}
type Live = FishIdEnv & { ANTHROPIC_KEYS: string; TURNSTILE_SECRET: string; TURNSTILE_SITEKEY: string; COMMENT_HMAC_KEY: string; DB: D1Database }
type Siteverify = typeof realSiteverify
export type FishIdDeps = {
  siteverify?: Siteverify
  /** The SDK's fetch: tests hand it a fake Claude. */
  fetch?: typeof fetch
  random?: () => number
  log?: (line: Record<string, unknown>) => void
}

/** The page sends a JPEG of 1024 px at most (~200 KB); anything this big is not from it. */
export const MAX_IMAGE = 1.5 * 1024 * 1024
const PER_IP = 10
const PER_ACCOUNT = 10
const PER_DAY = 300
/** How sure Claude must be of a guess with no page for it to count as a reader's request. */
const WANTED_CONFIDENCE = 0.6
const DAY_SEC = 86_400

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } })
/** On with at least one readable key (a file of comments only is none), Turnstile, the rate-limit key and the accounts' database. */
const live = (env: FishIdEnv): env is Live => Boolean(parseKeys(env.ANTHROPIC_KEYS).entries.length && env.TURNSTILE_SECRET && env.TURNSTILE_SITEKEY && env.COMMENT_HMAC_KEY && env.DB)
const limit = (v: string | undefined, d: number) => (Number(v) > 0 ? Math.floor(Number(v)) : d)
const LANGS: Lang[] = ['vi', 'id', 'th']

/**
 * Each key's problem in KV (fishid:key:<hash>), gone by itself once it no longer applies (KV's TTL, and `until`): a key
 * out of credit is skipped for 24 h by every isolate, then tried again, since its organisation may have been topped up.
 * This isolate also remembers its own marks: KV can answer "no mark" from its edge cache for up to a minute after one is
 * written, and a dead key shouldn't cost every request in that minute a failed call.
 */
const remembered = new WeakMap<KVNamespace, Map<string, KeyHealth>>()
export const kvHealth = (kv: KVNamespace): HealthStore => {
  const mine = remembered.get(kv) ?? remembered.set(kv, new Map()).get(kv)!
  return {
    get: async h => {
      const m = mine.get(h)
      if (m && m.until > Date.now()) return m
      return (await kv.get<KeyHealth>(`fishid:key:${h}`, 'json')) ?? null
    },
    mark: async (h, health, ttlSec) => {
      mine.set(h, health)
      await kv.put(`fishid:key:${h}`, JSON.stringify(health), { expirationTtl: ttlSec })
    },
  }
}
/** Today's (UTC) count: identifications, calls per key, and the calls each key got an answer to. One KV value, written once per identification. */
type Day = { calls: number; keys: Record<string, number>; ok?: Record<string, number> }
const dayKey = (now: Date) => `fishid:day:${now.toISOString().slice(0, 10)}`
const readDay = async (kv: KVNamespace, now: Date): Promise<Day> => (await kv.get<Day>(dayKey(now), 'json')) ?? { calls: 0, keys: {} }

let keysCache: { text: string; keys: Promise<{ keys: KeyEntry[]; bad: number }> } | undefined
const keysOf = (text: string) => (keysCache?.text === text ? keysCache.keys : (keysCache = { text, keys: loadKeys(text) }).keys)

let catalogCache: { at: number; origin: string; catalog: Promise<Catalog | null> } | undefined
/** The pages to link to, from the deploy's own assets (built with the pages), kept 10 minutes per isolate; a failed read isn't kept, so the next photo tries again. */
export function catalogOf(env: Pick<FishIdEnv, 'ASSETS'>, origin: string): Promise<Catalog | null> {
  if (catalogCache && catalogCache.origin === origin && Date.now() - catalogCache.at < 600_000) return catalogCache.catalog
  const entry = { at: Date.now(), origin, catalog: Promise.resolve<Catalog | null>(null) }
  entry.catalog = env.ASSETS.fetch(new Request(new URL('/app/fish-id.json', origin))).then(r => (r.ok ? (r.json() as Promise<Catalog>) : null)).catch(() => null).then(c => {
    if (!c && catalogCache === entry) catalogCache = undefined
    return c
  })
  catalogCache = entry
  return entry.catalog
}

/** Bytes → base64 in slices (spreading a whole photo into fromCharCode overflows the stack). */
function base64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}
function fromBase64(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/^data:[^,]*,/, ''))
    return Uint8Array.from(bin, c => c.charCodeAt(0))
  } catch { return null }
}

/** The body, or null past `max` bytes, without trusting content-length (a chunked body has none). */
async function readBytes(req: Request, max: number): Promise<Uint8Array | null> {
  if (Number(req.headers.get('content-length') ?? 0) > max) return null
  if (!req.body) return new Uint8Array()
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) { await reader.cancel(); return null }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let o = 0
  for (const c of chunks) { all.set(c, o); o += c.byteLength }
  return all
}

/** `keep`: the reader ticked "Cho phép AquaTome giữ ảnh này để cải thiện nhận diện". */
type Upload = { bytes: Uint8Array | null; token: string; lang: Lang; from: From | ''; keep: boolean }
async function parseUpload(req: Request, body: Uint8Array): Promise<Upload | null> {
  const type = req.headers.get('content-type') ?? ''
  const langOf = (v: unknown) => LANGS.find(l => l === v) ?? 'vi'
  const fromOf = (v: unknown) => FROM.find(f => f === v) ?? ''
  if (type.startsWith('multipart/form-data')) {
    const form = await new Response(body, { headers: { 'content-type': type } }).formData().catch(() => null)
    if (!form) return null
    const file = form.get('file')
    const bytes = file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : null
    return { bytes, token: String(form.get('token') ?? ''), lang: langOf(form.get('lang')), from: fromOf(form.get('from')), keep: ['1', 'true', 'on'].includes(String(form.get('keep') ?? '')) }
  }
  if (type.startsWith('application/json')) {
    const raw = (() => { try { return JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown> } catch { return null } })()
    if (!raw) return null
    return { bytes: typeof raw.image === 'string' ? fromBase64(raw.image) : null, token: typeof raw.token === 'string' ? raw.token : '', lang: langOf(raw.lang), from: fromOf(raw.from), keep: raw.keep === true }
  }
  return null
}

export async function fishId(req: Request, url: URL, env: FishIdEnv, now: Date, deps: FishIdDeps = {}): Promise<Response> {
  if (req.method === 'GET') {
    // The page asks this as it loads: off is an answer, not an error (a 503 there is a console error on every visit, as
    // Lighthouse counts them, until the keys are set). The identification itself answers 503 fish_id_off.
    if (!live(env)) return json({ on: false })
    const { keys } = await keysOf(env.ANTHROPIC_KEYS)
    const resting = !(await healthyKeys(keys, kvHealth(env.AB), now.getTime())).length
    return json({ on: true, sitekey: env.TURNSTILE_SITEKEY, resting, perIp: limit(env.FISH_ID_PER_IP, PER_IP), perAccount: limit(env.FISH_ID_PER_ACCOUNT, PER_ACCOUNT) })
  }
  if (req.method !== 'POST') return new Response(null, { status: 405 })
  // One data point per POST, however it ends; a fault of ours (a throw) is 'error'. Writing it never fails the request.
  const arrived = Date.now()
  const rec = emptyLog(env.FISH_ID_MODEL || DEFAULT_MODEL)
  rec.country = String((req as { cf?: { country?: string } }).cf?.country ?? '')
  try {
    return await identify(req, url, env, now, deps, rec)
  } finally {
    rec.ms = Date.now() - arrived
    rec.outcome ||= 'error'
    try { env.FISHID_LOG?.writeDataPoint(toFishIdPoint(rec)) } catch (e) { console.error('fish-id log:', e) }
  }
}

async function identify(req: Request, url: URL, env: FishIdEnv, now: Date, deps: FishIdDeps, rec: CallLog): Promise<Response> {
  /** A refusal before any call: the reader's error code is the outcome. */
  const refuse = (error: string, status: number, extra: Record<string, unknown> = {}) => {
    rec.outcome = error
    return json({ error, ...extra }, status)
  }
  if (!live(env)) return refuse('fish_id_off', 503)
  // The app: its live session stands in for Origin and Turnstile. A bearer without one is refused, never the page's way.
  const account = await appAccount(req, env.DB, now)
  if (account === 'session') return refuse('session', 401)
  // Browsers send Origin: another site's page may not use our quota.
  const origin = req.headers.get('origin')
  if (!account && origin && origin !== url.origin) return refuse('cross-origin', 403)
  // Base64 in JSON is 4/3 of the photo, plus the form's other fields.
  const body = await readBytes(req, Math.ceil(MAX_IMAGE * 4 / 3) + 16 * 1024)
  if (!body) return refuse('too large', 413)
  const up = await parseUpload(req, body)
  if (!up) return refuse('bad form', 400)
  rec.lang = up.lang
  rec.from = up.from
  if (!up.bytes?.length) return refuse('no file', 400)
  if (up.bytes.length > MAX_IMAGE) return refuse('too large', 413)
  const type = sniff(up.bytes)
  if (!type) return refuse('not an image', 415)
  const ip = req.headers.get('cf-connecting-ip')
  if (!account && (!up.token || !(await (deps.siteverify ?? realSiteverify)(env.TURNSTILE_SECRET, up.token, ip, url.hostname)))) return refuse('turnstile', 403)

  // Limits, before any call: a reader's day, then the site's. The app's reader is its account: many phones share one
  // carrier address.
  const perReader = account ? limit(env.FISH_ID_PER_ACCOUNT, PER_ACCOUNT) : limit(env.FISH_ID_PER_IP, PER_IP)
  const readerKey = account
    ? `fishid:acct:${(await accountDayKey(env.COMMENT_HMAC_KEY, account, now)).slice(3)}`
    : `fishid:ip:${(await ipDayKey(env.COMMENT_HMAC_KEY, ip ?? 'unknown', now)).slice(3)}`
  const used = Number((await env.AB.get(readerKey)) ?? 0)
  if (used >= perReader) return refuse('rate', 429, { limit: perReader })
  const day = await readDay(env.AB, now)
  if (day.calls >= limit(env.FISH_ID_PER_DAY, PER_DAY)) return refuse('busy', 429)
  const store = kvHealth(env.AB)
  const healthy = await healthyKeys((await keysOf(env.ANTHROPIC_KEYS)).keys, store, now.getTime())
  if (!healthy.length) return refuse('resting', 503)
  await env.AB.put(readerKey, String(used + 1), { expirationTtl: DAY_SEC })

  const model = rec.model
  const photo = { data: base64(up.bytes), type: type as ImageType }
  const t = Date.now()
  const out = await rotate(healthy, store, (key, timeoutMs) => askClaude(key, photo, { model, lang: up.lang, timeoutMs, fetch: deps.fetch ?? (env.FISHID_RELAY ? relayFetch(env.FISHID_RELAY) : undefined) }), { random: deps.random })
  day.calls++
  for (const a of out.attempts) day.keys[a.hash] = (day.keys[a.hash] ?? 0) + 1
  if (out.ok) day.ok = { ...day.ok, [out.hash]: (day.ok?.[out.hash] ?? 0) + 1 }
  await env.AB.put(dayKey(now), JSON.stringify(day), { expirationTtl: 3 * DAY_SEC })
  const line = deps.log ?? (l => console.log(JSON.stringify(l)))
  const log = (outcome: string, extra: Record<string, unknown> = {}) => {
    rec.outcome = outcome
    line({ fishId: outcome, model, ms: Date.now() - t, attempts: out.attempts.map(slim), ...extra })
  }
  rec.attempts = out.attempts.length
  rec.key = out.ok ? out.hash : (out.attempts.at(-1)?.hash ?? '')
  if (!out.ok) {
    log(out.reason)
    return out.reason === 'request' ? json({ error: 'failed' }, 502) : json({ error: out.reason }, 503)
  }
  // Tokens from the message itself: an answer that can't be read was still paid for.
  rec.input = out.value.usage?.input_tokens ?? 0
  rec.output = out.value.usage?.output_tokens ?? 0
  rec.cost = costOf(model, { input: rec.input, output: rec.output }) ?? 0
  let answer: Answer
  try {
    answer = readAnswer(out.value)
  } catch (e) {
    log('unreadable', { why: String((e as Error).message).slice(0, 80) })
    return json({ error: 'failed' }, 502)
  }
  const usage = { in: answer.usage.input, out: answer.usage.output }
  // Kept only when asked, with the answer: a JPEG (what the page and the app send), its own metadata cut, under the
  // account that sent it (the app's bearer, or the page's signed-in cookie), or no one's. `kept` says whether it was.
  const keep = async (verdict: string, guesses: Result[]) => {
    if (!up.keep) return {}
    const owner = account ?? (await sessionOf(req, env.DB, now))?.userId
    const id = env.UPLOADS && type === 'image/jpeg'
      ? await keepPhoto(env.UPLOADS, owner, up.bytes!, { verdict, guesses, model, lang: up.lang }, now).catch(e => { console.error('fish-id keep:', e); return null })
      : null
    return { kept: Boolean(id) }
  }
  if (answer.refused) {
    log('refused', usage)
    return json({ verdict: 'unclear', results: [], refused: true, model, ...await keep('unclear', []) })
  }
  const { verdict, guesses } = answer.id
  const catalog = verdict === 'other' ? null : await catalogOf(env, url.origin)
  const results = verdict === 'other' ? [] : catalog ? matchGuesses(guesses, catalog, up.lang) : guesses
  // A fish or plant Claude is fairly sure of that has no page: a reader's request, as a tank's entry without a page is
  // (worker/wanted.ts), counted once a reader a day. Not the owner trying it out, nor our own checks.
  const top = catalog && (verdict === 'fish' || verdict === 'plant') ? results[0] : undefined
  const reader = !/(?:^|;\s*)aq_owner=1(?:;|$)/.test(req.headers.get('cookie') ?? '') && !isBot(req.headers.get('user-agent'), req.headers.get('accept-language'))
  if (top && !('page' in top && top.page) && top.confidence >= WANTED_CONFIDENCE && reader) {
    await recordWanted(env, { kind: verdict, name: top.commonName || top.scientificName, sci: top.scientificName, source: 'fish-id', reader: await readerOf(req, env, now) }, now).catch(() => undefined)
  }
  const first: Result | undefined = results[0]
  Object.assign(rec, { verdict, top: first?.scientificName ?? '', confidence: first?.confidence ?? 0, page: first?.page?.id ?? '', guesses: results.length } satisfies Partial<CallLog>)
  log('ok', { ...usage, verdict, guesses: results.length, linked: results.filter(r => 'page' in r && r.page).length, ...(catalog || verdict === 'other' ? {} : { catalog: 'missing' }) })
  return json({ verdict, results, model, ...await keep(verdict, results) })
}
const slim = (a: Attempt) => ({ key: a.hash, ms: a.ms, ...(a.status ? { status: a.status } : {}), ...(a.marked ? { marked: a.marked } : {}) })

/** The owner's dashboard: each key by number and hash, whether it is in use or set aside (until when), today's calls with it and the answers among them. */
export type KeyRow = { n: number; hash: string; workspace: boolean; state: 'ok' | KeyProblem; until?: string; calls: number; answered: number }
export type FishIdStatus = { rows: KeyRow[]; bad: number; today: number; model: string }
export async function fishIdStatus(env: FishIdEnv, now: Date): Promise<FishIdStatus | undefined> {
  const text = env.ANTHROPIC_KEYS
  if (!text || !parseKeys(text).entries.length) return undefined
  const { keys, bad } = await keysOf(text)
  const store = kvHealth(env.AB)
  const day = await readDay(env.AB, now)
  const rows = await Promise.all(keys.map(async (k, i): Promise<KeyRow> => {
    const h = await store.get(k.hash).catch(() => null)
    const off = h && h.until > now.getTime() ? h : null
    return { n: i + 1, hash: k.hash, workspace: Boolean(k.workspace), state: off ? off.why : 'ok', ...(off ? { until: new Date(off.until).toISOString() } : {}), calls: day.keys[k.hash] ?? 0, answered: day.ok?.[k.hash] ?? 0 }
  }))
  return { rows, bad, today: day.calls, model: env.FISH_ID_MODEL || DEFAULT_MODEL }
}
