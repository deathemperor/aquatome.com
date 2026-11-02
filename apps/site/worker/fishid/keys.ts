/**
 * The fish-ID tool's Anthropic API keys: several, each from an organisation with its own prepaid credit, so one running
 * out never takes the tool down. The Worker reads them from the ANTHROPIC_KEYS secret, the accuracy script
 * (packages/engine/scripts/fish-id-accuracy.ts) from ~/.config/thuysinh/anthropic-keys; both through this module.
 *
 * One entry per line: `<key>` (a workspace's key) or `<key> <workspaceId>` (an organisation's key, which needs its
 * workspace sent as the `anthropic-workspace-id` header). Blank lines and `#` comments are ignored.
 *
 * A key is never printed, logged or returned: state and logs name it by the first 8 hex of its SHA-256 (`hash`).
 * No Cloudflare types here: the script imports this module too.
 */
export type KeyEntry = { key: string; workspace?: string; hash: string }
export type KeyProblem = 'credit' | 'auth' | 'rate'
/** A key set aside until `until` (ms since the epoch), and why. */
export type KeyHealth = { until: number; why: KeyProblem }
/** Where a key's problem is kept between requests (KV in the Worker, memory in the script). */
export type HealthStore = {
  get(hash: string): Promise<KeyHealth | null>
  mark(hash: string, health: KeyHealth, ttlSec: number): Promise<void>
}

const TOKEN = /^[A-Za-z0-9_-]{8,300}$/

/** The entries of a keys file; a line that isn't one is skipped and counted, never echoed (it may hold a key). */
export function parseKeys(text: string | undefined): { entries: { key: string; workspace?: string }[]; bad: number } {
  const entries: { key: string; workspace?: string }[] = []
  const seen = new Set<string>()
  let bad = 0
  for (const raw of (text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, '').trim()
    if (!line) continue
    const [key, workspace, ...rest] = line.split(/\s+/)
    if (!key || !TOKEN.test(key) || rest.length || (workspace !== undefined && !TOKEN.test(workspace))) { bad++; continue }
    if (seen.has(key)) continue
    seen.add(key)
    entries.push(workspace ? { key, workspace } : { key })
  }
  return { entries, bad }
}

