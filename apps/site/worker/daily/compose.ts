import { LANGS, OTHER_LANGS } from '@aq/schema/langs'
import { READERS_FROM } from '../admin/ae'
import { isEmpty, type AppDay } from '../admin/app'
import { chipOf, dayLabel, esc, lastDays } from '../admin/chart'
import { added, type EntityKind, type Snapshot } from '../admin/content'
import { inLang, items, perDay } from '../admin/content-page'
import { alignDaily, at, MODERATION_MISSED_MS, todos, waitingEn, type Overview } from '../admin/pages'
import { isFailed, REPORT_PATH, type Soft } from '../admin/shell'
import { clock, HOME_TZ } from '../admin/time'
import { REPO_URL, type GitHubSide, type Item, type Listed, type Runs } from './github'

/** Numbers as the report's English reads them, 2.1, 1,234, $0.11; the dashboard writes them the Vietnamese way (admin/chart.ts). */
export const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })
const usd = (n: number) => `$${fmt(n, n !== 0 && Math.abs(n) < 0.01 ? 4 : 2)}`

/**
 * The owner's daily report, from what the dashboard's loaders returned and what daily-report.yml sent: needs care first,
 * then the day's biggest moves, what was built, and the numbers. In English, which the owner reads it in; days and times
 * in Vietnam's zone, numbers as the dashboard writes them. No reader's data: comments, names they typed, addresses and
 * account ids aren't in what it prints, and any address that comes in with GitHub's text is cut on the way out (`cleaned`).
 * Links go only to aquatome.com and github.com. No pictures.
 */

/**
 * Every dashboard address the report prints, in one place: a /_ab/ path as the address to open from a mail. When the
 * dashboard moves to its own host, this line is the one to change.
 */
export const dashLink = (path: string) => `https://aquatome.com${path}`

/** A link the report may print: the dashboard's or this repository's. Anything else stays plain text. */
const linkOf = (href: string | undefined) => (!href ? undefined : href.startsWith('/_ab/') ? dashLink(href) : href.startsWith(REPO_URL) ? href : undefined)

/** Waiting this long, the moderation (hourly, on a Mac that can be queued for hours) has missed several runs. */
const QUEUE_LATE_MS = 6 * 3_600_000
/** Needs care lists this many; its count and the subject say them all. */
const CARE_SHOWN = 20
const PRS_SHOWN = 10
const HIGHLIGHTS = 5
/** A move smaller than this share of its baseline, or on counts under that, isn't a highlight. */
const MIN_MOVE = 0.2
const MIN_COUNT = 5

/** `n`: how many it stands for, when one line sums up several. */
export type Care = { title: string; text?: string; href?: string; n?: number }
/** A measure yesterday against the 7 whole days before it. `moves`: it may be a highlight. */
export type Stat = { label: string; value: number; base?: number; show?: (n: number) => string; note?: string; moves: boolean }
type Line = { text: string; href?: string }
type Built = { label: string; text: string; href?: string; lines?: Line[]; more?: number }
type Table = { head: string[]; rows: string[][] }

export type ComposeInput = { now: Date; overview: Overview; app: Soft<AppDay>; gh: GitHubSide }
export type Composed = { subject: string; text: string; html: string; care: number }

const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`
const runsText = (r: Runs) => `${plural(r.runs, 'run')}, ${fmt(r.failed)} failed`
const when = (t: Date | string, now: Date) => clock(t, HOME_TZ, now)
const careCount = (care: Care[]) => care.reduce((sum, c) => sum + (c.n ?? 1), 0)

/** What needs the owner, each with where to deal with it. */
export function needsCare({ now, overview: o, app, gh }: ComposeInput): Care[] {
  const out: Care[] = []
  for (const f of gh.failing) out.push({ title: `${f.workflow} is failing`, text: `${plural(f.failures, 'failed run')} since ${when(f.since, now)}, no success after.`, href: f.url })
  if (gh.missing.length) out.push({ title: 'GitHub did not give part of this report', text: `Missing: ${gh.missing.join(', ')}. The counts they feed may be low.`, href: gh.runUrl })
  for (const i of gh.issues.items) out.push({ title: `#${i.number} ${i.title}`, href: i.url })
  const moreIssues = gh.issues.total - gh.issues.items.length
  if (moreIssues > 0) out.push({ title: `${plural(moreIssues, 'more open issue')} from the workflows`, href: `${REPO_URL}issues?q=is%3Aissue+is%3Aopen+author%3Aapp%2Fgithub-actions`, n: moreIssues })
  // Past MODERATION_MISSED_MS, the overview's own to-do below says it.
  if (!isFailed(o.waiting) && o.waiting.oldest) {
    const age = now.getTime() - Date.parse(o.waiting.oldest)
    if (age > QUEUE_LATE_MS && age <= MODERATION_MISSED_MS) out.push({ title: 'Moderation is behind', text: `${waitingEn(o.waiting)} waiting since ${when(o.waiting.oldest, now)}.`, href: o.waiting.photos ? '/_ab/anh-ban-doc/' : '/_ab/tai-khoan/' })
  }
  for (const t of todos({ ...o, tz: HOME_TZ })) out.push({ title: t.en.title, text: t.en.text, href: t.href })
  if (isFailed(app)) out.push({ title: 'Could not load the app\'s telemetry', text: 'Its dashboard page has the error.', href: '/_ab/ung-dung/' })
  else {
    const crashes = app.versions.reduce((n, v) => n + v.crashes, 0)
    if (crashes) out.push({ title: `App: ${plural(crashes, 'crash', 'crashes')} in the last 24 hours`, text: app.versions.filter(v => v.crashes).map(v => `${v.version}: ${fmt(v.crashes)}`).join(', '), href: '/_ab/ung-dung/' })
  }
  return out
}

