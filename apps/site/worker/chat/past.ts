import { sameSiteOk, sessionOf, tokenOf } from '../accounts/session'
import { DEFAULT_MODEL } from '../fishid/claude'
import { ledgerClient } from '../fishid/ledger'
import type { Start } from './agent'
import { linkedOf } from './answer'
import { askable, assetSource, charsOf, CONVERSATION_MS, json, limit, live, MAX_TURNS, UUID, type ChatDeps, type ChatEnv, type Conversation, type Kept, type KeptTurn, type Turn } from './api'
import { handbookOf, type Handbook, type Lang } from './handbook'
import { chatAccount, conversationKey, importedKey, listAll, reportKey, retryKey, secs, stopKey } from './store'

/**
 * The chat's Stop and its past conversations (protocols/chat.openapi.json), behind the chat's own gate.
 *
 * - Stop: the ledger (fishid/ledger.ts) says whether the stop or the question's first text came first, whichever Worker
 *   each landed on; the question's own request sees it and ends `410 cancelled` (api.ts).
 * - The list reads `chat_conversations`, one row a conversation with an answer, which holds no answers: those stay in R2
 *   with the conversation. A row is written with each answer (api.ts). Rows, reports and all go with the account.
 * - A report is an R2 object under the account, written only where none is: one a turn, the first reason standing.
 */
const FREE_STOPS = 10
const REASON_CHARS = 140
const PAGE = 20
const MAX_PAGE = 50
/** Conversations from before the list: copied in on the account's first look, at most this many. */
const IMPORT = 200

type Row = { id: string; title: string; start: string; first_at: string; last_at: string; questions: number; continues: string | null; hidden: number }
type StartKept = Start & { lang?: Lang }
const startOf = (r: Row) => JSON.parse(r.start) as StartKept

