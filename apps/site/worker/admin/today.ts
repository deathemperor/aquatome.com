import type { Change } from '../daily/github'
import type { ReportMeta } from '../daily/log'
import { chart, deltaJson, type Block, type Figure, type TextTone } from './blocks'
import { barWords, chipOf, deltaOf, dayLabel, esc, fmt, lastDays, SHORT_DAY, usd, weekdayOf, type DayChart, type Readout, type Series } from './chart'
import { HIDDEN_BY_OWNER, SHOWN_BY_OWNER } from './comments'
import { langOfPath, pageIndex, pagesByRef } from './content'
import { LANG_NAME, MAIN } from './content-page'
import { fishSpan, periodTotals } from './fishid'
import { ago, alignDaily, didntLoad, placeOf, todos, type Overview } from './pages'
import { publishingOf, type Bars as PublishingBars, type PublishingJson } from './publishing'
import { weekByDay, type BeaconRow, type WeekByDay } from './scoreboard'
import { ICON, isFailed, NAV, page, type Soft } from './shell'
import { clock, HOME_TZ, hourMinute, localDay } from './time'

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
  /** The pages held comments are on (entity_ref, newest first, each once): named under the need. */
  heldPages?: Soft<string[]>
  /** Readers' photos waiting, newest first, each with the page it's for (`ref`, a comment's photo its comment's page); undefined where readers' photos are off. */
  waitingPhotos: Soft<{ id: string; ref?: string }[]> | undefined
  /** Fish ID photos kept; undefined without R2. */
  kept: Soft<number> | undefined
  /** The app's crash reports this week. */
  crashes: Soft<number>
  /** The newest daily report, null before the first. */
  lastReport: Soft<ReportMeta | null>
  changes: Soft<Change[]>
  /** The owner's newest decisions kept in D1 (data.ts ownerActs): a comment shown or hidden, a reader photo approved or removed. */
  acts: Soft<OwnerAct[]>
}
/** A decision of the owner's, kept with its time: `ref` is the comment's or the photo's page (entity_ref). */
export type OwnerAct = { kind: 'comment-shown' | 'comment-hidden' | 'photo-approved' | 'photo-removed'; at: string; ref: string }
/** The owner's last action, shown under "Nothing needs you right now": what, when, and the page it was done on. */
export type LastAction = { title: string; text: string; when: string; at: string; section: string }

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
  lastAction: LastAction | null
  answers: { title: string; figure?: Figure; chart?: Block; figures?: Figure[]; note?: NoteBlock }
  shipped: { title: string; lines: Line[]; empty?: string; section: string; link: string; note?: NoteBlock }
  costs: { title: string; lines: Figure[]; keys: { label: string; text: string; tone: TextTone; section: string; anchor?: string }; fixed: string[]; note: string }
  pages: { name: string; pages: { key: string; name: string; figure: { text: string; tone: TextTone } }[] }[]
  days: { title: string; figure: string; text: string; section?: string }[]
  /** New pages by kind and day (admin/publishing.ts); absent while the build's figures or the nightly saves can't be read. */
  publishing?: PublishingJson
}

const DAY_MS = 86_400_000
const n = (x: number, one: string, many = `${one}s`) => `${fmt(x)} ${x === 1 ? one : many}`
const failedText = (what: string) => `Couldn’t load ${what}`
const badNote = (text: string): NoteBlock => ({ kind: 'note', text, tone: 'bad' })
/** "+18%" against the 7 days before: as the old overview's chips, coloured past 5%. */
const chipText = (now: number, before: number) => chipOf(now, before, 'the 7 days before', 'up')

/**
 * The first screen's pages card, as the board names its rows and in its order (the Design Lead, 20 Nov): "Species", as the
 * count holds shrimp, crabs and snails too, then "Video guides", "Guides", "Plants". Every page written is in the figure,
 * held ones too, so the card says "written" until the board's "pages a reader can open" replaces it (Fri 27).
 */
const BOARD_ROW: Partial<Record<string, string>> = { fish: 'Species', videoGuide: 'Video guides', guide: 'Guides', plant: 'Plants' }
const BOARD_ORDER = ['fish', 'videoGuide', 'guide', 'plant']
const byBoard = <K extends { key: string }>(kinds: K[]) => [...kinds].sort((a, b) => (BOARD_ORDER.indexOf(a.key) + 1 || 99) - (BOARD_ORDER.indexOf(b.key) + 1 || 99))