/** The mean of the 7 whole days before yesterday, in a list whose last value is today; undefined when none of them counts. */
const weekBefore = (vals: (number | null)[], counts: (back: number) => boolean = () => true) => {
  const xs = [2, 3, 4, 5, 6, 7, 8].filter(counts).map(back => vals[vals.length - 1 - back]).filter((x): x is number => typeof x === 'number')
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined
}
const avg = (n: number) => fmt(n, n < 10 ? 1 : 0)

/** Each measure yesterday (Vietnam's) against the 7 whole days before it: the site's table, and what the highlights pick from. */
export function siteStats(o: Overview, now: Date): Stat[] {
  const out: Stat[] = []
  const day = (label: string, vals: number[], extra: Partial<Stat> = {}, counts?: (back: number) => boolean) => out.push({ label, value: at(vals, 1), base: weekBefore(vals, counts), moves: true, ...extra })
  const month = lastDays(now, 31, HOME_TZ)
  if (!isFailed(o.readers)) {
    // The count starts at READERS_FROM: the days before it, and that day's part, are no baseline.
    const counted = (back: number) => month[month.length - 1 - back]! > READERS_FROM.slice(0, 10)
    const r = alignDaily(month, o.readers)
    day('Readers', r.readers, {}, counted)
    day('Sessions', r.sessions, {}, counted)
  }
  if (!isFailed(o.clicks)) day('Affiliate clicks', o.clicks.clicks)
  if (!isFailed(o.accounts)) {
    day('New accounts', o.accounts.newUsers)
    day('New comments', o.accounts.newComments)
  }
  if (!isFailed(o.wanted)) {
    const { names } = o.wanted
    day('New wanted names', month.map(d => names.filter(w => w.first === d).length))
  }
  if (!isFailed(o.snapshots)) {
    const kept = (label: string, pick: (t: Snapshot['totals']) => number) => {
      const vals = perDay(o.snapshots as Snapshot[], month, pick)
      const value = vals.at(-2)
      if (typeof value === 'number') out.push({ label, value, base: weekBefore(vals), moves: true })
    }
    kept('Pages added', items)
    kept('Pages translated', t => OTHER_LANGS.reduce((n, l) => n + inLang(t, l), 0))
  }
  if (!isFailed(o.fish)) {
    const d = o.fish.perDay
    day('Fish ID calls', d.ok.map((x, i) => x + d.none[i]!), { note: usd(at(d.usd, 1)) })
    day('Fish ID no answer', d.none)
    day('Fish ID blocked', d.blocked)
    day('Fish ID cost', d.usd, { show: usd, moves: false })
  }
  return out
}

/** The biggest moves first: how far each is from its baseline for a count that size. At most 5. */
export function highlights(stats: Stat[]): string[] {
  return stats
    .filter((s): s is Stat & { base: number } => s.moves && s.base !== undefined && Math.max(s.value, s.base) >= MIN_COUNT && Math.abs(s.value - s.base) >= MIN_MOVE * Math.max(s.base, 1))
    .map(s => ({ s, far: Math.abs(s.value - s.base) / Math.sqrt(Math.max(s.base, 1)) }))
    .sort((a, b) => b.far - a.far)
    .slice(0, HIGHLIGHTS)
    .map(({ s }) => `${s.label} ${fmt(s.value)}${s.note ? ` (${s.note})` : ''}: ${chipOf(s.value, s.base, '')?.text ?? ''} vs 7-day avg ${avg(s.base)}`)
}

