import { esc } from './chart'
import { ASKS_NAME, ASKS_PATH, failedBox, isFailed, page, type Soft } from './shell'

/**
 * The owner's asks: every ask since 6 Nov, as the chief of staff keeps the list on the Mac (a file there, never in the
 * repository). A job on the Mac sends it here when it changes (scripts/owner-asks-send.mjs, with the dashboard token);
 * this page shows the last list sent, as the chief's own page of it does: what isn't followed, what waits on the owner,
 * what's being built, what's theirs to try, what's done, and the owner's standing words folded at the bottom.
 *
 * The leads write it, so every field is checked before it's kept: its length, a state from a fixed list, a date as a
 * date, no HTML; everything is shown as text, and an address becomes a link only when it's one of ours. A list that
 * fails is refused whole, with the reason, and the page keeps the last one that passed. Web only for now: the app's
 * section list (protocols/owner-dashboard.openapi.json) gains it as its own change.
 */
/** Where the Mac's job sends the list (PUT, the dashboard token as its bearer). */
export const ASKS_PUT = '/_ab/asks'
/** One object in the private bucket, replaced by each list that passes. */
const KEY = 'owner-asks/list.json'
/** A list not changed for longer than this is marked on the page: the job or the chief may have stopped. */
export const STALE_MS = 6 * 3_600_000

export const STATES = ['late', 'nothing', 'unknown', 'open', 'partly', 'you', 'try', 'done', 'parked'] as const
type State = (typeof STATES)[number]
/** Each state's words on its chip, as the chief's page has them. */
const LABEL: Record<State, string> = {
  late: 'late', nothing: 'not started', unknown: 'not checked', open: 'being built', partly: 'partly there', you: 'needs you',
  try: 'try it', done: 'done', parked: 'parked',
}

export type Ask = { ask: string; words: string; asked: string[]; lead: string; state: State; due: string; now: string; d?: string; where?: string }
export type Asks = { today: string; updated: string; rows: Ask[]; parked: Ask[]; rules: string[] }
/** What the bucket keeps: the list, when the chief last changed it (the file's time on the Mac) and when it came. */
export type Stored = { modified: string; received: string; list: Asks }

/** Each text field's longest, in characters: twice and more the longest the list has had (16 Nov). */
const MAX: Record<'ask' | 'words' | 'lead' | 'due' | 'now' | 'where' | 'updated' | 'rule', number> = {
  ask: 300, words: 1500, lead: 80, due: 1000, now: 8000, where: 600, updated: 60, rule: 600,
}
const MAX_ROWS = 600
const MAX_RULES = 80
const MAX_ASKED = 30
/** The whole list, as sent. */
export const MAX_BYTES = 1_000_000
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const ASKED = /^([1-9]|[12]\d|3[01]) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/**
 * An HTML element's tag, which no field may hold. A placeholder in angle brackets ("Hỏi về <tên>", "/ca/<slug>/",
 * "/_ab/<key>/") is words, not a tag. Every field is shown as text anyway (escaped): this keeps markup out of the list.
 */
const TAG = /<\/?(a|abbr|audio|b|base|body|br|button|code|details|div|em|embed|form|frame|h[1-6]|head|html|i|iframe|img|input|label|li|link|math|meta|object|ol|option|p|picture|pre|script|section|select|source|span|strong|style|summary|svg|table|td|template|textarea|th|tr|u|ul|video)(?=[\s/>])[^<>]*>/i
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/
/** Our own hosts: the only addresses a row links to. */
const OURS = new Set(['aquatome.com', 'dashboard.aquatome.com'])

