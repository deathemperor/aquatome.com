import { staticRules } from '../comments/rules'
import { HIDDEN as REPORTED } from '../report'
import { figures, heading, note, table, type Action, type Block, type Cell, type Section } from './blocks'
import { esc, tiles, type Tile } from './chart'
import type { PageInfo, Talk } from './content'
import { weeksTo } from './scoreboard'
import { isFailed, page, type Failed, type Soft } from './shell'
import { dayStart, HOME_TZ, msOf, timeTag, zoneName } from './time'

/**
 * Readers' comments for the owner (/_ab/binh-luan/, its blocks for the app): one state at a time, newest first, 50 a
 * page, each with why it is in that state in plain English and the owner's buttons; then the week's counts and the most
 * discussed pages. The owner's show or hide (decideComment) writes the comment's reason and decided_at as the nightly
 * moderation does, so its queue (comments/api.ts moderationQueue) leaves the comment alone until a reader reports it again.
 * The new dashboard's words: English.
 */

export const COMMENTS_PATH = '/_ab/binh-luan/'
/** The page's form (the cookie); the app's is POST /api/owner/comments/{id} (owner-api.ts), both decideComment. */
export const COMMENTS_FORM = '/_ab/comments'

export type CommentState = 'held' | 'shown' | 'hidden'
export const STATES: CommentState[] = ['held', 'shown', 'hidden']
type Status = 'held' | 'approved' | 'removed'
const STATUS: Record<CommentState, Status> = { held: 'held', shown: 'approved', hidden: 'removed' }
const STATE: Record<Status, CommentState> = { held: 'held', approved: 'shown', removed: 'hidden' }
const LABEL: Record<CommentState, string> = { held: 'Held', shown: 'Shown', hidden: 'Hidden' }
export const stateOf = (s: string | null | undefined): CommentState | undefined => (STATES as (string | null | undefined)[]).includes(s) ? (s as CommentState) : undefined

/** A comment as D1 keeps it (migrations 0002, 0006), with its readers' reports' reasons ('' for none given), oldest first. */
export type CommentRow = { id: string; entity_ref: string; name: string; body: string; status: Status; reason: string | null; created_at: string; decided_at: string | null; reports: string[] }
export type CommentList = { counts: Record<CommentState, number>; rows: CommentRow[]; next?: string }
export type CommentWeek = { posted: number; heldPosted: number; reported: number; hidden: number }
export type CommentsData = {
  now: Date; tz: string; state: CommentState
  list: Soft<CommentList>
  /** The build's pages by D1's key ("species:<id>", content.ts pagesByRef); undefined when content.json didn't load. */
  pages?: Map<string, PageInfo>
  week: Soft<CommentWeek>
  talk: Soft<Talk>
}

// ——— Paging: newest first, by when it was posted and then its id, so a page never moves under a comment posted since ———

export const PER_PAGE = 50
type Cursor = { at: string; id: string }
const CURSOR = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z) ([0-9a-f-]{36})$/
export const cursorOf = (r: { created_at: string; id: string }) => btoa(`${r.created_at} ${r.id}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export function readCursor(s: string): Cursor | undefined {
  try {
    const m = CURSOR.exec(atob(s.replace(/-/g, '+').replace(/_/g, '/')))
    return m ? { at: m[1]!, id: m[2]! } : undefined
  } catch {
    return undefined
  }
}

/** The section's address takes ?state= alone (held when absent); undefined for anything else. */
export function sectionQuery(q: URLSearchParams): CommentState | undefined {
  if ([...q.keys()].some(k => k !== 'state') || q.getAll('state').length > 1) return undefined
  return q.has('state') ? stateOf(q.get('state')) : 'held'
}
/** GET /api/owner/comments: a state and the cursor of the page before, nothing else. */
export function moreQuery(q: URLSearchParams): { state: CommentState; cursor: Cursor } | undefined {
  if ([...q.keys()].some(k => k !== 'state' && k !== 'cursor') || q.getAll('state').length !== 1 || q.getAll('cursor').length !== 1) return undefined
  const state = stateOf(q.get('state'))
  const cursor = readCursor(q.get('cursor')!)
  return state && cursor ? { state, cursor } : undefined
}

// ——— Reads (D1) ———

/** One state's comments, newest first, PER_PAGE from `cursor`, and how many each state has. */
export async function listComments(db: D1Database, state: CommentState, cursor?: Cursor): Promise<CommentList> {
  const [counts, page] = await Promise.all([
    db.prepare('SELECT status, COUNT(*) AS n FROM comments GROUP BY status').all<{ status: Status; n: number }>(),
    db.prepare(
      `SELECT id, entity_ref, name, body, status, reason, created_at, decided_at,
         (SELECT json_group_array(r) FROM (SELECT COALESCE(reason, '') AS r FROM reports WHERE kind = 'comment' AND item_id = comments.id ORDER BY created_at)) AS reports
       FROM comments WHERE status = ?${cursor ? ' AND (created_at < ? OR (created_at = ? AND id < ?))' : ''}
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    ).bind(STATUS[state], ...(cursor ? [cursor.at, cursor.at, cursor.id] : []), PER_PAGE + 1).all<Omit<CommentRow, 'reports'> & { reports: string }>(),
  ])
  const n: Record<CommentState, number> = { held: 0, shown: 0, hidden: 0 }
  for (const c of counts.results) if (STATE[c.status]) n[STATE[c.status]] = Number(c.n) || 0
  const rows = page.results.slice(0, PER_PAGE).map(r => ({ ...r, reports: JSON.parse(r.reports) as string[] }))
  return { counts: n, rows, ...(page.results.length > PER_PAGE ? { next: cursorOf(rows.at(-1)!) } : {}) }
}

