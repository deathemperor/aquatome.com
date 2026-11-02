import { ipDayKey, siteverify as realSiteverify } from '../comments/api'
import { sniff } from '../photos'
import type { Catalog, Lang } from './catalog'
import { askClaude, DEFAULT_MODEL, readAnswer, type Answer, type ImageType } from './claude'
import { healthyKeys, loadKeys, parseKeys, rotate, type Attempt, type HealthStore, type KeyEntry, type KeyHealth, type KeyProblem } from './keys'
import { matchGuesses } from './match'
import { relayFetch } from './relay'
import { readerOf, recordWanted } from '../wanted'

/**
 * /api/fish-id: a reader's photo → Claude's guesses → the handbook's pages for them (the page
 * /vi/cong-cu/nhan-dien-ca/; the app can call it too).
 *
 * GET: whether the tool is on ({ on: false } when off), and the Turnstile site key. POST (multipart: file, token, lang;
 * or JSON: image as base64, token, lang): the identification, 503 fish_id_off when off. Off without a key in the
 * ANTHROPIC_KEYS secret, Turnstile or the rate-limit key. The photo is never stored or logged; the log has counts, timings, the model, token usage and keys by hash only.
 */
export type FishIdEnv = {
  AB: KVNamespace
  ASSETS: Fetcher
  /** One key per line, `<key>` or `<key> <workspaceId>` (worker/fishid/keys.ts). */
  ANTHROPIC_KEYS?: string
  FISH_ID_MODEL?: string
  /** The Durable Object the calls to Claude go out through (relay.ts); without it, straight from the Worker. */
  FISHID_RELAY?: DurableObjectNamespace
  /** Identifications per reader (IP) per day, and for the whole site per day (defaults 10 and 300). */
  FISH_ID_PER_IP?: string
  FISH_ID_PER_DAY?: string
  TURNSTILE_SECRET?: string
  TURNSTILE_SITEKEY?: string
  COMMENT_HMAC_KEY?: string
}
type Live = FishIdEnv & { ANTHROPIC_KEYS: string; TURNSTILE_SECRET: string; TURNSTILE_SITEKEY: string; COMMENT_HMAC_KEY: string }
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
const PER_DAY = 300
/** How sure Claude must be of a guess with no page for it to count as a reader's request. */
const WANTED_CONFIDENCE = 0.6
const DAY_SEC = 86_400

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } })
/** On with at least one readable key (a file of comments only is none), Turnstile and the rate-limit key. */
const live = (env: FishIdEnv): env is Live => Boolean(parseKeys(env.ANTHROPIC_KEYS).entries.length && env.TURNSTILE_SECRET && env.TURNSTILE_SITEKEY && env.COMMENT_HMAC_KEY)
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
/** Today's (UTC) count: identifications, and calls per key. One KV value, written once per identification. */
type Day = { calls: number; keys: Record<string, number> }
const dayKey = (now: Date) => `fishid:day:${now.toISOString().slice(0, 10)}`
const readDay = async (kv: KVNamespace, now: Date): Promise<Day> => (await kv.get<Day>(dayKey(now), 'json')) ?? { calls: 0, keys: {} }

let keysCache: { text: string; keys: Promise<{ keys: KeyEntry[]; bad: number }> } | undefined
const keysOf = (text: string) => (keysCache?.text === text ? keysCache.keys : (keysCache = { text, keys: loadKeys(text) }).keys)

