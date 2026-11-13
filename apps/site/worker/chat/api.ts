import type Anthropic from '@anthropic-ai/sdk'
import { isTombstone, type Device, type Tank as SavedTank } from '@aq/schema/tanks'
import { sameSiteOk, sessionOf, tokenOf } from '../accounts/session'
import { loadStore } from '../accounts/tanks'
import { accountDayKey } from '../comments/api'
import { kvHealth } from '../fishid/api'
import { clientFor, costOf, DEFAULT_MODEL, priceOf } from '../fishid/claude'
import { healthyKeys, isApiError, loadKeys, rotate, type Attempt, type KeyEntry } from '../fishid/keys'
import { ledgerClient, usdCap, type Stopped } from '../fishid/ledger'
import { relayFetch } from '../fishid/relay'
import { turnsOf } from '../fishid/transcript'
import { handoverFor } from './handover'
import { sectionSearch } from './section-search'
import { answerQuestion, CHAT_LIMITS, MAX_TOKENS, OPENING_TOKENS, type ChatRun, type Earlier, type Start } from './agent'
import type { ChatBlock } from './answer'
import { handbookOf, type Handbook, type Lang, type Source } from './handbook'
import { chatAccount, conversationKey, retryKey, secs, stopKey } from './store'
import type { Step, Tank, TankLight } from './tools'
import { transcriptKey, type ChatRunRecord } from './transcript'

/**
 * The chat (protocols/chat.openapi.json): GET /api/chat says whether it's on; POST asks one question in a conversation,
 * for signed-in readers only. Off unless CHAT is "1" (or "owner", on for the owner's accounts only) and everything it needs
 * is bound.
 *
 * - Who: the app's bearer, or the site's session cookie from the site's own pages (same-origin), as accounts checks
 *   them. No session is 401; a bearer that isn't a live app session never falls back to the cookie.
 * - Counts: per account a day and chat's own day, under the dollar cap fish ID's ledger keeps (ledger.ts, `kind`).
 * - The conversation: kept in R2 (UPLOADS, `chat-conv/<account>/<id>.json`, the account as its HMAC; store.ts) with no
 *   time limit, and deleted with the account (a run still answering when it's deleted deletes what it wrote). R2 reads its own writes, where KV can show a stale one for a minute at
 *   another location. Questions go in it for 24 hours from its first. An id another account used is another
 *   conversation. The question being answered is marked in it, written only over the version read (an etag match), or
 *   only where none is yet, so two questions at once can't both run: the second is 409 answering, or with the first's
 *   key waits for its answer.
 * - Retries (`Idempotency-Key`): the turn, or its error, read for 24 hours (a conversation's life; a failure on our side,
 *   503, for 15 minutes) under the account and key (`chat-turn/<account>/<key>.json`), and swept by the daily cron after. A retry while the first run still answers waits for it and gets its answer,
 *   counted once.
 *
 * - The transcript: what each question said and did (transcript.ts), under the account and conversation
 *   (`chat-run/<account>/<conversation>/<n>-<run>.json`), kept as the conversation is and deleted with the account.
 */
export type ChatEnv = {
  /**
   * "1": chat is on. "owner": on for the owner's accounts only (OWNER_ACCOUNTS), as the owner's report is: anyone else,
   * signed in or not, finds it off, the GET too.
   */
  CHAT?: string
  /** The owner's account ids, comma-separated (a Worker secret, as the dashboard reads it). */
  OWNER_ACCOUNTS?: string
  CHAT_MODEL?: string
  /** The search that hands Claude sections before its first call (handover.ts): Workers AI embeds the reader's words, Vectorize finds the sections. */
  AI?: Ai
  CHAT_SEARCH?: Vectorize
  /** Questions per account a day, for the whole site a day, and in one conversation (defaults below). */
  CHAT_PER_ACCOUNT?: string
  CHAT_PER_DAY?: string
  CHAT_MAX_TURNS?: string
  /** The site's spend a day, shared with fish ID (fishid/api.ts). */
  FISH_ID_USD_PER_DAY?: string
  ANTHROPIC_KEYS?: string
  COMMENT_HMAC_KEY?: string
  /** Names an account in the chat's storage (chat/store.ts), as accounts' own data: never rotated. */
  ACCOUNT_HMAC_KEY?: string
  AB: KVNamespace
  ASSETS: Fetcher
  DB?: D1Database
  UPLOADS?: R2Bucket
  FISHID_LEDGER?: DurableObjectNamespace
  FISHID_RELAY?: DurableObjectNamespace
}
export type ChatDeps = { fetch?: typeof fetch; random?: () => number; clock?: () => number; source?: Source; waitMs?: number; pollMs?: number; beginMs?: number; stopMs?: number }

/** Placeholders until the eval of real questions sets them (protocols/chat.openapi.json). */
const PER_ACCOUNT = 30
const PER_DAY = 1000
export const MAX_TURNS = 20
/** The longest question: a reader's whole forum post, as they paste it (14 of 30 real ones were over 500; the longest, 1,414). The chief of staff's call. */
const MAX_CHARS = 1500
/** Characters as the reader sees them, as the app counts (Swift's `count`): a Thai vowel or tone mark, or a Vietnamese
 * tone mark kept apart as older forums keep it, is part of its letter, so a post the app shows as 1,500 is 1,500 here. */
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
export const charsOf = (s: string) => [...graphemes.segment(s.normalize('NFC'))].length
export const CONVERSATION_MS = 24 * 3600_000
/** A kept turn answers retries for a conversation's life: a reader back hours later (a call, a locked phone) gets the
 * answer that landed, not a second run. Past it, the conversation has ended too: a retry is 410, never counted again. */
