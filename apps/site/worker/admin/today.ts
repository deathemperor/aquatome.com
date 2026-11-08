import type { Change } from '../daily/github'
import type { ReportMeta } from '../daily/log'
import { chart, deltaJson, type Block, type Figure, type TextTone } from './blocks'
import { barWords, chipOf, dayChart, dayLabel, dayName, esc, fmt, lastDays, spark, usd, weekdayOf, type DayChart, type Readout, type Series } from './chart'
import { HIDDEN_BY_OWNER, SHOWN_BY_OWNER } from './comments'
import { pagesByRef } from './content'
import { MAIN } from './content-page'
import { fishSpan, periodTotals } from './fishid'
import { ago, alignDaily, didntLoad, placeOf, todos, type Overview } from './pages'
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
  /** Readers' photos waiting, newest first; undefined where readers' photos are off. */
  waitingPhotos: Soft<{ id: string }[]> | undefined
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
}

const DAY_MS = 86_400_000
const n = (x: number, one: string, many = `${one}s`) => `${fmt(x)} ${x === 1 ? one : many}`
const failedText = (what: string) => `Couldn’t load ${what}`
const badNote = (text: string): NoteBlock => ({ kind: 'note', text, tone: 'bad' })
/** "+18%" against the 7 days before: as the old overview's chips, coloured past 5%. */
const chipText = (now: number, before: number) => chipOf(now, before, 'the 7 days before', 'up')

/** The pages' groups, their names, and the sections they open: the rail's order (shell.ts NAV). */
export const PAGE_GROUPS: readonly (readonly [string, readonly (readonly [string, string])[]])[] = [...new Set(NAV.map(([, , g]) => g).filter(Boolean))]
  .map(g => [g, NAV.filter(([, , x]) => x === g).map(([path, name]) => [path.slice('/_ab/'.length, -1), name] as const)] as const)

/** This week's fish ID calls and cost, Monday to now in the viewer's zone: the Fish ID section's "This week", the same sum. */
function fishWeek(t: Today): { calls: number; usd: number } | undefined {
  if (isFailed(t.fish)) return undefined
  const { now } = periodTotals(t.fish, fishSpan('week', t.now, t.tz ?? HOME_TZ))
  return { calls: now.calls, usd: now.usd }
}

/** What needs the owner, faults first: the overview's to-dos, then the comments held and the photos waiting. Each title one short line. */
export function needsOf(t: Today): Need[] {
  const out: Need[] = todos(t).map(x => ({ kind: x.kind, text: x.title, sub: x.text, label: x.action, tone: x.kind === 'spend' ? 'wait' as const : 'bad' as const, ...placeOf(x.href) }))
  for (const [what, part, section] of [['Readers’ beacon', t.beacon, 'thanh-cong'], ['Held comments', t.held, 'binh-luan'], ['Waiting photos', t.waitingPhotos, 'anh-ban-doc'], ['Kept photos', t.kept, 'anh-nhan-dien'], ['App crashes', t.crashes, 'ung-dung'], ['Daily reports', t.lastReport, 'bao-cao'], ['Changelog', t.changes, 'thay-doi']] as const) {
    if (isFailed(part)) out.push({ kind: 'failed', text: didntLoad(what), sub: 'Its page has the error.', label: 'Open', tone: 'bad', section })
  }
  if (!isFailed(t.held) && t.held) out.push({ kind: 'comments', text: `${n(t.held, 'comment')} held for review`, label: 'Review', tone: 'wait', section: 'binh-luan' })
  const photos = t.waitingPhotos && !isFailed(t.waitingPhotos) ? t.waitingPhotos : []
  if (photos.length) out.push({ kind: 'photos', text: `${n(photos.length, 'reader photo')} to approve`, label: 'Review', tone: 'wait', section: 'anh-ban-doc', photos: photos.slice(0, 4).map(p => p.id) })
  return out
}

/**
 * The owner's newest decision: a comment shown or hidden, a reader photo approved or removed (data.ts ownerActs), or a
 * page hidden (its time kept with it). Null when none is kept, or none could be read.
 */