let catalogCache: { at: number; origin: string; catalog: Promise<Catalog | null> } | undefined
/** The pages to link to, from the deploy's own assets (built with the pages), kept 10 minutes per isolate; a failed read isn't kept, so the next photo tries again. */
function catalogOf(env: FishIdEnv, origin: string): Promise<Catalog | null> {
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

type Upload = { bytes: Uint8Array | null; token: string; lang: Lang }
async function parseUpload(req: Request, body: Uint8Array): Promise<Upload | null> {
  const type = req.headers.get('content-type') ?? ''
  const langOf = (v: unknown) => LANGS.find(l => l === v) ?? 'vi'
  if (type.startsWith('multipart/form-data')) {
    const form = await new Response(body, { headers: { 'content-type': type } }).formData().catch(() => null)
    if (!form) return null
    const file = form.get('file')
    const bytes = file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : null
    return { bytes, token: String(form.get('token') ?? ''), lang: langOf(form.get('lang')) }
  }
  if (type.startsWith('application/json')) {
    const raw = (() => { try { return JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown> } catch { return null } })()
    if (!raw) return null
    return { bytes: typeof raw.image === 'string' ? fromBase64(raw.image) : null, token: typeof raw.token === 'string' ? raw.token : '', lang: langOf(raw.lang) }
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
    return json({ on: true, sitekey: env.TURNSTILE_SITEKEY, resting, perIp: limit(env.FISH_ID_PER_IP, PER_IP) })
  }
  if (req.method !== 'POST') return new Response(null, { status: 405 })
  if (!live(env)) return json({ error: 'fish_id_off' }, 503)
  // Browsers send Origin: another site's page may not use our quota. A native app sends none.
  const origin = req.headers.get('origin')
  if (origin && origin !== url.origin) return json({ error: 'cross-origin' }, 403)
  // Base64 in JSON is 4/3 of the photo, plus the form's other fields.
  const body = await readBytes(req, Math.ceil(MAX_IMAGE * 4 / 3) + 16 * 1024)
  if (!body) return json({ error: 'too large' }, 413)
  const up = await parseUpload(req, body)
  if (!up) return json({ error: 'bad form' }, 400)
  if (!up.bytes?.length) return json({ error: 'no file' }, 400)
  if (up.bytes.length > MAX_IMAGE) return json({ error: 'too large' }, 413)
  const type = sniff(up.bytes)
  if (!type) return json({ error: 'not an image' }, 415)
  const ip = req.headers.get('cf-connecting-ip')
  if (!up.token || !(await (deps.siteverify ?? realSiteverify)(env.TURNSTILE_SECRET, up.token, ip, url.hostname))) return json({ error: 'turnstile' }, 403)

  // Limits, before any call: a reader's day, then the site's.
  const perIp = limit(env.FISH_ID_PER_IP, PER_IP)
  const ipKey = `fishid:ip:${(await ipDayKey(env.COMMENT_HMAC_KEY, ip ?? 'unknown', now)).slice(3)}`
  const used = Number((await env.AB.get(ipKey)) ?? 0)
  if (used >= perIp) return json({ error: 'rate', limit: perIp }, 429)
  const day = await readDay(env.AB, now)
  if (day.calls >= limit(env.FISH_ID_PER_DAY, PER_DAY)) return json({ error: 'busy' }, 429)
  const store = kvHealth(env.AB)
  const healthy = await healthyKeys((await keysOf(env.ANTHROPIC_KEYS)).keys, store, now.getTime())
  if (!healthy.length) return json({ error: 'resting' }, 503)
  await env.AB.put(ipKey, String(used + 1), { expirationTtl: DAY_SEC })

  const model = env.FISH_ID_MODEL || DEFAULT_MODEL
  const photo = { data: base64(up.bytes), type: type as ImageType }
  const t = Date.now()
  const out = await rotate(healthy, store, (key, timeoutMs) => askClaude(key, photo, { model, lang: up.lang, timeoutMs, fetch: deps.fetch ?? (env.FISHID_RELAY ? relayFetch(env.FISHID_RELAY) : undefined) }), { random: deps.random })
  day.calls++
  for (const a of out.attempts) day.keys[a.hash] = (day.keys[a.hash] ?? 0) + 1
  await env.AB.put(dayKey(now), JSON.stringify(day), { expirationTtl: 3 * DAY_SEC })
  const log = (outcome: string, extra: Record<string, unknown> = {}) =>
    (deps.log ?? (l => console.log(JSON.stringify(l))))({ fishId: outcome, model, ms: Date.now() - t, attempts: out.attempts.map(slim), ...extra })
  if (!out.ok) {
    log(out.reason)
    return out.reason === 'request' ? json({ error: 'failed' }, 502) : json({ error: out.reason }, 503)
  }
  let answer: Answer
  try {
    answer = readAnswer(out.value)
  } catch (e) {
    log('unreadable', { why: String((e as Error).message).slice(0, 80) })
    return json({ error: 'failed' }, 502)
  }
  const usage = { in: answer.usage.input, out: answer.usage.output }
  if (answer.refused) {
    log('refused', usage)
    return json({ verdict: 'unclear', results: [], refused: true, model })
  }
  const { verdict, guesses } = answer.id
  const catalog = verdict === 'other' ? null : await catalogOf(env, url.origin)
  const results = verdict === 'other' ? [] : catalog ? matchGuesses(guesses, catalog, up.lang) : guesses
  // A fish or plant Claude is fairly sure of that has no page: a reader's request, as a tank's entry without a page is
  // (worker/wanted.ts), counted once a reader a day. Not the owner trying it out.
  const top = catalog && (verdict === 'fish' || verdict === 'plant') ? results[0] : undefined
  if (top && !('page' in top && top.page) && top.confidence >= WANTED_CONFIDENCE && !/(?:^|;\s*)aq_owner=1(?:;|$)/.test(req.headers.get('cookie') ?? '')) {
    await recordWanted(env, { kind: verdict, name: top.commonName || top.scientificName, sci: top.scientificName, source: 'fish-id', reader: await readerOf(req, env, now) }, now).catch(() => undefined)
  }
  log('ok', { ...usage, verdict, guesses: results.length, linked: results.filter(r => 'page' in r && r.page).length, ...(catalog || verdict === 'other' ? {} : { catalog: 'missing' }) })
  return json({ verdict, results, model })
}
const slim = (a: Attempt) => ({ key: a.hash, ms: a.ms, ...(a.status ? { status: a.status } : {}), ...(a.marked ? { marked: a.marked } : {}) })

/** The owner's dashboard: each key by number and hash, whether it is in use or set aside (until when), today's calls. */
export type KeyRow = { n: number; hash: string; workspace: boolean; state: 'ok' | KeyProblem; until?: string; calls: number }
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
    return { n: i + 1, hash: k.hash, workspace: Boolean(k.workspace), state: off ? off.why : 'ok', ...(off ? { until: new Date(off.until).toISOString() } : {}), calls: day.keys[k.hash] ?? 0 }
  }))
  return { rows, bad, today: day.calls, model: env.FISH_ID_MODEL || DEFAULT_MODEL }
}
