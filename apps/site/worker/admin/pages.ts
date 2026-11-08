import { LANGS, OTHER_LANGS, prefixedLang } from '@aq/schema/langs'
import { RUNS_PATH, runPath } from './runs'
import type { FishIdStatus } from '../fishid/api'
import type { KeptRow } from '../fishid/kept'
import type { Hidden } from '../hidden'
import { isViPage, withoutVi } from '../paths'
import type { Excluded, Readers } from '../readers'
import type { LangAsks } from '../lang-ask'
import type { Wanted } from '../wanted'
import { chipHtml, chipOf, dayChart, dayLabel, dayName, deltaOf, esc, fmt, lastDays, rankTable, spark, tiles, usd, type Chip, type DayChart, type Ranked, type Tile } from './chart'
import { chart, failedNote, figures, heading, note, rankBlock, table, tableHtml, textOf, type Action, type Block, type Cell, type PhotoItem, type RankRow, type Section, type TextTone } from './blocks'
import type { AccountStats, Waiting } from './data'
import type { ContentStats, Snapshot } from './content'
import { inLang, items as itemCount, KIND as PAGE_KIND, LANG_NAME, MAIN, perDay, writtenPerDay } from './content-page'
import { FISH_PERIOD_KEYS, fishSpan, periodTotals, RECENT_MAX, type Call, type FishIdStats, type FishPeriodKey, type FishSpan, type Totals } from './fishid'
import { failedBox, ICON, isFailed, page, REPORT_NAME, REPORT_PATH, SCOREBOARD_PATH, type Soft } from './shell'
import { clock, HOME_TZ, hourMinute, localDay, sameClock, timeTag, timeText, zoneName } from './time'

/** Each admin page's HTML from what its loaders returned; a part that failed says so in its place. */

export type AffSummary = { byNetwork: { network: string; category: string; n: number }[]; top: { entity_ref: string; n: number }[]; status: { status: string; n: number }[]; lastCheck: string | null }
/**
 * `moved_from`: the page it was sent for, when moderation found another fish and moved it to `entity_ref`. `comment`: a
 * comment's photo's comment (`entity_ref` "comment:<id>"): its page's key and, when this build has the page, its address.
 */
export type RecentPhoto = { id: string; entity_ref: string; moved_from?: string | null; name: string; thumb: string; created_at: string; comment?: PhotoComment }
/** `ownerOk`: the owner approved it here; the next moderation pass publishes it. */
export type WaitingPhoto = { id: string; entity_ref: string; moved_from?: string | null; name: string; created_at: string; ownerOk: boolean; comment?: PhotoComment }
export type PhotoComment = { page: string; path?: string }
export type Clicks = { days: string[]; clicks: number[] }

/** A day kept as text (2026-11-04) as the dashboard writes days: 4 Nov, with the year when it isn't `now`'s. */
const dayText = (day: string, now: Date, tz: string) => `${dayLabel(day)}${day.slice(0, 4) !== localDay(now, tz).slice(0, 4) ? ` ${day.slice(0, 4)}` : ''}`
/** The page's note on days and times: the viewer's zone, named by its offset. */
const zoneNote = (tz: string, now: Date) => `Days and times in your time (${zoneName(tz, now)}).`
/** The sum of `vals` (one per day, the last is today) from `from` to `to` days ago. */
export const ago = (vals: number[], from: number, to: number) => vals.slice(vals.length - 1 - from, vals.length - to).reduce((a, b) => a + b, 0)
export const alignDaily = (days: string[], daily: Readers['daily']) => {
  const m = new Map(daily.map(d => [d.day, d]))
  return { sessions: days.map(d => m.get(d)?.sessions ?? 0), readers: days.map(d => m.get(d)?.readers ?? 0) }
}

// ——— The overview's parts ———

export type Overview = {
  now: Date
  /** The viewer's time zone (admin/time.ts); Vietnam's when not given. */
  tz?: string
  /** 31 days to today: 30 whole days, then today. */
  readers: Soft<Readers['daily']>
  /** 31 days to today, as readers. */
  clicks: Soft<Clicks>
  fish: Soft<FishIdStats>
  keys: Soft<FishIdStatus | undefined>
  photos: Soft<number>
  waiting: Soft<Waiting>
  wanted: Soft<{ names: Wanted[]; more: boolean }>
  accounts: Soft<AccountStats>
  hidden: Soft<Hidden>
  /** The build's content.json (admin/content.ts), and the totals kept each night. */
  content: Soft<ContentStats>
  snapshots: Soft<Snapshot[]>
}

