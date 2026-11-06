import { LANGS } from '@aq/schema/langs'
import type Anthropic from '@anthropic-ai/sdk'
import { LIMITS, type Limits } from '../agent/loop'
import { sessionOf } from '../accounts/session'
import { isBot } from '../bots'
import { accountDayKey, appAccount, ipDayKey, siteverify as realSiteverify } from '../comments/api'
import { sniff } from '../photos'
import { identifyWithAgent, type AgentOutcome } from './agent'
import type { Step } from './agent-tools'
import type { Catalog, Lang } from './catalog'
import { askClaude, costOf, DEFAULT_MODEL, readAnswer, worstCost, type Answer, type ImageType, type Usage } from './claude'
import { factShardOf, factShards, type Facts, type FactsShard } from './facts'
import { healthyKeys, loadKeys, parseKeys, rotate, type Attempt, type HealthStore, type KeyEntry, type KeyHealth, type KeyProblem } from './keys'
import { keepPhoto } from './kept'
import { emptyDay, ledgerClient, type Counts } from './ledger'
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
 * ANTHROPIC_KEYS secret, Turnstile, the rate-limit key, the database or the ledger (ledger.ts: the readers' and the
 * site's counts and spend, admitted in one step). The photo is never logged, and stored only when
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
  /** The Durable Object that counts readers, the site's day and its spend (ledger.ts); without it the tool is off. */
  FISHID_LEDGER?: DurableObjectNamespace
  /** Identifications per reader (IP) per day, per app account per day, and for the whole site per day (defaults 10, 10 and 300). */
  FISH_ID_PER_IP?: string
  FISH_ID_PER_ACCOUNT?: string
  FISH_ID_PER_DAY?: string
  /** The site's spend a day at list price, in USD (default 15): past it, identifications answer busy as past the count. */
  FISH_ID_USD_PER_DAY?: string
  /** "1": fish ID as an agent (agent.ts), which checks its guesses against the handbook; anything else, today's single call. */
  FISH_ID_AGENT?: string
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
type Live = FishIdEnv & { ANTHROPIC_KEYS: string; TURNSTILE_SECRET: string; TURNSTILE_SITEKEY: string; COMMENT_HMAC_KEY: string; DB: D1Database; FISHID_LEDGER: DurableObjectNamespace }
type Siteverify = typeof realSiteverify
export type FishIdDeps = {
  siteverify?: Siteverify
  /** The SDK's fetch: tests hand it a fake Claude. */
  fetch?: typeof fetch
  random?: () => number
  log?: (line: Record<string, unknown>) => void
  /** The agent's limits (tests make them small), and the stream's ping interval. */
  limits?: Partial<Limits>
  pingMs?: number
}

/** The page sends a JPEG of 1024 px at most (~200 KB); anything this big is not from it. */
export const MAX_IMAGE = 1.5 * 1024 * 1024
const PER_IP = 10
const PER_ACCOUNT = 10
const PER_DAY = 300
const USD_PER_DAY = 15
/** A stream's keep-alive while Claude works, so no proxy closes it. */
const PING_MS = 10_000
/** How sure Claude must be of a guess with no page for it to count as a reader's request. */
const WANTED_CONFIDENCE = 0.6
/**
 * A run, from the photo read to its settle, ends within this: the platform keeps a request's waitUntil 30 s after the
 * reader's connection drops, and the settle (the retry's copy, the ledger) needs the rest.
 */
const RUN_WITHIN_MS = 28_000
/** Today's single call's rotation over the keys (keys.ts), as before. */
const SINGLE_BUDGET_MS = 25_000

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } })
/** On with at least one readable key (a file of comments only is none), Turnstile, the rate-limit key, the accounts' database and the ledger. */
const live = (env: FishIdEnv): env is Live => Boolean(parseKeys(env.ANTHROPIC_KEYS).entries.length && env.TURNSTILE_SECRET && env.TURNSTILE_SITEKEY && env.COMMENT_HMAC_KEY && env.DB && env.FISHID_LEDGER)
const limit = (v: string | undefined, d: number) => (Number(v) > 0 ? Math.floor(Number(v)) : d)
const usdLimit = (env: FishIdEnv) => (Number(env.FISH_ID_USD_PER_DAY) > 0 ? Number(env.FISH_ID_USD_PER_DAY) : USD_PER_DAY)

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
/** Today (UTC), as the ledger counts days. */
const dayOf = (now: Date) => now.toISOString().slice(0, 10)

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