/** The pages' groups, their names, and the sections they open: the rail's order (shell.ts NAV). */
export const PAGE_GROUPS: readonly (readonly [string, readonly (readonly [string, string])[]])[] = [...new Set(NAV.map(([, , g]) => g).filter(Boolean))]
  .map(g => [g, NAV.filter(([, , x]) => x === g).map(([path, name]) => [path.slice('/_ab/'.length, -1), name] as const)] as const)

/** This week's fish ID calls and cost, Monday to now in the viewer's zone: the Fish ID section's "This week", the same sum. */
function fishWeek(t: Today): { calls: number; usd: number } | undefined {
  if (isFailed(t.fish)) return undefined
  const { now } = periodTotals(t.fish, fishSpan('week', t.now, t.tz ?? HOME_TZ))
  return { calls: now.calls, usd: now.usd }
}

/** The overview's "New pages", from this build and the nightly saves; undefined when either didn't load or none is saved. */
export const publishingOfToday = (t: Today) => (isFailed(t.content) || isFailed(t.snapshots) ? undefined : publishingOf(t.now, t.tz ?? HOME_TZ, t.content, t.snapshots))

/**
 * What needs the owner, faults first: the overview's to-dos, the parts that didn't load, the engine's pages stopped (all of
 * them as one line, or a kind with work waiting), then the comments held and the photos waiting. Each title one short line.
 */
export function needsOf(t: Today): Need[] {
  const out: Need[] = todos(t).map(x => ({ kind: x.kind, text: x.title, sub: x.text, label: x.action, tone: x.kind === 'spend' ? 'wait' as const : 'bad' as const, ...placeOf(x.href) }))
  for (const [what, part, section] of [['Readers’ beacon', t.beacon, 'thanh-cong'], ['Held comments', t.held, 'binh-luan'], ['Waiting photos', t.waitingPhotos, 'anh-ban-doc'], ['Kept photos', t.kept, 'anh-nhan-dien'], ['App crashes', t.crashes, 'ung-dung'], ['Daily reports', t.lastReport, 'bao-cao'], ['Changelog', t.changes, 'thay-doi']] as const) {
    if (isFailed(part)) out.push({ kind: 'failed', text: didntLoad(what), sub: 'Its page has the error.', label: 'Open', tone: 'bad', section })
  }
  const pub = publishingOfToday(t)
  const engine = { kind: 'engine' as const, label: 'See engine', tone: 'bad' as const, section: 'noi-dung', anchor: 'engine' }
  const since = (x: { since: string }) => `Since ${clock(x.since, t.tz ?? HOME_TZ, t.now)}`
  if (pub?.quiet) out.push({ ...engine, text: 'Nothing new published', sub: since(pub.quiet) })
  for (const k of pub?.kinds ?? []) if (k.stalled) out.push({ ...engine, text: `No new ${k.label.toLowerCase()}`, sub: since(k.stalled) })
  const named = (refs: string[]) => pageNames(t, refs)
  if (!isFailed(t.held) && t.held) {
    const sub = t.heldPages && !isFailed(t.heldPages) ? named(t.heldPages) : ''
    out.push({ kind: 'comments', text: `${n(t.held, 'comment')} held for review`, ...(sub ? { sub } : {}), label: 'Review', tone: 'wait', section: 'binh-luan' })
  }
  const photos = t.waitingPhotos && !isFailed(t.waitingPhotos) ? t.waitingPhotos : []
  if (photos.length) {
    const sub = named(photos.flatMap(p => (p.ref ? [p.ref] : [])))
    out.push({ kind: 'photos', text: `${n(photos.length, 'reader photo')} to approve`, ...(sub ? { sub } : {}), label: 'Review', tone: 'wait', section: 'anh-ban-doc', photos: photos.slice(0, 4).map(p => p.id) })
  }
  return out
}