const VS = 'the 7 days before'
const MODERATION_RUNS = 'https://github.com/deathemperor/aquatome.com/actions/workflows/moderate.yml'
/** The last value of each list is today's: the value `back` days before it. */
export const at = (vals: number[], back: number) => vals[vals.length - 1 - back] ?? 0
export const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`
/** What's waiting: "2 comments, 1 photo". */
export const waitingEn = (w: Waiting) => [w.comments ? plural(w.comments, 'comment') : '', w.photos ? plural(w.photos, 'photo') : ''].filter(Boolean).join(', ')
/** A day's AI spend past this share of its cap is flagged to the owner. */
export const SPEND_WARN = 0.8
/** Waiting this long, the moderation missed a night. */
export const MODERATION_MISSED_MS = 30 * 3_600_000
/** A need's title fits one line of the app's list at its regular size: the thing, not its detail. */
export const NEED_TITLE_MAX = 36

/** Each part of the overview, by what it is to the owner (a need's title when it fails) and where its page is. */
const parts = (o: Overview): [string, Soft<unknown>, string][] => [
  ['Readers', o.readers, '/_ab/doc-gia/'], ['Shop clicks', o.clicks, '/_ab/affiliate/'], ['The fish ID log', o.fish, '/_ab/nhan-dien-ca/'],
  ['Accounts', o.accounts, '/_ab/tai-khoan/'], ['Moderation queues', o.waiting, '/_ab/binh-luan/'], ['Reader photos', o.photos, '/_ab/anh-ban-doc/'],
  ['Wanted names', o.wanted, '/_ab/muon-co/'], ['Hidden pages', o.hidden, '/_ab/an-trang/'],
  ['Content totals', o.content, '/_ab/noi-dung/'], ['Daily content totals', o.snapshots, '/_ab/noi-dung/'],
]
/** A part that didn't load, as a need's title. */
export const didntLoad = (what: string) => `${what} didn’t load`

/**
 * One thing that needs the owner: its title (one short line), one line of detail at most, and the one place to deal with
 * it. The overview, the app and the daily report read the same list.
 */
export type Todo = { kind: 'key' | 'spend' | 'engine' | 'moderation' | 'failed'; title: string; text: string; href: string; action: string }
/** What needs the owner: every fish-ID key resting, the AI spend near its cap, a moderation that stopped, a source behind a browser check, a part that won't load. */
export function todos(o: Overview): Todo[] {
  const out: Todo[] = []
  const tz = o.tz ?? HOME_TZ
  // In the viewer's time, as the bar shows it: 2026-11-04T21:05Z → Thu 5 Nov, 4:05 in Vietnam.
  const when = (iso: string) => clock(iso, tz, o.now)
  const key = { kind: 'key' as const, href: '/_ab/nhan-dien-ca/#key', action: 'See keys' }
  if (isFailed(o.keys)) out.push({ ...key, title: 'Can’t read the keys’ state', text: 'The fish ID page has the error.' })
  else if (!o.keys) out.push({ ...key, title: 'Fish ID is off', text: 'No key in ANTHROPIC_KEYS.' })
  else {
    // A key out of credit or refused is the rotation's to skip (fishid/keys.ts), and the fish ID page shows it. Only every
    // key resting stops fish ID and chat, so only that is the owner's (the owner's rule, 2026-11-07; docs/governance.md).
    const off = o.keys.rows.filter(r => r.state !== 'ok')
    if (off.length && off.length === o.keys.rows.length) {
      const back = off.map(r => r.until).filter((u): u is string => Boolean(u)).sort()[0]
      out.push({ ...key, title: 'Fish ID and chat are down', text: `Every key resting${back ? `, the first until ${when(back)}` : ''}.` })
    }
    // Fish ID and chat share one AI spend cap a UTC day (fishid/ledger.ts): a day past 80% of it is the owner's to raise
    // before readers are told "busy".
    for (const s of o.keys.spend) {
      if (s.usd < SPEND_WARN * o.keys.cap) continue
      const today = s.day === o.now.toISOString().slice(0, 10)
      const day = dayText(localDay(`${s.day}T00:00:00Z`, tz), o.now, tz)
      out.push({ kind: 'spend', title: `AI spend at ${Math.round((s.usd / o.keys.cap) * 100)}% of its cap`, text: `Fish ID and chat: ${usd(s.usd)} of the $${fmt(o.keys.cap)} cap ${today ? 'today' : `on ${day}`}.`, href: '/_ab/nhan-dien-ca/', action: 'See costs' })
    }
    if (o.keys.bad) out.push({ ...key, title: `${plural(o.keys.bad, 'key line')} unreadable`, text: 'Fix the ANTHROPIC_KEYS secret.' })
  }
  // The moderation runs at 21:00 UTC each night (moderate.yml): anything still waiting after 30 hours means a night was missed.
  if (!isFailed(o.waiting) && o.waiting.oldest && o.now.getTime() - Date.parse(o.waiting.oldest) > MODERATION_MISSED_MS) {
    out.push({ kind: 'moderation', title: 'Moderation hasn’t run', text: `${waitingEn(o.waiting)} waiting since ${when(o.waiting.oldest)}.`, href: MODERATION_RUNS, action: 'See runs' })
  }
  // A source behind a browser check stops until the owner passes it in the engine's Chrome profile.
  const engine = isFailed(o.content) ? null : o.content.engine
  const human = engine?.needsHuman ?? []
  if (human.length) {
    const name = (id: string) => engine!.sources.find(r => r.id === id)?.name ?? id
    const one = human.length === 1 ? `${name(human[0]!.source)} needs a browser check` : ''
    // The title names the source when it fits NEED_TITLE_MAX; a screen narrower than the name cuts it short ("…"). The line
    // under it always names each source in full, and since when.
    const named = Boolean(one) && one.length <= NEED_TITLE_MAX
    out.push({
      kind: 'engine', href: '/_ab/noi-dung/#engine', action: 'See engine',
      title: named ? one : human.length === 1 ? 'A source needs a browser check' : `${fmt(human.length)} sources need a browser check`,
      text: human.map(h => `${name(h.source)} since ${when(h.since)}`).join(' · '),
    })
  }
  for (const [what, part, href] of parts(o)) if (isFailed(part)) out.push({ kind: 'failed', title: didntLoad(what), text: 'Its page has the error.', href, action: 'Open' })
  return out
}

export type Area = { name: string; href: string; fig: string; sub: string; spark?: (number | null)[]; chip?: Chip; warn?: boolean }
const failedArea = (name: string, href: string, f: { failed: string }): Area => ({ name, href, fig: '—', sub: `Didn’t load: ${f.failed.slice(0, 80)}`, warn: true })
/**
 * One row an area: its figure (most are the last 7 whole days), what it counts, the 30 whole days before today, and the
 * change on the 7 days before. The overview before version 2, still sent to the app before it (overviewJson).
 */
export function areas(o: Overview): Area[] {
  const out: Area[] = []
  const tz = o.tz ?? HOME_TZ
  const month = lastDays(o.now, 31, tz)
  const whole = (vals: number[]) => vals.slice(0, -1)
  if (isFailed(o.readers)) out.push(failedArea('Readers', '/_ab/doc-gia/', o.readers))
  else {
    const r = alignDaily(month, o.readers)
    out.push({ name: 'Readers', href: '/_ab/doc-gia/', fig: fmt(ago(r.readers, 7, 1)), sub: `readers · 7 days · ${plural(ago(r.sessions, 7, 1), 'session')}`, spark: whole(r.readers), chip: chipOf(ago(r.readers, 7, 1), ago(r.readers, 14, 8), VS, 'up') })
  }
  if (isFailed(o.content)) out.push(failedArea('Content', '/_ab/noi-dung/', o.content))
  else {
    const c = o.content
    const snaps = isFailed(o.snapshots) ? [] : o.snapshots
    const kept = perDay(snaps, month, itemCount)
    const daily = kept.map(v => v ?? 0)
    const total = MAIN.reduce((n, k) => n + (c.inventory[k]?.total ?? 0), 0)
    out.push(snaps.length > 1
      ? { name: 'Content', href: '/_ab/noi-dung/', fig: fmt(ago(daily, 7, 1)), sub: `new pages · 7 days · ${fmt(total)} in all`, spark: kept.slice(0, -1), chip: chipOf(ago(daily, 7, 1), ago(daily, 14, 8), VS, 'up') }
      : { name: 'Content', href: '/_ab/noi-dung/', fig: fmt(total), sub: 'pages · the totals are kept once a night, too few days to compare' })
    if (c.engine) {
      // The build's list, counted by the viewer's days: the build is at most a few hours old.
      const written = writtenPerDay(c.engine.videos.writtenAt, month, tz)
      out.push({ name: 'Engine', href: '/_ab/noi-dung/#engine', fig: fmt(c.engine.videos.waiting), sub: `videos waiting · ${plural(ago(written, 7, 1), 'page')} from videos in 7 days`, spark: whole(written), chip: chipOf(ago(written, 7, 1), ago(written, 14, 8), VS), warn: c.engine.needsHuman.length > 0 })
    }
  }
  if (isFailed(o.clicks)) out.push(failedArea('Affiliate', '/_ab/affiliate/', o.clicks))
  else out.push({ name: 'Affiliate', href: '/_ab/affiliate/', fig: fmt(ago(o.clicks.clicks, 7, 1)), sub: 'shop clicks · 7 days', spark: whole(o.clicks.clicks), chip: chipOf(ago(o.clicks.clicks, 7, 1), ago(o.clicks.clicks, 14, 8), VS, 'up') })
  const keysOff = isFailed(o.keys) || !o.keys || o.keys.rows.every(k => k.state !== 'ok')
  if (isFailed(o.fish)) out.push(failedArea('Fish ID', '/_ab/nhan-dien-ca/', o.fish))
  else {
    const { periods: p, perDay } = o.fish
    out.push({ name: 'Fish ID', href: '/_ab/nhan-dien-ca/', fig: fmt(p.d7.calls), sub: `Claude calls · 7 days · ${usd(p.d7.usd)}`, spark: whole(perDay.ok.map((v, i) => v + perDay.none[i]!)), chip: chipOf(p.d7.calls, p.d7prev.calls, VS), warn: keysOff })
  }
  const waiting = isFailed(o.waiting) ? undefined : o.waiting
  if (isFailed(o.accounts)) out.push(failedArea('Comments', '/_ab/binh-luan/', o.accounts), failedArea('New accounts', '/_ab/tai-khoan/', o.accounts))
  else {
    const a = o.accounts
    out.push({ name: 'Comments', href: '/_ab/binh-luan/', fig: fmt(ago(a.newComments, 7, 1)), sub: `new comments · 7 days${waiting?.comments ? ` · ${fmt(waiting.comments)} waiting` : ''}`, spark: whole(a.newComments), chip: chipOf(ago(a.newComments, 7, 1), ago(a.newComments, 14, 8), VS, 'up') })
    out.push({ name: 'New accounts', href: '/_ab/tai-khoan/', fig: fmt(ago(a.newUsers, 7, 1)), sub: `7 days · ${fmt(a.users)} in all · ${fmt(a.synced)} with synced tanks`, spark: whole(a.newUsers), chip: chipOf(ago(a.newUsers, 7, 1), ago(a.newUsers, 14, 8), VS, 'up') })
  }
  if (isFailed(o.photos)) out.push(failedArea('Reader photos', '/_ab/anh-ban-doc/', o.photos))
  else out.push({ name: 'Reader photos', href: '/_ab/anh-ban-doc/', fig: fmt(o.photos), sub: `photos shown${waiting?.photos ? ` · ${fmt(waiting.photos)} waiting` : ''}` })
  if (isFailed(o.wanted)) out.push(failedArea('Wanted by readers', '/_ab/muon-co/', o.wanted))
  else {
    const { names, more } = o.wanted
    const perDay = month.map(d => names.filter(w => w.first === d).length)
    out.push({ name: 'Wanted by readers', href: '/_ab/muon-co/', fig: `${fmt(names.length)}${more ? '+' : ''}`, sub: `names with no page · ${plural(ago(perDay, 7, 1), 'new name')} in 7 days`, spark: whole(perDay) })
  }
  if (isFailed(o.hidden)) out.push(failedArea('Hidden pages', '/_ab/an-trang/', o.hidden))
  else out.push({ name: 'Hidden pages', href: '/_ab/an-trang/', fig: fmt(Object.keys(o.hidden).length), sub: 'pages hidden' })
  return out
}

/** `section`: the dashboard page the item counts for (the app opens it). */
export type LogItem = { text: string; small?: string; section: string }
export type LogDay = { day: string; label: string; partial: boolean; items: LogItem[] }
/** The last `n` of the viewer's days, today first, in words: what each area counted that day. A part that didn't load is left out (its to-do says so). */
export function log(o: Overview, n = 3): LogDay[] {
  const tz = o.tz ?? HOME_TZ
  const days = lastDays(o.now, n, tz).reverse()
  const r = isFailed(o.readers) ? undefined : alignDaily(lastDays(o.now, 31, tz), o.readers)
  const { clicks, fish, accounts, wanted, hidden, snapshots } = o
  const snaps = isFailed(snapshots) ? [] : snapshots
  return days.map((day, back) => {
    const items: LogItem[] = []
    const kept = snaps.find(x => x.day === day)
    const before = snaps.filter(x => x.day < day).at(-1)
    if (kept && before) {
      const added = MAIN.map(k => [k, (kept.totals.kinds[k]?.vi ?? 0) - (before.totals.kinds[k]?.vi ?? 0)] as const).filter(([, n]) => n > 0)
      const n = added.reduce((a, [, x]) => a + x, 0)
      if (n) items.push({ text: plural(n, 'new page'), small: added.map(([k, x]) => `${fmt(x)} ${PAGE_KIND[k].toLowerCase()}`).join(' · '), section: 'noi-dung' })
      // Only the languages that gained pages: one just served has none most nights.
      const translated = OTHER_LANGS.map(l => [l, inLang(kept.totals, l) - inLang(before.totals, l)] as const).filter(([, n]) => n > 0)
      if (translated.length) items.push({ text: translated.map(([l, n], i) => `${fmt(n)} ${i ? '' : 'new '}in ${LANG_NAME[l]}`).join(', '), section: 'noi-dung' })
    }
    if (r && (at(r.readers, back) || at(r.sessions, back))) items.push({ text: plural(at(r.readers, back), 'reader'), small: plural(at(r.sessions, back), 'session'), section: 'doc-gia' })
    if (!isFailed(clicks) && at(clicks.clicks, back)) items.push({ text: plural(at(clicks.clicks, back), 'shop click'), section: 'affiliate' })
    if (!isFailed(fish)) {
      const d = fish.perDay
      const calls = at(d.ok, back) + at(d.none, back)
      if (calls || at(d.blocked, back)) items.push({ text: `${plural(calls, 'fish ID call')} to Claude · ${usd(at(d.usd, back))}`, small: `${fmt(at(d.ok, back))} named${at(d.blocked, back) ? ` · ${fmt(at(d.blocked, back))} stopped before Claude` : ''}`, section: 'nhan-dien-ca' })
    }
    if (!isFailed(accounts)) {
      if (at(accounts.newComments, back)) items.push({ text: plural(at(accounts.newComments, back), 'new comment'), section: 'binh-luan' })
      if (at(accounts.newUsers, back)) items.push({ text: plural(at(accounts.newUsers, back), 'new account'), section: 'tai-khoan' })
    }
    if (!isFailed(wanted)) {
      const fresh = wanted.names.filter(w => w.first === day)
      if (fresh.length) items.push({ text: plural(fresh.length, 'new name', 'new names'), small: `${fresh.slice(0, 3).map(w => w.name).join(', ')}${fresh.length > 3 ? '…' : ''}`, section: 'muon-co' })
    }
    if (!isFailed(hidden)) {
      const hid = Object.entries(hidden).filter(([, v]) => localDay(v.at, tz) === day).map(([path]) => path)
      if (hid.length) items.push({ text: `${plural(hid.length, 'page')} hidden`, small: `${hid.slice(0, 2).join(', ')}${hid.length > 2 ? '…' : ''}`, section: 'an-trang' })
    }
    const label = back === 0 ? `Today · ${dayLabel(day)}` : back === 1 ? `Yesterday · ${dayLabel(day)}` : dayName(day)
    return { day, label, partial: back === 0, items }
  })
}

const QUIET = 'Nothing new.'
const PARTIAL = 'so far'
/** The note under the areas: how to read a row. */
const areasNote = (o: Overview) =>
  `The figure: the 7 whole days to yesterday, against the 7 before. The small columns: the 30 whole days, one a day. ${zoneNote(o.tz ?? HOME_TZ, o.now)}${sameClock(o.tz ?? HOME_TZ, HOME_TZ, o.now) ? '' : ' Shop clicks and wanted names are kept by Vietnam’s days.'}`

const LOG_TITLE = 'The last three days'
/** A place on the dashboard: its section by key and the spot on its page ("/_ab/noi-dung/#engine"), or an address elsewhere as it is. */
type Place = { section: string; anchor?: string } | { url: string }
export const placeOf = (href: string): Place => {
  const m = /^\/_ab\/([a-z0-9-]+)\/(?:#([a-z0-9-]+))?$/.exec(href)
  return m ? { section: m[1]!, ...(m[2] ? { anchor: m[2] } : {}) } : { url: href }
}
type LogEntry = { at: string; text: string; sub?: string; tone?: TextTone; section?: string }
type DashboardJson = {
  todos: { title: string; text: string; action: { label: string } & Place }[]
  areas: ({ name: string; fig: string; sub: string; spark: (number | null)[]; chip?: Chip; warn: boolean } & Place)[]
  areasNote: string
  log: { title: string; entries: LogEntry[] }
}
/** The overview before version 2 (deprecated, for the app before it): its to-dos, area rows, their note and the last days. */
export function overviewJson(o: Overview): DashboardJson {
  return {
    todos: todos(o).map(t => ({ title: t.title, text: t.text, action: { label: t.action, ...placeOf(t.href) } })),
    areas: areas(o).map(a => ({ name: a.name, ...placeOf(a.href), fig: a.fig, sub: a.sub, spark: a.spark ?? [], ...(a.chip ? { chip: a.chip } : {}), warn: Boolean(a.warn) })),
    areasNote: areasNote(o),
    // Each day as the page heads it, then what it counted; a quiet day says so.
    log: {
      title: LOG_TITLE,
      entries: log(o).flatMap((d): LogEntry[] => {
        const at = `${d.label}${d.partial ? ` · ${PARTIAL}` : ''}`
        return d.items.length ? d.items.map(i => ({ at, text: i.text, ...(i.small ? { sub: i.small } : {}), section: i.section })) : [{ at, text: QUIET, tone: 'muted' as const }]
      }),
    },
  }
}

// ——— Fish ID ———

/**
 * The section as drawn (docs/design/dashboard.md, "A section page"): the period's three figures, each against the same
 * point of the period before; its calls by day; the keys; the names guessed without a page; then the rest folded, each
 * row with its figure. Every figure is for the period in the menu, this week by default.
 */
export type FishPage = {
  now: Date; stats: Soft<FishIdStats>; keys: Soft<FishIdStatus | undefined>; pages: Map<string, string>
  /** The viewer's time zone (admin/time.ts). */ tz?: string
  /** The period's key (?period=); this week when none or another. */ period?: string | null
}

const OUTCOME: Record<string, string> = {
  ok: 'answered', refused: 'Claude declined', unreadable: 'answer unreadable', request: 'API refused the request', unavailable: 'API down for a moment',
  resting: 'every key resting', error: 'server error', fish_id_off: 'tool off', 'cross-origin': 'sent from another site', 'too large': 'photo too large',
  'bad form': 'broken form', 'no file': 'no photo', 'not an image': 'not an image', turnstile: 'failed the spam check', rate: 'reader out of turns', busy: 'site out of turns',
  retry: 'sent again, answer reused',
}
/** Why the agent stopped (fishid/log.ts blob10). */
const STOPPED: Record<string, string> = { answer: 'answered', calls: 'out of calls', tools: 'out of tool calls', time: 'out of time', tokens: 'out of tokens', fallback: 'fell back to one call', error: 'error, no time to retry' }
const VERDICT: Record<string, string> = { fish: 'animal', plant: 'plant', other: 'none', unclear: 'unclear' }
const FROM: Record<string, string> = { page: 'fish ID page', tank: 'My tanks' }
export const KEY_STATE: Record<FishIdStatus['rows'][number]['state'], string> = { ok: 'Working', credit: 'Out of credit', auth: 'Refused', rate: 'Rate limited' }

const periodKey = (f: FishPage): FishPeriodKey => FISH_PERIOD_KEYS.find(k => k === f.period) ?? 'week'
/** The period menu: this week, today, 7 days, 30 days, and the month by its name. */
export const fishPeriods = (now: Date, tz: string) => FISH_PERIOD_KEYS.map(key => ({ key, label: fishSpan(key, now, tz).label }))
/** Cost per identification that reached Claude: the agent's several calls are one identification. */
const each = (t: Totals) => (t.calls ? t.usd / t.calls : 0)
const share = (t: Totals) => (t.guessed ? t.linked / t.guessed : 0)
const shareText = (t: Totals) => (t.guessed ? `${fmt(100 * share(t))}%` : '—')

/** Calls, cost and the answers that led to a page, each against the same point of the period before. */
function periodFigures(t: { now: Totals; before: Totals }, vs: string): Tile[] {
  const { now, before } = t
  return [
    { label: 'Claude calls', value: fmt(now.calls), delta: { now: now.calls, before: before.calls, vs, good: 'up' } },
    { label: 'Claude cost', value: usd(now.usd), delta: { now: now.usd, before: before.usd, vs } },
    { label: 'Led to a page', value: shareText(now), ...(now.guessed && before.guessed ? { delta: { now: share(now), before: share(before), vs, good: 'up', points: true } } : {}) },
  ]
}
/** The period's calls by day, by what came of them; a week or a month runs to its end, the days after today still to come. */
function callsChart(s: FishIdStats, span: FishSpan): DayChart {
  const day = (pick: (t: Totals) => number) => span.chart.map((d, i) => (span.today !== undefined && i > span.today ? null : pick(s.byDay.get(d) ?? ZERO)))
  return {
    id: 'f-calls', title: 'Calls by day', days: span.chart, ...(span.today !== undefined ? { today: span.today } : {}),
    series: [{ label: 'Named', values: day(t => t.ok) }, { label: 'No answer', values: day(t => t.none) }, { label: 'Stopped before Claude', values: day(t => t.blocked), tone: 'mute' }],
    empty: 'No calls in this period yet.',
  }
}
const ZERO: Totals = { requests: 0, calls: 0, ok: 0, none: 0, blocked: 0, tin: 0, tout: 0, usd: 0, guessed: 0, linked: 0 }
const chartNote = (span: FishSpan, tz: string, now: Date) => `Days in your time (${zoneName(tz, now)})${span.today !== undefined && span.key !== 'month' ? ', weeks Monday to Sunday' : ''}.`

/** The keys by number and the start of their hash, never the key; today is the tool's, from UTC midnight in the viewer's time. */
function keysTable(k: FishIdStatus, now: Date, tz: string) {
  const began = `${now.toISOString().slice(0, 10)}T00:00:00Z`
  const since = `${hourMinute(began, tz)}${localDay(began, tz) === localDay(now, tz) ? '' : ' yesterday'}`
  const rows: Cell[][] = k.rows.map(r => [
    { text: `Key ${r.n}`, sub: `${r.hash}${r.workspace ? ' · workspace' : ''}` },
    { text: KEY_STATE[r.state], ...(r.until ? { sub: `until ${timeText(r.until, tz, now)}` } : {}), ...(r.state === 'ok' ? {} : { tone: 'bad' as const }) },
    { text: `${fmt(r.calls)} ${r.calls === 1 ? 'call' : 'calls'}`, sub: r.answered === r.calls ? 'all answered' : `${fmt(r.answered)} answered` },
  ])
  const c = k.counts
  const ran: [number, string, string?][] = [
    [c.fallback, 'Fell back to one call'], [c.callLimit, 'Hit the call limit'], [c.later400, 'Refused on a later call'], [c.facts, 'Couldn’t read a page’s facts'],
    [c.refunds, 'Refunded', k.mostRefunds > 1 ? `${fmt(k.mostRefunds)} to one reader` : undefined], [c.offTopic, 'Chat questions off the hobby'],
  ]
  // The day's detail, folded as a row of its own (docs/design: "Since 7:00, in detail"): the model, then each count.
  const detail: Cell[][] = [
    [{ text: 'Model' }, { text: k.model }],
    [{ text: 'Identifications that called Claude' }, { text: fmt(k.today) }],
    ...ran.filter(([n]) => n).map(([n, what, sub]): Cell[] => [{ text: what }, { text: fmt(n), ...(sub ? { sub } : {}) }]),
  ]
  return {
    table: table(['Key', 'State', `Since ${since}`], rows, { empty: 'No keys.' }),
    detail: table(['What', 'Number'], detail, { folded: `Since ${since}, in detail`, figure: fmt(k.today) }),
    bad: k.bad ? `${fmt(k.bad)} ${k.bad === 1 ? 'line' : 'lines'} of ANTHROPIC_KEYS can’t be read and ${k.bad === 1 ? 'is' : 'are'} skipped: fix the secret.` : undefined,
  }
}
const NO_KEYS = 'No keys set (ANTHROPIC_KEYS): fish ID is off.'
const UNMATCHED_HEAD = ['Scientific name', 'Times', 'Sure, on average']
const unmatchedRows = (s: FishIdStats): Ranked[] => s.unmatched.map(u => ({ label: `<i class="sci">${esc(u.sci)}</i>`, value: u.n, cells: [`${fmt(u.conf * 100)}%`] }))

const REQUEST_HEAD = ['When', 'Result', 'Kind', 'Top guess', 'Sure', 'Tokens in', 'Tokens out', 'Cost', 'ms', 'Key', 'Tries', 'Agent: Claude turns · tools · photos', 'From', 'Country']
/** A call's best guess: its page when the catalog has one, else the name and why there is no link. */
function guessOf(c: Call, pages: Map<string, string>): Cell {
  if (!c.sci) return { text: '—', tone: 'muted' }
  const url = c.page ? pages.get(c.page) : undefined
  return url ? { text: c.sci, href: withoutVi(url) } : { text: c.sci, sub: c.page ? `(${c.page})` : 'no page yet' }
}
const requestCells = (c: Call, pages: Map<string, string>, now: Date, tz: string): Cell[] => [
  { text: timeText(c.t, tz, now) }, { text: OUTCOME[c.outcome] ?? c.outcome }, { text: VERDICT[c.verdict] ?? (c.verdict || '—') }, guessOf(c, pages),
  { text: c.guesses ? `${fmt(c.conf * 100)}%` : '—' }, { text: fmt(c.tin) }, { text: fmt(c.tout) }, { text: c.usd ? usd(c.usd) : '—' }, { text: fmt(c.ms) },
  { text: c.key || '—' }, { text: fmt(c.attempts) },
  c.stopped ? { text: `${fmt(c.turns)} · ${fmt(c.tools)} · ${fmt(c.refs)}`, sub: `${STOPPED[c.stopped] ?? c.stopped}${c.rechecked ? ' · looked again once' : ''}` } : { text: '—' },
  { text: FROM[c.from] ?? (c.from || '—') }, { text: c.country || '—' },
]

/** The rest, folded: every period side by side, cost and tokens by day, and every request of the period. */
function foldedTables(f: FishPage, s: FishIdStats, span: FishSpan, t: { now: Totals; before: Totals }, tz: string) {
  const all = FISH_PERIOD_KEYS.map(k => {
    const p = fishSpan(k, f.now, tz)
    const x = periodTotals(s, p)
    const d = (pick: (x: Totals) => number) => deltaOf({ now: pick(x.now), before: pick(x.before), vs: p.vs }).text
    return [{ text: p.label, sub: p.heading.slice(p.label.length).trim() || undefined }, { text: fmt(x.now.calls), sub: d(y => y.calls) }, { text: fmt(x.now.ok) }, { text: fmt(x.now.none) },
      { text: fmt(x.now.blocked) }, { text: fmt(x.now.tin) }, { text: fmt(x.now.tout) }, { text: usd(x.now.usd), sub: d(y => y.usd) }, { text: usd(each(x.now)) }] as Cell[]
  })
  // The period's days so far, newest first.
  const days = span.days.slice().reverse().map(d => [d, s.byDay.get(d) ?? ZERO] as const)
  const dayCell = (d: string): Cell => ({ text: dayName(d) })
  const capped = s.recent.length >= RECENT_MAX
  return [
    table(['Period', 'Claude calls', 'Named', 'No answer', 'Stopped before Claude', 'Tokens in', 'Tokens out', 'Cost', 'Per call'], all.map(r => r.map(c => (c.sub === undefined ? { text: c.text } : c))), { folded: 'Every period side by side' }),
    table(['Day', 'Cost', 'Claude calls'], days.map(([d, x]) => [dayCell(d), { text: usd(x.usd) }, { text: fmt(x.calls) }]), { folded: 'Cost by day', figure: usd(t.now.usd) }),
    table(['Day', 'Tokens in'], days.map(([d, x]) => [dayCell(d), { text: fmt(x.tin) }]), { folded: 'Tokens in by day', figure: fmt(t.now.tin) }),
    table(['Day', 'Tokens out'], days.map(([d, x]) => [dayCell(d), { text: fmt(x.tout) }]), { folded: 'Tokens out by day', figure: fmt(t.now.tout) }),
    table(REQUEST_HEAD, s.recent.map(c => requestCells(c, f.pages, f.now, tz)), { folded: capped ? `The newest ${fmt(RECENT_MAX)} requests` : 'Every request', figure: fmt(s.recent.length), empty: 'No requests in this period.' }),
  ]
}

/** The section's parts, in order, from one load: the page draws them, the app reads them as blocks. */
function fishParts(f: FishPage) {
  const tz = f.tz ?? HOME_TZ
  const span = fishSpan(periodKey(f), f.now, tz)
  const s = isFailed(f.stats) ? undefined : f.stats
  const t = s ? periodTotals(s, span) : undefined
  return {
    tz, span,
    head: heading(span.heading, 3),
    figures: t && periodFigures(t, span.vs),
    chart: s && callsChart(s, span),
    chartNote: chartNote(span, tz, f.now),
    keys: isFailed(f.keys) || !f.keys ? undefined : keysTable(f.keys, f.now, tz),
    unmatched: s && unmatchedRows(s),
    folded: s && t ? foldedTables(f, s, span, t, tz) : [],
  }
}

export function fishIdPage(f: FishPage): string {
  const p = fishParts(f)
  const path = '/_ab/nhan-dien-ca/'
  // The periods: a segmented control from a tablet's width up; on a phone a menu button, "This week ▾", that opens them.
  const links = fishPeriods(f.now, p.tz).map(x => `<a href="${path}?period=${x.key}"${x.key === p.span.key ? ' aria-current="page"' : ''}>${esc(x.label)}</a>`).join('')
  const menu = `<nav class="filters periods" aria-label="Period"><details class="pmenu"><summary>${esc(p.span.label)}</summary><div>${links}</div></details><span class="seg">${links}</span></nav>`
  let body = `<h1>Fish ID</h1>${menu}`
  if (isFailed(f.stats)) body += failedBox('the fish ID log', f.stats)
  else body += `<h3>${esc(p.span.heading)}</h3>${tiles(p.figures!)}<div class="charts">${dayChart({ ...p.chart!, bare: true })}</div><p class="note">${esc(p.chartNote)}</p>`
  body += `<h2 id="key">Anthropic keys</h2>${isFailed(f.keys) ? failedBox('the keys’ state', f.keys) : !p.keys ? `<p class="muted">${NO_KEYS}</p>` : `${tableHtml(p.keys.table)}${tableHtml(p.keys.detail)}${p.keys.bad ? `<p class="failed">${esc(p.keys.bad)}</p>` : ''}`}`
  if (p.unmatched) body += `<h2>Guessed often, no page yet</h2>${rankTable(p.unmatched, UNMATCHED_HEAD)}`
  if (p.folded.length) body += `<h2>More figures</h2>${p.folded.map(x => tableHtml(x, { wide: true })).join('')}`
  body += `<p><a href="${RUNS_PATH}">Each run: what Claude thought and looked up (kept 365 days) →</a></p>`
  return page(path, 'Fish ID', body, f.now, p.tz)
}

export function fishIdSection(f: FishPage): Section {
  const p = fishParts(f)
  const blocks: Block[] = []
  if (isFailed(f.stats)) blocks.push(failedNote('the fish ID log', f.stats))
  else blocks.push(p.head, figures(p.figures!), chart(p.chart!), note(p.chartNote, 'muted'))
  blocks.push(heading('Anthropic keys', 2, 'key'))
  if (isFailed(f.keys)) blocks.push(failedNote('the keys’ state', f.keys))
  else if (!p.keys) blocks.push(note(NO_KEYS, 'muted'))
  else blocks.push(p.keys.table, p.keys.detail, ...(p.keys.bad ? [note(p.keys.bad, 'bad')] : []))
  if (p.unmatched) blocks.push(heading('Guessed often, no page yet'), rankBlock(p.unmatched, UNMATCHED_HEAD))
  if (p.folded.length) blocks.push(heading('More figures'), ...p.folded)
  return { title: 'Fish ID', blocks, periods: fishPeriods(f.now, p.tz), period: p.span.key }
}

// ——— Readers ———

/** A path from the beacon is anything a script sent: a link only for one of the site's pages ("//other.site" stays text). */
export const pageLink = (path: string) => (isViPage(path) || prefixedLang(path) ? `<a href="${esc(path)}">${esc(path)}</a>` : esc(path))

const NO_AE = 'Not set up: AE_API_TOKEN and CF_ACCOUNT_ID, so there are no figures yet (Analytics Engine).'
const SOURCE_HEAD = ['Source', 'Tabs', 'Readers']
const PAGE_VIEWS_HEAD = ['Page', 'Views']
const COUNTRY_HEAD = ['Country', 'Readers']
// Who the count leaves out (worker/us.ts).
const WHO_LABEL: Record<Excluded['who'], string> = {
  owner: 'The owner’s browsers',
  team: 'Our marked browsers and test copies of the app',
  net: 'Our network (the agents’ Mac, its simulators and preview browser)',
  app: 'Web pages inside the iOS app (counted with app reads)',
}
const LEFT_OUT_TITLE = 'Left out of the count'
const LEFT_OUT_HEAD = ['Left out', 'Tabs', 'Would-be readers']
const SIDE_TITLE = 'Web and app'
const SIDE_HEAD = ['Where', 'Tabs', 'Readers']
/** The web's and the app's reads side by side, and what the count left out: our own visits by mark, and automated bursts. */
function leftOutParts(r: Readers, tz: string, now: Date) {
  const auto = r.automated
  const rows: Ranked[] = [
    ...(r.excluded ?? []).map(x => ({ label: WHO_LABEL[x.who], value: x.sessions, cells: [fmt(x.readers)] })),
    ...(auto ? [{ label: 'Likely automated: bursts of fresh tabs, one new page each', value: auto.sessions, cells: [fmt(auto.readers)] }] : []),
  ]
  const bursts = (auto?.bursts ?? []).map(b => `${esc(b.cc || '??')}: ${fmt(b.sessions)} tabs, ${timeTag(`${b.from.replace(' ', 'T')}Z`, tz, now)} to ${timeTag(`${b.to.replace(' ', 'T')}Z`, tz, now)}`)
  const app = r.app
  const side: Ranked[] = [
    { label: 'Web (browsers)', value: r.sessions, cells: [fmt(r.readers)] },
    ...(app ? [{ label: app.onStore ? 'iOS app' : 'iOS app (not on the App Store yet: every copy is ours)', value: app.sessions, cells: [fmt(app.readers)] }] : []),
  ]
  return {
    lede: 'Not in the figures above. Our visits carry a mark (a cookie, our network, a test copy’s link), and a burst is at least 20 fresh tabs from one country, with no outside referrer, opening mostly different pages within 30 minutes.',
    rows, bursts,
    side,
    sideNote: `A reader is a tab that scrolled half a page or stayed 30 s, in the browser or the app alike. ${app ? `Our own app sessions (TestFlight, simulators): ${fmt(app.ours.sessions)}, ${fmt(app.ours.readers)} of them would-be readers.` : 'The app’s figures didn’t load.'}`,
  }
}

const BACK_TITLE = 'Return visits'
const BACK_HEAD = ['Page they first landed on', 'Visitors who came back']
/** Return visits (readers.ts revisitsOf), from the visitor code, once there is one. */
function backParts(r: Readers) {
  const b = r.revisits
  if (!b) return undefined
  return {
    lede: `Within the ${r.days} days, among the counted tabs. A visitor is a browser that kept its random visitor code: a reader on a phone and a computer is two. Tabs without a code (Global Privacy Control or Do Not Track on, storage blocked): ${fmt(b.noCode)}.`,
    tiles: [
      { label: 'Visitors', value: fmt(b.visitors) },
      { label: 'Came back another day', value: fmt(b.returning), meter: b.visitors ? b.returning / b.visitors : undefined, sub: `${fmt(b.visitors ? (100 * b.returning) / b.visitors : 0, 1)}% of visitors` },
      { label: 'Days to the next visit', value: b.gapDays === null ? '—' : fmt(b.gapDays), sub: 'the middle returning visitor' },
    ] as Tile[],
    pages: b.pages.map(x => ({ label: pageLink(x.path), value: x.visitors })) as Ranked[],
  }
}

/** What the readers page draws: its line, its tiles, its chart and its three rankings. */
function readersParts(now: Date, r: Readers, tz: string) {
  const days = lastDays(now, r.days, tz)
  const d = alignDaily(days, r.daily)
  // Days before the count's reset weren't counted: no value, not 0.
  const from = r.from ? localDay(r.from, tz) : ''
  const counted = (vals: number[]) => days.map((day, i) => (day < from ? null : vals[i]!))
  return {
    lede: `The last ${r.days} days${r.from ? ` (counted again from ${timeTag(r.from, tz, now)})` : ''} · counted by the page’s script in the browser (known bots, AquaTome’s own checks and the owner’s visits left out) · a <b>reader</b> is a tab that scrolled half the page or stayed 30 s. ${zoneNote(tz, now)}`,
    tiles: [{ label: 'Tabs', value: fmt(r.sessions) }, { label: 'Readers', value: fmt(r.readers), meter: r.sessions ? r.readers / r.sessions : undefined, sub: `${fmt(r.sessions ? (100 * r.readers) / r.sessions : 0, 1)}% of tabs` }] as Tile[],
    chart: { id: 'r-daily', title: 'Tabs and readers by day', days, series: [{ label: 'Readers', values: counted(d.readers) }], whole: { label: 'Tabs', values: counted(d.sessions) }, partialLast: true, empty: 'No tabs yet.', ...(from ? { missing: `not counted: the count started again on ${dayText(from, now, tz)}` } : {}) } as DayChart,
    sources: r.sources.map(x => ({ label: esc(x.source), value: x.sessions, part: x.readers, cells: [fmt(x.readers)] })) as Ranked[],
    pages: r.pages.map(x => ({ label: pageLink(x.path), value: x.views })) as Ranked[],
    countries: r.countries.map(x => ({ label: esc(x.cc), value: x.readers })) as Ranked[],
  }
}

const ASKS_TITLE = 'The language chooser'
const ASKS_HEAD = ['Country', 'Shown', ...LANGS.map(l => `Chose ${LANG_NAME[l]}`)]
/** The language chooser (worker/lang-ask.ts): who saw it and what they picked, by country. */
const asksParts = (a: LangAsks) => ({
  lede: `A browser that asks for none of the site’s languages, from a country other than Vietnam, Indonesia or Thailand, is asked to choose one at aquatome.com/. How often the chooser showed and what was chosen, by country, the last ${a.days} days (bots and prefetches left out). Readers who came through it show as “(direct)” under Sources.`,
  rows: a.rows.map(x => ({ label: esc(x.cc || '??'), value: x.shown, cells: LANGS.map(l => fmt(x.picked[l])) })) as Ranked[],
})

export function readersPage(now: Date, r: Soft<Readers> | undefined, tz = HOME_TZ, asks?: Soft<LangAsks>): string {
  let body = '<h1>Readers</h1>'
  if (!r) body += `<p class="muted">${NO_AE}</p>`
  else if (isFailed(r)) body += failedBox('readers (Analytics Engine)', r)
  else {
    const p = readersParts(now, r, tz)
    body += `<p class="lede">${p.lede}</p>