/** The posting rules' reasons as rules.ts writes them. */
const RULE_REASONS = /^(contains <|more than one link|blocked term: .+|duplicate within 24 h|more than 5 posts today)$/
/**
 * This week's comments, the scoreboard's week (Monday, Vietnam's time): posted; held when posted; reported (by anyone:
 * whether a report held one isn't kept); hidden (by the moderator or the owner). A decision writes over the rule's reason,
 * so a hold is worked out again from the comment: the content rules and the duplicate as rules.ts checks them. Only the
 * day's limit can't be (who sent it isn't kept), and counts while its reason stands.
 */
export async function commentWeek(db: D1Database, now: Date): Promise<CommentWeek> {
  const from = dayStart(weeksTo(now, 1)[0]!, HOME_TZ)
  const [posted, reported, hidden] = await Promise.all([
    db.prepare(
      `SELECT name, body, reason, EXISTS (SELECT 1 FROM comments d WHERE d.entity_ref = c.entity_ref AND d.body = c.body AND d.created_at < c.created_at
         AND d.created_at > strftime('%Y-%m-%dT%H:%M:%fZ', c.created_at, '-1 day')) AS dup
       FROM comments c WHERE created_at >= ?`,
    ).bind(from).all<{ name: string; body: string; reason: string | null; dup: number }>(),
    db.prepare("SELECT COUNT(DISTINCT item_id) AS n FROM reports WHERE kind = 'comment' AND created_at >= ?").bind(from).first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM comments WHERE status = 'removed' AND decided_at >= ?").bind(from).first<{ n: number }>(),
  ])
  const held = posted.results.filter(r => RULE_REASONS.test(r.reason ?? '') || Number(r.dup) > 0 || !('ok' in staticRules({ entityRef: '', name: r.name, body: r.body })))
  return { posted: posted.results.length, heldPosted: held.length, reported: Number(reported?.n) || 0, hidden: Number(hidden?.n) || 0 }
}

// ——— The owner's decision ———

/** A hidden comment is deleted 30 days after (comments/api.ts purgeRemoved); until then it can be shown again. */
const KEEP_MS = 30 * 86_400_000
export const SHOWN_BY_OWNER = 'Shown by the owner'
export const HIDDEN_BY_OWNER = 'Hidden by the owner'
const expired = (decidedAt: string | null, now: Date) => decidedAt !== null && decidedAt < new Date(now.getTime() - KEEP_MS).toISOString()
export const GONE = 'That comment no longer exists: a hidden comment is deleted 30 days after it was hidden.'
export const EXPIRED = 'This comment was hidden more than 30 days ago and is about to be deleted, so it can no longer be shown.'

/**
 * Show (on its page) or hide (off it, deleted 30 days later), with the reason and decided_at the moderation reads. Already
 * so: nothing written, its 30 days not started again. `expired`: showing one hidden more than 30 days ago.
 */
export async function decideComment(db: D1Database, id: string, action: 'show' | 'hide', now: Date): Promise<{ changed: boolean } | 'not_found' | 'expired'> {
  const c = await db.prepare('SELECT status, decided_at FROM comments WHERE id = ?').bind(id).first<{ status: Status; decided_at: string | null }>()
  if (!c) return 'not_found'
  const to: Status = action === 'show' ? 'approved' : 'removed'
  if (c.status === to) return { changed: false }
  if (c.status === 'removed' && expired(c.decided_at, now)) return 'expired'
  const r = await db.prepare('UPDATE comments SET status = ?, reason = ?, decided_at = ? WHERE id = ? AND status = ?')
    .bind(to, action === 'show' ? SHOWN_BY_OWNER : HIDDEN_BY_OWNER, now.toISOString(), id, c.status).run()
  return { changed: (r.meta.changes ?? 0) > 0 }
}