/** A real day ("2026-11-31" and "2026-13-01" aren't: refused with why, never thrown). */
const isDay = (s: unknown): s is string => {
  if (typeof s !== 'string' || !ISO_DAY.test(s)) return false
  const t = Date.parse(`${s}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s
}

/** A text field, or why it fails. */
function textOf(v: unknown, what: string, max: number, optional = false): string | { why: string } {
  if (v === undefined && optional) return ''
  if (typeof v !== 'string') return { why: `${what} isn't text` }
  if (v.length > max) return { why: `${what} is ${v.length} characters, over ${max}` }
  if (CONTROL.test(v)) return { why: `${what} holds a control character` }
  if (TAG.test(v)) return { why: `${what} holds an HTML tag` }
  return v
}
const failed = (x: unknown): x is { why: string } => typeof x === 'object' && x !== null && 'why' in x

const ROW_KEYS = new Set(['ask', 'words', 'asked', 'lead', 'state', 'due', 'now', 'd', 'where'])
function rowOf(v: unknown, at: string): Ask | { why: string } {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return { why: `${at} isn't a row` }
  const r = v as Record<string, unknown>
  const odd = Object.keys(r).find(k => !ROW_KEYS.has(k))
  if (odd !== undefined) return { why: `${at} has a field the page doesn't know` }
  const ask = textOf(r.ask, `${at}'s ask`, MAX.ask)
  if (failed(ask)) return ask
  if (!ask.trim()) return { why: `${at}'s ask is empty` }
  const fields = { words: textOf(r.words, `${at}'s words`, MAX.words, true), lead: textOf(r.lead, `${at}'s lead`, MAX.lead, true), due: textOf(r.due, `${at}'s due`, MAX.due, true), now: textOf(r.now, `${at}'s now`, MAX.now, true), where: textOf(r.where, `${at}'s where`, MAX.where, true) }
  for (const f of Object.values(fields)) if (failed(f)) return f
  if (!STATES.includes(r.state as State)) return { why: `${at}'s state isn't one of ${STATES.join(', ')}` }
  if (!Array.isArray(r.asked) || !r.asked.length || r.asked.length > MAX_ASKED || !r.asked.every(a => typeof a === 'string' && ASKED.test(a))) return { why: `${at}'s asked isn't 1 to ${MAX_ASKED} days like "15 Nov"` }
  if (r.d !== undefined && r.d !== '' && !isDay(r.d)) return { why: `${at}'s d isn't a day like 2026-11-17` }
  const f = fields as Record<keyof typeof fields, string>
  return { ask, words: f.words, asked: r.asked as string[], lead: f.lead, state: r.state as State, due: f.due, now: f.now, ...(r.d ? { d: r.d as string } : {}), ...(f.where ? { where: f.where } : {}) }
}

/** The list as the job sends it, checked field by field: the list, or why it's refused (the first fault found). */
export function readAsks(v: unknown): Asks | { why: string } {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return { why: "the list isn't an object" }
  const o = v as Record<string, unknown>
  const odd = Object.keys(o).find(k => !['today', 'updated', 'rows', 'parked', 'rules'].includes(k))
  if (odd !== undefined) return { why: "the list has a field the page doesn't know" }
  if (!isDay(o.today)) return { why: "today isn't a day like 2026-11-17" }
  const updated = textOf(o.updated, 'updated', MAX.updated)
  if (failed(updated)) return updated
  const lists: Record<'rows' | 'parked', Ask[]> = { rows: [], parked: [] }
  // A list with no rows would replace the page with an empty one: refused (a parked list may be empty).
  if (!Array.isArray(o.rows) || !o.rows.length) return { why: 'the list has no rows' }
  for (const name of ['rows', 'parked'] as const) {
    const xs = o[name] ?? []
    if (!Array.isArray(xs) || xs.length > MAX_ROWS) return { why: `${name} isn't a list of at most ${MAX_ROWS} rows` }
    for (const [i, x] of xs.entries()) {
      const r = rowOf(x, `${name} ${i + 1}`)
      if (failed(r)) return r
      lists[name].push(r)
    }
  }
  const rules = o.rules ?? []
  if (!Array.isArray(rules) || rules.length > MAX_RULES) return { why: `rules isn't a list of at most ${MAX_RULES}` }
  const kept: string[] = []
  for (const [i, x] of rules.entries()) {
    const r = textOf(x, `rule ${i + 1}`, MAX.rule)
    if (failed(r)) return r
    kept.push(r)
  }
  return { today: o.today, updated, rows: lists.rows, parked: lists.parked, rules: kept }
}

/** A request's body as text, or null once it passes `max` bytes: read no further than that. */
export async function capped(req: Request, max: number): Promise<string | null> {
  if (Number(req.headers.get('content-length')) > max) return null
  if (!req.body) return ''
  const reader = req.body.getReader(), parts: Uint8Array[] = []
  let n = 0
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    n += r.value.byteLength
    if (n > max) { await reader.cancel(); return null }
    parts.push(r.value)
  }
  const all = new Uint8Array(n)
  let at = 0
  for (const p of parts) { all.set(p, at); at += p.byteLength }
  return new TextDecoder().decode(all)
}