${tiles(p.tiles)}
<h2>By day and source</h2><div class="charts">${dayChart(p.chart)}
<figure class="chart" aria-labelledby="r-src"><figcaption><h3 id="r-src">Sources</h3></figcaption>${rankTable(p.sources, SOURCE_HEAD, undefined, { part: 'Readers' })}</figure></div>
<div class="split"><section><h2>Most read pages</h2>${rankTable(p.pages, PAGE_VIEWS_HEAD)}</section>
<section><h2>Readers’ countries</h2>${rankTable(p.countries, COUNTRY_HEAD)}</section></div>`
    const back = backParts(r)
    if (back) body += `<h2>${BACK_TITLE}</h2><p class="lede">${back.lede}</p>${tiles(back.tiles)}${rankTable(back.pages, BACK_HEAD)}`
    const o = leftOutParts(r, tz, now)
    body += `<h2>${SIDE_TITLE}</h2><p class="lede">${o.sideNote}</p>${rankTable(o.side, SIDE_HEAD)}
<h2>${LEFT_OUT_TITLE}</h2><p class="lede">${o.lede}</p>${rankTable(o.rows, LEFT_OUT_HEAD)}${o.bursts.length ? `<ul>${o.bursts.map(b => `<li>${b}</li>`).join('')}</ul>` : ''}`
  }
  if (asks && isFailed(asks)) body += `<h2>${ASKS_TITLE}</h2>${failedBox('the language chooser (Analytics Engine)', asks)}`
  else if (asks) {
    const a = asksParts(asks)
    body += `<h2>${ASKS_TITLE}</h2><p class="lede">${a.lede}</p>${rankTable(a.rows, ASKS_HEAD)}`
  }
  return page('/_ab/doc-gia/', 'Readers', body, now, tz)
}

export function readersSection(now: Date, r: Soft<Readers> | undefined, tz = HOME_TZ, asks?: Soft<LangAsks>): Section {
  const blocks: Block[] = []
  if (!r) blocks.push(note(NO_AE, 'muted'))
  else if (isFailed(r)) blocks.push(failedNote('readers (Analytics Engine)', r))
  else {
    const p = readersParts(now, r, tz)
    blocks.push(note(textOf(p.lede)), figures(p.tiles), heading('By day and source'), chart(p.chart), heading('Sources', 3), rankBlock(p.sources, SOURCE_HEAD),
      heading('Most read pages'), rankBlock(p.pages, PAGE_VIEWS_HEAD), heading('Readers’ countries'), rankBlock(p.countries, COUNTRY_HEAD))
    const back = backParts(r)
    if (back) blocks.push(heading(BACK_TITLE), note(back.lede), figures(back.tiles), rankBlock(back.pages, BACK_HEAD))
    const o = leftOutParts(r, tz, now)
    blocks.push(heading(SIDE_TITLE), note(o.sideNote), rankBlock(o.side, SIDE_HEAD), heading(LEFT_OUT_TITLE), note(o.lede), rankBlock(o.rows, LEFT_OUT_HEAD), ...o.bursts.map(b => note(textOf(b), 'muted')))
  }
  if (asks && isFailed(asks)) blocks.push(heading(ASKS_TITLE), failedNote('the language chooser (Analytics Engine)', asks))
  else if (asks) {
    const a = asksParts(asks)
    blocks.push(heading(ASKS_TITLE), note(a.lede), rankBlock(a.rows, ASKS_HEAD))
  }
  return { title: 'Readers', blocks }
}

// ——— Affiliate ———

const NETWORK_HEAD = ['Shop · group', 'Clicks']
const TOP_HEAD = ['Page', 'Clicks']
/** What the affiliate page draws: its line, its chart, its two rankings and the line on the catalog. */
function affiliateParts(clicks: Soft<Clicks>, a: Soft<AffSummary>, now: Date, tz: string) {
  // clicks_daily keeps Vietnam's days (affiliate/go.ts), which can't be split again by another zone's.
  const days = sameClock(tz, HOME_TZ, now) ? zoneNote(tz, now) : `Clicks are kept by Vietnam’s days (GMT+7); times are in your zone (${zoneName(tz, now)}).`
  return {
    lede: `Clicks on /go/ links to the shops (bots left out). ${days}`,
    chart: isFailed(clicks) ? clicks : ({ id: 'a-daily', title: 'Clicks by day · 30 days', days: clicks.days, series: [{ label: 'Clicks', values: clicks.clicks }], partialLast: true, empty: 'No clicks in 30 days.' } as DayChart),
    tables: isFailed(a) ? a : {
      networks: a.byNetwork.map(r => ({ label: `${esc(r.network)} <span class="muted">· ${esc(r.category)}</span>`, value: r.n })) as Ranked[],
      top: a.top.map(r => ({ label: esc(r.entity_ref), value: r.n })) as Ranked[],
      products: `Products: ${a.status.map(s => `${esc(s.status)} ${fmt(s.n)}`).join(' · ') || 'none yet (search links for now)'} · last checked: ${a.lastCheck ? timeTag(a.lastCheck, tz, now) : 'never'}`,
    },
  }
}

export function affiliatePage(clicks: Soft<Clicks>, a: Soft<AffSummary>, now = new Date(), tz = HOME_TZ): string {
  const p = affiliateParts(clicks, a, now, tz)
  const chartHtml = isFailed(p.chart) ? failedBox('clicks by day', p.chart) : dayChart(p.chart)
  const tables = isFailed(p.tables) ? failedBox('the affiliate tables', p.tables) : `<div class="split"><section><h2>By shop · 14 days</h2>${rankTable(p.tables.networks, NETWORK_HEAD)}</section>