// ——— What the owner reads ———

/** Each posting rule's reason (rules.ts) as a sentence. */
const RULES: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^blocked term: (.+)$/, m => `it has “${m[1]}”, a blocked term`],
  [/^contains <$/, () => 'it has a “<”'],
  [/^more than one link$/, () => 'it has more than one link'],
  [/^duplicate within 24 h$/, () => 'the same text was posted on this page in the 24 hours before'],
  [/^more than 5 posts today$/, () => 'its sender had already posted 5 times that day'],
]
const HELD_POSTED = 'Held when posted: '
/** Why a comment is in its state: a posting rule, a reader's report, the moderator's reason as it wrote it, or the owner's. */
export function reasonText(reason: string | null): string {
  if (!reason) return ''
  if (reason === REPORTED) return 'Held after a report'
  for (const [re, say] of RULES) {
    const m = re.exec(reason)
    if (m) return `${HELD_POSTED}${say(m)}`
  }
  return reason
}

/** A comment as the contract's Comment. A page this build doesn't have (or content.json didn't load): its key, at "/". */
export type CommentItem = { id: string; at: string; name: string; page: { path?: string; title: string }; text: string; state: CommentState; reason: string; reports?: string[]; actions: Action[] }
export type CommentsBlock = { kind: 'comments'; state: CommentState; filters: { state: CommentState; label: string; count: number; href: string }[]; items: CommentItem[]; next?: string; empty: string }

const button = (id: string, action: 'show' | 'hide', label: string): Action =>
  ({ label, method: 'POST', path: `/api/owner/comments/${encodeURIComponent(id)}`, body: { action }, ...(action === 'hide' ? { tone: 'bad' as const } : {}) })
/** Held: Show, Hide. Shown: Hide. Hidden: Show again, until its 30 days are up. */
function actionsOf(r: CommentRow, now: Date): Action[] {
  if (r.status === 'held') return [button(r.id, 'show', 'Show'), button(r.id, 'hide', 'Hide')]
  if (r.status === 'approved') return [button(r.id, 'hide', 'Hide')]
  return expired(r.decided_at, now) ? [] : [button(r.id, 'show', 'Show again')]
}
export function commentItem(r: CommentRow, pages: Map<string, PageInfo> | undefined, now: Date): CommentItem {
  const p = pages?.get(r.entity_ref)
  return {
    id: r.id, at: new Date(msOf(r.created_at)).toISOString(), name: r.name, page: p ? { path: p.path, title: p.title } : { title: r.entity_ref },
    text: r.body, state: STATE[r.status], reason: reasonText(r.reason), ...(r.reports.length ? { reports: r.reports } : {}), actions: actionsOf(r, now),
  }
}

const count = (n: number) => n.toLocaleString('en-GB')
const LEDE = (tz: string, now: Date) => `Rules check each comment as it is posted and hold some, and a signed-in reader's report holds a shown one. The moderator looks at new and held comments each day; once you show or hide one here, it leaves it alone unless a reader reports it later. Times are in your time zone (${zoneName(tz, now)}).`
const AFTER = 'Show puts a comment on its page at once. Hidden comments can be shown again for 30 days, then they are deleted. 50 a page, newest first.'
const WEEK_NOTE = 'Since Monday 00:00, Vietnam\'s time. Held when posted counts what the posting rules held, whatever was decided after. Reported counts any reader\'s report; only a signed-in reader\'s holds the comment.'
const TALK_HEAD = ['Page', 'Shown comments', 'Photos']
const NO_TALK = 'No comments or photos shown yet.'
const emptyOf = (s: CommentState) => `No ${LABEL[s].toLowerCase()} comments.`
const webHref = (s: CommentState) => `${COMMENTS_PATH}?state=${s}`
const failedText = (what: string) => `Couldn't load ${what}.`
const failedHtml = (what: string, f: Failed) => `<div class="failed" role="status">${esc(failedText(what))}<code>${esc(f.failed)}</code></div>`
const failedBlock = (what: string, f: Failed) => note(`${failedText(what)} ${f.failed}`, 'bad')

function weekTiles(w: CommentWeek): Tile[] {
  return [
    { label: 'New', value: count(w.posted) },
    { label: 'Held when posted', value: count(w.heldPosted) },
    { label: 'Reported', value: count(w.reported) },
    { label: 'Hidden', value: count(w.hidden) },
  ]
}
const talkRows = (t: Talk): Cell[][] => t.top.map(p => [{ text: p.title, href: p.path }, { text: count(p.comments) }, { text: count(p.photos) }])