/** A page by its title, and its language when it isn't Vietnamese: "Cá betta (cá xiêm)", "Ikan neon (Indonesian)". */
const titled = (x: { path: string; title: string }) => `${x.title}${langOfPath(x.path) === 'vi' ? '' : ` (${LANG_NAME[langOfPath(x.path)]})`}`
/** The pages a need is on, by D1's keys: the first three this build names, each once, then how many more. */
function pageNames(t: Today, refs: string[]): string {
  if (isFailed(t.content)) return ''
  const byRef = pagesByRef(t.content)
  const names = [...new Set(refs.flatMap(r => (byRef.get(r) ? [titled(byRef.get(r)!)] : [])))]
  return [...names.slice(0, 3), ...(names.length > 3 ? [`${fmt(names.length - 3)} more`] : [])].join(' · ')
}

/**
 * The owner's newest decision: a comment shown or hidden, a reader photo approved or removed (data.ts ownerActs), or a
 * page hidden (its time kept with it). Null when none is kept, or none could be read.
 */
export function lastActionOf(t: Today): LastAction | null {
  const tz = t.tz ?? HOME_TZ
  const pages = isFailed(t.content) ? undefined : pagesByRef(t.content)
  const byPath = isFailed(t.content) ? undefined : pageIndex(t.content)
  const on = (ref: string) => (pages?.get(ref) ? ` on ${titled(pages.get(ref)!)}` : '')
  const said: Record<OwnerAct['kind'], [(ref: string) => string, string]> = {
    'comment-shown': [ref => `You showed a comment${on(ref)}`, 'binh-luan'], 'comment-hidden': [ref => `You hid a comment${on(ref)}`, 'binh-luan'],
    'photo-approved': [ref => `You approved a reader photo${on(ref)}`, 'anh-ban-doc'], 'photo-removed': [ref => `You removed a reader photo${on(ref)}`, 'anh-ban-doc'],
  }
  // A page hidden by its title; one this build doesn't have (gone since) by its address.
  const hid = (path: string) => (byPath?.get(path) ? `You hid the page ${titled(byPath.get(path)!)}` : `You hid the page at ${path}`)
  const all = [
    ...(isFailed(t.acts) ? [] : t.acts.map(a => ({ at: a.at, text: said[a.kind][0](a.ref), section: said[a.kind][1] }))),
    ...(isFailed(t.hidden) ? [] : Object.entries(t.hidden).map(([path, v]) => ({ at: v.at, text: hid(path), section: 'an-trang' }))),
  ].filter(a => Number.isFinite(Date.parse(a.at)) && Date.parse(a.at) <= t.now.getTime())
  const last = all.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]
  return last ? { title: 'Your last action', text: last.text, when: clock(last.at, tz, t.now), at: new Date(last.at).toISOString(), section: last.section } : null
}
/** What waits on the owner, by its items (two comments, two photos). */
const toReview = (t: Today) => (isFailed(t.held) ? 0 : t.held) + (t.waitingPhotos && !isFailed(t.waitingPhotos) ? t.waitingPhotos.length : 0)

/** Readers who found an answer this week, by day, Monday to Sunday: the chart, and what a tap on a bar says. */
function answersChart(w: WeekByDay): { chart: DayChart; also: Series[] } {
  return {
    chart: {
      id: 'answers', title: 'Found an answer, by day', days: w.days, today: w.today,
      series: [{ label: 'Found an answer', values: w.answered }], empty: 'No readers counted this week yet.',
    },
    also: [{ label: 'Readers', values: w.readers }, { label: 'Shop clicks', values: w.shop }],
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
      if (calls) parts.push(`${n(calls, 'fish ID call')} (${usd(at(d.usd, back))})`)
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
    const title = back === 0 ? 'Today so far' : back === 1 ? 'Yesterday' : `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekdayOf(day)]} ${dayLabel(day)}`
    return { title, figure: r ? n(at(r.readers, back), 'reader') : '—', text: parts.join(' · ') || 'Nothing else', ...(r ? { section: 'doc-gia' } : {}) }
  })
}