<section><h2>Pages that send the most · 14 days</h2>${rankTable(p.tables.top, TOP_HEAD)}</section></div>
<p class="note">${p.tables.products}</p>`
  return page('/_ab/affiliate/', 'Affiliate', `<h1>Affiliate</h1><p class="lede">${p.lede}</p><h2>By day</h2><div class="charts">${chartHtml}</div>${tables}`, now, tz)
}

export function affiliateSection(clicks: Soft<Clicks>, a: Soft<AffSummary>, now = new Date(), tz = HOME_TZ): Section {
  const p = affiliateParts(clicks, a, now, tz)
  const blocks: Block[] = [note(textOf(p.lede)), heading('By day'), isFailed(p.chart) ? failedNote('clicks by day', p.chart) : chart(p.chart)]
  if (isFailed(p.tables)) blocks.push(failedNote('the affiliate tables', p.tables))
  else blocks.push(heading('By shop · 14 days'), rankBlock(p.tables.networks, NETWORK_HEAD), heading('Pages that send the most · 14 days'), rankBlock(p.tables.top, TOP_HEAD), note(textOf(p.tables.products)))
  return { title: 'Affiliate', blocks }
}

// ——— Wanted by readers ———

const SOURCE: Record<string, string> = { tank: 'My tanks', 'fish-id': 'fish ID' }
const KIND: Record<string, string> = { fish: 'fish', plant: 'plant' }
const WANTED_HEAD = ['Name', 'Readers', 'Kind', 'From', 'First', 'Latest']
const WANTED_MORE = 'There are more names: this page reads the first 5,000.'
const wantedLede = (now: Date, tz: string) => `Fish and plants readers name that have no page yet: from “My tanks”, and from fish ID when Claude is fairly sure. Each reader counts once a day. The engine writes the most wanted first. Days are Vietnam’s${sameClock(tz, HOME_TZ, now) ? '' : ' (GMT+7)'}.`
/** What the wanted page draws from the list: its tiles, its heading and its ranking (the first 300). */
function wantedParts(now: Date, w: { names: Wanted[]; more: boolean }) {
  const since = lastDays(now, 7, HOME_TZ)[0]!
  const top = w.names.slice(0, 300)
  return {
    tiles: [{ label: 'Names', value: `${fmt(w.names.length)}${w.more ? '+' : ''}` }, { label: 'Reader asks', value: fmt(w.names.reduce((s, x) => s + x.readers, 0)) }, { label: 'New names · 7 days', value: fmt(w.names.filter(x => x.first >= since).length) }] as Tile[],
    title: `Most wanted${w.names.length > top.length ? ` · the first ${fmt(top.length)}` : ''}`,
    rows: top.map((x): RankRow => {
      // The name, and its scientific name under it when it's another.
      const cell: Cell = { text: x.name, ...(x.sci && x.sci !== x.name ? { sub: x.sci } : {}) }
      return {
        cell, label: `${esc(cell.text)}${cell.sub ? ` <i class="sci muted">${esc(cell.sub)}</i>` : ''}`,
        value: x.readers,
        cells: [esc(KIND[x.kind] ?? x.kind), esc(Object.entries(x.sources).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${SOURCE[k] ?? k} ${fmt(n)}`).join(' · ')), esc(dayText(x.first, now, HOME_TZ)), esc(dayText(x.last, now, HOME_TZ))],
      }
    }),
  }
}