/**
 * PUT /_ab/asks from the Mac's job, the dashboard token as its bearer (checked before this): `{ modified, list }`, the
 * file's time and the list. 200 with how many rows were kept; 400 with why it was refused, and the last list stays.
 */
export async function putAsks(req: Request, bucket: R2Bucket, now: Date): Promise<Response> {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
  const refuse = (why: string) => json({ error: 'refused', why }, 400)
  if (req.method !== 'PUT') return new Response(null, { status: 405, headers: { allow: 'PUT', 'cache-control': 'no-store' } })
  // The size before it's read: a list past it is refused, not held in the Worker's memory.
  const text = await capped(req, MAX_BYTES)
  if (text === null) return refuse(`the list is over ${MAX_BYTES} bytes`)
  let body: unknown
  try { body = JSON.parse(text) } catch { return refuse("the list isn't JSON") }
  const { modified, list } = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  if (typeof modified !== 'string' || !Number.isFinite(Date.parse(modified)) || Date.parse(modified) > now.getTime() + 300_000) return refuse("modified isn't a time before now")
  const asks = readAsks(list)
  if (failed(asks)) return refuse(asks.why)
  const stored: Stored = { modified: new Date(modified).toISOString(), received: now.toISOString(), list: asks }
  await bucket.put(KEY, JSON.stringify(stored), { httpMetadata: { contentType: 'application/json' } })
  return json({ ok: true, rows: asks.rows.length, parked: asks.parked.length })
}

/** The last list sent, read again as it's shown (a list kept under older rules is checked once more); null before the first. */
export async function readStored(bucket: R2Bucket): Promise<Stored | null> {
  const o = await bucket.get(KEY)
  if (!o) return null
  const s = (await o.json()) as Partial<Stored>
  const list = readAsks(s.list)
  if (failed(list)) throw new Error(`the list kept no longer passes: ${list.why}`)
  return { modified: String(s.modified), received: String(s.received), list }
}

/** An ask's first day ("15 Nov"), in the year that puts it on or before the list's today. */
function firstDay(r: Ask, today: string): string {
  const [d, m] = r.asked[0]!.split(' ')
  const year = Number(today.slice(0, 4))
  const day = (y: number) => `${y}-${String(MONTHS.indexOf(m!) + 1).padStart(2, '0')}-${d!.padStart(2, '0')}`
  return day(year) > today ? day(year - 1) : day(year)
}

type Bucket = 'red' | 'you' | 'build' | 'try' | 'done' | 'parked'
/** Where a row goes, as the chief's page sorts them: late, not started or not checked; an ask open since it was asked twice or a week ago; and so on. */
export function bucketOf(r: Ask, today: string): Bucket {
  if (r.state === 'late' || r.state === 'nothing' || r.state === 'unknown') return 'red'
  if (r.state === 'open' && (r.asked.length > 1 || Date.parse(today) - Date.parse(firstDay(r, today)) >= 7 * 86_400_000)) return 'red'
  if (r.state === 'open' || r.state === 'partly') return 'build'
  return r.state
}
const GROUPS: [Bucket, string, string, boolean][] = [
  ['red', 'Not followed', "Asked more than once or over a week ago and still not in your hands, a date that moved, nothing started, or I can't vouch for it.", true],
  ['you', 'Waiting on you', 'One word from you moves each of these.', true],
  ['build', 'Being built, on its date', '', true],
  ['try', 'In your hands: try it and tell me', "In a build you have or live on the site. Not closed until you say it's right.", false],
  ['done', 'Done', 'In your build or live, and seen by me.', false],
  ['parked', 'Parked by you', '', false],
]
const TILES: [Bucket, string][] = [['red', 'not followed'], ['you', 'waiting on you'], ['build', 'being built'], ['try', 'yours to try'], ['done', 'done']]