export async function chatPast(req: Request, url: URL, env: ChatEnv, now: Date, deps: ChatDeps = {}): Promise<Response> {
  if (!live(env)) return json({ error: 'unavailable' }, 503)
  const bearer = req.headers.has('authorization')
  if (req.method === 'POST' && !bearer && tokenOf(req)?.via === 'cookie' && !sameSiteOk(req, true)) return json({ error: 'cross-origin' }, 403)
  const session = await sessionOf(req, env.DB, now)
  if (!askable(env, session?.userId)) return json({ error: 'unavailable' }, 503)
  if (!session || (bearer && session.via !== 'bearer')) return json({ error: 'session' }, 401)
  const account = await chatAccount(env.ACCOUNT_HMAC_KEY, session.userId)
  const db = env.DB
  const bucket = env.UPLOADS
  const clock = deps.clock ?? (() => now.getTime())
  const maxTurns = limit(env.CHAT_MAX_TURNS, MAX_TURNS)

  const rows = async () => (await db.prepare('SELECT id, title, start, first_at, last_at, questions, continues, hidden FROM chat_conversations WHERE account = ?').bind(account).all<Row>()).results
  const open = (r: Row) => clock() - Date.parse(r.first_at) < CONVERSATION_MS && r.questions < maxTurns
  const books = new Map<Lang, Promise<Handbook | null>>()
  const book = (l: Lang) => { let b = books.get(l); if (!b) books.set(l, b = handbookOf(deps.source ?? assetSource(env, url.origin), l).catch(() => null)); return b }
  /** The page it started from: a fish's or plant's, or, from fish ID, its first guess's. Missing when the handbook no longer has it. */
  const aboutOf = async (s: StartKept) => {
    const id = s.about ?? s.identified?.results[0]?.id
    if (!id) return undefined
    const i = (await book(s.lang ?? 'vi'))?.byId(id)
    return i && (i.kind === 'fish' || i.kind === 'plant') ? linkedOf(id, i) : undefined
  }
  const summaryOf = async (r: Row) => {
    const s = startOf(r)
    const about = await aboutOf(s)
    return { id: r.id, question: r.title, ...(s.from ? { from: s.from } : {}), ...(about ? { about } : {}), ...(s.identified ? { identified: s.identified } : {}), started: r.first_at, last: r.last_at, n: r.questions, open: open(r), ...(r.continues ? { continues: r.continues } : {}) }
  }
  /** One of the account's conversations it hasn't hidden, with what it keeps. */
  const held = async (id: string): Promise<{ row: Row; conv: Conversation } | undefined> => {
    if (!UUID.test(id)) return undefined
    const row = await db.prepare('SELECT id, title, start, first_at, last_at, questions, continues, hidden FROM chat_conversations WHERE account = ? AND id = ?').bind(account, id).first<Row>()
    if (!row || row.hidden) return undefined
    const conv = await (await bucket.get(conversationKey(account, id)))?.json<Conversation>()
    return conv ? { row, conv } : undefined
  }

  const list = async () => {
    const asked = Number(url.searchParams.get('limit') ?? PAGE)
    if (!Number.isInteger(asked) || asked < 1 || asked > MAX_PAGE) return json({ error: 'bad request' }, 400)
    const before = url.searchParams.get('before')
    const cursor = before === null ? undefined : cursorOf(before)
    if (cursor === null) return json({ error: 'bad request' }, 400)
    let all = await rows()
    if (!(await bucket.get(importedKey(account)))) { await importOld(env as Required<Pick<ChatEnv, 'DB' | 'UPLOADS'>>, account, new Set(all.map(r => r.id))); all = await rows() }
    const about = url.searchParams.get('about')
    const chains = chainsOf(all.filter(r => !r.hidden)).filter(c => about === null || (startOf(c[0]!).from === 'species' && startOf(c[0]!).about === about))
    const sorted = chains.map(c => ({ c, t: Math.max(...c.map(r => Date.parse(r.last_at))) })).sort((a, b) => b.t - a.t || (a.c[0]!.id < b.c[0]!.id ? 1 : -1))
    const after = cursor ? sorted.filter(x => x.t < cursor.t || (x.t === cursor.t && x.c[0]!.id < cursor.id)) : sorted
    const page = after.slice(0, asked)
    const out = await Promise.all(page.map(async x => ({ conversations: await Promise.all(x.c.map(summaryOf)) })))
    const last = page.at(-1)
    return json({ rows: out, ...(after.length > asked && last ? { next: cursorFor(last.t, last.c[0]!.id) } : {}) })
  }

  const conversation = async (id: string) => {
    const it = await held(id)
    if (!it) return json({ error: 'unknown' }, 404)
    const s = startOf(it.row)
    const about = await aboutOf(s)
    return json({
      id: it.row.id, ...(s.from ? { from: s.from } : {}), ...(about ? { about } : {}), ...(s.identified ? { identified: s.identified } : {}),
      started: it.row.first_at, last: it.row.last_at, open: open(it.row), ...(it.row.continues ? { continues: it.row.continues } : {}),
      turns: it.conv.turns.map(t => ({ question: t.question, asked: secs(t.at), turn: turnOf(t, id, env.CHAT_MODEL || DEFAULT_MODEL) })),
    })
  }

  /** The whole row: every conversation joined to this one by what carried on what. Nothing is deleted. */
  const hide = async (id: string) => {
    const all = (await rows())
    if (!all.some(r => r.id === id)) return json({ hidden: [] })
    const near = new Map<string, string[]>()
    for (const r of all) if (r.continues) { near.set(r.id, [...(near.get(r.id) ?? []), r.continues]); near.set(r.continues, [...(near.get(r.continues) ?? []), r.id]) }
    const seen = new Set([id])
    for (const x of seen) for (const y of near.get(x) ?? []) seen.add(y)
    const hidden = all.filter(r => seen.has(r.id)).sort((a, b) => Date.parse(a.first_at) - Date.parse(b.first_at)).map(r => r.id)
    await db.batch(hidden.map(x => db.prepare('UPDATE chat_conversations SET hidden = 1 WHERE account = ? AND id = ?').bind(account, x)))
    return json({ hidden })
  }

  const report = async (id: string) => {
    const b = await req.json().catch(() => null) as Record<string, unknown> | null
    if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).some(k => k !== 'turn' && k !== 'reason')) return json({ error: 'bad request' }, 400)
    const n = b.turn
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return json({ error: 'bad request' }, 400)
    if (b.reason !== undefined && (typeof b.reason !== 'string' || /[\r\n]/.test(b.reason))) return json({ error: 'bad request' }, 400)
    const reason = (b.reason as string | undefined) ?? ''
    if (charsOf(reason) > REASON_CHARS) return json({ error: 'too long' }, 400)
    const t = (await held(id))?.conv.turns.find(x => x.n === n)
    if (!t) return json({ error: 'unknown' }, 404)
    const put = await bucket.put(reportKey(account, id, n), JSON.stringify({ at: secs(clock()), conversation: id, turn: n, question: t.question, text: t.text, ...(reason ? { reason } : {}) }), { onlyIf: { etagDoesNotMatch: '*' } })
    return json({ result: put ? 'saved' : 'already' })
  }

  const cancel = async () => {
    const b = await req.json().catch(() => null) as Record<string, unknown> | null
    if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).some(k => k !== 'key') || typeof b.key !== 'string' || !UUID.test(b.key)) return json({ error: 'bad request' }, 400)
    const key = b.key.toLowerCase()
    // It ended already: its turn or its error stands, unless that error is this stop's own.
    const kept = await (await bucket.get(retryKey(account, key)))?.json<Kept>()
    if (kept) return json('error' in kept && kept.error === 'cancelled' ? { result: 'cancelled', counted: kept.counted ?? false, ...(kept.freeLeft !== undefined ? { freeLeft: kept.freeLeft } : {}) } : { result: 'too late' })
    return json(await ledgerClient(env.FISHID_LEDGER!).cancel({ day: now.toISOString().slice(0, 10), key: stopKey(account, key), free: FREE_STOPS }))
  }

  try {
    const path = url.pathname.replace(/\/$/, '')
    if (path === '/api/chat/cancel') return req.method === 'POST' ? await cancel() : new Response(null, { status: 405 })
    const m = path.match(/^\/api\/chat\/conversations(?:\/([^/]+)(?:\/(hide|report))?)?$/)
    if (!m) return json({ error: 'unknown' }, 404)
    const id = m[1]?.toLowerCase()
    if (!id) return req.method === 'GET' ? await list() : new Response(null, { status: 405 })
    if (!m[2]) return req.method === 'GET' ? await conversation(id) : new Response(null, { status: 405 })
    if (req.method !== 'POST') return new Response(null, { status: 405 })
    return m[2] === 'hide' ? await hide(id) : await report(id)
  } catch (e) {
    console.error('chat past:', e)
    return json({ error: 'unavailable' }, 503)
  }
}