export function wantedPage(now: Date, w: Soft<{ names: Wanted[]; more: boolean }>, tz = HOME_TZ): string {
  let body = `<h1>Wanted by readers</h1><p class="lede">${wantedLede(now, tz)}</p>`
  if (isFailed(w)) return page('/_ab/muon-co/', 'Wanted by readers', body + failedBox('the list', w), now, tz)
  const p = wantedParts(now, w)
  body += tiles(p.tiles)
  body += `<h2>${p.title}</h2>${rankTable(p.rows, WANTED_HEAD)}${w.more ? `<p class="note">${WANTED_MORE}</p>` : ''}`
  return page('/_ab/muon-co/', 'Wanted by readers', body, now, tz)
}

export function wantedSection(now: Date, w: Soft<{ names: Wanted[]; more: boolean }>, tz = HOME_TZ): Section {
  const blocks: Block[] = [note(wantedLede(now, tz))]
  if (isFailed(w)) blocks.push(failedNote('the list', w))
  else {
    const p = wantedParts(now, w)
    blocks.push(figures(p.tiles), heading(p.title), rankBlock(p.rows, WANTED_HEAD), ...(w.more ? [note(WANTED_MORE)] : []))
  }
  return { title: 'Wanted by readers', blocks }
}

// ——— Reader photos, hidden pages ———