/** Text with each of our own addresses in it as a link; any other address stays text. */
export function linked(text: string): string {
  let out = '', from = 0
  for (const m of text.matchAll(/https?:\/\/[^\s<>"'()]+/g)) {
    const raw = m[0].replace(/[.,;:!?]+$/, '')
    let ours = false
    try { const u = new URL(raw); ours = u.protocol === 'https:' && OURS.has(u.hostname) && !u.username && !u.password } catch { /* not an address */ }
    out += esc(text.slice(from, m.index)) + (ours ? `<a href="${esc(raw)}">${esc(raw)}</a>` : esc(raw))
    from = m.index! + raw.length
  }
  return out + esc(text.slice(from))
}

function rowHtml(r: Ask): string {
  const days = [...new Set(r.asked)]
  const again = r.asked.length > 1 ? ` · <span class="x">${r.asked.length} times</span>` : ''
  return `<div class="ask"><div class="top"><p class="what">${esc(r.ask)}</p><span class="state s-${r.state}">${LABEL[r.state]}</span></div>`
    + (r.words ? `<p class="said">“${esc(r.words)}”</p>` : '')
    + `<p class="meta">asked ${esc(days.join(', '))}${again}${r.lead ? ` · ${esc(r.lead)}` : ''}</p>`
    + (r.due || r.now ? `<p class="now">${r.due ? `<b>${esc(r.due)}.</b> ` : ''}${linked(r.now)}</p>` : '')
    + (r.where ? `<p class="where"><b>Where:</b> ${linked(r.where)}</p>` : '')
    + '</div>'
}

export type AsksData = { now: Date; tz: string; s: Soft<Stored | null> }

export function asksPage({ now, tz, s }: AsksData): string {
  const head = `<h1>${ASKS_NAME}</h1>`
  if (isFailed(s)) return page(ASKS_PATH, ASKS_NAME, `${head}${failedBox('the list', s)}`, now, tz)
  if (!s) return page(ASKS_PATH, ASKS_NAME, `${head}<p class="lede">No list yet: the Mac sends the chief of staff's list here when it changes.</p>`, now, tz)
  const { list } = s
  const rows = [...list.rows, ...list.parked.map(r => ({ ...r, state: 'parked' as const }))]
  const groups = new Map<Bucket, Ask[]>(GROUPS.map(([k]) => [k, []]))
  for (const r of rows) groups.get(bucketOf(r, list.today))!.push(r)
  for (const xs of groups.values()) xs.sort((a, b) => (a.d || '9999').localeCompare(b.d || '9999') || firstDay(a, list.today).localeCompare(firstDay(b, list.today)))
  const age = now.getTime() - Date.parse(s.modified)
  const stale = age > STALE_MS ? ` <span class="stale">Not changed for ${Math.floor(age / 3_600_000)} hours.</span>` : ''
  const lede = `<p class="lede">Every ask since 6 Nov, ${rows.length} in all. Updated ${esc(list.updated)}.${stale}</p>`
  const tiles = `<div class="asks-tiles">${TILES.map(([k, name]) => `<div class="t-${k}"><b>${groups.get(k)!.length}</b><span>${name}</span></div>`).join('')}</div>`
  const sections = GROUPS.filter(([k]) => groups.get(k)!.length).map(([k, title, note, open]) =>
    `<details class="asks-group"${open ? ' open' : ''}><summary>${esc(title)} <span class="n">${groups.get(k)!.length}</span></summary>${note ? `<p class="note">${esc(note)}</p>` : ''}${groups.get(k)!.map(rowHtml).join('')}</details>`).join('')
  const rules = list.rules.length ? `<details class="asks-group"><summary>Your standing words <span class="n">${list.rules.length}</span></summary><ul class="rules">${list.rules.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''
  return page(ASKS_PATH, ASKS_NAME, `<div class="asks">${head}${lede}${tiles}${sections}${rules}</div>`, now, tz)
}