/** Each page's figure: what waits on the owner there, a fault, else its main figure. */
function figureOf(key: string, t: Today, w: WeekByDay | undefined): { text: string; tone: TextTone } {
  const tz = t.tz ?? HOME_TZ
  const plain = (text: string) => ({ text, tone: 'plain' as const })
  const failed = { text: 'Couldn’t load', tone: 'bad' as const }
  const sevenDays = (vals: number[]) => {
    const chip = chipText(ago(vals, 7, 1), ago(vals, 14, 8))
    return plain(`${fmt(ago(vals, 7, 1))}${chip ? ` · ${chip.text}` : ''}`)
  }
  // This week so far against the same point last week: what the answers card says (docs/design: Readers "169 · +2%").
  const week = (now: number, before: number | undefined) => {
    const d = before === undefined ? undefined : changeOf(deltaOf({ now, before, vs: 'the same point last week' }).text)
    return plain(`${fmt(now)}${d ? ` · ${d.change}` : ''}`)
  }
  switch (key) {
    case 'thanh-cong': return w ? plain(n(w.now.answered, 'answer')) : failed
    case 'doc-gia': return w ? week(w.now.readers, w.lastSoFar?.readers) : isFailed(t.readers) ? failed : sevenDays(alignDaily(lastDays(t.now, 31, tz), t.readers).readers)
    case 'affiliate': return w ? week(w.now.shop, w.lastSoFar?.shop) : isFailed(t.clicks) ? failed : sevenDays(t.clicks.clicks)
    case 'noi-dung': {
      if (isFailed(t.content)) return failed
      const c = t.content
      const human = c.engine?.needsHuman.length ?? 0
      return human ? { text: `${fmt(human)} to fix`, tone: 'bad' } : plain(n(MAIN.reduce((k, x) => k + (c.inventory[x]?.total ?? 0), 0), 'page'))
    }
    case 'muon-co': return isFailed(t.wanted) ? failed : plain(`${n(t.wanted.names.length, 'name')}${t.wanted.more ? '+' : ''}`)
    case 'an-trang': return isFailed(t.hidden) ? failed : plain(fmt(Object.keys(t.hidden).length))
    case 'binh-luan': return isFailed(t.held) ? failed : t.held ? { text: `${fmt(t.held)} held`, tone: 'wait' } : plain('None held')
    case 'anh-ban-doc': {
      const waiting = t.waitingPhotos && !isFailed(t.waitingPhotos) ? t.waitingPhotos.length : 0
      if (waiting) return { text: `${fmt(waiting)} waiting`, tone: 'wait' }
      return isFailed(t.photos) ? failed : plain(`${fmt(t.photos)} shown`)
    }
    case 'tai-khoan': return isFailed(t.accounts) ? failed : plain(`${fmt(ago(t.accounts.newUsers, 6, 0))} new`)
    case 'nhan-dien-ca': {
      if (isFailed(t.keys)) return failed
      const off = t.keys?.rows.filter(r => r.state !== 'ok').length ?? 0
      if (off && off === t.keys?.rows.length) return { text: `${n(off, 'key')} resting`, tone: 'bad' }
      const week = fishWeek(t)
      return week ? plain(n(week.calls, 'call')) : failed
    }
    case 'anh-nhan-dien': return t.kept === undefined ? { text: 'Off', tone: 'muted' } : isFailed(t.kept) ? failed : plain(fmt(t.kept))
    case 'ung-dung': return isFailed(t.crashes) ? failed : t.crashes ? { text: n(t.crashes, 'crash', 'crashes'), tone: 'bad' } : plain('0 crashes')
    case 'bao-cao': {
      if (isFailed(t.lastReport)) return failed
      if (!t.lastReport) return { text: 'None yet', tone: 'muted' }
      return t.lastReport.sent ? plain(`sent ${hourMinute(t.lastReport.when, tz)}`) : { text: 'not sent', tone: 'bad' }
    }
    case 'thay-doi': return isFailed(t.changes) ? failed : plain(`${fmt(shippedLines(t).length)} in 24 h`)
    default: return plain('')
  }
}