export function lastActionOf(t: Today): LastAction | null {
  const tz = t.tz ?? HOME_TZ
  const pages = isFailed(t.content) ? undefined : pagesByRef(t.content)
  const on = (ref: string) => (pages?.get(ref) ? ` on ${pages.get(ref)!.title}` : '')
  const said: Record<OwnerAct['kind'], [(ref: string) => string, string]> = {
    'comment-shown': [ref => `Showed a comment${on(ref)}`, 'binh-luan'], 'comment-hidden': [ref => `Hid a comment${on(ref)}`, 'binh-luan'],
    'photo-approved': [ref => `Approved a reader photo${on(ref)}`, 'anh-ban-doc'], 'photo-removed': [ref => `Removed a reader photo${on(ref)}`, 'anh-ban-doc'],
  }
  const all = [
    ...(isFailed(t.acts) ? [] : t.acts.map(a => ({ at: a.at, text: said[a.kind][0](a.ref), section: said[a.kind][1] }))),
    ...(isFailed(t.hidden) ? [] : Object.entries(t.hidden).map(([path, v]) => ({ at: v.at, text: `Hid ${path}`, section: 'an-trang' }))),
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
  switch (key) {
    case 'thanh-cong': return w ? plain(n(w.now.answered, 'answer')) : failed
    case 'doc-gia': return isFailed(t.readers) ? failed : sevenDays(alignDaily(lastDays(t.now, 31, tz), t.readers).readers)
    case 'affiliate': return isFailed(t.clicks) ? failed : sevenDays(t.clicks.clicks)
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
        ? { key: 'answers', label: 'Found an answer', value: fmt(w.now.answered), sub: 'This week so far', ...(last ? { delta: fig('', w.now.answered, last.answered, { good: 'up' }).delta } : {}), bars: { days: w.days, values: w.answered, readouts: bars.readouts, today: w.today } }
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
  }
}

// ——— The web's overview: the same parts as the app's, drawn as docs/design/img/dash-web.png ———

const placeHref = (p: { section?: string; anchor?: string; url?: string }) => p.url ?? `/_ab/${p.section}/${p.anchor ? `#${p.anchor}` : ''}`
const deltaSpan = (d: NonNullable<Figure['delta']>) => `<span class="delta${d.tone === 'good' || d.tone === 'bad' ? ` ${d.tone}` : ''}">${esc(d.text)}</span>`
const figHtml = (f: Figure) => `<div class="kpi"><dt>${esc(f.label)}</dt><dd class="v">${esc(f.value)}</dd>${f.delta ? `<dd>${deltaSpan(f.delta)}</dd>` : ''}${f.sub ? `<dd class="sub">${esc(f.sub)}</dd>` : ''}</div>`
const noteHtml = (n: NoteBlock) => `<p class="${n.tone === 'bad' ? 'failed' : 'note'}">${esc(n.text)}</p>`
/** Where each tile leads on the page. */
const TILE_TO: Record<TileJson['key'], string> = { needs: 'needs', answers: 'answers', shipped: 'shipped', cost: 'costs' }

export function todayPage(t: Today): string {
  const j = todayJson(t)
  const tz = t.tz ?? HOME_TZ
  const tile = (x: TileJson) => {
    const bars = x.bars ? spark(x.bars.values, 7, { labels: x.bars.days.map(d => dayLabel(d)) }) : ''
    return `<div class="kpi${x.tone === 'wait' || x.tone === 'bad' ? ` ${x.tone}` : ''}"><dt><a href="#${TILE_TO[x.key]}">${esc(x.label)}</a></dt><dd class="v">${esc(x.value)}</dd>${bars ? `<dd>${bars}</dd>` : ''}${x.delta ? `<dd>${deltaSpan(x.delta)}</dd>` : ''}<dd class="sub">${esc(x.sub)}</dd></div>`
  }
  const needs = j.needs.length
    ? `<ul class="todo">${j.needs.map(x => `<li>${ICON.alert}<div><b>${esc(x.text)}</b>${x.sub ? `<p>${esc(x.sub)}</p>` : ''}${x.photos?.length ? `<span class="ph">${x.photos.map(id => `<img src="/_ab/anh/${esc(id)}" alt="" width="36" height="36" loading="lazy">`).join('')}</span>` : ''}</div><a class="act" href="${esc(placeHref(x))}">${esc(x.label)}</a></li>`).join('')}</ul>`
    : `<p class="clear panel">${ICON.check}${esc(j.needsEmpty)}</p>${j.lastAction ? `<p class="note last">${esc(j.lastAction.title)}: <a href="/_ab/${j.lastAction.section}/">${esc(j.lastAction.text)}</a> · <time datetime="${j.lastAction.at}">${esc(j.lastAction.when)}</time></p>` : ''}`
  const a = j.answers
  const answers = a.figure && a.chart
    ? `<dl class="kpis">${figHtml(a.figure)}</dl><div class="charts">${dayChart(a.chart as Extract<Block, { kind: 'chart' }>)}</div><dl class="kpis">${(a.figures ?? []).map(figHtml).join('')}</dl><p class="note">${ANSWERS_NOTE}</p>`
    : a.note ? noteHtml(a.note) : ''
  const sh = j.shipped
  const shipped = `${sh.lines.length ? `<ul class="ship">${sh.lines.map(l => `<li><span class="chip">${esc(l.label)}</span><span>${esc(l.text)}</span></li>`).join('')}</ul>` : sh.note ? noteHtml(sh.note) : `<p class="muted">${esc(sh.empty ?? '')}</p>`}<p><a href="/_ab/${sh.section}/">${esc(sh.link)} →</a></p>`
  const c = j.costs
  const costs = `<ul class="lines">${c.lines.map(l => `<li><span>${esc(l.label)}${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</span><span class="fig">${esc(l.value)}</span></li>`).join('')}<li><a href="${esc(placeHref(c.keys))}">${esc(c.keys.label)}</a><span class="fig${c.keys.tone === 'bad' ? ' bad' : ''}">${esc(c.keys.text)}</span></li>${c.fixed.map(f => `<li><span class="muted">${esc(f)}</span></li>`).join('')}</ul><p class="note">${esc(c.note)}</p>`
  const days = `<ul class="lines">${j.days.map(d => `<li><span><b>${esc(d.title)}</b><small>${esc(d.text)}</small></span>${d.section ? `<a class="fig" href="/_ab/${d.section}/">${esc(d.figure)}</a>` : `<span class="fig">${esc(d.figure)}</span>`}</li>`).join('')}</ul>`
  const pages = `<div class="groups">${j.pages.map(g => `<section><h3>${esc(g.name)}</h3><ul>${g.pages.map(p => `<li><a href="/_ab/${p.key}/"><span>${esc(p.name)}</span><span class="fig${p.figure.tone === 'wait' || p.figure.tone === 'bad' ? ` ${p.figure.tone}` : ''}">${esc(p.figure.text)}</span></a></li>`).join('')}</ul></section>`).join('')}</div>`
  // The tile's count: the items to review and to fix, not the rows they're grouped in.
  const badge = j.needs.length ? ` <span class="badge">${esc(j.tiles[0]!.value)}</span>` : ''
  const body = `<h1>Today</h1><p class="lede">${esc(dayName(localDay(t.now, tz)))} · figures as of ${hourMinute(t.now, tz)}</p>
<dl class="kpis tiles4">${j.tiles.map(tile).join('')}</dl>
<div class="home-grid"><div>
<section aria-labelledby="needs"><h2 id="needs">Needs you${badge}</h2>${needs}</section>
<section aria-labelledby="answers"><h2 id="answers">${esc(a.title)}</h2>${answers}</section>
</div><div class="side">
<section aria-labelledby="shipped"><h2 id="shipped">${esc(sh.title)}</h2>${shipped}</section>
<section aria-labelledby="costs"><h2 id="costs">${esc(c.title)}</h2>${costs}</section>
<section aria-labelledby="days"><h2 id="days">The last three days</h2>${days}</section>
</div></div>
<section aria-labelledby="pages"><h2 id="pages">Every page</h2>${pages}</section>`
  return page('/_ab/', 'Today', body, t.now, tz)
}
const ANSWERS_NOTE = 'From search, then stayed 30 s or read half the page. Weeks run Monday to Sunday.'
