import type { Change } from '../daily/github'
import type { ReportMeta } from '../daily/log'
import { chart, deltaJson, type Block, type Figure, type TextTone } from './blocks'
import { barWords, chipOf, dayMonthEn, fmtEn, lastDays, usdEn, weekdayOf, type DayChart, type Readout, type Series } from './chart'
import { MAIN } from './content-page'
import { ago, alignDaily, todos, type Overview } from './pages'
import { weekByDay, type BeaconRow, type WeekByDay } from './scoreboard'
import { isFailed, type Soft } from './shell'
import { HOME_TZ, hourMinute, localDay } from './time'

/**
 * The overview's version 2 (docs/design/dashboard.md, protocols/owner-dashboard.openapi.json `Dashboard`), in English:
 * four tiles, what needs the owner, readers who found an answer, what shipped, the costs, the last three days, and every
 * page grouped with its figure. Read from the overview's own parts and a few more (`Today`), each failing on its own.
 */

/** The overview's parts, and what version 2 reads besides. */
export type Today = Overview & {
  /** The readers' beacon from last week's Monday (Vietnam's), as the scoreboard reads it, and when it began counting (READERS_FROM). */
  beacon: Soft<BeaconRow[]>
  countingFrom: string
  /** Comments held: they wait on the owner. */
  held: Soft<number>
  /** Readers' photos waiting, newest first; undefined where readers' photos are off. */
  waitingPhotos: Soft<{ id: string }[]> | undefined
  /** Fish ID photos kept; undefined without R2. */
  kept: Soft<number> | undefined
  /** The app's crash reports this week. */
  crashes: Soft<number>
  /** The newest daily report, null before the first. */
  lastReport: Soft<ReportMeta | null>
  changes: Soft<Change[]>
}

export type Need = {
  kind: 'comments' | 'photos' | 'key' | 'spend' | 'engine' | 'moderation' | 'failed'; text: string; sub?: string; label: string; tone: 'wait' | 'bad'
  section?: string; anchor?: string; url?: string; photos?: string[]
}
type Bars = { days: string[]; values: (number | null)[]; readouts: Readout[]; today?: number }
export type TileJson = { key: 'needs' | 'answers' | 'shipped' | 'cost'; label: string; value: string; sub: string; tone?: TextTone; delta?: Figure['delta']; bars?: Bars }
type Line = { area: 'site' | 'app' | 'engine'; label: string; text: string; at: string }
type NoteBlock = Extract<Block, { kind: 'note' }>
export type TodayJson = {
  asOf: string
  tiles: TileJson[]
  needs: Need[]
  needsEmpty: string
  answers: { title: string; figure?: Figure; chart?: Block; figures?: Figure[]; note?: NoteBlock }
  shipped: { title: string; lines: Line[]; empty?: string; section: string; link: string; note?: NoteBlock }
  costs: { title: string; lines: Figure[]; keys: { label: string; text: string; tone: TextTone; section: string; anchor?: string }; fixed: string[]; note: string }
  pages: { name: string; pages: { key: string; name: string; figure: { text: string; tone: TextTone } }[] }[]
  days: { title: string; figure: string; text: string; section?: string }[]
}

const DAY_MS = 86_400_000
const n = (x: number, one: string, many = `${one}s`) => `${fmtEn(x)} ${x === 1 ? one : many}`
const failedText = (what: string) => `Couldn't load ${what}`
const badNote = (text: string): NoteBlock => ({ kind: 'note', text, tone: 'bad' })
/** "+18%" against the 7 days before: as the old overview's chips, coloured past 5%. */
const chipText = (now: number, before: number) => chipOf(now, before, 'the 7 days before', 'up')