/** The list's rows: each conversation with those that carried it on, oldest first. If two carried on one, the later joins it and the other starts its own row. */
function chainsOf(rows: Row[]): Row[][] {
  const ids = new Set(rows.map(r => r.id))
  const next = new Map<string, Row>()
  for (const r of [...rows].sort((a, b) => Date.parse(a.first_at) - Date.parse(b.first_at))) if (r.continues && ids.has(r.continues)) next.set(r.continues, r)
  const joined = new Set([...next.values()].map(r => r.id))
  return rows.filter(r => !joined.has(r.id)).map(root => {
    const chain = [root]
    for (let r = next.get(root.id); r && !chain.includes(r); r = next.get(r.id)) chain.push(r)
    return chain
  })
}

const turnOf = (t: KeptTurn, conversation: string, model: string): Turn => ({
  conversation, n: t.n, text: t.text, blocks: t.blocks, suggestions: t.suggestions ?? [], covered: t.covered ?? true, model: t.model ?? model,
  ...(t.steps ? { steps: t.steps } : {}), ...(t.opening ? { opening: t.opening } : {}),
})

const cursorFor = (t: number, id: string) => btoa(`${t}|${id}`).replace(/=+$/, '')
function cursorOf(s: string): { t: number; id: string } | null {
  try {
    const m = atob(s).match(/^(\d+)\|([0-9a-f-]{36})$/)
    return m ? { t: Number(m[1]), id: m[2]! } : null
  } catch { return null }
}

/** An account's conversations from before the list has rows for them: where they started wasn't kept, so their rows have no picture. */
async function importOld(env: Required<Pick<ChatEnv, 'DB' | 'UPLOADS'>>, account: string, have: Set<string>): Promise<void> {
  const prefix = conversationKey(account, '').replace(/\.json$/, '')
  const idOf = (key: string) => key.slice(prefix.length, -'.json'.length)
  const missing = (await listAll(env.UPLOADS, prefix)).map(o => o.key).filter(k => !have.has(idOf(k)))
  const rows: D1PreparedStatement[] = []
  let unread = 0
  for (const key of missing.slice(0, IMPORT)) {
    try {
      const c = await (await env.UPLOADS.get(key))?.json<Conversation>()
      if (!c?.turns.length) continue
      rows.push(env.DB.prepare('INSERT OR IGNORE INTO chat_conversations (account, id, title, first_at, last_at, questions) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(account, idOf(key), c.turns[0]!.question, secs(c.created), secs(c.turns.at(-1)!.at), c.turns.length))
    } catch { unread++ }
  }
  if (rows.length) await env.DB.batch(rows)
  if (unread) console.error('chat import: conversations unread', unread)
  // Past what one look may read, or with one unread, the next look carries on.
  else if (missing.length <= IMPORT) await env.UPLOADS.put(importedKey(account), '1')
}