const KIND_NAME: Record<EntityKind, string> = { fish: 'fish', breed: 'breeds', plant: 'plants', guide: 'guides', videoGuide: 'video guides', series: 'video series', glossary: 'glossary terms', equipment: 'equipment', place: 'places', product: 'products' }
const signed = (n: number) => `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}`
/** What the last snapshot added on the one before it, by kind and language; undefined with under two kept. */
function contentAdded(o: Overview): string | undefined {
  if (isFailed(o.snapshots) || o.snapshots.length < 2) return undefined
  const [before, last] = o.snapshots.slice(-2) as [Snapshot, Snapshot]
  const a = added(before.totals, last.totals)
  const kinds = (Object.keys(a.kinds) as EntityKind[]).flatMap(k => {
    const langs = LANGS.flatMap(l => (a.kinds[k][l] ? [`${l} ${signed(a.kinds[k][l])}`] : []))
    return langs.length ? [`${KIND_NAME[k]} ${langs.join(', ')}`] : []
  })
  const photos = [a.photos.pages ? `${signed(a.photos.pages)} on pages` : '', a.photos.gallery ? `${signed(a.photos.gallery)} in galleries` : ''].filter(Boolean)
  const what = [...kinds, ...(photos.length ? [`photos ${photos.join(', ')}`] : [])]
  return `Added ${dayLabel(before.day)} to ${dayLabel(last.day)}: ${what.length ? what.join('; ') : 'nothing'}.`
}

const itemLines = (l: Listed, n: number): Pick<Built, 'lines' | 'more'> => ({ lines: l.items.slice(0, n).map((i: Item) => ({ text: `#${i.number} ${i.title}`, href: i.url })), more: Math.max(0, l.total - Math.min(n, l.items.length)) })

function built({ now, overview: o, gh }: ComposeInput): Built[] {
  const live = gh.deploys.live
  const madeAt = !isFailed(o.content) && o.content.builtAt ? ` Build made ${when(o.content.builtAt, now)}.` : ''
  const parts = gh.commits.parts.map(p => `${p.name} ${fmt(p.n)}`).join(', ')
  const addedText = contentAdded(o)
  const tf = gh.testflight
  return [
    { label: 'Deploys', text: `${runsText(gh.deploys)}.${live ? ` Live: ${live.sha}, deployed ${when(live.at, now)}.` : ''}${madeAt}`, ...(live ? { href: live.url } : {}) },
    { label: 'Content pushes', text: `Engine: ${plural(gh.engine.runs, 'cycle')}, ${fmt(gh.engine.failed)} failed. ${plural(gh.commits.total, 'content commit')}${parts ? ` (${parts})` : ''}.`, lines: addedText ? [{ text: addedText }] : [] },
    { label: `Merged PRs (${fmt(gh.merged.total)})`, text: gh.merged.total ? '' : 'none.', ...itemLines(gh.merged, 50) },
    { label: 'App builds', text: `ios.yml: ${runsText(gh.ios)}. TestFlight: ${tf.uploads.length ? `${plural(tf.uploads.length, 'upload')} (build ${tf.uploads.map(u => u.build).join(', ')})` : 'no upload'}${tf.failed ? `, ${fmt(tf.failed)} failed` : ''}. App Store: ${runsText(gh.appStore)}.`, ...(tf.uploads[0] ? { href: tf.uploads[0].url } : {}) },
    { label: 'Live checks', text: `${runsText(gh.watch)}.${gh.notes ? ` ${plural(gh.notes, 'review note')} open.` : ''}` },
    { label: 'Open PRs', text: `${fmt(gh.prs.ready.total)} ready, ${fmt(gh.prs.draft.total)} draft.`, ...itemLines(gh.prs.ready, PRS_SHOWN) },
  ]
}

function siteTables(o: Overview, stats: Stat[]): Table[] {
  const rightNow: string[][] = []
  if (!isFailed(o.waiting)) rightNow.push(['Comments waiting', fmt(o.waiting.comments)], ['Photos waiting', fmt(o.waiting.photos)])
  if (!isFailed(o.accounts)) rightNow.push(['Accounts', fmt(o.accounts.users)])
  if (!isFailed(o.wanted)) rightNow.push(['Wanted names', `${fmt(o.wanted.names.length)}${o.wanted.more ? '+' : ''}`])
  if (!isFailed(o.photos)) rightNow.push(['Reader photos shown', fmt(o.photos)])
  const yesterday = stats.map(s => [s.label, s.show ? s.show(s.value) : fmt(s.value), s.base === undefined ? '—' : s.show ? s.show(s.base) : avg(s.base)])
  return [...(yesterday.length ? [{ head: ['Yesterday', 'Count', '7-day avg'], rows: yesterday }] : []), ...(rightNow.length ? [{ head: ['Now', 'Count'], rows: rightNow }] : [])]
}