/** A moved photo's line under its page: the page it was sent for. */
const movedText = (from: string) => `Moved by moderation from ${from}`
/** A comment's photo is marked so, with its comment's page (worker/comments/photo.ts) in place of its own key. */
const FROM_COMMENT = 'From a comment'
const isCommentPhoto = (p: { entity_ref: string }) => p.entity_ref.startsWith('comment:')
const commentPage = (p: { entity_ref: string; comment?: PhotoComment }) => p.comment?.path ?? p.comment?.page ?? p.entity_ref
/**
 * One reader photo: its picture, who sent it, to which page (and the page it was sent for, when moderation moved it) and
 * when, then its buttons, Remove last. Two columns, so the buttons stay on a phone's screen.
 */
const photoRow = (p: { id: string; entity_ref: string; moved_from?: string | null; name: string; created_at: string; comment?: PhotoComment }, picture: string, state: string, buttons: string, now: Date, tz: string) =>
  `<tr><th style="width:1%">${picture}</th><td class="l" style="overflow-wrap:anywhere"><strong>${esc(p.name)}</strong><br>${isCommentPhoto(p) ? `<span class="chip">${FROM_COMMENT}</span> ${p.comment?.path ? pageLink(p.comment.path) : esc(commentPage(p))}` : esc(p.entity_ref)}${p.moved_from ? `<br><span class="muted">${esc(movedText(p.moved_from))}</span>` : ''}<br><span class="muted">${timeTag(p.created_at, tz, now)}</span>${state}`
  + `<form method="post" action="/_ab/photos" style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px"><input type="hidden" name="id" value="${esc(p.id)}">${buttons}<button name="action" value="remove">Remove</button></form></td></tr>`