/** The pages' groups, their English names, and the sections they open: the rail's order (shell.ts NAV). */
export const PAGE_GROUPS: readonly (readonly [string, readonly (readonly [string, string])[]])[] = [
  ['Growth', [['thanh-cong', 'Scoreboard'], ['doc-gia', 'Readers'], ['affiliate', 'Affiliate']]],
  ['Content', [['noi-dung', 'Content and engine'], ['muon-co', 'Wanted by readers'], ['an-trang', 'Hidden pages']]],
  ['Community', [['binh-luan', 'Comments'], ['anh-ban-doc', 'Reader photos'], ['tai-khoan', 'Accounts']]],
  ['Fish ID', [['nhan-dien-ca', 'Calls and keys'], ['anh-nhan-dien', 'Kept photos']]],
  ['App', [['ung-dung', 'iPhone app']]],
  ['Records', [['bao-cao', 'Daily reports'], ['thay-doi', 'Changelog']]],
]

/** This week's fish ID calls and cost, Monday (Vietnam's) to now, from the stats' days. */
function fishWeek(t: Today): { calls: number; usd: number } | undefined {
  if (isFailed(t.fish)) return undefined
  const monday = weekByDay(t.now, [], t.countingFrom).days[0]!
  const { days, perDay } = t.fish
  let calls = 0
  let usd = 0
  days.forEach((d, i) => {
    if (d < monday) return
    calls += perDay.ok[i]! + perDay.none[i]!
    usd += perDay.usd[i]!
  })
  return { calls, usd }
}

/** What needs the owner, faults first: the overview's to-dos (in English), then the comments held and the photos waiting. */
export function needsOf(t: Today): Need[] {
  const out: Need[] = todos(t).map(x => {
    const place = x.href.startsWith('/_ab/') ? (([p, a]) => ({ section: p!.slice('/_ab/'.length, -1), ...(a ? { anchor: a } : {}) }))(x.href.split('#')) : { url: x.href }
    return { kind: x.kind, text: x.en.title, sub: x.en.text, label: x.en.action, tone: x.kind === 'spend' ? 'wait' as const : 'bad' as const, ...place }
  })
  for (const [what, part, section] of [['the readers\' beacon', t.beacon, 'thanh-cong'], ['the held comments', t.held, 'binh-luan'], ['the waiting photos', t.waitingPhotos, 'anh-ban-doc'], ['the kept photos', t.kept, 'anh-nhan-dien'], ['the app\'s crashes', t.crashes, 'ung-dung'], ['the daily reports', t.lastReport, 'bao-cao'], ['the changelog', t.changes, 'thay-doi']] as const) {
    if (isFailed(part)) out.push({ kind: 'failed', text: failedText(what), sub: 'Its dashboard page has the error.', label: 'Open', tone: 'bad', section })
  }
  if (!isFailed(t.held) && t.held) out.push({ kind: 'comments', text: `${n(t.held, 'comment')} held`, label: 'Review', tone: 'wait', section: 'binh-luan' })
  const photos = t.waitingPhotos && !isFailed(t.waitingPhotos) ? t.waitingPhotos : []
  if (photos.length) out.push({ kind: 'photos', text: `${n(photos.length, 'reader photo')} waiting`, label: 'Review', tone: 'wait', section: 'anh-ban-doc', photos: photos.slice(0, 4).map(p => p.id) })
  return out
}
/** What waits on the owner, by its items (two comments, two photos). */
const toReview = (t: Today) => (isFailed(t.held) ? 0 : t.held) + (t.waitingPhotos && !isFailed(t.waitingPhotos) ? t.waitingPhotos.length : 0)

/** Readers who found an answer this week, by day, Monday to Sunday: the chart, and what a tap on a bar says. */
function answersChart(w: WeekByDay): { chart: DayChart; also: Series[] } {
  return {
    chart: {
      id: 'answers', title: 'Found an answer, by day', days: w.days, today: w.today,
      series: [{ label: 'Found an answer', values: w.answered }], whole: { label: 'Readers', values: w.readers }, empty: 'No readers counted this week yet.',
    },
    also: [{ label: 'Shop clicks', values: w.shop }],
  }
}