/** The first 8 hex of the key's SHA-256: how the dashboard, KV and logs name a key. */
export async function keyHash(key: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return [...new Uint8Array(d).slice(0, 4)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function loadKeys(text: string | undefined): Promise<{ keys: KeyEntry[]; bad: number }> {
  const { entries, bad } = parseKeys(text)
  return { keys: await Promise.all(entries.map(async e => ({ ...e, hash: await keyHash(e.key) }))), bad }
}

const DAY_SEC = 86_400
/** What an API failure says about the key that made the call. */
export type Verdict = { mark?: { why: KeyProblem; ttlSec: number }; next: boolean }

type ApiErrorLike = { status?: number; type?: string | null; headers?: Headers; error?: unknown; message?: string }
const isApiError = (e: unknown): e is ApiErrorLike => typeof e === 'object' && e !== null && 'status' in e

/** The error's own message from the API body ({ error: { message } }), else the SDK's. */
function messageOf(e: ApiErrorLike): string {
  const body = e.error as { error?: { message?: unknown } } | undefined
  return typeof body?.error?.message === 'string' ? body.error.message : (e.message ?? '')
}

/**
 * Out of credit or over a spend limit: 24 h off. A bad or revoked key, or one not allowed: 24 h off. Refused for where
 * the call comes from (403 "Request not allowed"): the next key, none set aside. Rate-limited: off
 * for the retry-after the API gave (else 60 s). Overloaded or a server error, or no answer at all: the next key, this
 * one left as it is. A 404 too: the model may not be open to that organisation. Anything else (a 400 that isn't about
 * credit, a 413) is our request's fault: every key would refuse it, so stop.
 */
export function classify(e: unknown): Verdict {
  if (!isApiError(e)) return { next: false }
  const s = e.status
  // APIConnectionError and its timeout carry no status: the network, not the key.
  if (s === undefined) return { next: true }
  if (s === 402 || e.type === 'billing_error') return { mark: { why: 'credit', ttlSec: DAY_SEC }, next: true }
  if (s === 400 && /credit balance|usage limit|spend(ing)? limit/i.test(messageOf(e))) return { mark: { why: 'credit', ttlSec: DAY_SEC }, next: true }
  // Anthropic refusing where the call comes from (an unsupported region), not the key: every key would get the same.
  if (s === 403 && (e.type === 'forbidden' || /request not allowed/i.test(messageOf(e)))) return { next: true }
  if (s === 401 || s === 403 || e.type === 'authentication_error' || e.type === 'permission_error') return { mark: { why: 'auth', ttlSec: DAY_SEC }, next: true }
  if (s === 429 || e.type === 'rate_limit_error') {
    const after = Number(e.headers?.get('retry-after'))
    return { mark: { why: 'rate', ttlSec: Number.isFinite(after) && after > 0 ? Math.ceil(after) : 60 }, next: true }
  }
  if (s >= 500 || s === 404) return { next: true }
  return { next: false }
}

/** One call the rotation made: which key, how it ended (no status: it answered), how long it took. */
export type Attempt = { hash: string; ms: number; status?: number; type?: string; marked?: KeyProblem }
export type Rotated<T> =
  | { ok: true; value: T; hash: string; attempts: Attempt[] }
  /** resting: every key is set aside. unavailable: the keys tried failed for now (overloaded, network, out of time). request: our request was refused. */
  | { ok: false; reason: 'resting' | 'unavailable' | 'request'; attempts: Attempt[] }

/** The keys not set aside right now, in the order given. */
export async function healthyKeys(keys: KeyEntry[], store: HealthStore, now: number): Promise<KeyEntry[]> {
  const health = await Promise.all(keys.map(k => store.get(k.hash).catch(() => null)))
  return keys.filter((_, i) => !health[i] || health[i]!.until <= now)
}

export type RotateOptions = { random?: () => number; clock?: () => number; budgetMs?: number }

/**
 * Call with a random healthy key (use spreads evenly over the organisations, with no write per request); on a failure
 * that is the key's or the moment's, the next healthy key, each at most once, within `budgetMs` in all. A key whose
 * failure says it is out of credit, refused or rate-limited is marked in `store` so later requests skip it.
 */
export async function rotate<T>(healthy: KeyEntry[], store: HealthStore, call: (key: KeyEntry, timeoutMs: number) => Promise<T>, opts: RotateOptions = {}): Promise<Rotated<T>> {
  const clock = opts.clock ?? Date.now
  const deadline = clock() + (opts.budgetMs ?? 25_000)
  const attempts: Attempt[] = []
  if (!healthy.length) return { ok: false, reason: 'resting', attempts }
  const start = Math.min(healthy.length - 1, Math.floor((opts.random ?? Math.random)() * healthy.length))
  const order = [...healthy.slice(start), ...healthy.slice(0, start)]
  for (const key of order) {
    const left = deadline - clock()
    if (left < 1000) break
    const t = clock()
    try {
      const value = await call(key, left)
      attempts.push({ hash: key.hash, ms: clock() - t })
      return { ok: true, value, hash: key.hash, attempts }
    } catch (e) {
      const v = classify(e)
      const a: Attempt = { hash: key.hash, ms: clock() - t, ...(isApiError(e) && e.status !== undefined ? { status: e.status } : {}), ...(isApiError(e) && e.type ? { type: e.type } : {}) }
      attempts.push(a)
      if (v.mark) {
        a.marked = v.mark.why
        // KV keeps an entry 60 s at least; the `until` inside is what counts.
        await store.mark(key.hash, { until: clock() + v.mark.ttlSec * 1000, why: v.mark.why }, Math.max(60, v.mark.ttlSec)).catch(() => {})
      }
      if (!v.next) {
        if (!isApiError(e)) throw e // a bug of ours, not an answer from the API
        return { ok: false, reason: 'request', attempts }
      }
    }
  }
  // Every key tried this time was set aside by its own answer: the tool rests, as it would have for the next request.
  const allMarked = attempts.length === healthy.length && attempts.every(a => a.marked)
  return { ok: false, reason: allMarked ? 'resting' : 'unavailable', attempts }
}

/** The script's store: a run's own marks, in memory. */
export function memoryHealth(): HealthStore {
  const m = new Map<string, KeyHealth>()
  return { get: async h => m.get(h) ?? null, mark: async (h, health) => { m.set(h, health) } }
}