/** One comment, drawn from its item as the app reads it; its page a link when this build has it. */
function itemHtml(r: CommentRow, d: CommentsData): string {
  const c = commentItem(r, d.pages, d.now)
  const where = c.page.path ? `<a href="${esc(c.page.path)}">${esc(c.page.title)}</a>` : esc(c.page.title)
  const why = c.reason.startsWith(HELD_POSTED) ? `<b>${esc(HELD_POSTED.trim())}</b> ${esc(c.reason.slice(HELD_POSTED.length))}` : c.reason === 'Held after a report' ? `<b>${esc(c.reason)}</b>` : esc(c.reason)
  const reports = c.reports?.map(r => (r ? `“${esc(r)}”` : 'no reason given')).join(', ')
  const buttons = c.actions.map(a => `<button${a.tone === 'bad' ? ' class="bad"' : ''} name="action" value="${esc(String(a.body!.action))}">${esc(a.label)}</button>`).join('')
  return `<li id="c-${esc(c.id)}"><div><p class="by"><b>${esc(c.name)}</b> · ${timeTag(c.at, d.tz, d.now)} · on <span class="pg">${where}</span> <span class="chip${c.state === 'held' ? ' bad' : c.state === 'shown' ? ' good' : ''}">${LABEL[c.state]}</span></p>`
    + `<p class="text">${esc(c.text)}</p>${c.reason ? `<p class="why">${why}</p>` : ''}${reports ? `<p class="reports">Reports: ${reports}</p>` : ''}</div>`
    + `${buttons ? `<form method="post" action="${COMMENTS_FORM}"><input type="hidden" name="id" value="${esc(c.id)}"><input type="hidden" name="state" value="${d.state}">${buttons}</form>` : ''}</li>`
}

export function commentsPage(d: CommentsData): string {
  let body = `<h1>Comments</h1><p class="lede">${esc(LEDE(d.tz, d.now))}</p>`
  if (isFailed(d.list)) body += failedHtml('the comments', d.list)
  else {
    const l = d.list
    const filters = STATES.map(s => `<a href="${esc(webHref(s))}"${s === d.state ? ' aria-current="page"' : ''}>${LABEL[s]} · ${count(l.counts[s])}</a>`).join('')
    const items = l.rows.map(r => itemHtml(r, d)).join('')
    body += `<section class="comments" aria-label="Comments"><nav class="filters" aria-label="Show comments">${filters}</nav>`
      + `${items ? `<ol class="cm">${items}</ol>` : `<p class="cm none">${esc(emptyOf(d.state))}</p>`}`
      + `${l.next ? `<p class="more"><a href="${esc(`${webHref(d.state)}&cursor=${l.next}`)}">Older comments</a></p>` : ''}</section>`
  }
  body += `<p class="note">${esc(AFTER)}</p><div class="split"><section><h2>This week</h2>`
  body += isFailed(d.week) ? failedHtml('this week\'s counts', d.week) : `${tiles(weekTiles(d.week))}<p class="note">${esc(WEEK_NOTE)}</p>`
  body += '</section><section><h2>Most discussed</h2>'
  if (isFailed(d.talk)) body += failedHtml('the most discussed pages', d.talk)
  else {
    const rows = talkRows(d.talk).map(r => `<tr><th><a href="${esc(r[0]!.href!)}">${esc(r[0]!.text)}</a></th><td>${r[1]!.text}</td><td>${r[2]!.text}</td></tr>`).join('')
    body += `<div class="scroll"><table><thead><tr>${TALK_HEAD.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="3" class="none">${NO_TALK}</td></tr>`}</tbody></table></div>`
  }
  return page(COMMENTS_PATH, 'Comments', `${body}</section></div>`, d.now, d.tz)
}

export function commentsSection(d: CommentsData): Section {
  const blocks: Block[] = [note(LEDE(d.tz, d.now))]
  if (isFailed(d.list)) blocks.push(failedBlock('the comments', d.list))
  else {
    const l = d.list
    blocks.push({
      kind: 'comments', state: d.state,
      filters: STATES.map(s => ({ state: s, label: LABEL[s], count: l.counts[s], href: `/api/owner/sections/binh-luan?state=${s}` })),
      items: l.rows.map(r => commentItem(r, d.pages, d.now)), ...(l.next ? { next: l.next } : {}), empty: emptyOf(d.state),
    })
  }
  blocks.push(note(AFTER, 'muted'), heading('This week'))
  blocks.push(...(isFailed(d.week) ? [failedBlock('this week\'s counts', d.week)] : [figures(weekTiles(d.week)), note(WEEK_NOTE, 'muted')]))
  blocks.push(heading('Most discussed'), isFailed(d.talk) ? failedBlock('the most discussed pages', d.talk) : table(TALK_HEAD, talkRows(d.talk), { empty: NO_TALK }))
  return { title: 'Comments', blocks }
}