const factsCache = new Map<string, { at: number; shard: Promise<FactsShard | null> }>()
/**
 * A page's facts for the agent's get_entry (facts.ts): its shard from the deploy's assets, kept 10 minutes per isolate.
 * A shard that can't be read throws (get_entry says so and counts it) and isn't kept, so the next photo tries again.
 */
export function factsOf(env: Pick<FishIdEnv, 'ASSETS'>, origin: string, catalog: Catalog): (id: string) => Promise<Facts | undefined> {
  const shards = catalog.shards ?? factShards(catalog)
  return async id => {
    const n = factShardOf(id, shards)
    const k = `${origin} ${shards} ${n}`
    let hit = factsCache.get(k)
    if (!hit || Date.now() - hit.at > 600_000) {
      const entry = { at: Date.now(), shard: env.ASSETS.fetch(new Request(new URL(`/app/fish-id/facts-${n}.json`, origin))).then(r => (r.ok ? (r.json() as Promise<FactsShard>) : null)).catch(() => null) }
      factsCache.set(k, entry)
      entry.shard.then(s => { if (!s && factsCache.get(k) === entry) factsCache.delete(k) })
      hit = entry
    }
    const shard = await hit.shard
    if (!shard) {
      console.error(`fish-id facts: shard ${n} of ${shards} unreadable`)
      throw new Error('facts unreadable')
    }
    return shard.entries.find(f => f.id === id)
  }
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

export async function fishId(req: Request, url: URL, env: FishIdEnv, now: Date, deps: FishIdDeps = {}, wait: (p: Promise<unknown>) => void = p => void p): Promise<Response> {
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
  // A stream writes it when its run ends (identify takes it over), not when the stream starts.
  const arrived = Date.now()
  const rec = emptyLog(env.FISH_ID_MODEL || DEFAULT_MODEL)
  rec.country = String((req as { cf?: { country?: string } }).cf?.country ?? '')
  const point = { later: false, write: () => {
    rec.ms = Date.now() - arrived
    rec.outcome ||= 'error'
    try { env.FISHID_LOG?.writeDataPoint(toFishIdPoint(rec)) } catch (e) { console.error('fish-id log:', e) }
  } }
  try {
    return await identify(req, url, env, now, deps, rec, wait, point)
  } finally {
    if (!point.later) point.write()
  }
}

/** What an identification answers: the JSON body and its status (a stream sends the body as its last event). */
type Done = { status: number; body: Record<string, unknown> }
/** A run's outcome, from today's single call or the agent, before its answer is read. */
type Called = { attempts: Attempt[]; usage: Usage; agent?: Pick<AgentOutcome, 'calls' | 'tools' | 'photos' | 'steps' | 'stopped' | 'later400'> } & ({ ok: true; message: Anthropic.Message; hash: string } | { ok: false; reason: 'resting' | 'unavailable' | 'request' })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** How long a result is kept for a retry with the same Idempotency-Key. */
const RETRY_SEC = 15 * 60
const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const streamHeaders = { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' }

async function identify(req: Request, url: URL, env: FishIdEnv, now: Date, deps: FishIdDeps, rec: CallLog, wait: (p: Promise<unknown>) => void, point: { later: boolean; write: () => void }): Promise<Response> {
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
  // The app's Idempotency-Key, when sent, is a UUID (protocols/fishid.openapi.json): anything else is refused, not ignored.
  const idem = req.headers.get('idempotency-key')?.trim() ?? ''
  if (idem && !UUID.test(idem)) return refuse('bad idempotency-key', 400)
  // Base64 in JSON is 4/3 of the photo, plus the form's other fields.
  const body = await readBytes(req, Math.ceil(MAX_IMAGE * 4 / 3) + 16 * 1024)
  if (!body) return refuse('too large', 413)
  const read = Date.now()
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

  // Limits, before any call, in one step in the ledger (ledger.ts): a reader's day, then the site's day and spend, then
  // whether a key is healthy. The app's reader is its account: many phones share one carrier address.
  const perReader = account ? limit(env.FISH_ID_PER_ACCOUNT, PER_ACCOUNT) : limit(env.FISH_ID_PER_IP, PER_IP)
  const readerKey = account
    ? `fishid:acct:${(await accountDayKey(env.COMMENT_HMAC_KEY, account, now)).slice(3)}`
    : `fishid:ip:${(await ipDayKey(env.COMMENT_HMAC_KEY, ip ?? 'unknown', now)).slice(3)}`
  const stream = /(^|[\s,])text\/event-stream\b/i.test(req.headers.get('accept') ?? '')
  // A retry of a photo already answered (the app's Idempotency-Key, under its reader): the kept result, no call and no count.
  const retryKey = idem ? `fishid:run:${readerKey.slice(7)}:${idem.toLowerCase()}` : ''
  const kept = retryKey ? await env.AB.get<Record<string, unknown>>(retryKey, 'json') : null
  if (kept) {
    rec.outcome = 'retry'
    return stream ? new Response(sse('result', kept), { headers: streamHeaders }) : json(kept)
  }
  const model = rec.model
  const agentOn = env.FISH_ID_AGENT === '1'
  const lim = { ...LIMITS, ...deps.limits }
  const store = kvHealth(env.AB)
  const healthy = await healthyKeys((await keysOf(env.ANTHROPIC_KEYS)).keys, store, now.getTime())
  const ledger = ledgerClient(env.FISHID_LEDGER)
  const day = dayOf(now)
  // The run's worst cost is reserved (the agent's at its limits, though it may fall back to today's call); the settle reconciles.
  const admitted = await ledger.admit({ day, reader: readerKey, perReader, perDay: limit(env.FISH_ID_PER_DAY, PER_DAY), usdCap: usdLimit(env), reserve: worstCost(model, agentOn ? lim : undefined), healthy: healthy.length > 0 })
    .catch(e => { console.error('fish-id ledger:', e); return null })
  if (!admitted) return refuse('unavailable', 503)
  if (!admitted.ok) return admitted.error === 'rate' ? refuse('rate', 429, { limit: admitted.limit }) : refuse(admitted.error, admitted.error === 'busy' ? 429 : 503)
  const run = admitted.run

  const photo = { data: base64(up.bytes), type: type as ImageType }
  const fetchImpl = deps.fetch ?? (env.FISHID_RELAY ? relayFetch(env.FISHID_RELAY) : undefined)
  const line = deps.log ?? (l => console.log(JSON.stringify(l)))
  /** What the settle tells the ledger: calls per key, the key that answered, the run's counts. */
  const tally: { keys: Record<string, number>; ok?: string; counts: Partial<Counts> } = { keys: {}, counts: {} }
  const count = (k: keyof Counts) => { tally.counts[k] = (tally.counts[k] ?? 0) + 1 }
  /** Each call's cost goes to the ledger as it lands: a run cut off later keeps what it spent. */
  const spends: Promise<unknown>[] = []
  const onUsage = (u: Anthropic.Usage) => {
    const usd = costOf(model, { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 })
    spends.push(ledger.spend(day, run, usd).catch(e => console.error('fish-id spend:', e)))
  }
  /** The run's time left: it ends RUN_WITHIN_MS after the photo was read. */
  const runMs = () => RUN_WITHIN_MS - (Date.now() - read)

  /** The identification, after admission: today's call, or the agent with the flag on and the page list readable. */
  const work = async (onStep?: (step: Step) => void): Promise<Done> => {
    const t = Date.now()
    const catalogFirst = agentOn ? await catalogOf(env, url.origin) : null
    let out: Called
    if (catalogFirst) {
      const a = await identifyWithAgent({ healthy, store, photo, model, lang: up.lang, fetch: fetchImpl, random: deps.random, limits: { ...deps.limits, ms: Math.min(lim.ms, runMs()) }, onStep, onUsage, tools: { catalog: catalogFirst, facts: factsOf(env, url.origin, catalogFirst), onFactsMissing: () => count('facts') } })
      const agent = { calls: a.calls, tools: a.tools, photos: a.photos, steps: a.steps, stopped: a.stopped, ...(a.later400 !== undefined ? { later400: a.later400 } : {}) }
      out = { ...(a.ok ? { ok: true, message: a.message, hash: a.hash } : { ok: false, reason: a.reason }), attempts: a.attempts, usage: { input: a.spent.input, output: a.spent.output, cacheRead: a.spent.cacheRead, cacheWrite: a.spent.cacheWrite }, agent }
      if (a.stopped === 'fallback') count('fallback')
      if (a.stopped === 'calls') count('callLimit')
      if (a.later400 !== undefined) count('later400')
    } else {
      const r = await rotate(healthy, store, (key, timeoutMs) => askClaude(key, photo, { model, lang: up.lang, timeoutMs, fetch: fetchImpl }), { random: deps.random, budgetMs: Math.min(SINGLE_BUDGET_MS, runMs()) })
      if (r.ok) onUsage(r.value.usage)
      out = r.ok
        ? { ok: true, message: r.value, hash: r.hash, attempts: r.attempts, usage: { input: r.value.usage?.input_tokens ?? 0, output: r.value.usage?.output_tokens ?? 0 } }
        : { ok: false, reason: r.reason, attempts: r.attempts, usage: { input: 0, output: 0 } }
    }
    // Tokens from the messages themselves: an answer that can't be read was still paid for, and so were the agent's calls before one failed.
    rec.input = out.usage.input + (out.usage.cacheRead ?? 0) + (out.usage.cacheWrite ?? 0)
    rec.output = out.usage.output
    rec.cost = costOf(model, out.usage)
    if (out.agent) Object.assign(rec, { turns: out.agent.calls, tools: out.agent.tools, refs: out.agent.photos, stopped: out.agent.stopped } satisfies Partial<CallLog>)
    else if (out.ok) rec.turns = 1
    for (const a of out.attempts) tally.keys[a.hash] = (tally.keys[a.hash] ?? 0) + 1
    if (out.ok) tally.ok = out.hash
    const log = (outcome: string, extra: Record<string, unknown> = {}) => {
      rec.outcome = outcome
      // The agent's counts and its steps' kinds; never what it searched for. A later call's 400: the API's message.
      const agent = out.agent ? { turns: out.agent.calls, tools: out.agent.tools, refs: out.agent.photos, stopped: out.agent.stopped, steps: out.agent.steps.map(s => s.kind), ...(out.agent.later400 !== undefined ? { later400: out.agent.later400 } : {}) } : {}
      line({ fishId: outcome, model, ms: Date.now() - t, attempts: out.attempts.map(slim), ...agent, ...extra })
    }
    rec.attempts = out.attempts.length
    rec.key = out.ok ? out.hash : (out.attempts.at(-1)?.hash ?? '')
    if (!out.ok) {
      log(out.reason)
      return out.reason === 'request' ? { status: 502, body: { error: 'failed' } } : { status: 503, body: { error: out.reason } }
    }
    let answer: Answer
    try {
      answer = readAnswer(out.message)
    } catch (e) {
      log('unreadable', { why: String((e as Error).message).slice(0, 80) })
      return { status: 502, body: { error: 'failed' } }
    }
    const usage = out.agent ? { in: rec.input, out: rec.output } : { in: answer.usage.input, out: answer.usage.output }
    const steps = out.agent?.steps.length ? { steps: out.agent.steps } : {}
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
      return { status: 200, body: { verdict: 'unclear', results: [], refused: true, model, ...steps, ...await keep('unclear', []) } }
    }
    const { verdict, guesses } = answer.id
    const catalog = verdict === 'other' ? null : (catalogFirst ?? await catalogOf(env, url.origin))
    const results = verdict === 'other' ? [] : catalog ? matchGuesses(guesses, catalog, up.lang) : guesses.map(({ id: _id, ...g }) => g)
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
    return { status: 200, body: { verdict, results, model, ...steps, ...await keep(verdict, results) } }
  }
  /**
   * After the run: a result is kept for a retry; the ledger gets the run's calls and counts once every call's spend has
   * landed, and gives the reader's count back only when our side failed (503), never for their photo or request (502).
   */
  const settle = async (d: Done): Promise<Done> => {
    if (d.status === 200 && retryKey) await env.AB.put(retryKey, JSON.stringify(d.body), { expirationTtl: RETRY_SEC }).catch(() => undefined)
    await Promise.allSettled(spends)
    await ledger.settle({ day, run, refund: d.status === 503, keys: tally.keys, ...(tally.ok ? { ok: tally.ok } : {}), counts: tally.counts }).catch(e => console.error('fish-id settle:', e))
    return d
  }
  /** A fault of ours mid-run: the reader sees failed, the data point says error, and the run still settles. */
  const fault = (e: unknown): Done => {
    console.error('fish-id:', e)
    return { status: 502, body: { error: 'failed' } }
  }

  if (!stream) {
    // The run goes on if the reader's connection drops (waitUntil), so a retry can fetch its result.
    const p = work().catch(fault).then(settle)
    wait(p.catch(() => undefined))
    const d = await p
    return json(d.body, d.status)
  }
  // The stream: steps as they happen, a ping every 10 s while Claude works, then the result or the error, and the end.
  point.later = true
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const enc = new TextEncoder()
  let open = true
  const send = (text: string) => { if (open) writer.write(enc.encode(text)).catch(() => { open = false }) }
  const ping = setInterval(() => send(': ping\n\n'), deps.pingMs ?? PING_MS)
  const done = work(step => send(sse('step', step)))
    .catch(fault)
    .then(settle)
    .then(async d => {
      clearInterval(ping)
      point.write()
      send(d.status === 200 ? sse('result', d.body) : sse('error', { error: d.body.error }))
      await writer.close().catch(() => undefined)
    })
  wait(done)
  return new Response(readable, { headers: streamHeaders })
}
const slim = (a: Attempt) => ({ key: a.hash, ms: a.ms, ...(a.status ? { status: a.status } : {}), ...(a.marked ? { marked: a.marked } : {}) })

/** The owner's dashboard: each key by number and hash, whether it is in use or set aside (until when), today's calls with it and the answers among them. */
export type KeyRow = { n: number; hash: string; workspace: boolean; state: 'ok' | KeyProblem; until?: string; calls: number; answered: number }
/** `counts`: today's fallbacks, runs the call limit ended, later calls refused (400), unreadable facts and refunds; `mostRefunds`: the most one reader had. */
export type FishIdStatus = { rows: KeyRow[]; bad: number; today: number; model: string; counts: Counts; mostRefunds: number }
export async function fishIdStatus(env: FishIdEnv, now: Date): Promise<FishIdStatus | undefined> {
  const text = env.ANTHROPIC_KEYS
  if (!text || !parseKeys(text).entries.length) return undefined
  const { keys, bad } = await keysOf(text)
  const store = kvHealth(env.AB)
  // The ledger's day; none (no binding, or it can't be read) reads as an empty one, as the dashboard reads a quiet day.
  const day = (env.FISHID_LEDGER ? await ledgerClient(env.FISHID_LEDGER).read(dayOf(now)).catch(e => { console.error('fish-id ledger:', e); return undefined }) : undefined)
    ?? { ...emptyDay(), mostRefunds: 0 }
  const rows = await Promise.all(keys.map(async (k, i): Promise<KeyRow> => {
    const h = await store.get(k.hash).catch(() => null)
    const off = h && h.until > now.getTime() ? h : null
    return { n: i + 1, hash: k.hash, workspace: Boolean(k.workspace), state: off ? off.why : 'ok', ...(off ? { until: new Date(off.until).toISOString() } : {}), calls: day.keys[k.hash] ?? 0, answered: day.ok[k.hash] ?? 0 }
  }))
  return { rows, bad, today: day.calls, model: env.FISH_ID_MODEL || DEFAULT_MODEL, counts: day.counts, mostRefunds: day.mostRefunds }
}
