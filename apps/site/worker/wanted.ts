import { KNOWN } from '@aq/schema/tanks'
import { nameKey } from '@aq/schema/text'
import { sciKey } from '@aq/schema/unlisted'
import { isBot } from './bots'
import { ipDayKey, readCapped } from './comments/api'
import { sha256 } from './accounts/session'
import { HOME_TZ, localDay } from './admin/time'

/**
 * Readers' demand for pages. A reader who puts a fish or plant the handbook has no page for on a tank ("Bể của tôi",
 * docs/my-tanks-sync.md) sends POST /api/v1/wanted `{ kind, name, sci? }`; the engine writes pages for the most wanted
 * first (packages/engine/src/readers-wanted.ts). Other parts of the site record theirs with `recordWanted`.
 *
 * KV `AB`, nothing about the reader:
 * - `wanted:n:<kind>:<name>`: per name, how many readers asked (once a reader a day), by which part of the site, first
 *   and last day. The same object is the key's metadata, so the engine reads every name in one list call per 1000.
 * - `wanted:r:<reader>`: the names (hashed) one reader counted today, for two days. The reader is an HMAC of their
 *   network and the day (`ipDayKey`), never the address; it also caps a reader at PER_READER_DAY names a day.
 */
export type WantedEnv = { AB: KVNamespace; ACCOUNT_HMAC_KEY?: string; COMMENT_HMAC_KEY?: string }
/** A name as counted: its kind (KNOWN.unlistedKind), the name as first written, the scientific name when one was given. */
export type Wanted = { kind: string; name: string; sci?: string; readers: number; sources: Record<string, number>; first: string; last: string }
export type WantedIn = { kind: unknown; name: unknown; sci?: unknown; source: string; reader?: string }

export const PREFIX = 'wanted:n:'
/** Names one reader can add in a day; more is a script, not a reader's tanks. */
export const PER_READER_DAY = 30
const MAX_BODY = 1024

const KINDS: readonly string[] = KNOWN.unlistedKind
const squash = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim()
const length = (s: string) => [...s].length
/** A name a person could keep: a letter, no address, email or phone number, no control characters. */
const junk = (s: string) => !/\p{L}/u.test(s) || /\p{Cc}|\p{Cf}|https?:|www\.|@|\.(?:com|net|org|vn)\b|\d{5}/iu.test(s)
/** A scientific name: Latin letters and the marks names use ("Corydoras cf. sterbai", "Hygrophila 'Sunset'"). */
const SCI = /^[A-Za-z][A-Za-z.'’×()-]*(?: [A-Za-z.'’×()-]+)+$/
const BINOMIAL = /^[A-Z][a-z]+ (?:(?:cf|aff)\.? )?[a-z]+$/

/** The name to count, cleaned, or undefined for one not worth keeping. A name that is a scientific name is also its `sci`. */
export function cleanWanted(raw: { kind: unknown; name: unknown; sci?: unknown }): { kind: string; name: string; sci?: string } | undefined {
  if (typeof raw.kind !== 'string' || !KINDS.includes(raw.kind) || typeof raw.name !== 'string') return undefined
  const name = squash(raw.name)
  if (length(name) < 2 || length(name) > 80 || junk(name)) return undefined
  const given = typeof raw.sci === 'string' ? squash(raw.sci) : ''
  // A scientific name that isn't one is left out, the name still counts.
  const sci = given && length(given) <= 120 && SCI.test(given) ? given : BINOMIAL.test(name) ? name : undefined
  return { kind: raw.kind, name, ...(sci ? { sci } : {}) }
}

/** Where a name is counted: by its scientific name when it has one (as the engine will look it up), else by its name. */
export const wantedKey = (w: { kind: string; name: string; sci?: string }) =>
  `${PREFIX}${w.kind}:${w.sci ? `s:${sciKey(w.sci)}` : `n:${nameKey(w.name)}`}`