const RETRY_MS = CONVERSATION_MS
/** A failure on our side (503) gave its count back: kept only for the retries waiting on its run, then asked again. */
const UNAVAILABLE_MS = 15 * 60_000
/** A question marked as answering longer than this was cut off: the conversation takes another. */
const RUNNING_MS = 2 * 60_000
const PING_MS = 10_000
/** A retry waits this long for the first run's answer, checking every `pollMs`. */
const WAIT_MS = 75_000
const POLL_MS = 1000
/** How often a run asks whether the reader stopped it, until its text begins. */
const STOP_POLL_MS = 500
/** How long the text waits on the ledger's word. It goes out after that: a ledger that hangs mustn't hold an answer. */
const BEGIN_MS = 1000
const MAX_BODY = 16 * 1024
/** A fish ID guess's scientific name and page id, at most. */
const MAX_NAME = 100

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LANGS = ['vi', 'id', 'th', 'ms'] as const
export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } })
const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const streamHeaders = { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' }
/**
 * One call to Claude. With `onDelta`, it streams, and each delta of its text (never its thinking) goes to `onDelta` as it
 * comes; the whole message comes back either way. The SDK's timeout ends once a stream begins, so a timer bounds the
 * whole streamed call, as the timeout bounds one that isn't: the stream is stopped, nothing more of it goes to `onDelta`,
 * and the call fails as a timeout does, with no status (keys.ts `classify`: the network, not the key). Once its text has
 * begun the timer runs to `writingMs` instead, if that's longer (loop.ts: an answer on its way isn't stopped). A timer, not an
 * abort signal: a stream stalled mid-body doesn't end on its signal in every runtime. A stream cut once it has begun
 * (the connection lost, the body ended early) fails in the SDK's own error with no status at all, where a call that
 * doesn't stream would have failed in its connection error: it is given one, so it too is the network's.
 */
export function callClaude(c: Anthropic, b: Anthropic.MessageCreateParamsNonStreaming, timeoutMs: number, onDelta?: (delta: string) => void, signal?: AbortSignal, writingMs = 0): Promise<Anthropic.Message> {
  if (!onDelta) return c.messages.create(b, { timeout: timeoutMs, signal })
  const s = c.messages.stream(b, { timeout: timeoutMs, signal })
  let over = false
  const began = Date.now()
  let writing = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let expire = () => {}
  const bound = new Promise<never>((_, reject) => {
    expire = () => { over = true; s.abort(); reject(Object.assign(new Error('Request timed out.'), { status: undefined })) }
    timer = setTimeout(expire, timeoutMs)
  })
  s.on('text', delta => {
    if (over) return
    if (!writing && writingMs > timeoutMs) { clearTimeout(timer); timer = setTimeout(expire, writingMs - (Date.now() - began)) }
    writing = true
    onDelta(delta)
  })
  const sdkError = (c.constructor as typeof Anthropic).AnthropicError
  const done = s.finalMessage().catch((e: unknown) => { throw e instanceof sdkError && !isApiError(e) ? Object.assign(e, { status: undefined }) : e })
  return Promise.race([done, bound]).finally(() => clearTimeout(timer))
}
/** On for this account: everyone's while CHAT is "1", the owner's alone while it is "owner". */
export const askable = (env: ChatEnv, userId: string | undefined) => env.CHAT !== 'owner' || (userId !== undefined && (env.OWNER_ACCOUNTS ?? '').split(',').map(id => id.trim()).includes(userId))
export const limit = (v: string | undefined, d: number) => (Number(v) > 0 ? Math.floor(Number(v)) : d)
export const live = (env: ChatEnv): env is ChatEnv & Required<Pick<ChatEnv, 'ANTHROPIC_KEYS' | 'COMMENT_HMAC_KEY' | 'ACCOUNT_HMAC_KEY' | 'DB' | 'UPLOADS' | 'FISHID_LEDGER'>> =>
  (env.CHAT === '1' || env.CHAT === 'owner') && Boolean(env.ANTHROPIC_KEYS && env.COMMENT_HMAC_KEY && env.ACCOUNT_HMAC_KEY && env.DB && env.UPLOADS && env.FISHID_LEDGER)

/**
 * The chat's most a question can cost, reserved at admission: every call's input past the trigger by half, all written to
 * cache, and every output in full; and the first line's call, whose input (the first message) is under the trigger.
 */
export function chatWorstCost(model: string): number {
  const p = priceOf(model)
  const line = CHAT_LIMITS.inputTokens * p.input + OPENING_TOKENS * p.output
  return (CHAT_LIMITS.inputTokens * 1.5 * Math.max(p.input, p.cacheWrite) + CHAT_LIMITS.calls * MAX_TOKENS * p.output + line) / 1e6
}

/** The contract's `Turn`. */
export type Turn = { conversation: string; n: number; text: string; blocks: ChatBlock[]; suggestions: string[]; covered: boolean; model: string; steps?: Step[]; opening?: string }
/** A conversation as kept (under its account's prefix): when it began, its turns, and the question being answered. */
export type Conversation = { created: number; turns: KeptTurn[]; running?: { key: string; at: number } }
/** A turn as a conversation keeps it, to read it to Claude and draw it again. A turn from before the past conversations has the first five alone. */
export type KeptTurn = Earlier & { n: number; at: number; suggestions?: string[]; covered?: boolean; model?: string; steps?: Step[]; opening?: string }
/** A question's outcome, kept for its retries: its turn, or the error it ended on (a stopped one's, with the stop's figures). */
export type Kept = { at: number } & ({ turn: Turn } | { status: number; error: string; counted?: boolean; freeLeft?: number })
const stopBody = (s: { counted: boolean; freeLeft?: number }) => ({ error: 'cancelled', counted: s.counted, ...(s.freeLeft !== undefined ? { freeLeft: s.freeLeft } : {}) })

type Question = { conversation: string; question: string; lang: Lang; start: Start; continues?: string }
function questionOf(v: unknown, maxChars: number): Question | 'too long' | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const o = v as Record<string, unknown>
  const known = ['conversation', 'question', 'lang', 'from', 'about', 'tank', 'identified', 'continues']
  if (Object.keys(o).some(k => !known.includes(k))) return undefined
  if (typeof o.conversation !== 'string' || !UUID.test(o.conversation) || typeof o.question !== 'string' || !o.question.trim()) return undefined
  if (o.lang !== undefined && !LANGS.includes(o.lang as Lang)) return undefined
  if (o.from !== undefined && !['fish-id', 'species', 'search', 'tank'].includes(o.from as string)) return undefined
  if (o.about !== undefined && typeof o.about !== 'string') return undefined
  // A saved tank's id, as the app syncs it: never the reader's words, so no more than an id's length.
  if (o.tank !== undefined && (typeof o.tank !== 'string' || !o.tank || o.tank.length > MAX_NAME)) return undefined
  if (o.continues !== undefined && (typeof o.continues !== 'string' || !UUID.test(o.continues))) return undefined
  let identified: Start['identified']
  if (o.identified !== undefined) {
    const i = o.identified as { verdict?: unknown; results?: unknown }
    const results = Array.isArray(i?.results) ? i.results as Record<string, unknown>[] : undefined
    // Closed, as the contract closes it; a name or id longer than MAX_NAME is no fish ID guess.
    if (!i || typeof i !== 'object' || Object.keys(i).some(k => !['verdict', 'results'].includes(k))) return undefined
    if (!['fish', 'plant', 'other', 'unclear'].includes(i?.verdict as string) || !results || results.length > 3
      || results.some(r => !r || typeof r.scientificName !== 'string' || r.scientificName.length > MAX_NAME || typeof r.confidence !== 'number' || r.confidence < 0
        || (r.id !== undefined && (typeof r.id !== 'string' || r.id.length > MAX_NAME))
        || Object.keys(r).some(k => !['scientificName', 'id', 'confidence'].includes(k)))) return undefined
    identified = { verdict: i.verdict as string, results: results.map(r => ({ scientificName: r.scientificName as string, confidence: r.confidence as number, ...(r.id ? { id: r.id as string } : {}) })) }
  }
  if (charsOf(o.question.trim()) > maxChars) return 'too long'
  return {
    conversation: o.conversation.toLowerCase(), question: o.question.trim(), lang: (o.lang as Lang) ?? 'vi',
    start: { ...(o.from ? { from: o.from as Start['from'] } : {}), ...(o.about ? { about: o.about as string } : {}), ...(o.tank ? { tank: o.tank as string } : {}), ...(identified ? { identified } : {}) },
    ...(o.continues ? { continues: (o.continues as string).toLowerCase() } : {}),
  }
}