export function todayJson(t: Today): TodayJson {
  const w = isFailed(t.beacon) ? undefined : weekByDay(t.now, t.beacon, t.countingFrom)
  const needs = needsOf(t)
  const pub = publishingOfToday(t)
  // Held comments and waiting photos one by one, and a day's AI spend near its cap: what waits on the owner.
  const review = toReview(t) + needs.filter(x => x.kind === 'spend').length
  const fix = needs.filter(x => x.tone === 'bad').length
  const lines = shippedLines(t)
  const week = fishWeek(t)
  // The 30 whole days to yesterday: the Fish ID section's "30 days".
  const thirty = isFailed(t.fish) ? undefined : t.fish.periods.d30
  const a = w ? answersChart(w) : undefined
  const bars = a ? barWords(a.chart, a.also) : undefined
  // This week so far against the same point last week, as the scoreboard compares them.
  const fig = (label: string, now: number, before: number | undefined, o: { sub?: string; good?: 'up' } = {}): Figure => ({
    label, value: fmt(now), ...(o.sub ? { sub: o.sub } : {}),
    ...(before === undefined ? {} : { delta: deltaJson({ now, before, vs: 'the same point last week', ...(o.good ? { good: o.good } : {}) }) }),
  })
  const last = w?.lastSoFar ?? undefined
  const keys = ((): TodayJson['costs']['keys'] => {
    const k = { label: 'Anthropic keys', section: 'nhan-dien-ca', anchor: 'key' }
    if (isFailed(t.keys)) return { ...k, text: 'Couldn’t read their state', tone: 'bad' }
    if (!t.keys) return { ...k, text: 'None set: fish ID is off', tone: 'bad' }
    const off = t.keys.rows.filter(r => r.state !== 'ok').length
    return { ...k, text: off ? `${fmt(off)} of ${fmt(t.keys.rows.length)} resting` : `${fmt(t.keys.rows.length)} working`, tone: off && off === t.keys.rows.length ? 'bad' : 'plain' }
  })()
  const byArea = (['site', 'app', 'engine'] as const).map(x => [x, lines.filter(l => l.area === x).length] as const).filter(([, k]) => k)
  return {
    asOf: t.now.toISOString(),
    tiles: [
      { key: 'needs', label: 'Needs you', value: needs.length ? fmt(review + fix) : 'All clear', sub: needs.length ? [review ? `${fmt(review)} to review` : '', fix ? `${fmt(fix)} to fix` : ''].filter(Boolean).join(' · ') : 'Nothing to review or fix', tone: fix ? 'bad' : review ? 'wait' : 'good' },
      w && a && bars
        ? { key: 'answers', label: 'Found an answer', value: fmt(w.now.answered), sub: 'This week so far', ...(last ? { delta: deltaJson({ now: w.now.answered, before: last.answered, vs: 'last week', good: 'up' }) } : {}), bars: { days: w.days, values: w.answered, readouts: bars.readouts, today: w.today } }
        : { key: 'answers', label: 'Found an answer', value: '—', sub: failedText('the readers’ beacon'), tone: 'bad' },
      { key: 'shipped', label: 'Shipped in 24 hours', value: isFailed(t.changes) ? '—' : fmt(lines.length), sub: isFailed(t.changes) ? failedText('the changelog') : byArea.length ? byArea.map(([x, k]) => `${fmt(k)} ${x}`).join(' · ') : 'Nothing new', ...(isFailed(t.changes) ? { tone: 'bad' as const } : {}) },
      week
        ? { key: 'cost', label: 'Fish ID cost, this week', value: usd(week.usd), sub: n(week.calls, 'Claude call') }
        : { key: 'cost', label: 'Fish ID cost, this week', value: '—', sub: failedText('the fish ID log'), tone: 'bad' },
    ],
    needs,
    needsEmpty: 'Nothing needs you right now',
    lastAction: lastActionOf(t),
    answers: w && a
      ? {
        title: 'Readers who found an answer',
        figure: fig('Found an answer', w.now.answered, last?.answered, { sub: 'This week so far', good: 'up' }),
        chart: chart(a.chart, a.also),
        figures: [fig('Readers', w.now.readers, last?.readers, { good: 'up' }), fig('Sessions', w.now.sessions, last?.sessions), fig('Shop clicks', w.now.shop, last?.shop, { good: 'up' })],
      }
      : { title: 'Readers who found an answer', note: badNote(`${failedText('the readers’ beacon')}: ${(t.beacon as { failed: string }).failed}`) },
    shipped: {
      title: 'Shipped in 24 hours', lines, section: 'thay-doi', link: `Changelog · ${fmt(lines.length)} in 24 h`,
      ...(isFailed(t.changes) ? { note: badNote(`${failedText('the changelog')}: ${t.changes.failed}`) } : lines.length ? {} : { empty: 'Nothing shipped in the last 24 hours.' }),
    },
    costs: {
      title: 'Costs',
      lines: [
        week ? { label: 'Fish ID, this week', value: usd(week.usd), sub: n(week.calls, 'Claude call') } : { label: 'Fish ID, this week', value: '—', sub: failedText('the fish ID log') },
        thirty ? { label: 'Fish ID, 30 days', value: usd(thirty.usd), sub: n(thirty.calls, 'Claude call') } : { label: 'Fish ID, 30 days', value: '—', sub: failedText('the fish ID log') },
      ],
      keys,
      fixed: ['Engine: Claude subscription, flat', 'Cloudflare: fixed plan'],
      note: 'Only fish ID is counted so far',
    },
    pages: PAGE_GROUPS.map(([name, pages]) => ({ name, pages: pages.map(([key, page]) => ({ key, name: page, figure: figureOf(key, t, w) })) })),
    days: daysOf(t),
    ...(pub ? { publishing: pub } : {}),
  }
}