/** The last 24 hours' changes, newest first, each line once. */
function shippedLines(t: Today): Line[] {
  if (isFailed(t.changes)) return []
  const from = t.now.getTime() - DAY_MS
  const seen = new Set<string>()
  return [...t.changes].filter(c => Date.parse(c.at) > from && Date.parse(c.at) <= t.now.getTime()).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .filter(c => !seen.has(`${c.area}\n${c.text}`) && Boolean(seen.add(`${c.area}\n${c.text}`)))
    .map(c => ({ area: c.area.toLowerCase() as Line['area'], label: c.area, text: c.text, at: c.at }))
}

/** One row a day, today first: its readers, then the rest in one line. */
function daysOf(t: Today): TodayJson['days'] {
  const tz = t.tz ?? HOME_TZ
  const month = lastDays(t.now, 31, tz)
  const r = isFailed(t.readers) ? undefined : alignDaily(month, t.readers)
  const at = (vals: number[], back: number) => vals[vals.length - 1 - back] ?? 0
  return lastDays(t.now, 3, tz).reverse().map((day, back) => {
    const parts: string[] = []
    if (!isFailed(t.fish)) {
      const d = t.fish.perDay
      const calls = at(d.ok, back) + at(d.none, back)
      if (calls) parts.push(`${n(calls, 'fish ID call')} (${usdEn(at(d.usd, back))})`)
    }
    if (!isFailed(t.clicks) && at(t.clicks.clicks, back)) parts.push(n(at(t.clicks.clicks, back), 'shop click'))
    if (!isFailed(t.accounts)) {
      if (at(t.accounts.newComments, back)) parts.push(`${n(at(t.accounts.newComments, back), 'new comment')}`)
      if (at(t.accounts.newUsers, back)) parts.push(`${n(at(t.accounts.newUsers, back), 'new account')}`)
    }
    if (!isFailed(t.wanted)) {
      const fresh = t.wanted.names.filter(w => w.first === day).length
      if (fresh) parts.push(`${n(fresh, 'name')} wanted`)
    }
    if (!isFailed(t.hidden)) {
      const hid = Object.values(t.hidden).filter(v => localDay(v.at, tz) === day).length
      if (hid) parts.push(`${n(hid, 'page')} hidden`)
    }
    const title = back === 0 ? 'Today so far' : back === 1 ? 'Yesterday' : `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekdayOf(day)]} ${dayMonthEn(day)}`
    return { title, figure: r ? n(at(r.readers, back), 'reader') : '—', text: parts.join(' · ') || 'Nothing else', ...(r ? { section: 'doc-gia' } : {}) }
  })
}