const failures = (app: AppDay, name: string) => {
  const rows = app.actions.filter(a => a.name === name)
  const n = rows.reduce((sum, a) => sum + a.n, 0)
  return n ? `${fmt(n - rows.reduce((sum, a) => sum + a.ok, 0))} of ${fmt(n)}` : '0'
}
/** The app's table, or the one line it has before it sends anything. */
function appBlock(app: Soft<AppDay>): Table | string {
  if (isFailed(app)) return 'Could not load the app\'s telemetry.'
  if (isEmpty(app) && !app.sessions) return 'no app data yet'
  const sum = (k: 'crashes' | 'hangs' | 'exits') => fmt(app.versions.reduce((n, v) => n + v[k], 0))
  return { head: ['Last 24 hours', 'Count'], rows: [
    ['Sessions', fmt(app.sessions)], ['Crashes', sum('crashes')], ['Hangs', sum('hangs')], ['Abnormal exits', sum('exits')],
    ['Light connect failures', failures(app, 'light.connect')], ['Light write failures', failures(app, 'light.write')], ['Plug switch failures', failures(app, 'plug.switch')],
  ] }
}

// ——— Its two forms: one model, drawn as plain text and as HTML with inline styles, which is what Gmail on a phone keeps ———

type Model = { title: string; lede: string; count: number; care: Care[]; highlights: string[]; built: Built[]; site: Table[]; app: Table | string; footer: Line[] }

const textTable = (t: Table) => [`${t.head[0]}:`, ...t.rows.map(r => `  ${r[0]}: ${r[1]}${r[2] !== undefined ? ` (${t.head[2]} ${r[2]})` : ''}`)]
function toText(m: Model): string {
  const out = [m.title, m.lede, '', m.count ? `NEEDS CARE (${fmt(m.count)})` : 'NEEDS CARE: nothing']
  m.care.slice(0, CARE_SHOWN).forEach((c, i) => {
    out.push(`${i + 1}. ${c.title}${c.text ? `: ${c.text}` : ''}`)
    const href = linkOf(c.href)
    if (href) out.push(`   ${href}`)
  })
  if (m.care.length > CARE_SHOWN) out.push(`and ${fmt(m.care.length - CARE_SHOWN)} more`)
  out.push('', 'HIGHLIGHTS', ...(m.highlights.length ? m.highlights.map(h => `- ${h}`) : ['No big moves.']), '', 'BUILT (last 24 hours)')
  for (const b of m.built) {
    out.push(`${b.label}${b.text ? `: ${b.text}` : ''}`)
    const href = linkOf(b.href)
    if (href) out.push(`  ${href}`)
    for (const l of b.lines ?? []) out.push(`- ${l.text}${linkOf(l.href) ? ` ${linkOf(l.href)}` : ''}`)
    if (b.more) out.push(`- and ${fmt(b.more)} more`)
  }
  out.push('', 'SITE', ...m.site.flatMap(textTable), '', 'APP', ...(typeof m.app === 'string' ? [m.app] : textTable(m.app)), '', ...m.footer.map(l => `${l.text}: ${linkOf(l.href) ?? ''}`))
  return out.join('\n')
}