// ——— The web's overview: the app's first screen (Design's board2, 14 Nov; the cards' parts, 15 Nov), in the web's frame ———

const placeHref = (p: { section?: string; anchor?: string; url?: string }) => p.url ?? `/_ab/${p.section}/${p.anchor ? `#${p.anchor}` : ''}`
/** A change's figure and what it's against: "−12%" and "vs the same point last week" (none for a change from nothing). */
const changeOf = (text: string) => {
  const m = /^([+−±]\S+) (vs .+)$/.exec(text)
  return m ? { change: m[1]!, vs: m[2]! } : undefined
}
/** The rows of what needs the owner the card shows; the rest open under "N more" (the app's `needsShown`, which opens a page of them). */
export const NEEDS_SHOWN = 3
const FULL_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n))
/** A count as the server writes a total ("2,503"); undefined for anything else. */
const countOf = (s: string) => (/^\d[\d,]*$/.test(s) ? Number(s.replace(/,/g, '')) : undefined)
/** The last seven days of a kind's bars, up to today (or the last). */
const weekOf = (b: PublishingBars) => { const end = (b.today ?? b.values.length - 1) + 1; return [Math.max(0, end - 7), end] as const }
/** What a kind has added today so far; undefined when today isn't among its bars, or wasn't counted. */
const addedToday = (b: PublishingBars) => (b.today === undefined ? undefined : b.values[b.today] ?? undefined)
/** A bar's day, "2026-11-08", as "Sun 8". */
const barDay = (d: string) => `${SHORT_DAY[weekdayOf(d)]} ${+d.slice(8, 10)}`

/**
 * A card's seven days as small bars (pages-spec "Small bars"): the latest in the chart green, the others grey; a zero a
 * 2-high tick, red on a day that's over, grey on the day still open; a day not counted a dotted line, never a zero. No
 * readout: the card opens its page.
 */
export function smallBars(values: (number | null)[], open?: number): string {
  const high = Math.max(1, ...values.filter((v): v is number => v !== null))
  const bar = (v: number | null, i: number) => {
    if (v === null) return '<i class="none"></i>'
    if (v <= 0) return `<i class="zero${i === open ? ' open' : ''}"></i>`
    return `<i${i === values.length - 1 ? ' class="on"' : ''} style="--h:${Math.max(8, Math.round((v / high) * 100))}%"></i>`
  }
  return `<span class="sb" aria-hidden="true">${values.map(bar).join('')}</span>`
}

/**
 * A card: its name, a link to its page that covers the whole card, and a chevron, then what it shows. Its words are
 * read in order; the drawn bars aren't.
 */
const card = (id: string, name: string, href: string | undefined, body: string, cls = '') =>
  `<section class="card${cls ? ` ${cls}` : ''}" aria-labelledby="${id}"><h2 id="${id}">${href ? `<a href="${esc(href)}">${name}</a>${ICON.chevron}` : name}</h2>${body}</section>`

/** A change's figure ("+12%", its first word) in its tone, the rest muted; what it's against stays for a screen reader. */
const changeHtml = (d: NonNullable<Figure['delta']>) => {
  const [first, ...rest] = d.text.split(' ')
  return `<span class="chg${d.tone === 'good' || d.tone === 'bad' ? ` ${d.tone}` : ''}">${esc(first!)}</span>${rest.length ? ` ${esc(rest.join(' '))}` : ''}`
}