const PHOTOS_LEDE = 'Photos that passed moderation (no faces, the right species, safe) or that you approved, now on their species pages. Remove deletes one from the page and the server at once.'
const WAITING_NOTE = 'Moderation runs every hour: a photo that passes goes on its species page and the list below, one that fails is deleted. Tap a photo to see it whole. Approve puts it on its page at the next pass, without the checks. Remove deletes it now.'
const PHOTOS_OFF = 'Reader photos are off (D1, R2 or Turnstile is missing).'
const NO_PHOTOS = 'No photos yet.'
/** A waiting photo's upload, served to the owner alone (dashboard.ts). */
const waitingSrc = (id: string) => `/_ab/anh/${id}`
const OWNER_OK = ['Approved', 'goes up at the next pass']
/** Approve (the next pass publishes it) and Remove (removed now): the page's two buttons, as the app's requests. */
const photoActions = (id: string, approve: boolean): Action[] => [
  ...(approve ? [{ label: 'Approve', method: 'POST', path: `/api/owner/photos/${encodeURIComponent(id)}`, body: { action: 'approve' }, tone: 'good' } as Action] : []),
  { label: 'Remove', method: 'POST', path: `/api/owner/photos/${encodeURIComponent(id)}`, body: { action: 'remove' }, tone: 'bad' },
]

export function photosPage(xs: Soft<RecentPhoto[] | undefined>, waiting?: Soft<WaitingPhoto[] | undefined>, now = new Date(), tz = HOME_TZ): string {
  let body = `<h1>Reader photos</h1><p class="lede">${PHOTOS_LEDE}</p>`
  // Sent but not yet through the moderation pass (hourly): each with its picture (the upload, served to the owner alone,
  // tapped to see it whole), Approve (the next pass publishes it without its checks) and Remove.
  if (waiting && !isFailed(waiting) && waiting.length) {
    const rows = waiting.map(p => {
      const src = esc(waitingSrc(p.id))
      const picture = `<a href="${src}"><img class="thumb" src="${src}" alt="See ${esc(p.name)}’s photo whole" width="96" height="96" loading="lazy" style="height:96px;object-fit:cover"></a>`
      return p.ownerOk
        ? photoRow(p, picture, `<br><span class="chip good">${OWNER_OK[0]}</span> <span class="muted">${OWNER_OK[1]}</span>`, '', now, tz)
        : photoRow(p, picture, '', '<button class="go" name="action" value="approve">Approve</button>', now, tz)
    }).join('')
    body += `<h2>Waiting (${waiting.length})</h2><p class="muted">${WAITING_NOTE}</p><div class="scroll"><table><tbody>${rows}</tbody></table></div><h2>On the site</h2>`
  }
  if (isFailed(xs)) body += failedBox('the photos', xs)
  else if (!xs) body += `<p class="muted">${PHOTOS_OFF}</p>`
  else {
    const rows = xs.map(p => photoRow(p, `<img class="thumb" src="${esc(p.thumb)}" alt="" width="96" loading="lazy">`, '', '', now, tz)).join('')
    body += `<div class="scroll"><table><tbody>${rows || `<tr><td colspan="2" class="none">${NO_PHOTOS}</td></tr>`}</tbody></table></div>`
  }
  return page('/_ab/anh-ban-doc/', 'Reader photos', body, now, tz)
}

export function photosSection(xs: Soft<RecentPhoto[] | undefined>, waiting?: Soft<WaitingPhoto[] | undefined>, now = new Date(), tz = HOME_TZ): Section {
  const blocks: Block[] = [note(PHOTOS_LEDE)]
  const meta = (p: { entity_ref: string; moved_from?: string | null; created_at: string; comment?: PhotoComment }) => [...(isCommentPhoto(p) ? [FROM_COMMENT, commentPage(p)] : [p.entity_ref]), ...(p.moved_from ? [movedText(p.moved_from)] : []), timeText(p.created_at, tz, now)]
  if (waiting && !isFailed(waiting) && waiting.length) {
    const items: PhotoItem[] = waiting.map(p => ({ id: p.id, src: waitingSrc(p.id), caption: p.name, meta: [...meta(p), ...(p.ownerOk ? [OWNER_OK.join(' · ')] : [])], actions: photoActions(p.id, !p.ownerOk) }))
    blocks.push(heading(`Waiting (${waiting.length})`), note(WAITING_NOTE, 'muted'), { kind: 'photos', items }, heading('On the site'))
  }
  if (isFailed(xs)) blocks.push(failedNote('the photos', xs))
  else if (!xs) blocks.push(note(PHOTOS_OFF, 'muted'))
  else blocks.push({ kind: 'photos', items: xs.map(p => ({ id: p.id, src: p.thumb, caption: p.name, meta: meta(p), actions: photoActions(p.id, false) })), empty: NO_PHOTOS })
  return { title: 'Reader photos', blocks }
}