/** Each page's figure: what waits on the owner there, a fault, else its main figure. */
function figureOf(key: string, t: Today, w: WeekByDay | undefined): { text: string; tone: TextTone } {
  const tz = t.tz ?? HOME_TZ
  const plain = (text: string) => ({ text, tone: 'plain' as const })
  const failed = { text: 'Couldn\'t load', tone: 'bad' as const }
  const sevenDays = (vals: number[]) => {
    const chip = chipText(ago(vals, 7, 1), ago(vals, 14, 8))
    return plain(`${fmtEn(ago(vals, 7, 1))}${chip ? ` · ${chip.text}` : ''}`)
  }
  switch (key) {
    case 'thanh-cong': return w ? plain(n(w.now.answered, 'answer')) : failed
    case 'doc-gia': return isFailed(t.readers) ? failed : sevenDays(alignDaily(lastDays(t.now, 31, tz), t.readers).readers)
    case 'affiliate': return isFailed(t.clicks) ? failed : sevenDays(t.clicks.clicks)
    case 'noi-dung': {
      if (isFailed(t.content)) return failed
      const c = t.content
      const human = c.engine?.needsHuman.length ?? 0
      return human ? { text: `${fmtEn(human)} to fix`, tone: 'bad' } : plain(n(MAIN.reduce((k, x) => k + (c.inventory[x]?.total ?? 0), 0), 'page'))
    }
    case 'muon-co': return isFailed(t.wanted) ? failed : plain(`${n(t.wanted.names.length, 'name')}${t.wanted.more ? '+' : ''}`)
    case 'an-trang': return isFailed(t.hidden) ? failed : plain(fmtEn(Object.keys(t.hidden).length))
    case 'binh-luan': return isFailed(t.held) ? failed : t.held ? { text: `${fmtEn(t.held)} held`, tone: 'wait' } : plain('None held')
    case 'anh-ban-doc': {
      const waiting = t.waitingPhotos && !isFailed(t.waitingPhotos) ? t.waitingPhotos.length : 0
      if (waiting) return { text: `${fmtEn(waiting)} waiting`, tone: 'wait' }
      return isFailed(t.photos) ? failed : plain(`${fmtEn(t.photos)} shown`)
    }
    case 'tai-khoan': return isFailed(t.accounts) ? failed : plain(`${fmtEn(ago(t.accounts.newUsers, 6, 0))} new`)
    case 'nhan-dien-ca': {
      if (isFailed(t.keys)) return failed
      const off = t.keys?.rows.filter(r => r.state !== 'ok').length ?? 0
      if (off) return { text: `${n(off, 'key')} resting`, tone: 'bad' }
      const week = fishWeek(t)
      return week ? plain(n(week.calls, 'call')) : failed
    }
    case 'anh-nhan-dien': return t.kept === undefined ? { text: 'Off', tone: 'muted' } : isFailed(t.kept) ? failed : plain(fmtEn(t.kept))
    case 'ung-dung': return isFailed(t.crashes) ? failed : t.crashes ? { text: n(t.crashes, 'crash', 'crashes'), tone: 'bad' } : plain('0 crashes')
    case 'bao-cao': {
      if (isFailed(t.lastReport)) return failed
      if (!t.lastReport) return { text: 'None yet', tone: 'muted' }
      return t.lastReport.sent ? plain(`sent ${hourMinute(t.lastReport.when, tz).replace(/^0(?=\d:)/, '')}`) : { text: 'not sent', tone: 'bad' }
    }
    case 'thay-doi': return isFailed(t.changes) ? failed : plain(`${fmtEn(shippedLines(t).length)} in 24 h`)
    default: return plain('')
  }
}