const FONT = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif"
const INK = '#1d2a22'
const MUTED = '#5a665e'
const RULE = '#d9d0bd'
const RUST = '#a0522d'
const MOSS = '#2f6b4f'
const LIST = 'margin:0;padding:0 0 0 20px'
const WRAP = 'overflow-wrap:anywhere'
const anchor = (text: string, href: string | undefined, bold = false) => {
  const link = linkOf(href)
  return link ? `<a href="${esc(link)}" style="color:${MOSS}${bold ? ';font-weight:600' : ''}">${esc(text)}</a>` : bold ? `<b>${esc(text)}</b>` : esc(text)
}
const h3 = (text: string, color = INK) => `<h3 style="display:block;font:600 17px/1.3 ${FONT};color:${color};margin:22px 0 8px">${esc(text)}</h3>`
function htmlTable(t: Table): string {
  const cell = (s: string, i: number, tag: 'th' | 'td') => `<${tag} style="padding:6px 8px 6px ${i ? '8px' : '0'};border-bottom:1px solid ${RULE};text-align:${i ? 'right' : 'left'};font-weight:${tag === 'th' ? 600 : 400};white-space:${i ? 'nowrap' : 'normal'}${tag === 'th' ? `;color:${MUTED};font-size:13px` : ''}">${esc(s)}</${tag}>`
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 14px;font-size:14px"><tr>${t.head.map((h, i) => cell(h, i, 'th')).join('')}</tr>${t.rows.map(r => `<tr>${r.map((c, i) => cell(c, i, 'td')).join('')}</tr>`).join('')}</table>`
}
function toHtml(m: Model): string {
  const more = m.care.length > CARE_SHOWN ? `<p style="margin:0;color:${MUTED}">and ${fmt(m.care.length - CARE_SHOWN)} more</p>` : ''
  const care = m.care.length
    ? `<ol style="${LIST}">${m.care.slice(0, CARE_SHOWN).map(c => `<li style="margin:0 0 8px;${WRAP}">${anchor(c.title, c.href, true)}${c.text ? `<br><span style="color:${MUTED}">${esc(c.text)}</span>` : ''}</li>`).join('')}</ol>${more}`
    : '<p style="margin:0">Nothing.</p>'
  const moves = m.highlights.length ? `<ul style="${LIST}">${m.highlights.map(h => `<li style="margin:0 0 6px">${esc(h)}</li>`).join('')}</ul>` : '<p style="margin:0">No big moves.</p>'
  const made = m.built.map(b => {
    const sub = [...(b.lines ?? []).map(l => anchor(l.text, l.href)), ...(b.more ? [`and ${fmt(b.more)} more`] : [])]
    return `<p style="margin:0 0 ${sub.length ? 4 : 10}px;${WRAP}"><b>${esc(b.label)}</b>${b.text ? `: ${esc(b.text)}` : ''}${linkOf(b.href) ? ` ${anchor('run', b.href)}` : ''}</p>${sub.length ? `<ul style="${LIST};margin-bottom:10px">${sub.map(s => `<li style="margin:0 0 4px;${WRAP}">${s}</li>`).join('')}</ul>` : ''}`
  }).join('')
  return `<div style="font:15px/1.5 ${FONT};color:${INK};background:#fff;max-width:640px;margin:0 auto;padding:16px">
<h2 style="display:block;font:600 21px/1.25 ${FONT};color:${INK};margin:0 0 4px">${esc(m.title)}</h2>
<p style="margin:0;color:${MUTED};font-size:13px">${esc(m.lede)}</p>
${h3(m.count ? `Needs care (${fmt(m.count)})` : 'Needs care', m.count ? RUST : INK)}${care}
${h3('Highlights')}${moves}
${h3('Built, last 24 hours')}${made}
${h3('Site')}${m.site.map(htmlTable).join('')}
${h3('App')}${typeof m.app === 'string' ? `<p style="margin:0">${esc(m.app)}</p>` : htmlTable(m.app)}
<p style="margin:22px 0 0;color:${MUTED};font-size:13px">${m.footer.map(l => anchor(l.text, l.href)).join(' · ')}</p>
</div>`
}

/**
 * What came in with someone's text (a PR title, say) goes no further than this: an address, or an address of another
 * site, which mail apps turn into a link by themselves.
 */
const ADDRESS = /[^\s<>"'(),;:]+@[^\s<>"'(),;:]+\.[A-Za-z]{2,}/g
const OTHER_SITE = /\b(?:https?:\/\/|www\.)(?!(?:[a-z0-9-]+\.)?aquatome\.com\b|github\.com\b)[^\s<>"'&]+/gi
const cleaned = (s: string) => s.replace(ADDRESS, '[address removed]').replace(OTHER_SITE, '[link removed]')

const SHORT_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: HOME_TZ })

export function compose(input: ComposeInput): Composed {
  const { now, overview: o, app, gh } = input
  const care = needsCare(input)
  const count = careCount(care)
  const day = SHORT_DAY.format(now)
  const stats = siteStats(o, now)
  const model: Model = {
    title: `AquaTome daily · ${day}`,
    lede: `Made ${when(now, now)}, Vietnam. GitHub: the last 24 hours. Site: yesterday, ${dayLabel(lastDays(now, 2, HOME_TZ)[0]!)}, against the 7 days before it.`,
    count, care,
    highlights: highlights(stats),
    built: built(input),
    site: siteTables(o, stats),
    app: appBlock(app),
    footer: [{ text: 'All reports', href: REPORT_PATH }, { text: 'This run', href: gh.runUrl }],
  }
  const subject = `AquaTome daily · ${day} · ${count ? `${fmt(count)} ${count === 1 ? 'needs' : 'need'} care` : 'nothing needs care'}`
  return { subject: cleaned(subject), text: cleaned(toText(model)), html: cleaned(toHtml(model)), care: count }
}