export function todayPage(t: Today): string {
  const j = todayJson(t)
  const tz = t.tz ?? HOME_TZ
  const tile = (k: TileJson['key']) => j.tiles.find(x => x.key === k)
  // What needs the owner, faults first, each a dot in its tone, its line, and the pages it's on; the whole row is its
  // link. Three, then the rest under "N more" in the same card: the web has no page of them, as the app has.
  const row = (x: Need) => `<li class="${x.tone}"><a href="${esc(placeHref(x))}"><span class="dot" aria-hidden="true"></span><span class="tx"><b>${esc(x.text)}</b>${x.sub ? `<span class="sub">${esc(x.sub)}</span>` : ''}</span>${ICON.chevron}</a></li>`
  // A source behind a browser check waits on the owner's hand, not a fault: rust, as what waits (the Design Lead, 20 Nov,
  // on her ruling of 9 Nov), and faults first, then what waits. The web's first screen only: the app follows in its own
  // change, so what the app gets (needsOf) is as it was.
  const checks = new Set(todos(t).filter(x => x.kind === 'engine').map(x => x.title))
  const toned = j.needs.map(x => (x.kind === 'engine' && checks.has(x.text) ? { ...x, tone: 'wait' as const } : x))
  const shown = [...toned.filter(x => x.tone === 'bad'), ...toned.filter(x => x.tone !== 'bad')]
  const tileTone = tile('needs')?.tone ?? 'plain'
  const needsTone = !shown.length ? 'good' : shown.some(x => x.tone === 'bad') ? 'bad' : tileTone === 'bad' ? 'wait' : tileTone
  const more = shown.length - NEEDS_SHOWN
  const needs = card('needs', `${needsTone === 'good' ? ICON.check : needsTone === 'plain' ? '' : ICON.alert}<span>${esc(tile('needs')?.label ?? 'Needs you')}</span>${j.needs.length ? ` <span class="count">· ${fmt(j.needs.length)}</span>` : ''}`, undefined,
    j.needs.length
      ? `<ul class="nrows">${shown.slice(0, NEEDS_SHOWN).map(row).join('')}</ul>${more > 0 ? `<details class="more"><summary>${fmt(more)} more${ICON.chevron}</summary><ul class="nrows">${shown.slice(NEEDS_SHOWN).map(row).join('')}</ul></details>` : ''}`
      : `<p class="clear">${esc(j.needsEmpty)}</p>${j.lastAction ? `<p class="last"><a href="/_ab/${j.lastAction.section}/">${esc(j.lastAction.text)}</a> · <time datetime="${j.lastAction.at}">${esc(j.lastAction.when)}</time></p>` : ''}`,
    `needs ${needsTone}`)
  // New pages by kind: the kinds' totals added up and what today has added so far, then a line a kind: its name, its last
  // seven days, its total and today's.
  const p = j.publishing
  const pages = (() => {
    if (!p) return ''
    const totals = p.kinds.map(k => countOf(k.total))
    const total = totals.every(x => x !== undefined) ? totals.reduce((a, b) => a! + b!, 0)! : undefined
    const todays = p.kinds.map(k => addedToday(k.bars)).filter((x): x is number => x !== undefined && x !== null)
    const today = todays.length ? todays.reduce((a, b) => a + b, 0) : undefined
    const plus = (n: number | undefined) => (n === undefined ? '<span class="t"></span>' : `<span class="t${n > 0 ? ' good' : ''}">${esc(signed(n))}</span>`)
    const first = p.kinds[0]?.bars
    const [from, to] = first ? weekOf(first) : [0, 0]
    const rows = byBoard(p.kinds).map(k => {
      const [a, b] = weekOf(k.bars)
      const open = k.bars.today !== undefined && k.bars.today >= a && k.bars.today < b ? k.bars.today - a : undefined
      return `<span class="k">${esc(BOARD_ROW[k.key] ?? k.label)}</span>${smallBars(k.bars.values.slice(a, b), open)}<b class="n">${esc(k.total)}</b>${plus(addedToday(k.bars) ?? undefined)}`
    }).join('')
    const axis = first ? `<span class="k cap" aria-hidden="true">written a day</span><span class="days" aria-hidden="true"><span>${esc(barDay(first.days[from]!))}</span><span>${esc(barDay(first.days[to - 1]!))}</span></span>` : ''
    return card('content', 'Content · pages written', '/_ab/noi-dung/', `<p class="top">${total === undefined ? '' : `<b class="fig">${esc(fmt(total))}</b> written`}${today === undefined ? '' : ` <span class="today">${plus(today)} today</span>`}</p><div class="kinds">${rows}${axis}</div>`)
  })()
  // Readers this week against the same point last week, in the board's words (the Design Lead, 20 Nov): "+100% vs 7 by
  // now last week". The app's JSON keeps its own. With none by now last week, the plain change; without them, why not.
  const rf = j.answers.figures?.find(f => f.label === 'Readers')
  const at = tile('answers')
  const w = isFailed(t.beacon) ? undefined : weekByDay(t.now, t.beacon, t.countingFrom)
  const before = w?.lastSoFar?.readers
  const rd = rf?.delta && w && before ? deltaJson({ now: w.now.readers, before, vs: `${fmt(before)} by now last week`, good: 'up' }) : rf?.delta
  // Its page is Readers; with the beacon failed, the scoreboard, whose page has the error, as Needs you's row says (#1689's
  // reader, 21 Nov: Readers runs other queries and can load while the beacon doesn't).
  const readers = card('readers', esc(rf?.label ?? 'Readers'), isFailed(t.beacon) ? '/_ab/thanh-cong/' : '/_ab/doc-gia/', `<p class="fig">${esc(rf?.value ?? at?.value ?? '—')}</p>${rf
    ? `<p class="line">this week${rd ? ` · ${changeHtml(rd)}` : ''}</p>${rf.sub ? `<p class="line">${esc(rf.sub)}</p>` : ''}`
    : at ? `<p class="line${at.tone === 'bad' || at.tone === 'wait' ? ` ${at.tone}` : ''}">${esc(at.sub)}</p>` : ''}`)
  // Changes shipped in the last 24 hours, by where, and the newest in its words. The board's name and split (the Design
  // Lead, 20 Nov): "Shipped, 24 h", "site 32 · app 9 · engine 38". The app's tile keeps its own.
  const st = tile('shipped')
  const newest = j.shipped.lines[0]?.text
  const areas = (['site', 'app', 'engine'] as const).map(x => [x, j.shipped.lines.filter(l => l.area === x).length] as const).filter(([, k]) => k)
  const split = st && st.tone !== 'bad' && areas.length ? areas.map(([x, k]) => `${x} ${fmt(k)}`).join(' · ') : st?.sub
  const shipped = card('shipped', 'Shipped, 24 h', `/_ab/${j.shipped.section}/`, `${st ? `<p class="fig">${esc(st.value)}</p><p class="line${st.tone === 'bad' ? ' bad' : ''}">${esc(split ?? '')}</p>` : ''}${newest ? `<p class="newest">${esc(newest)}</p>` : ''}`)
  // What the server counts of the cost, on one row: its figure and what it's made of. Opens the keys' page.
  const ct = tile('cost')
  const cost = ct ? `<section class="card cost" aria-labelledby="cost"><h2 id="cost"><a href="/_ab/${j.costs.keys.section}/"><span>${esc(ct.label)}</span> <b class="${ct.tone === 'bad' ? 'bad' : ''}">${esc(ct.value)}</b> <span class="line">${esc(ct.sub)}</span></a>${ICON.chevron}</h2></section>` : ''
  const groups = `<div class="groups">${j.pages.map(g => `<section><h3>${esc(g.name)}</h3><ul>${g.pages.map(x => `<li><a href="/_ab/${x.key}/"><span>${esc(x.name)}</span><span class="fig${x.figure.tone === 'wait' || x.figure.tone === 'bad' ? ` ${x.figure.tone}` : ''}">${esc(x.figure.text)}</span></a></li>`).join('')}</ul></section>`).join('')}</div>`
  const day = localDay(t.now, tz)
  const body = `<h1>Today</h1><p class="lede">${FULL_DAY[weekdayOf(day)]} ${dayLabel(day)} · figures as of ${hourMinute(t.now, tz)}</p>
<div class="first-screen"><div>${needs}${pages}</div><div><div class="pair">${readers}${shipped}</div>${cost}</div></div>
<section aria-labelledby="pages"><h2 id="pages">Every page</h2>${groups}</section>`
  return page('/_ab/', 'Today', body, t.now, tz)
}