export function todayJson(t: Today): TodayJson {
  const w = isFailed(t.beacon) ? undefined : weekByDay(t.now, t.beacon, t.countingFrom)
  const needs = needsOf(t)
  // Held comments and waiting photos one by one, and a day's AI spend near its cap: what waits on the owner.
  const review = toReview(t) + needs.filter(x => x.kind === 'spend').length
  const fix = needs.filter(x => x.tone === 'bad').length
  const lines = shippedLines(t)
  const week = fishWeek(t)
  const thirty = isFailed(t.fish) ? undefined : t.fish.periods.last30
  const a = w ? answersChart(w) : undefined
  const bars = a ? barWords(a.chart, 'en', a.also) : undefined
  // This week so far against the same point last week, as the scoreboard compares them.
  const fig = (label: string, now: number, before: number | undefined, o: { sub?: string; good?: 'up' } = {}): Figure => ({
    label, value: fmtEn(now), ...(o.sub ? { sub: o.sub } : {}),
    ...(before === undefined ? {} : { delta: deltaJson({ now, before, vs: 'the same point last week', ...(o.good ? { good: o.good } : {}) }, 'en') }),
  })
  const last = w?.lastSoFar ?? undefined
  const keys = ((): TodayJson['costs']['keys'] => {
    const k = { label: 'Anthropic keys', section: 'nhan-dien-ca', anchor: 'key' }
    if (isFailed(t.keys)) return { ...k, text: 'Couldn\'t read their state', tone: 'bad' }
    if (!t.keys) return { ...k, text: 'None set: fish ID is off', tone: 'bad' }
    const off = t.keys.rows.filter(r => r.state !== 'ok').length
    return { ...k, text: off ? `${fmtEn(off)} of ${fmtEn(t.keys.rows.length)} resting` : `${fmtEn(t.keys.rows.length)} working`, tone: off ? 'bad' : 'plain' }
  })()
  const byArea = (['site', 'app', 'engine'] as const).map(x => [x, lines.filter(l => l.area === x).length] as const).filter(([, k]) => k)
  return {
    asOf: t.now.toISOString(),
    tiles: [
      { key: 'needs', label: 'Needs you', value: needs.length ? fmtEn(review + fix) : 'All clear', sub: needs.length ? [review ? `${fmtEn(review)} to review` : '', fix ? `${fmtEn(fix)} to fix` : ''].filter(Boolean).join(' · ') : 'Nothing to review or fix', tone: fix ? 'bad' : review ? 'wait' : 'good' },
      w && a && bars
        ? { key: 'answers', label: 'Found an answer', value: fmtEn(w.now.answered), sub: 'This week so far', ...(last ? { delta: fig('', w.now.answered, last.answered, { good: 'up' }).delta } : {}), bars: { days: w.days, values: w.answered, readouts: bars.readouts, today: w.today } }
        : { key: 'answers', label: 'Found an answer', value: '—', sub: failedText('the readers\' beacon'), tone: 'bad' },
      { key: 'shipped', label: 'Shipped in 24 hours', value: isFailed(t.changes) ? '—' : fmtEn(lines.length), sub: isFailed(t.changes) ? failedText('the changelog') : byArea.length ? byArea.map(([x, k]) => `${fmtEn(k)} ${x}`).join(' · ') : 'Nothing new', ...(isFailed(t.changes) ? { tone: 'bad' as const } : {}) },
      week
        ? { key: 'cost', label: 'Fish ID cost, this week', value: usdEn(week.usd), sub: n(week.calls, 'Claude call') }
        : { key: 'cost', label: 'Fish ID cost, this week', value: '—', sub: failedText('the fish ID log'), tone: 'bad' },
    ],
    needs,
    needsEmpty: 'Nothing needs you right now',
    answers: w && a
      ? {
        title: 'Readers who found an answer',
        figure: fig('Found an answer', w.now.answered, last?.answered, { sub: 'This week so far', good: 'up' }),
        chart: chart(a.chart, 'en', a.also),
        figures: [fig('Readers', w.now.readers, last?.readers, { good: 'up' }), fig('Sessions', w.now.sessions, last?.sessions), fig('Shop clicks', w.now.shop, last?.shop, { good: 'up' })],
      }
      : { title: 'Readers who found an answer', note: badNote(`${failedText('the readers\' beacon')}: ${(t.beacon as { failed: string }).failed}`) },
    shipped: {
      title: 'Shipped in 24 hours', lines, section: 'thay-doi', link: `Changelog · ${fmtEn(lines.length)} in 24 h`,
      ...(isFailed(t.changes) ? { note: badNote(`${failedText('the changelog')}: ${t.changes.failed}`) } : lines.length ? {} : { empty: 'Nothing shipped in the last 24 hours.' }),
    },
    costs: {
      title: 'Costs',
      lines: [
        week ? { label: 'Fish ID, this week', value: usdEn(week.usd), sub: n(week.calls, 'Claude call') } : { label: 'Fish ID, this week', value: '—', sub: failedText('the fish ID log') },
        thirty ? { label: 'Fish ID, 30 days', value: usdEn(thirty.usd), sub: n(thirty.calls, 'Claude call') } : { label: 'Fish ID, 30 days', value: '—', sub: failedText('the fish ID log') },
      ],
      keys,
      fixed: ['Engine: Claude subscription, flat', 'Cloudflare: fixed plan'],
      note: 'Only fish ID is counted so far',
    },
    pages: PAGE_GROUPS.map(([name, pages]) => ({ name, pages: pages.map(([key, page]) => ({ key, name: page, figure: figureOf(key, t, w) })) })),
    days: daysOf(t),
  }
}