const KEPT_LEDE = 'Photos readers let us keep from fish ID, with the answer, to check and improve it. Shown only here, never public, and deleted after 6 months. A signed-in reader can delete their own; one sent signed out can only be deleted here, when they ask.'
const KEPT_OFF = 'Off (R2 UPLOADS is missing).'
/** A kept photo's image, served to the owner alone (dashboard.ts); `who`: its account, or anon. */
const keptSrc = (who: string, id: string) => `/_ab/anh-nhan-dien/anh/${who}/${id}`
const keptWho = (p: KeptRow) => p.account ?? 'anon'

/** Fish-ID photos readers let us keep (fishid/kept.ts): only here are they seen. Newest first; each goes 6 months on. */
export function keptPage(xs: Soft<KeptRow[] | undefined>, now = new Date(), tz = HOME_TZ): string {
  let body = `<h1>Kept photos</h1><p class="lede">${KEPT_LEDE}</p>`
  if (isFailed(xs)) body += failedBox('the kept photos', xs)
  else if (!xs) body += `<p class="muted">${KEPT_OFF}</p>`
  else {
    const rows = xs.map(p => {
      const who = keptWho(p)
      const top = p.guesses[0]
      const src = keptSrc(esc(who), esc(p.id))
      return `<tr><th><a href="${src}"><img class="thumb" src="${src}" alt="" width="96" loading="lazy"></a></th><td class="l">${esc(p.verdict)}${top ? ` · <i>${esc(top.scientificName)}</i> ${Math.round(top.confidence * 100)}%` : ''}</td><td>${p.account ? 'signed in' : 'signed out'}</td><td>${esc(p.lang)}</td><td>${p.run ? `<a href="${runPath(p.run.day, p.run.id)}">${timeTag(p.created, tz, now)}</a>` : timeTag(p.created, tz, now)}</td><td><form method="post" action="/_ab/anh-nhan-dien/xoa"><input type="hidden" name="who" value="${esc(who)}"><input type="hidden" name="id" value="${esc(p.id)}"><button>Delete</button></form></td></tr>`
    }).join('')
    body += `<div class="scroll"><table><thead><tr><th></th><th>Answer</th><th>Sent</th><th>Language</th><th>When</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="none">${NO_PHOTOS}</td></tr>`}</tbody></table></div>`
  }
  return page('/_ab/anh-nhan-dien/', 'Kept photos', body, now, tz)
}

export function keptSection(xs: Soft<KeptRow[] | undefined>, now = new Date(), tz = HOME_TZ): Section {
  const blocks: Block[] = [note(KEPT_LEDE)]
  if (isFailed(xs)) blocks.push(failedNote('the kept photos', xs))
  else if (!xs) blocks.push(note(KEPT_OFF, 'muted'))
  else {
    const items: PhotoItem[] = xs.map(p => {
      const who = keptWho(p)
      const top = p.guesses[0]
      return {
        id: p.id, src: keptSrc(who, p.id), caption: `${p.verdict}${top ? ` · ${top.scientificName} ${Math.round(top.confidence * 100)}%` : ''}`,
        meta: [p.account ? 'signed in' : 'signed out', p.lang, timeText(p.created, tz, now)],
        actions: [{ label: 'Delete', method: 'DELETE', path: `/api/owner/fishid-shots/${encodeURIComponent(who)}/${encodeURIComponent(p.id)}`, tone: 'bad' }],
      }
    })
    blocks.push({ kind: 'photos', items, empty: NO_PHOTOS })
  }
  return { title: 'Kept photos', blocks }
}

const HIDDEN_LEDE = 'A hidden page answers 410 (gone), its Markdown too: usually within 1–2 minutes, at the latest by the next build (3 hours or less), when it also leaves the lists, the sitemap and search. Show again: if a build has run since, the page comes back at the next build.'
const NO_HIDDEN = 'No hidden pages.'
const newestHidden = (h: Hidden) => Object.entries(h).sort(([, a], [, b]) => b.at.localeCompare(a.at))

export function hiddenPage(h: Soft<Hidden>, now = new Date(), tz = HOME_TZ): string {
  let body = `<h1>Hidden pages</h1><p class="lede">${HIDDEN_LEDE}</p>
<form class="inline" method="post" action="/_ab/hidden"><input name="url" required placeholder="https://aquatome.com/ca/..." aria-label="Page address"><input name="note" placeholder="Why (optional)" aria-label="Why"><button class="go" name="action" value="hide">Hide</button></form>`
  if (isFailed(h)) body += failedBox('the hidden pages', h)
  else {
    const rows = newestHidden(h).map(([path, v]) =>
      `<tr><th><a href="${esc(path)}">${esc(path)}</a></th><td class="l">${esc(v.note ?? '')}</td><td>${timeTag(v.at, tz, now)}</td><td><form method="post" action="/_ab/hidden"><input type="hidden" name="url" value="${esc(path)}"><button name="action" value="unhide">Show again</button></form></td></tr>`).join('')
    body += `<div class="scroll"><table><thead><tr><th>Page</th><th>Why</th><th>When</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="4" class="none">${NO_HIDDEN}</td></tr>`}</tbody></table></div>`
  }
  return page('/_ab/an-trang/', 'Hidden pages', body, now, tz)
}

export function hiddenSection(h: Soft<Hidden>, now = new Date(), tz = HOME_TZ): Section {
  // The page's form: a page's address and why, hidden at once.
  const form: Block = {
    kind: 'form', method: 'POST', path: '/api/owner/hidden', body: { hide: true }, submit: 'Hide',
    fields: [{ name: 'path', label: 'Page address', kind: 'text', required: true, placeholder: 'https://aquatome.com/ca/...' }, { name: 'note', label: 'Why', kind: 'text', placeholder: 'Why (optional)' }],
  }
  const blocks: Block[] = [note(HIDDEN_LEDE), form]
  if (isFailed(h)) blocks.push(failedNote('the hidden pages', h))
  else blocks.push({
    kind: 'hidden',
    items: newestHidden(h).map(([path, v]) => ({ path, ...(v.note ? { note: v.note } : {}), since: timeText(v.at, tz, now), actions: [{ label: 'Show again', method: 'POST', path: '/api/owner/hidden', body: { path, hide: false } }] })),
    empty: NO_HIDDEN,
  })
  return { title: 'Hidden pages', blocks }
}

// ——— Accounts (comments have their own page, admin/comments.ts) ———

const CRED: Record<string, string> = { apple: 'Apple', google: 'Google', passkey: 'Passkey', email: 'Email' }
const CRED_HEAD = ['Sign-in', 'Accounts']
const accountsLede = (now: Date, tz: string) => `Accounts that sign in to sync “My tanks”. No names, emails or phone numbers are kept. ${zoneNote(tz, now)}`
/** What the accounts page draws: its tiles, its chart and its ranking. */
function accountsParts(a: AccountStats) {
  return {
    tiles: [
      { label: 'Accounts', value: fmt(a.users) },
      { label: 'New accounts · 7 days', value: fmt(ago(a.newUsers, 7, 1)), delta: { now: ago(a.newUsers, 7, 1), before: ago(a.newUsers, 14, 8), vs: 'the 7 days before', good: 'up' } },
      { label: 'With synced tanks', value: fmt(a.synced) },
      { label: 'Signed in now', value: fmt(a.openSessions) },
    ] as Tile[],
    charts: [
      { id: 'u-daily', title: 'New accounts by day · 30 days', days: a.days, series: [{ label: 'New accounts', values: a.newUsers }], partialLast: true, empty: 'No new accounts in 30 days.' },
    ] as DayChart[],
    credentials: a.credentials.map(c => ({ label: esc(CRED[c.kind] ?? c.kind), value: c.n })) as Ranked[],
  }
}

export function accountsPage(a: Soft<AccountStats>, now = new Date(), tz = HOME_TZ): string {
  let body = `<h1>Accounts</h1><p class="lede">${accountsLede(now, tz)}</p>`
  if (isFailed(a)) return page('/_ab/tai-khoan/', 'Accounts', body + failedBox('the figures', a), now, tz)
  const p = accountsParts(a)
  body += tiles(p.tiles)
  body += `<h2>By day</h2><div class="charts">${dayChart(p.charts[0]!)}</div>
<h2>How they sign in</h2>${rankTable(p.credentials, CRED_HEAD)}`
  return page('/_ab/tai-khoan/', 'Accounts', body, now, tz)
}

export function accountsSection(a: Soft<AccountStats>, now = new Date(), tz = HOME_TZ): Section {
  const blocks: Block[] = [note(accountsLede(now, tz))]
  if (isFailed(a)) blocks.push(failedNote('the figures', a))
  else {
    const p = accountsParts(a)
    blocks.push(figures(p.tiles), heading('By day'), ...p.charts.map(c => chart(c)), heading('How they sign in'), rankBlock(p.credentials, CRED_HEAD))
  }
  return { title: 'Accounts', blocks }
}