/** The reader behind a request, for counting each once a day: an HMAC of their network and the day; none without a key. */
export async function readerOf(req: Request, env: WantedEnv, now: Date): Promise<string | undefined> {
  const secret = env.ACCOUNT_HMAC_KEY ?? env.COMMENT_HMAC_KEY
  if (!secret) return undefined
  // Its own key, so this count can't be joined with the comments' limits.
  return (await ipDayKey(`${secret}|wanted`, req.headers.get('cf-connecting-ip') ?? 'unknown', now)).slice(3)
}

/**
 * Counts a name the handbook has no page for (a reader's tank, or a fish-ID guess no page matches). `reader`
 * (`readerOf`): counted once a reader a day, and at most PER_READER_DAY names a reader a day; without it, every call
 * counts. `source`: the part of the site asking (`tank`, …). Two counts at the same moment can lose one (KV has no
 * transactions); fine for a ranking.
 */
export async function recordWanted(env: WantedEnv, w: WantedIn, now = new Date()): Promise<'counted' | 'again' | 'limited' | 'invalid'> {
  const clean = cleanWanted(w)
  if (!clean || !/^[a-z][a-z-]{0,19}$/.test(w.source)) return 'invalid'
  const key = wantedKey(clean)
  // The dashboard's days for a name, first and last: Vietnam's, as the affiliate clicks keep theirs (admin/time.ts).
  const day = localDay(now, HOME_TZ)
  if (w.reader) {
    const rk = `wanted:r:${w.reader}`
    const seen = (await env.AB.get<string[]>(rk, 'json')) ?? []
    const mark = (await sha256(key)).slice(0, 12)
    if (seen.includes(mark)) return 'again'
    if (seen.length >= PER_READER_DAY) return 'limited'
    await env.AB.put(rk, JSON.stringify([...seen, mark]), { expirationTtl: 2 * 86_400 })
  }
  const was = await env.AB.get<Wanted>(key, 'json')
  const sci = was?.sci ?? clean.sci
  const next: Wanted = {
    kind: clean.kind, name: was?.name ?? clean.name, ...(sci ? { sci } : {}),
    readers: (was?.readers ?? 0) + 1, sources: { ...was?.sources, [w.source]: (was?.sources[w.source] ?? 0) + 1 },
    first: was?.first ?? day, last: day,
  }
  await env.AB.put(key, JSON.stringify(next), { metadata: next })
  return 'counted'
}

const answer = (status: number, error?: string) =>
  error ? Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } }) : new Response(null, { status, headers: { 'cache-control': 'no-store' } })

/**
 * POST /api/v1/wanted `{ kind, name, sci? }`: from this site's pages or the app (no Origin), as JSON. 204 counted, or not
 * counted (said before today, a bot, the owner); 400 a name not worth keeping; 429 past a reader's names for the day.
 */
export async function wantedRoute(req: Request, env: WantedEnv, now: Date): Promise<Response> {
  if (req.method !== 'POST') return answer(405, 'method')
  const origin = req.headers.get('origin')
  if (origin && origin !== new URL(req.url).origin) return answer(403, 'cross_origin')
  if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '')) return answer(415, 'json')
  const text = await readCapped(req, MAX_BODY)
  if (text === null) return answer(413, 'too_large')
  let body: Record<string, unknown>
  try {
    const v = JSON.parse(text) as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) return answer(400, 'bad_request')
    body = v as Record<string, unknown>
  } catch { return answer(400, 'bad_request') }
  if (isBot(req.headers.get('user-agent'), req.headers.get('accept-language'))) return answer(204)
  if (/(?:^|;\s*)aq_owner=1(?:;|$)/.test(req.headers.get('cookie') ?? '')) return answer(204) // the owner trying it out
  const reader = await readerOf(req, env, now)
  if (!reader) return answer(503, 'wanted_off')
  const r = await recordWanted(env, { kind: body.kind, name: body.name, sci: body.sci, source: 'tank', reader }, now)
  return r === 'invalid' ? answer(400, 'bad_name') : r === 'limited' ? answer(429, 'rate_limited') : answer(204)
}