/** The site's own assets: the app index and the app's page copies, kept per isolate for 10 minutes (a failed read isn't). */
const assets = new Map<string, { at: number; value: Promise<unknown> }>()
export function assetSource(env: Pick<ChatEnv, 'ASSETS'>, origin: string): Source {
  const read = (path: string) => {
    const hit = assets.get(path)
    if (hit && Date.now() - hit.at < 600_000) return hit.value
    const value = env.ASSETS.fetch(new Request(`${origin}${path}`)).then(r => (r.ok ? r.json() : null)).catch(() => null)
    assets.set(path, { at: Date.now(), value })
    void value.then(v => { if (v === null) assets.delete(path) })
    return value
  }
  return { index: lang => read(`/app/${lang}.json`) as never, shard: (lang, kind, n) => read(`/app/pages/${lang}/${kind}-${n}.json`) as never, topics: lang => read(`/app/chat/${lang}.json`) as never }
}

/** The account's saved tanks as the chat reads them (tools.ts `Tank`): what read_tanks tells Claude and a check is of. */
export async function tanksOf(db: D1Database, account: string, now = new Date()): Promise<Tank[]> {
  const store = await loadStore(db, account)
  const devices = store.devices.filter(d => !isTombstone(d)) as Device[]
  return (store.tanks.filter(t => !isTombstone(t)) as SavedTank[]).map(r => {
    const mine = devices.filter(d => d.tankId === r.id)
    const lights: TankLight[] = mine.filter(d => d.kind === 'light').map(d => {
      // The schedule last written to the light, and levels set by hand after it, which the light runs until it's written again.
      const s = d.schedules?.find(x => x.id === d.activeScheduleId)
      const hand = d.manual && (!s || d.manual.at > s.savedAt) ? d.manual.levels : undefined
      return {
        name: d.nickname ?? ([d.brand, d.model].filter(Boolean).join(' ') || 'light'),
        ...(s ? { schedule: { on: s.on, off: s.off, ramp: s.ramp, levels: s.levels } } : {}),
        ...(hand ? { manual: hand } : {}),
      }
    })
    const power = mine.filter(d => d.kind === 'plug').flatMap(d => (d.outlets ?? []).flatMap(o => (o.role && o.role !== 'other' ? [o.role] : o.label ? [o.label] : [])))
    const days = r.createdAt ? Math.floor((now.getTime() - Date.parse(r.createdAt)) / 86_400_000) : undefined
    return {
      id: r.id,
      name: r.name,
      ...(r.dims ? { dims: { l: r.dims.l, w: r.dims.w, h: r.dims.h } } : {}),
      ...(r.litres ? { litres: r.litres } : {}),
      species: (r.species ?? []).map(s => ({ id: s.id, ...(s.count ? { count: s.count } : {}) })),
      unlisted: (r.unlisted ?? []).map(u => ({ name: u.name, kind: u.kind, ...(u.sci ? { sci: u.sci } : {}), ...(u.count ? { count: u.count } : {}) })),
      ...(r.plants?.length ? { plants: r.plants.map(p => p.id) } : {}),
      ...(r.substrate ? { substrate: r.substrate } : {}),
      ...(r.notes?.trim() ? { notes: r.notes.trim() } : {}),
      ...(days !== undefined && days >= 0 ? { days } : {}),
      ...(lights.length ? { lights } : {}),
      ...(power.length ? { power: [...new Set(power)] } : {}),
    }
  })
}

let keysCache: { text: string; keys: ReturnType<typeof loadKeys> } | undefined
const keysOf = (text: string) => (keysCache?.text === text ? keysCache.keys : (keysCache = { text, keys: loadKeys(text) }).keys)

export async function chat(req: Request, url: URL, env: ChatEnv, now: Date, deps: ChatDeps = {}, wait: (p: Promise<unknown>) => void = p => void p): Promise<Response> {
  const maxChars = MAX_CHARS
  const perAccount = limit(env.CHAT_PER_ACCOUNT, PER_ACCOUNT)
  const maxTurns = limit(env.CHAT_MAX_TURNS, MAX_TURNS)
  if (req.method === 'GET') {
    if (!live(env)) return json({ on: false })
    if (env.CHAT === 'owner' && !askable(env, (await sessionOf(req, env.DB, now).catch(() => null))?.userId)) return json({ on: false })
    const resting = !(await healthyKeys((await keysOf(env.ANTHROPIC_KEYS)).keys, kvHealth(env.AB), now.getTime())).length
    return json({ on: true, resting, perAccount, maxTurns, maxChars })
  }
  if (req.method !== 'POST') return new Response(null, { status: 405 })
  if (!live(env)) return json({ error: 'chat_off' }, 503)
  const clock = deps.clock ?? Date.now

  // Who asks: a bearer is the app's session or nothing; a cookie only from the site's own pages.
  const bearer = req.headers.has('authorization')
  if (!bearer && tokenOf(req)?.via === 'cookie' && !sameSiteOk(req, true)) return json({ error: 'cross-origin' }, 403)
  const session = await sessionOf(req, env.DB, now)
  // On for the owner only: anyone else finds it off, signed in or not, before anything is read or counted.
  if (!askable(env, session?.userId)) return json({ error: 'chat_off' }, 503)
  if (!session || (bearer && session.via !== 'bearer')) return json({ error: 'session' }, 401)
  const idem = req.headers.get('idempotency-key')?.trim().toLowerCase() ?? ''
  if (idem && !UUID.test(idem)) return json({ error: 'bad idempotency-key' }, 400)
  const raw = await req.text().catch(() => '')
  if (raw.length > MAX_BODY) return json({ error: 'too long', limit: maxChars }, 413)
  let body: unknown
  try { body = JSON.parse(raw) } catch { return json({ error: 'bad request' }, 400) }
  const q = questionOf(body, maxChars)
  if (q === 'too long') return json({ error: 'too long', limit: maxChars }, 413)
  if (!q) return json({ error: 'bad request' }, 400)
  const stream = /(^|[\s,])text\/event-stream\b/i.test(req.headers.get('accept') ?? '')

  // The account as the stores name it: an HMAC, never its id.
  const account = await chatAccount(env.ACCOUNT_HMAC_KEY, session.userId)
  const convKey = conversationKey(account, q.conversation)
  const keptKey = idem ? retryKey(account, idem) : ''
  const readKept = async (): Promise<Kept | undefined> => {
    if (!keptKey) return undefined
    const k = await (await env.UPLOADS.get(keptKey))?.json<Kept>()
    return k && clock() - k.at < ('turn' in k || k.status !== 503 ? RETRY_MS : UNAVAILABLE_MS) ? k : undefined
  }
  const answerOf = (k: Kept) => ('turn' in k ? k.turn : undefined)
  const keptResponse = (k: Kept): Response => {
    if ('turn' in k) return stream ? new Response(sse('done', k.turn), { headers: streamHeaders }) : json(k.turn)
    const body = { error: k.error, ...(k.counted !== undefined ? { counted: k.counted } : {}), ...(k.freeLeft !== undefined ? { freeLeft: k.freeLeft } : {}) }
    return stream ? new Response(sse('error', body), { headers: streamHeaders }) : json(body, k.status)
  }

  const kept = await readKept()
  if (kept) return keptResponse(kept)
  const obj = await env.UPLOADS.get(convKey)
  const conv = obj ? await obj.json<Conversation>() : undefined
  // A retry of the question still answering waits for it, even once the conversation has passed its end: a 410 would
  // have it asked again elsewhere, before its kept answer is written.
  const running = conv?.running && clock() - conv.running.at < RUNNING_MS ? conv.running : undefined
  if (running && idem && running.key === idem) return waitFor(readKept, keptResponse, stream, clock, deps)
  // Hidden from the list on another device: ended, so the app asks in a new conversation. A read that fails stops no question.
  const hidden = conv?.turns.length ? (await env.DB.prepare('SELECT hidden FROM chat_conversations WHERE account = ? AND id = ?').bind(account, q.conversation).first<{ hidden: number }>().catch(() => null))?.hidden === 1 : false
  if (conv && (hidden || clock() - conv.created > CONVERSATION_MS || conv.turns.length >= maxTurns)) return json({ error: 'ended' }, 410)
  if (running) return json({ error: 'answering' }, 409)

  // Admission, in one step in the ledger: the account's day, chat's day and the site's spend, and a healthy key.
  const model = env.CHAT_MODEL || DEFAULT_MODEL
  const store = kvHealth(env.AB)
  const healthy = await healthyKeys((await keysOf(env.ANTHROPIC_KEYS)).keys, store, now.getTime())
  const ledger = ledgerClient(env.FISHID_LEDGER)
  const day = now.toISOString().slice(0, 10)
  const reader = `chat:acct:${(await accountDayKey(env.COMMENT_HMAC_KEY, session.userId, now)).slice(3)}`
  const admitted = await ledger.admit({ day, reader, perReader: perAccount, perDay: limit(env.CHAT_PER_DAY, PER_DAY), usdCap: usdCap(env.FISH_ID_USD_PER_DAY), reserve: chatWorstCost(model), healthy: healthy.length > 0, kind: 'chat', key: idem ? stopKey(account, idem) : undefined })
    .catch(e => { console.error('chat ledger:', e); return null })
  if (!admitted) return json({ error: 'unavailable' }, 503)
  if (!admitted.ok && admitted.error === 'cancelled') return json(stopBody(admitted), 410)
  if (!admitted.ok) return admitted.error === 'rate' ? json({ error: 'rate', limit: admitted.limit }, 429) : json({ error: admitted.error }, admitted.error === 'busy' ? 429 : 503)
  const run = admitted.run

  // The question is marked as answering: over the version read (an etag match), or, for a new conversation, only where
  // none is yet. When another request wrote first, R2 refuses the write (null) and its question is the one answering.
  // `etagDoesNotMatch: '*'` is If-None-Match: * (workerd's r2-bucket.c++, buildSingleEtagArray), which R2 applies as a
  // create-once write only one of several at once wins (developers.cloudflare.com/r2/api/s3/extensions/, "Conditional
  // operations in PutObject"); a failed condition is null, not an error (developers.cloudflare.com/r2/api/workers/workers-api-reference/).
  const mark: Conversation = { created: conv?.created ?? clock(), turns: conv?.turns ?? [], running: { key: idem || crypto.randomUUID(), at: clock() } }
  const marked = await env.UPLOADS.put(convKey, JSON.stringify(mark), { onlyIf: obj ? { etagMatches: obj.etag } : { etagDoesNotMatch: '*' } })
    .then(o => (o ? 'ok' : 'taken'), e => { console.error('chat mark:', e); return 'failed' })
  if (marked !== 'ok') {
    await ledger.settle({ day, run, refund: true, keys: {} }).catch(e => console.error('chat settle:', e))
    if (marked === 'failed') return json({ error: 'unavailable' }, 503)
    // Taken by a request with this one's key: this one waits for that run's answer, as a retry does. The conversation is
    // read before the kept answer, since a run keeps its answer before it drops the mark. By another question: answering.
    const latest = await (await env.UPLOADS.get(convKey))?.json<Conversation>()
    if (idem && (latest?.running?.key === idem || await readKept())) return waitFor(readKept, keptResponse, stream, clock, deps)
    return json({ error: 'answering' }, 409)
  }

  const fetchImpl = deps.fetch ?? (env.FISHID_RELAY ? relayFetch(env.FISHID_RELAY) : undefined)
  const spends: Promise<unknown>[] = []
  const tally: Record<string, number> = {}
  /** The key that answered the run's last call: the one that wrote the answer, as a run may change keys. */
  let wrote: string | undefined
  const attempts: Attempt[] = []
  const began = clock()
  /** On a stream: when it sent the text's first piece and its last; when the run ended; when it sent `done` (or its error). */
  let wordsAt: number | undefined
  let lastAt: number | undefined
  let answeredAt: number | undefined
  let doneAt: number | undefined
  /** The run as the agent ran it, for its transcript: none when it never started (the handbook unread). */
  let trail: ChatRun | undefined
  // The reader's Stop (POST /api/chat/cancel) comes in another request, maybe to another Worker: the ledger says which came
  // first, it or the text's first piece. Until then this run asks it every half second, and stops at once if it was stopped.
  const stop = new AbortController()
  let stopped: Extract<Stopped, { result: 'cancelled' }> | undefined
  const halted = new Promise<void>(resolve => stop.signal.addEventListener('abort', () => resolve(), { once: true }))
  const halt = (s: Stopped | null) => { if (s?.result === 'cancelled') { stopped = s; stop.abort() } return !stopped }
  let gate: Promise<boolean> | undefined
  /** May the text go out? Asked of the ledger once, at its first piece or the run's end. A question with no key can't be stopped. */
  const goAhead = () => (gate ??= idem ? Promise.race([ledger.begin(day, run), new Promise<null>(r => setTimeout(() => r(null), deps.beginMs ?? BEGIN_MS))]).then(halt, e => { console.error('chat begin:', e); return true }) : Promise.resolve(true))
  if (idem) void (async () => {
    while (!gate && !stop.signal.aborted) {
      await new Promise(r => setTimeout(r, deps.stopMs ?? STOP_POLL_MS))
      if (!gate) halt(await ledger.stopped(day, run).catch(() => null))
    }
  })()
  type Done = { status: number; body: Record<string, unknown> }
  const cancelled = (): Done => ({ status: 410, body: stopBody(stopped!) })
  /** The run or the reader's stop, whichever is first; then past the gate, which a stop that came first doesn't pass. */
  const finish = async (running: Promise<Done>): Promise<Done> => {
    const done = await Promise.race([running, halted.then(cancelled)])
    if (stopped) return cancelled()
    await goAhead()
    return stopped ? cancelled() : done
  }
  // The first question of a conversation, on the owner's account alone: opening chat to all turns this off. To widen it, first
  // a judged pass three times the size of the last, whose middle estimate of mistakes doesn't lean worse than today's chat (2026-11-09).
  const search = env.CHAT === 'owner' && env.AI && env.CHAT_SEARCH && !conv?.turns.length ? sectionSearch(env.AI, env.CHAT_SEARCH) : undefined
  let saved: Promise<Tank[]> | undefined
  /** The reader's tanks, read once for the handover and for read_tanks; a read that failed is tried again by the next. */
  const tanks = () => (saved ??= tanksOf(env.DB, session.userId, now)).catch(e => { saved = undefined; console.error('chat tanks:', e); return null })

  /** The run, after admission: its turn, or the error it ends on (as the JSON answer's status). */
  const work = async (onStep?: (s: Step) => void, onText?: (piece: string) => void, onBlock?: (b: ChatBlock) => void, onOpening?: (line: string) => void): Promise<{ status: number; body: Record<string, unknown> }> => {
    // Read inside the run, which outlives a dropped connection: read before it, a drop would leave the mark and the ledger open.
    const hb = await handbookOf(deps.source ?? assetSource(env, url.origin), q.lang).catch(e => { console.error('chat handbook:', e); return null })
    if (!hb) return { status: 503, body: { error: 'unavailable' } }
    let key: KeyEntry | undefined
    const onUsage = (u: Anthropic.Usage) => {
      const usd = costOf(model, { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 })
      spends.push(ledger.spend(day, run, usd).catch(e => console.error('chat spend:', e)))
    }
    /** A call no key answered: resting or unavailable (ours), or our request refused. */
    class NoAnswer extends Error { constructor(readonly reason: 'resting' | 'unavailable' | 'request') { super(reason) } }
    /** The reader has some of the text: it streamed. */
    let shown = false
    /** The keys a call of this run set aside (out of credit, refused, rate-limited): no later call asks them again. */
    const aside = new Set<string>()
    try {
      const out = await answerQuestion({
        // Every call rotates over the healthy keys, the run's key first once it has one: a key that runs dry or is
        // refused mid-answer hands the rest of the run to the next (the run's thinking reads back on any of our keys).
        // Once the reader has some of the text, a call that fails isn't asked again of the next key: what they read
        // would be followed by a second answer from its start. It is our side's failure, as no key answering is.
        // Before that, the next key is asked, without streaming once any of the first's text was read (its reader can't
        // start again), so that answer's text comes whole.
        send: async (b, { timeoutMs, writingMs, call, onText: onDelta }) => {
          if (stop.signal.aborted) throw new NoAnswer('unavailable')
          const ready = healthy.filter(k => !aside.has(k.hash))
          const mine = key && !aside.has(key.hash) ? key : undefined
          let fed = false
          const r = await rotate(mine ? [mine, ...ready.filter(k => k !== mine)] : ready, store, async (k, left) => {
            const feed = onDelta && !fed ? (d: string) => { fed = true; onDelta(d) } : undefined
            // What an earlier key's try used comes off both.
            const bounded = Math.min(left, timeoutMs)
            try { return await callClaude(await clientFor(k, fetchImpl), b, bounded, feed, stop.signal, writingMs && writingMs - (timeoutMs - bounded)) } catch (e) { throw shown || stop.signal.aborted ? new NoAnswer('unavailable') : e }
          }, { random: mine ? () => 0 : deps.random, clock, budgetMs: timeoutMs })
          attempts.push(...r.attempts)
          for (const a of r.attempts) if (a.marked) aside.add(a.hash)
          if (!r.ok) throw new NoAnswer(r.reason)
          const used = healthy.find(k => k.hash === r.hash)!
          tally[used.hash] = (tally[used.hash] ?? 0) + 1
          onUsage(r.value.usage)
          // The first line's call (0) is beside the run's: its key isn't the run's, nor the one that wrote the answer.
          if (call !== 0) { key = used; wrote = used.hash }
          return r.value
        },
        model, lang: q.lang, question: q.question, earlier: conv?.turns ?? [], start: (conv?.turns.length ? {} : q.start), handbook: hb,
        tanks,
        ...(search ? { handover: async () => handoverFor({ question: q.question, start: q.start, tanks: (await tanks()) ?? [], hb, lang: q.lang, search }) } : {}),
        onStep, clock,
        ...(onText ? { onText: (piece: string) => { shown = true; onText(piece) }, ...(onBlock ? { onBlock } : {}) } : {}),
        ...(onOpening ? { opening: true, onOpening } : {}),
      })
      trail = out
      if (out.dropped.length) console.log(JSON.stringify({ chat: 'dropped', dropped: out.dropped }))
      // No key answered a call: resting or unavailable (ours), or our request refused (failed: a 400 that isn't the
      // key's; out of credit also comes as a 400, and the key's fault goes to the next key). The run out of time:
      // unavailable. An answer we can't read (a refusal, one cut short): failed.
      if (out.error instanceof NoAnswer) return out.error.reason === 'request' ? { status: 502, body: { error: 'failed' } } : { status: 503, body: { error: out.error.reason } }
      if (out.error && !out.message) {
        if ((out.error as Error)?.message === 'out of time') return { status: 503, body: { error: 'unavailable' } }
        throw out.error
      }
      if (!out.answer) return { status: 502, body: { error: 'failed' } }
      const turn: Turn = {
        conversation: q.conversation, n: (conv?.turns.length ?? 0) + 1, text: out.answer.text, blocks: out.blocks,
        suggestions: out.answer.suggestions.filter(s => s.trim()).slice(0, 3), covered: out.answer.covered, model,
        ...(out.steps.length ? { steps: out.steps } : {}),
        // An off-topic answer keeps no line: `done` has the last word, and the app takes away the one it showed (the
        // Design Lead's rule). The transcript keeps it all the same: the reader saw it.
        ...(out.opening && !out.answer.offTopic ? { opening: out.opening } : {}),
      }
      return { status: 200, body: turn as unknown as Record<string, unknown> }
    } catch (e) {
      console.error('chat run:', e)
      return { status: 502, body: { error: 'failed' } }
    }
  }

  /** Its row in the reader's list (past.ts): its first question and where it started with its first answer, then its last time and count. */
  const listed = async (at: number, turns: number) => {
    // The conversation this carries on: left out if the account doesn't hold it, or hid it.
    const carried = q.continues && !mark.turns.length ? await env.DB.prepare('SELECT hidden FROM chat_conversations WHERE account = ? AND id = ?').bind(account, q.continues).first<{ hidden: number }>() : null
    await env.DB.prepare(`INSERT INTO chat_conversations (account, id, title, start, first_at, last_at, questions, continues) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (account, id) DO UPDATE SET last_at = excluded.last_at, questions = excluded.questions`)
      .bind(account, q.conversation, mark.turns[0]?.question ?? q.question, JSON.stringify({ ...(mark.turns.length ? {} : q.start), lang: q.lang }), secs(mark.created), secs(at), turns, carried && !carried.hidden ? q.continues : null)
      .run()
  }

  /**
   * After the run: the outcome is kept for retries, then the conversation gets the turn (or just loses its mark). In that
   * order: a retry that finds no mark finds the kept answer, and never runs the question again. Then the ledger settles.
   * The reader's answer waits for these alone, so a question asked right after it finds the conversation free and the
   * count already given back.
   */
  const save = async (done: { status: number; body: Record<string, unknown> }) => {
    const turn = done.status === 200 ? done.body as unknown as Turn : undefined
    const asked = clock()
    const next: Conversation = { created: mark.created, turns: turn ? [...mark.turns, { n: turn.n, question: q.question, text: turn.text, blocks: turn.blocks, suggestions: turn.suggestions, covered: turn.covered, model: turn.model, ...(turn.steps ? { steps: turn.steps } : {}), ...(turn.opening ? { opening: turn.opening } : {}), at: asked }] : mark.turns }
    const k: Kept = turn ? { at: asked, turn } : { at: asked, status: done.status, ...(done.body as { error: string; counted?: boolean; freeLeft?: number }) }
    if (keptKey) await env.UPLOADS.put(keptKey, JSON.stringify(k)).catch(e => console.error('chat kept:', e))
    await env.UPLOADS.put(convKey, JSON.stringify(next)).catch(e => console.error('chat conversation:', e))
    if (turn) await listed(asked, next.turns.length).catch(e => console.error('chat list:', e))
    await Promise.all(spends)
    // Our side failed (503: no key, Claude unreachable): the reader's count goes back. So does a question that wasn't about
    // fishkeeping (the owner's rule), up to a day's worth of them, so looping off-topic questions can't use up chat's own
    // day for everyone. Chat's own day and the dollars spent still count. A failed answer (502) still counts, unless its
    // text had begun on the stream: only a whole answer counts, so one cut off after the reader's first words goes back too.
    const ok = turn ? wrote : undefined
    const offTopic = done.status === 200 && trail?.answer?.offTopic === true
    const cutOff = !turn && wordsAt !== undefined && !stopped
    await ledger.settle({ day, run, refund: done.status === 503 || cutOff, ...(offTopic ? { offTopic: perAccount } : {}), keys: tally, ...(ok ? { ok } : {}) }).catch(e => console.error('chat settle:', e))
  }
  /** Then, once the reader has the answer: the transcript, and the check for an account deleted meanwhile. */
  const after = async (done: { status: number; body: Record<string, unknown> }) => {
    // The transcript beside the conversation: never in the reader's way, so one that can't be made or saved is only logged.
    // A stopped question keeps nothing of it.
    const record = (() => { try { return done.status !== 410 && trail && JSON.stringify(transcript(done, trail)) } catch (e) { console.error('chat transcript:', e) } })()
    const runKey = record ? transcriptKey(account, q.conversation, (conv?.turns.length ?? 0) + 1, run) : ''
    if (record) await env.UPLOADS.put(runKey, record).catch(e => console.error('chat transcript:', e))
    // The account deleted while this ran (deleteUser): what it just wrote goes too. Its account still there, deleteUser's
    // second pass, after the account's rows, comes after these writes and deletes them.
    const still = await env.DB.prepare('SELECT 1 FROM users WHERE id = ?').bind(session.userId).first().catch(() => true)
    if (!still) {
      await env.UPLOADS.delete([convKey, ...(keptKey ? [keptKey] : []), ...(runKey ? [runKey] : [])]).catch(e => console.error('chat deleted account:', e))
      await env.DB.prepare('DELETE FROM chat_conversations WHERE account = ? AND id = ?').bind(account, q.conversation).run().catch(e => console.error('chat deleted account:', e))
    }
  }

  const since = (t: number | undefined) => (t === undefined ? undefined : t - now.getTime())
  /** What the question said and did (transcript.ts): what the reader asked and got, never who they are. */
  const transcript = (done: { status: number; body: Record<string, unknown> }, t: ChatRun): ChatRunRecord => {
    const s = t.spent
    return {
      v: 1, conversation: q.conversation, n: (conv?.turns.length ?? 0) + 1, at: now.toISOString(), lang: q.lang, model,
      question: q.question, outcome: done.status === 200 ? 'ok' : String(done.body.error), ms: clock() - began,
      // From the question's arrival: to the run's start (the session, the conversation, the ledger); on a stream, to the
      // text's first piece and its last, the run's end, and `done` (the turn saved).
      timing: { before: began - now.getTime(), words: since(wordsAt), last: since(lastAt), answered: since(answeredAt), done: since(doneAt) },
      cost: costOf(model, s), tokens: { input: s.input + s.cacheRead + s.cacheWrite, output: s.output },
      agent: { calls: t.calls, tools: t.tools, stopped: t.stopped },
      ...(t.answer ? { answer: { text: t.answer.text, covered: t.answer.covered, ...(t.answer.offTopic ? { offTopic: true } : {}), blocks: t.blocks.length, dropped: t.dropped } } : {}),
      ...(t.opening ? { opening: t.opening } : {}),
      ...(t.handed ? { handed: t.handed } : {}),
      turns: turnsOf(t.history, t.message),
    }
  }

  if (!stream) {
    // The run goes on if the reader's connection drops (waitUntil), so its retry gets its answer and the mark clears.
    const p = finish(work()).then(async done => { await save(done); return done })
    wait(p.then(after).catch(() => undefined))
    const done = await p
    return json(done.body, done.status)
  }
  // The stream: steps as they happen, then the text as Claude writes it, the blocks as Claude picks them, and done (the
  // whole turn); or error. Pings while it works. Every step comes before the text: the run ends on the call that writes
  // it (agent.ts `streaming`), and its picks come after its text. Done comes once the turn is saved and settled (`save`): a
  // question asked right after it finds the conversation free.
  const enc = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const w = writable.getWriter()
  let open = true
  const send = (s: string) => { if (open) w.write(enc.encode(s)).catch(() => { open = false }) }
  const ping = setInterval(() => send(': ping\n\n'), PING_MS)
  wait((async () => {
    let shown = false
    let sent = 0
    // The text and cards wait here, the first time, for the ledger's word that no stop came first (`goAhead`).
    const held: string[] = []
    let flowing = false
    const flush = () => { flowing = true; for (const s of held.splice(0)) send(s) }
    const gated = (s: string) => {
      if (stop.signal.aborted) return
      if (flowing) return send(s)
      held.push(s)
      void goAhead().then(go => { if (go) flush(); else held.length = 0 })
    }
    const done = await finish(work(
      step => { if (!stop.signal.aborted) send(sse('step', step)) },
      piece => { if (!shown) wordsAt = clock(); shown = true; lastAt = clock(); gated(sse('text', { text: piece })) },
      block => { sent++; gated(sse('block', block)) },
      line => { if (!stop.signal.aborted) send(sse('opening', { text: line })) },
    ))
    answeredAt = clock()
    const t = done.status === 200 ? done.body as unknown as Turn : undefined
    if (t) {
      // An off-topic answer's line, the Worker's own, comes whole, as does a text that didn't stream; then the blocks the
      // stream didn't send as Claude picked them (all of them, then).
      flush()
      if (!shown) { wordsAt = lastAt = clock(); send(sse('text', { text: t.text })) }
      for (const b of t.blocks.slice(sent)) send(sse('block', b))
    }
    await save(done)
    clearInterval(ping)
    if (t) send(sse('done', t))
    else send(sse('error', done.status === 410 ? done.body : { error: done.status === 502 ? 'failed' : done.body.error === 'resting' ? 'resting' : 'unavailable' }))
    doneAt = clock()
    await w.close().catch(() => {})
    await after(done)
  })())
  return new Response(readable, { headers: streamHeaders })
}

/** A retry while its first run answers: wait for that run's outcome, then answer as a retry does; pings meanwhile on a stream. */
async function waitFor(readKept: () => Promise<Kept | undefined>, respond: (k: Kept) => Response, stream: boolean, clock: () => number, deps: ChatDeps): Promise<Response> {
  const until = clock() + (deps.waitMs ?? WAIT_MS)
  const poll = deps.pollMs ?? POLL_MS
  const next = async (): Promise<Kept | undefined> => {
    for (;;) {
      const k = await readKept()
      if (k || clock() >= until) return k
      await new Promise(r => setTimeout(r, poll))
    }
  }
  if (!stream) {
    const k = await next()
    return k ? respond(k) : json({ error: 'unavailable' }, 503)
  }
  const enc = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const w = writable.getWriter()
  const ping = setInterval(() => void w.write(enc.encode(': ping\n\n')).catch(() => {}), PING_MS)
  void (async () => {
    const k = await next()
    clearInterval(ping)
    const res = k ? respond(k) : new Response(sse('error', { error: 'unavailable' }))
    await w.write(new Uint8Array(await res.arrayBuffer())).catch(() => {})
    await w.close().catch(() => {})
  })()
  return new Response(readable, { headers: streamHeaders })
}
