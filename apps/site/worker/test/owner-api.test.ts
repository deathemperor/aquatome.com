import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse, type HTMLElement } from 'node-html-parser'
import { afterEach, expect, test, vi } from 'vitest'
import { handle, type Env } from '../index'
import { appPage, appSection, summariseApp } from '../admin/app'
import { paged, tablePage, type Action, type Block, type FormField, type Section } from '../admin/blocks'
import { chatReportsPage, chatReportsSection } from '../admin/chat-reports'
import { scoreboardPage, scoreboardSection, summariseScoreboard } from '../admin/scoreboard'
import { todayJson, todayPage, PAGE_GROUPS, type OwnerAct } from '../admin/today'
import { CHANGE_COLUMN, changelogPage, changelogSection } from '../daily/changelog'
import { dashboardJson } from '../owner-api'
import { commentsPage, commentsSection, cursorOf, EXPIRED, GONE, type CommentItem, type CommentsBlock, type CommentsData, type CommentState } from '../admin/comments'
import { moderationQueue } from '../comments/api'
import { contentPage, contentSection, type ContentPage } from '../admin/content-page'
import {
  accountsPage, accountsSection, affiliatePage, affiliateSection, fishIdPage, fishIdSection, hiddenPage, hiddenSection, keptPage, keptSection, overviewJson,
  photosPage, photosSection, readersPage, readersSection, wantedPage, wantedSection,
} from '../admin/pages'
import { ADMIN_PAGES, SECTIONS, sectionKey } from '../dashboard'
import { reportsPage, reportsSection, type ReportsData } from '../daily/page'
import { contract } from './contract'
import { testD1 } from './d1'
import { memoryR2 } from './r2'
import * as S from './owner-sample'

const { api, misfits, answer } = contract('owner-dashboard.openapi.json')
const VECTORS = fileURLToPath(new URL('../../../../protocols/owner-dashboard-vectors.json', import.meta.url).href)
const KEYS = SECTIONS.map(s => s.key)
const F = { failed: 'D1 down <b>' }

/** Each section's page and its blocks from the same data: the full sample first (the vectors' reply), then its other states. */
const VARIANTS: Record<string, [string, () => string, () => Section][]> = {
  'noi-dung': [
    ['sample', () => contentPage(S.CONTENT), () => contentSection(S.CONTENT)],
    ['failed', () => contentPage({ ...S.CONTENT, stats: F }), () => contentSection({ ...S.CONTENT, stats: F })],
    ['parts failed', () => contentPage({ ...S.CONTENT, reads: F, talk: F, clicks: F, snapshots: F, quality: F }), () => contentSection({ ...S.CONTENT, reads: F, talk: F, clicks: F, snapshots: F, quality: F })],
    ...(() => {
      const c = { ...S.CONTENT, tz: 'America/New_York', snapshots: [S.SNAPSHOTS[0]!], stats: { ...S.STATS, engine: null, sources: {}, gaps: {} }, reads: { ...S.READS, byKind: [], top: [], unread: { n: 0, byKind: {}, pages: [] }, elsewhere: { views: 0, paths: 0 } } }
      return [['empty, elsewhere', () => contentPage(c), () => contentSection(c)] as [string, () => string, () => Section]]
    })(),
    ...(() => {
      const v = (name: string, c: ContentPage): [string, () => string, () => Section] => [name, () => contentPage(c), () => contentSection(c)]
      return [
        v('out of search', S.LOW_CONTENT),
        v('out of search, no readers, elsewhere', { ...S.LOW_CONTENT, reads: F, tz: 'America/New_York' }),
        v('out of search, none', { ...S.LOW_CONTENT, low: { v: 1, bar: 0.75, pages: [] } }),
        v('out of search failed', { ...S.LOW_CONTENT, low: F }),
      ]
    })(),
  ],
  'doc-gia': [
    ['sample', () => readersPage(S.NOW, S.READERS, S.TZ), () => readersSection(S.NOW, S.READERS, S.TZ)],
    ['not set up', () => readersPage(S.NOW, undefined, S.TZ), () => readersSection(S.NOW, undefined, S.TZ)],
    ['failed', () => readersPage(S.NOW, F, S.TZ), () => readersSection(S.NOW, F, S.TZ)],
    ...(() => {
      const asks = { days: 14, rows: [{ cc: 'GB', shown: 5, picked: { vi: 2, id: 0, th: 1, ms: 0 } }, { cc: 'US', shown: 3, picked: { vi: 0, id: 0, th: 0, ms: 0 } }] }
      return [
        ['language chooser', () => readersPage(S.NOW, S.READERS, S.TZ, asks), () => readersSection(S.NOW, S.READERS, S.TZ, asks)],
        ['language chooser failed', () => readersPage(S.NOW, S.READERS, S.TZ, F), () => readersSection(S.NOW, S.READERS, S.TZ, F)],
      ] as [string, () => string, () => Section][]
    })(),
  ],
  'ung-dung': [
    ['sample', () => appPage(S.NOW, false, S.APP, S.TZ), () => appSection(false, S.APP)],
    ['test builds, none', () => appPage(S.NOW, true, summariseApp({ views: [], actions: [], errors: [], shops: [], health: [], perf: [] }, true), S.TZ), () => appSection(true, summariseApp({ views: [], actions: [], errors: [], shops: [], health: [], perf: [] }, true))],
    ['failed', () => appPage(S.NOW, false, F, S.TZ), () => appSection(false, F)],
  ],
  'thanh-cong': [
    ['sample', () => scoreboardPage(S.SCOREBOARD, S.TZ), () => scoreboardSection(S.SCOREBOARD)],
    ...(() => {
      const s = summariseScoreboard({ ...S.SCOREBOARD_INPUT, beacon: F, community: F, clicks: F, app: F, content: F, checks: F })
      return [['parts failed', () => scoreboardPage(s, S.TZ), () => scoreboardSection(s)] as [string, () => string, () => Section]]
    })(),
  ],
  'thay-doi': [
    ['sample', () => changelogPage({ now: S.NOW, tz: S.TZ, xs: S.CHANGES }), () => changelogSection({ now: S.NOW, tz: S.TZ, xs: S.CHANGES })],
    ['none, elsewhere', () => changelogPage({ now: S.NOW, tz: 'America/New_York', xs: [] }), () => changelogSection({ now: S.NOW, tz: 'America/New_York', xs: [] })],
    ['failed', () => changelogPage({ now: S.NOW, tz: S.TZ, xs: F }), () => changelogSection({ now: S.NOW, tz: S.TZ, xs: F })],
  ],
  'nhan-dien-ca': [
    ['sample', () => fishIdPage(S.FISH), () => fishIdSection(S.FISH)],
    ['30 days', () => fishIdPage(S.FISH_30), () => fishIdSection(S.FISH_30)],
    ...(['today', 'd7', 'month'] as const).map((k): [string, () => string, () => Section] => {
      const f = { ...S.FISH, stats: S.fishStats(k), period: k }
      return [k, () => fishIdPage(f), () => fishIdSection(f)]
    }),
    ['failed', () => fishIdPage({ ...S.FISH, stats: F, keys: F }), () => fishIdSection({ ...S.FISH, stats: F, keys: F })],
    ['no keys', () => fishIdPage({ ...S.FISH, keys: undefined }), () => fishIdSection({ ...S.FISH, keys: undefined })],
    ['bad key lines, elsewhere', () => fishIdPage({ ...S.FISH, tz: 'America/New_York', keys: { rows: [], bad: 2, today: 0, model: 'm', counts: { fallback: 0, callLimit: 0, later400: 0, facts: 0, refunds: 0, offTopic: 0 }, mostRefunds: 0, cap: 50, spend: [] } }), () => fishIdSection({ ...S.FISH, tz: 'America/New_York', keys: { rows: [], bad: 2, today: 0, model: 'm', counts: { fallback: 0, callLimit: 0, later400: 0, facts: 0, refunds: 0, offTopic: 0 }, mostRefunds: 0, cap: 50, spend: [] } })],
  ],
  'bao-sai': [
    ['sample', () => chatReportsPage(S.CHAT_REPORTS, S.NOW, S.TZ), () => chatReportsSection(S.CHAT_REPORTS, S.NOW, S.TZ)],
    ['none', () => chatReportsPage({ total: 0, rows: [] }, S.NOW, S.TZ), () => chatReportsSection({ total: 0, rows: [] }, S.NOW, S.TZ)],
    ['more than shown', () => chatReportsPage({ ...S.CHAT_REPORTS, total: 300 }, S.NOW, S.TZ), () => chatReportsSection({ ...S.CHAT_REPORTS, total: 300 }, S.NOW, S.TZ)],
    ['off', () => chatReportsPage(undefined, S.NOW, S.TZ), () => chatReportsSection(undefined, S.NOW, S.TZ)],
    ['failed', () => chatReportsPage(F, S.NOW, S.TZ), () => chatReportsSection(F, S.NOW, S.TZ)],
  ],
  'anh-nhan-dien': [
    ['sample', () => keptPage(S.KEPT, S.NOW, S.TZ), () => keptSection(S.KEPT, S.NOW, S.TZ)],
    ['none', () => keptPage([], S.NOW, S.TZ), () => keptSection([], S.NOW, S.TZ)],
    ['off', () => keptPage(undefined, S.NOW, S.TZ), () => keptSection(undefined, S.NOW, S.TZ)],
    ['failed', () => keptPage(F, S.NOW, S.TZ), () => keptSection(F, S.NOW, S.TZ)],
  ],
  affiliate: [
    ['sample', () => affiliatePage(S.CLICKS, S.AFF, S.NOW, S.TZ), () => affiliateSection(S.CLICKS, S.AFF, S.NOW, S.TZ)],
    ['empty, elsewhere', () => affiliatePage(S.CLICKS, { byNetwork: [], top: [], status: [], lastCheck: null }, S.NOW, 'Europe/Paris'), () => affiliateSection(S.CLICKS, { byNetwork: [], top: [], status: [], lastCheck: null }, S.NOW, 'Europe/Paris')],
    ['failed', () => affiliatePage(F, F, S.NOW, S.TZ), () => affiliateSection(F, F, S.NOW, S.TZ)],
  ],
  'muon-co': [
    ['sample', () => wantedPage(S.NOW, S.WANTED, S.TZ), () => wantedSection(S.NOW, S.WANTED, S.TZ)],
    ...(() => {
      const many = { names: Array.from({ length: 320 }, (_, i) => ({ ...S.WANTED.names[0]!, name: `Cá ${i}` })), more: true }
      return [['more than shown', () => wantedPage(S.NOW, many, S.TZ), () => wantedSection(S.NOW, many, S.TZ)] as [string, () => string, () => Section]]
    })(),
    ['failed', () => wantedPage(S.NOW, F, S.TZ), () => wantedSection(S.NOW, F, S.TZ)],
  ],
  'anh-ban-doc': [
    ['sample', () => photosPage(S.RECENT, S.WAITING, S.NOW, S.TZ), () => photosSection(S.RECENT, S.WAITING, S.NOW, S.TZ)],
    ['none', () => photosPage([], [], S.NOW, S.TZ), () => photosSection([], [], S.NOW, S.TZ)],
    ['off', () => photosPage(undefined, undefined, S.NOW, S.TZ), () => photosSection(undefined, undefined, S.NOW, S.TZ)],
    ['failed', () => photosPage(F, F, S.NOW, S.TZ), () => photosSection(F, F, S.NOW, S.TZ)],
  ],
  'an-trang': [
    ['sample', () => hiddenPage(S.HIDDEN, S.NOW, S.TZ), () => hiddenSection(S.HIDDEN, S.NOW, S.TZ)],
    ['none', () => hiddenPage({}, S.NOW, S.TZ), () => hiddenSection({}, S.NOW, S.TZ)],
    ['failed', () => hiddenPage(F, S.NOW, S.TZ), () => hiddenSection(F, S.NOW, S.TZ)],
  ],
  'binh-luan': (() => {
    const status = { held: 'held', shown: 'approved', hidden: 'removed' } as const
    const d = (state: CommentState, over: Partial<CommentsData> = {}): CommentsData =>
      ({ now: S.NOW, tz: S.TZ, state, list: { counts: S.COMMENT_COUNTS, rows: S.COMMENT_ROWS.filter(r => r.status === status[state]) }, pages: S.COMMENT_PAGES, week: S.COMMENT_WEEK, talk: S.TALK, ...over })
    const many = Array.from({ length: 50 }, (_, i) => ({ ...S.COMMENT_ROWS[0]!, id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, created_at: new Date(S.NOW.getTime() - i * 60_000).toISOString() }))
    const v = (name: string, c: CommentsData): [string, () => string, () => Section] => [name, () => commentsPage(c), () => commentsSection(c)]
    return [
      v('sample', d('held', { list: { counts: S.COMMENT_COUNTS, rows: S.COMMENT_ROWS.filter(r => r.status === 'held'), next: S.COMMENT_MORE } })),
      v('shown', d('shown')),
      v('hidden, one past its 30 days', d('hidden')),
      v('none', d('held', { list: { counts: { held: 0, shown: 0, hidden: 0 }, rows: [] }, week: { posted: 0, heldPosted: 0, reported: 0, hidden: 0 }, talk: { ...S.TALK, top: [] } })),
      v('more than 50', d('held', { list: { counts: { held: 80, shown: 20, hidden: 2 }, rows: many, next: cursorOf(many.at(-1)!) } })),
      v('no pages from the build, elsewhere', d('held', { pages: undefined, tz: 'America/New_York' })),
      v('failed', d('held', { list: F, week: F, talk: F })),
    ]
  })(),
  'tai-khoan': [
    ['sample', () => accountsPage(S.ACCOUNTS, S.NOW, S.TZ), () => accountsSection(S.ACCOUNTS, S.NOW, S.TZ)],
    ['failed', () => accountsPage(F, S.NOW, S.TZ), () => accountsSection(F, S.NOW, S.TZ)],
  ],
  'bao-cao': (() => {
    const r = (name: string, d: ReportsData): [string, () => string, () => Section] => [name, () => reportsPage(d), () => reportsSection(d)]
    return [
      r('sample', S.REPORTS),
      r('push on with no phone and no key, email off, none yet', { ...S.REPORTS, delivery: { settings: { email: false, push: true }, phones: 0, keyed: false }, xs: [] }),
      r('push on with phones but no key', { ...S.REPORTS, delivery: { settings: { email: true, push: true }, phones: 2, keyed: false } }),
      r('as before push, elsewhere', { ...S.REPORTS, tz: 'America/New_York', delivery: { settings: { email: true, push: false }, phones: 0, keyed: false } }),
      r('both off, a report sent nowhere, one in part', {
        ...S.REPORTS, delivery: { settings: { email: false, push: false }, phones: 1, keyed: true },
        xs: [
          { id: '1005', when: '2026-11-04T01:00:00.000Z', subject: 's <b>', sent: false, why: 'email_off', push: { sent: 0, why: 'push_off' }, care: 0 },
          { id: '1004', when: '2026-11-04T00:30:00.000Z', subject: 't', sent: false, why: 'email_off', push: { sent: 1, why: 'TooManyRequests' }, care: 3 },
        ],
      }),
      r('failed', { ...S.REPORTS, delivery: F, xs: F }),
    ]
  })(),
}

test('every dashboard page but the overview has a JSON form, under its path\'s name, in the contract and the samples', () => {
  const pages = ADMIN_PAGES.filter(p => p !== '/_ab/').map(sectionKey)
  expect([...KEYS].sort()).toEqual([...pages].sort())
  expect(Object.keys(VARIANTS).sort()).toEqual([...KEYS].sort())
  const param = api.paths['/api/owner/sections/{key}'].get.parameters.find((p: { name: string }) => p.name === 'key')
  expect([...param.schema.enum].sort()).toEqual([...KEYS].sort())
})

// ——— The page and its blocks hold to each other ———

const norm = (s: string) => s.replace(/·/g, ' ').replace(/\s+/g, ' ').trim()
/** The page as a reader sees it: what's only for screen readers and the drawn bars left out, line breaks as spaces. */
function dom(html: string): HTMLElement {
  const root = parse(html.replace(/<br\s*\/?>/g, ' '))
  for (const x of root.querySelectorAll('.vh, [aria-hidden="true"], script, style')) x.remove()
  return root.querySelector('main')!
}
const txt = (el: HTMLElement | null | undefined) => norm(el?.text ?? '')
const inChartTable = (el: HTMLElement) => {
  for (let p = el.parentNode as HTMLElement | null; p; p = p.parentNode as HTMLElement | null) if (p.tagName === 'DETAILS' && txt(p.querySelector('summary')) === 'The figures') return true
  return false
}
const folded = (el: HTMLElement) => {
  for (let p = el.parentNode as HTMLElement | null; p; p = p.parentNode as HTMLElement | null) if (p.tagName === 'DETAILS') return txt(p.querySelector('summary'))
  return undefined
}
type Fig = { label: string; value: string; sub?: string; delta?: string }
type Tab = { columns?: string[]; rows: { text: string; href?: string }[][]; empty?: string; folded?: string }
type Req = { label: string; method: string; path: string; body?: Record<string, unknown> }
type ActRow = { src?: string; text: string; buttons: Req[] }
type Form = { method: string; path: string; fields: FormField[]; body?: Record<string, unknown>; submit: string }
/** The comments as the owner reads them: the filter (the app's addresses), each comment and its buttons, and what comes after. */
type Cm = { state: string; filters: { label: string; count: number; href: string }[]; items: { id: string; at: string; name: string; page: { path?: string; title: string }; text: string; state: string; reason: string; reports: string; buttons: Req[] }[]; empty?: string; next?: string }
const STATE_LABEL: Record<string, string> = { held: 'Held', shown: 'Shown', hidden: 'Hidden' }
/** The page's comments: in their own section, so its filter and paging links aren't a switch. A page this build doesn't have is plain text. */
function commentsOf(n: HTMLElement): Cm {
  const filters = n.querySelectorAll('nav.filters a').map(a => {
    const [label, count] = txt(a).split(' ')
    return { label: label!, count: Number(count), href: `/api/owner/sections/binh-luan${a.getAttribute('href')!.slice('/_ab/binh-luan/'.length)}`, on: a.getAttribute('aria-current') === 'page' }
  })
  const items = n.querySelectorAll('ol.cm > li').map(li => {
    const page = li.querySelector('.pg')!
    const a = page.querySelector('a')
    return {
      id: li.id.slice('c-'.length), at: li.querySelector('time')!.getAttribute('datetime')!, name: txt(li.querySelector('.by b')),
      page: { ...(a ? { path: a.getAttribute('href')! } : {}), title: txt(page) }, text: txt(li.querySelector('.text')),
      state: Object.keys(STATE_LABEL).find(k => STATE_LABEL[k] === txt(li.querySelector('.chip')))!, reason: txt(li.querySelector('.why')), reports: txt(li.querySelector('.reports')),
      buttons: li.querySelectorAll('button').map(requestOf),
    }
  })
  const more = n.querySelector('.more a')?.getAttribute('href')
  return {
    state: Object.keys(STATE_LABEL).find(k => filters.find(f => f.on)?.label === STATE_LABEL[k])!, filters: filters.map(({ on: _, ...f }) => f), items,
    ...(n.querySelector('.cm.none') ? { empty: txt(n.querySelector('.cm.none')) } : {}), ...(more ? { next: new URL(more, 'https://x.test').searchParams.get('cursor')! } : {}),
  }
}
/** What owner-api.ts does for each of the pages' forms: the request, from the form's fields and the button pressed. */
const REQUEST: Record<string, (v: Record<string, string>) => Omit<Req, 'label'>> = {
  '/_ab/photos': v => ({ method: 'POST', path: `/api/owner/photos/${v.id}`, body: { action: v.action } }),
  '/_ab/comments': v => ({ method: 'POST', path: `/api/owner/comments/${v.id}`, body: { action: v.action } }),
  '/_ab/hidden': v => ({ method: 'POST', path: '/api/owner/hidden', body: { ...(v.url ? { path: v.url } : {}), hide: v.action !== 'unhide' } }),
  '/_ab/anh-nhan-dien/xoa': v => ({ method: 'DELETE', path: `/api/owner/fishid-shots/${v.who}/${v.id}` }),
  '/_ab/bao-cao/cai-dat': v => ({ method: 'POST', path: '/api/owner/report-settings', body: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '1'])) }),
}
/** A form's field as the API names it. */
const FIELD: Record<string, string> = { url: 'path' }
/** A page's button as the request the app makes for it. */
function requestOf(button: HTMLElement): Req {
  const f = button.closest('form')!
  const to = REQUEST[f.getAttribute('action')!]
  if (!to) throw new Error(`no request for the page's form ${f.getAttribute('action')}`)
  const v = Object.fromEntries(f.querySelectorAll('input[type="hidden"]').map(i => [i.getAttribute('name')!, i.getAttribute('value')!]))
  if (button.getAttribute('name')) v[button.getAttribute('name')!] = button.getAttribute('value')!
  return { label: txt(button), ...to(v) }
}
/** A page's form with fields to fill (hide a page) as the app's form block: its fields, and the request its button makes. */
function formOf(f: HTMLElement): Form {
  const { label, ...req } = requestOf(f.querySelector('button')!)
  const fields = f.querySelectorAll('input, textarea').filter(i => i.getAttribute('type') !== 'hidden').map((i): FormField => ({
    name: FIELD[i.getAttribute('name')!] ?? i.getAttribute('name')!, label: i.getAttribute('aria-label')!, kind: i.tagName === 'TEXTAREA' ? 'textarea' : 'text',
    ...(i.hasAttribute('required') ? { required: true } : {}), ...(i.getAttribute('placeholder') ? { placeholder: i.getAttribute('placeholder')! } : {}),
  }))
  return { method: req.method, path: req.path, fields, ...(req.body ? { body: req.body } : {}), submit: label }
}
/** What the page draws, in its order: headings (an h2's id with it), tiles (and the gaps' counts), charts, tables (and folded page lists, and lists of rows that each open a page), rows with buttons, forms, and buttons on their own (a form with nothing to fill). */
function fromHtml(html: string) {
  const main = dom(html)
  const out = { title: txt(main.querySelector('h1')), headings: [] as string[], figures: [] as Fig[], charts: [] as string[], tables: [] as Tab[], acts: [] as ActRow[], actsEmpty: [] as string[], forms: [] as Form[], actions: [] as Req[], comments: undefined as Cm | undefined, links: main.querySelectorAll('a').filter(a => !a.closest('section.comments') && !a.closest('nav.periods')).map(a => a.getAttribute('href') ?? ''), text: txt(main),
    // The period menu: each period's key and name, and the one shown; a phone's menu button has the same links, under the one shown.
    periods: main.querySelectorAll('nav.periods .seg a').map(a => ({ key: new URL(a.getAttribute('href')!, 'https://x.test').searchParams.get('period')!, label: txt(a), on: a.getAttribute('aria-current') === 'page' })),
    periodMenu: { shown: txt(main.querySelector('nav.periods .pmenu summary')), links: main.querySelectorAll('nav.periods .pmenu a').map(a => [a.getAttribute('href'), txt(a)]) },
    periodLinks: main.querySelectorAll('nav.periods .seg a').map(a => [a.getAttribute('href'), txt(a)]) }
  const cell = (c: HTMLElement) => {
    const a = c.querySelectorAll('a')
    return { text: txt(c), ...(a.length === 1 && txt(a[0]) === txt(c) ? { href: a[0]!.getAttribute('href')! } : {}) }
  }
  const walk = (el: HTMLElement) => {
    for (const n of el.childNodes as HTMLElement[]) {
      if (n.nodeType !== 1) continue
      const tag = n.tagName
      if ((tag === 'H2' || tag === 'H3') && !n.id.endsWith('-t')) out.headings.push(`${tag[1]} ${txt(n)}${tag === 'H2' && n.id ? ` #${n.id}` : ''}`)
      else if (tag === 'SECTION' && n.classList.contains('comments')) {
        out.comments = commentsOf(n)
        continue
      } else if (tag === 'FORM') {
        if (n.querySelectorAll('input, textarea').some(i => i.getAttribute('type') !== 'hidden')) out.forms.push(formOf(n))
        else out.actions.push(...n.querySelectorAll('button').map(requestOf))
        continue
      }
      else if (tag === 'UL' && n.classList.contains('areas')) {
        out.tables.push({ rows: n.querySelectorAll('li').map(li => [cell(li)]) })
        continue
      }
      else if (tag === 'FIGURE' && n.getAttribute('aria-labelledby')?.endsWith('-t')) {
        out.charts.push(`${n.getAttribute('aria-labelledby')!.slice(0, -2)} ${txt(n.querySelector('h3'))}`)
        continue // its readout, plot and numbers are the chart's own
      } else if (tag === 'DIV' && n.classList.contains('kpi')) {
        out.figures.push({ label: txt(n.querySelector('dt')), value: txt(n.querySelector('dd.v')), ...(n.querySelector('dd.sub') ? { sub: txt(n.querySelector('dd.sub')) } : {}), ...(n.querySelector('.delta') ? { delta: txt(n.querySelector('.delta')) } : {}) })
        continue
      } else if (tag === 'LI' && (n.parentNode as HTMLElement).classList.contains('gaps') && n.querySelector('p span.muted')) {
        const p = n.querySelector('p')!
        const value = txt(p.querySelector('b'))
        const sub = txt(p.querySelectorAll('span.muted').at(-1))
        const all = txt(p)
        out.figures.push({ label: norm(all.slice(value.length, all.length - sub.length)), value, sub })
      } else if (tag === 'OL' && (n.parentNode?.parentNode as HTMLElement | null)?.classList.contains('log')) {
        // A day of the change log: each line and its area under it.
        out.tables.push({ rows: n.querySelectorAll('li').map(li => [{ text: norm(`${txt(li.querySelector('p'))} ${txt(li.querySelector('small'))}`) }]) })
        continue
      } else if (tag === 'OL' && n.classList.contains('pages')) {
        out.tables.push({ rows: n.querySelectorAll('li').map(li => [cell(li)]), folded: folded(n) })
        continue
      } else if (tag === 'TABLE' && !inChartTable(n)) {
        const rows = n.querySelectorAll('tbody tr')
        const head = n.querySelectorAll('thead th').map(th => txt(th))
        if (n.querySelector('form') || !head.length || head.at(-1) === '') {
          // Rows with buttons (a photo, a hidden page): the photos' tables have no head, the others an empty last one.
          for (const r of rows) {
            if (r.querySelector('td.none')) { out.actsEmpty.push(txt(r)); continue }
            const buttons = r.querySelectorAll('button').map(requestOf)
            for (const f of r.querySelectorAll('form')) f.remove()
            out.acts.push({ ...(r.querySelector('img') ? { src: r.querySelector('img')!.getAttribute('src')! } : {}), text: norm(r.querySelectorAll('th, td').map(c => txt(c)).join(' ')), buttons })
          }
        } else {
          const none = n.querySelector('td.none')
          out.tables.push({ ...(head.length ? { columns: head } : {}), rows: rows.filter(r => !r.querySelector('td.none')).map(r => r.querySelectorAll('th, td').map(cell)), ...(none ? { empty: txt(none) } : {}), ...(folded(n) ? { folded: folded(n) } : {}) })
        }
        continue
      }
      walk(n)
    }
  }
  walk(main)
  return out
}
/** The same, from the blocks. */
const reqOf = (a: Action): Req => ({ label: a.label, method: a.method, path: a.path, ...(a.body ? { body: a.body } : {}) })
function fromJson(s: Section, withColumns: (t: Tab) => boolean) {
  const out = { title: norm(s.title), headings: [] as string[], figures: [] as Fig[], charts: [] as string[], tables: [] as Tab[], acts: [] as ActRow[], actsEmpty: [] as string[], forms: [] as Form[], actions: [] as Req[], comments: undefined as Cm | undefined, switches: [] as { on: boolean; href: string }[], notes: [] as string[] }
  for (const b of s.blocks as Block[]) {
    if (b.kind === 'heading') out.headings.push(`${b.level} ${norm(b.text)}${b.anchor ? ` #${b.anchor}` : ''}`)
    else if (b.kind === 'figures') out.figures.push(...b.items.map(f => ({ label: norm(f.label), value: f.value, ...(f.sub ? { sub: norm(f.sub) } : {}), ...(f.delta ? { delta: norm(f.delta.text) } : {}) })))
    else if (b.kind === 'chart') out.charts.push(`${b.id} ${norm(b.title)}`)
    else if (b.kind === 'table') {
      const t: Tab = { columns: b.columns.map(norm), rows: b.rows.map(r => r.map(c => ({ text: norm(`${c.text} ${c.sub ?? ''}`), ...(c.href ? { href: c.href } : {}) }))), ...(b.rows.length || !b.empty ? {} : { empty: b.empty }), ...(b.folded ? { folded: norm(`${b.folded} ${b.figure ?? ''}`) } : {}) }
      if (!withColumns(t)) delete t.columns
      out.tables.push(t)
    } else if (b.kind === 'photos' || b.kind === 'hidden') {
      if (!b.items.length && b.empty) out.actsEmpty.push(b.empty)
      for (const x of b.items) out.acts.push('src' in x
        ? { src: x.src, text: norm([x.caption, ...x.meta].join(' ')), buttons: x.actions.map(reqOf) }
        : { text: norm([x.path, x.note ?? '', x.since].join(' ')), buttons: x.actions.map(reqOf) })
    } else if (b.kind === 'form') out.forms.push({ method: b.method, path: b.path, fields: b.fields, ...(b.body ? { body: b.body } : {}), submit: b.submit })
    else if (b.kind === 'switch') out.switches.push({ on: b.on, href: b.href })
    else if (b.kind === 'actions') out.actions.push(...b.actions.map(reqOf))
    else if (b.kind === 'note') out.notes.push(b.text)
    else if (b.kind === 'comments') {
      out.comments = {
        state: b.state, filters: b.filters.map(f => ({ label: f.label, count: f.count, href: f.href })),
        items: b.items.map(c => ({
          id: c.id, at: c.at, name: norm(c.name), page: { ...(c.page.path ? { path: c.page.path } : {}), title: norm(c.page.title) }, text: norm(c.text), state: c.state, reason: norm(c.reason),
          reports: c.reports ? `Reports: ${c.reports.map(r => (r ? `“${r}”` : 'no reason given')).join(', ')}` : '', buttons: c.actions.map(reqOf),
        })),
        ...(b.items.length ? {} : { empty: b.empty }), ...(b.next ? { next: b.next } : {}),
      }
    }
  }
  return out
}

for (const [key, variants] of Object.entries(VARIANTS)) {
  test(`${key}: the blocks say what the page shows, from the same data`, () => {
    for (const [name, html, json] of variants) {
      const h = fromHtml(html())
      // A page's list of pages, the report log's list of reports and the change log's days have no column heads; their tables do.
      const j = fromJson(json(), t => (t.folded ? t.columns?.[0] !== 'Page' : !['Report', CHANGE_COLUMN].includes(t.columns?.[0] ?? '')))
      const at = `${key}, ${name}`
      expect(j.title, at).toBe(h.title)
      expect(j.headings, at).toEqual(h.headings)
      expect(j.figures, at).toEqual(h.figures)
      expect(j.charts, at).toEqual(h.charts)
      expect(j.tables, at).toEqual(h.tables)
      // Each button makes the request its page's form makes (owner-api.ts), with the page's words.
      expect(j.acts, at).toEqual(h.acts)
      expect(j.actsEmpty, at).toEqual(h.actsEmpty)
      expect(j.forms, at).toEqual(h.forms)
      // A button on its own makes the request its page's form's button makes.
      expect(j.actions, at).toEqual(h.actions)
      // Each comment as the page shows it, its buttons the page's form's requests; the filter and the next page.
      expect(j.comments, at).toEqual(h.comments)
      // The page's link to its other form (the app's test builds) is a switch: on when that link goes back to the plain page.
      const own = h.links.filter(l => l === `/_ab/${key}/` || l.startsWith(`/_ab/${key}/?`))
      expect(j.switches, at).toEqual(own.map(l => ({ on: !l.includes('?'), href: `/api/owner/sections/${key}${l.slice(`/_ab/${key}/`.length)}` })))
      // The period menu is the section's periods, the one shown its period.
      const s = json()
      expect((s.periods ?? []).map(p => ({ ...p, on: p.key === s.period })), at).toEqual(h.periods)
      if (s.periods) expect(h.periodMenu, at).toEqual({ shown: s.periods.find(p => p.key === s.period)!.label, links: h.periodLinks })
      // Every note is on the page, word for word.
      for (const n of j.notes) expect(h.text.replace(/\s/g, ''), `${at}: ${n}`).toContain(norm(n).replace(/\s/g, '').replace(/·/g, ''))
    }
  })
}

test('the overview before version 2: its to-dos, areas and last days each open a section (at one of its headings) or an address', () => {
  const anchors = (key: string) => VARIANTS[key]![0]![2]().blocks.flatMap(b => (b.kind === 'heading' && b.anchor ? [b.anchor] : []))
  const failed = { ...S.OVERVIEW, readers: F, clicks: F, fish: F, keys: F, photos: F, waiting: F, wanted: F, accounts: F, hidden: F, content: F, snapshots: F }
  for (const o of [S.OVERVIEW, failed, { ...S.OVERVIEW, tz: 'America/New_York' }]) {
    const j = overviewJson(o)
    for (const x of [...j.todos.map(t => t.action), ...j.areas, ...j.log.entries]) {
      if (!('section' in x) || !x.section) continue
      expect(KEYS).toContain(x.section)
      if ('anchor' in x && x.anchor) expect(anchors(x.section), `${x.section}#${x.anchor}`).toContain(x.anchor)
    }
  }
  const j = overviewJson(S.OVERVIEW)
  expect(j.todos.map(t => t.action)).toEqual([{ label: 'See keys', section: 'nhan-dien-ca', anchor: 'key' }, { label: 'See engine', section: 'noi-dung', anchor: 'engine' }])
  expect(j.areas.find(a => a.name === 'Engine')).toMatchObject({ section: 'noi-dung', anchor: 'engine' })
  expect(j.log.entries.filter(e => e.section).length).toBeGreaterThan(2)
})

/** Where a need, a line or a tile leads on the web: its section's page (at its anchor), or its address. */
const placeHref = (p: { section?: string; anchor?: string; url?: string }) => p.url ?? `/_ab/${p.section}/${p.anchor ? `#${p.anchor}` : ''}`
test('the web overview draws what the app gets: the tiles, what needs you (or the all clear and your last action), the costs and every page', () => {
  for (const t of [S.TODAY, S.CALM, S.SPENDING, { ...S.TODAY, beacon: F }, { ...S.CALM, tz: 'America/New_York' }]) {
    const j = todayJson(t)
    const page = dom(todayPage(t))
    // A tile: its label, figure, and the line under it; one with small columns says its change there instead, on one line.
    expect(page.querySelectorAll('dl.tiles4 > .kpi').map(k => [txt(k.querySelector('dt')), txt(k.querySelector('dd.v')), txt(k.querySelector('dd.sub')), txt(k.querySelector('.delta'))]))
      .toEqual(j.tiles.map(x => [x.label, x.value, x.bars && x.delta ? '' : norm(x.sub), norm(x.delta?.text ?? '')]))
    // What needs you: one row each, the whole row its link; the thing, the pages it's on, and the button's words.
    expect(page.querySelectorAll('ul.todo > li').map(li => [txt(li.querySelector('b')), txt(li.querySelector('.sub')), txt(li.querySelector('.act')), li.querySelector('a')!.getAttribute('href')]))
      .toEqual(j.needs.map(x => [x.text, norm(x.sub ?? ''), x.label, placeHref(x)]))
    // The heading's count is the tile's.
    expect(txt(page.querySelector('#needs .badge'))).toBe(j.needs.length ? j.tiles[0]!.value : '')
    // All clear: said so, then the owner's last decision in words, its page and when, as the app shows it.
    const last = page.querySelector('p.last')
    if (j.needs.length || !j.lastAction) expect(last).toBeNull()
    else {
      expect(txt(last)).toBe(norm(`${j.lastAction.text} · ${j.lastAction.when}`))
      expect(last!.querySelector('a')!.getAttribute('href')).toBe(`/_ab/${j.lastAction.section}/`)
      expect(last!.querySelector('time')!.getAttribute('datetime')).toBe(j.lastAction.at)
    }
    expect(page.querySelectorAll('#costs ~ ul.lines > li, section[aria-labelledby="costs"] ul.lines > li').slice(0, j.costs.lines.length).map(li => txt(li.querySelector('.fig')))).toEqual(j.costs.lines.map(l => l.value))
    expect(page.querySelectorAll('section[aria-labelledby="pages"] section').map(g => [txt(g.querySelector('h3')), g.querySelectorAll('a').map(a => [a.getAttribute('href'), ...a.querySelectorAll('span').map(txt)])]))
      .toEqual(j.pages.map(g => [g.name, g.pages.map(p => [`/_ab/${p.key}/`, p.name, norm(p.figure.text)])]))
  }
  expect(dom(todayPage(S.CALM)).querySelector('p.last')!.text).toBe('You hid a comment on Ikan neon (Indonesian) · Wed 4 Nov, 8:00')
})

test('what needs you is one card: each row its kind\'s icon (the triangle only for a fault), the pages it\'s on, and a button filled to review, outlined to fix', () => {
  // The Design Lead (2026-11-08): a peach alert card a row made routine reviews look like outages.
  const page = dom(todayPage(S.TODAY))
  expect(page.querySelectorAll('ul.todo')).toHaveLength(1)
  expect(page.querySelectorAll('ul.todo > li').map(li => [txt(li.querySelector('b')), li.getAttribute('class'), li.querySelector('.ic')!.getAttribute('data-i'), li.querySelector('.sub')?.text ?? ''])).toEqual([
    ['Fish ID and chat are down', 'bad', 'alert', 'Every key resting, the first until Wed 4 Nov, 16:30.'],
    ['2Hr Aquarist needs a browser check', 'bad', 'alert', '2Hr Aquarist since Wed 4 Nov, 5:00'],
    ['No new video guides', 'bad', 'alert', 'Since Tue 27 Oct, 3:17'],
    ['5 comments held for review', 'wait', 'comment', 'Cá neon vua · Cá betta (cá xiêm)'],
    ['2 reader photos to approve', 'wait', 'photo', 'Cá betta (cá xiêm) · Betta halfmoon'],
  ])
  // Each row is one link, with the chevron a phone shows in place of the button.
  for (const li of parse(todayPage(S.TODAY)).querySelectorAll('ul.todo > li')) expect([li.querySelectorAll('a').length, li.querySelectorAll('svg.chev').length]).toEqual([1, 1])
  // The spend near its cap waits, with its own icon; a held comment's pages past three say how many more; pages this build doesn't have aren't named.
  expect(dom(todayPage(S.SPENDING)).querySelector('ul.todo > li .ic')!.getAttribute('data-i')).toBe('coin')
  const many = { ...S.TODAY, heldPages: ['species:paracheirodon-axelrodi', 'species:betta-splendens', 'id:species:paracheirodon-innesi', 'species:paracheirodon-innesi', 'guide:gone'] }
  expect(todayJson(many).needs.find(x => x.kind === 'comments')!.sub).toBe('Cá neon vua · Cá betta (cá xiêm) · Ikan neon (Indonesian) · 1 more')
  expect(todayJson({ ...S.TODAY, heldPages: ['guide:gone'] }).needs.find(x => x.kind === 'comments')).not.toHaveProperty('sub')
  expect(todayJson({ ...S.TODAY, heldPages: F }).needs.find(x => x.kind === 'comments')).not.toHaveProperty('sub')
})

test('readers who found an answer: one card, the week\'s figure once, the days found an answer only (readers and shop clicks on a tap), then readers, sessions and shop clicks', () => {
  const j = todayJson(S.TODAY)
  const card = dom(todayPage(S.TODAY)).querySelector('section[aria-labelledby="answers"]')!
  // The drawn parts too (the page's dom() leaves out what only the eye reads).
  const drawn = parse(todayPage(S.TODAY)).querySelector('section[aria-labelledby="answers"]')!
  // The figure once in the card: its top line, "13 this week · +8% vs the same point last week".
  expect(card.querySelectorAll('.acard')).toHaveLength(1)
  expect(txt(card.querySelector('.acard .top'))).toBe(norm(`${j.answers.figure!.value} this week ${j.answers.figure!.delta!.text}`))
  expect(card.querySelectorAll('dd.v').map(txt)).toEqual(j.answers.figures!.map(f => f.value))
  // Under the chart, as drawn: "169", then "readers +2%" on one line; what it's against is there for a screen reader.
  expect(card.querySelectorAll('.kpi dt').map(txt)).toEqual(j.answers.figures!.map(f => `${f.label.toLowerCase()} ${f.delta!.text.split(' ')[0]}`))
  expect(drawn.querySelectorAll('.kpi dt').map(txt)).toEqual(j.answers.figures!.map(f => norm(`${f.label.toLowerCase()} ${f.delta!.text}`)))
  // The chart: found an answer only, a day's name under each of the week's bars, no axis, no totals, no key.
  const chart = j.answers.chart as Extract<Block, { kind: 'chart' }>
  expect(chart.series.map(x => x.label)).toEqual(['Found an answer'])
  expect(chart).not.toHaveProperty('whole')
  expect(drawn.querySelectorAll('.xax span').map(txt)).toEqual(['Mon', 'Tue', 'Today', 'Thu', 'Fri', 'Sat', 'Sun'])
  expect(drawn.querySelectorAll('.yax span, .readout, .legend')).toHaveLength(0)
  expect(drawn.querySelectorAll('.cols li').map(li => li.getAttribute('data-x'))).toEqual(chart.readouts.map(r => r.detail))
  expect(chart.readouts[1]!.detail).toMatch(/^Tue 3 Nov · \d+ readers · \d+ shop clicks?$/)
  // The tile's small columns: all seven days, today lighter, and its change on one line.
  const tile = j.tiles.find(x => x.key === 'answers')!
  expect(tile.bars!.values).toHaveLength(7)
  expect(tile.delta!.text).toMatch(/^[−+±]\d+% vs last week$/)
  expect(parse(todayPage(S.TODAY)).querySelectorAll('dl.tiles4 .spark rect.today')).toHaveLength(1)
})

test('the sample\'s readers agree: the week has at least each of its days\' readers, its days are the last three days\' and the scoreboard\'s, and every page says the card\'s week', () => {
  const j = todayJson(S.TODAY)
  const chart = j.answers.chart as Extract<Block, { kind: 'chart' }>
  const perDay = chart.readouts.slice(0, 3).map(r => Number(r.detail.match(/(\d+) readers?/)![1]))
  const week = Number(j.answers.figures!.find(f => f.label === 'Readers')!.value)
  expect(week).toBe(perDay.reduce((a, b) => a + b, 0))
  expect(week).toBeGreaterThanOrEqual(Math.max(...perDay))
  // The last three days, newest first, are the week's Wednesday, Tuesday and Monday.
  expect(j.days.map(d => Number(d.figure.match(/^(\d+) readers?$/)![1]))).toEqual(perDay.slice().reverse())
  // Every page's Readers and Affiliate say the card's week and its change, as the drawing's "169 · +2%" (2026-11-09).
  const page = (key: string) => j.pages.flatMap(g => g.pages).find(p => p.key === key)!.figure.text
  const said = (label: string) => {
    const f = j.answers.figures!.find(x => x.label === label)!
    return `${f.value} · ${f.delta!.text.split(' ')[0]}`
  }
  expect(page('doc-gia')).toBe(said('Readers'))
  expect(page('affiliate')).toBe(said('Shop clicks'))
  expect(page('thanh-cong')).toBe(`${j.answers.figure!.value} answers`)
  // Without the beacon, the readers' and the shop's own 7 days.
  const off = todayJson({ ...S.TODAY, beacon: { failed: 'down' } })
  const sevenDays = S.OVERVIEW.readers as { day: string; readers: number }[]
  expect(off.pages.flatMap(g => g.pages).find(p => p.key === 'doc-gia')!.figure.text).toMatch(new RegExp(`^${sevenDays.slice(-8, -1).reduce((a, d) => a + d.readers, 0)}\\b`))
})

test('the owner\'s last action, in words: the newest of a comment shown or hidden, a photo approved or removed and a page hidden; none, or none readable, is null', () => {
  // The Design Lead (2026-11-08): "Hid /id/ikan/y/" said a path; the page by its name, and its language when it isn't Vietnamese.
  expect(todayJson(S.CALM).lastAction).toEqual({ title: 'Your last action', text: 'You hid a comment on Ikan neon (Indonesian)', when: 'Wed 4 Nov, 8:00', at: '2026-11-04T01:00:30.000Z', section: 'binh-luan' })
  const older = (S.CALM.acts as OwnerAct[]).slice(0, 1)
  // Without it: the page hidden this morning, by its address when the build doesn't have it, else by its name.
  expect(todayJson({ ...S.CALM, acts: older }).lastAction).toMatchObject({ text: 'You hid the page at /id/ikan/y/', when: 'Wed 4 Nov, 8:00', section: 'an-trang' })
  expect(todayJson({ ...S.CALM, acts: older, hidden: { '/ca/ca-betta/': { at: '2026-11-04T01:00:00.000Z' } } }).lastAction!.text).toBe('You hid the page Cá betta (cá xiêm)')
  // Without the hidden pages: the comment hidden the day before, on its page when the build names it.
  expect(todayJson({ ...S.CALM, acts: older, hidden: {} }).lastAction).toMatchObject({ text: 'You hid a comment on Cá neon vua', when: 'Tue 3 Nov, 13:00', section: 'binh-luan' })
  expect(todayJson({ ...S.CALM, acts: older, hidden: {}, content: S.STATS }).lastAction!.text).toBe('You hid a comment')
  const act = (kind: 'comment-shown' | 'photo-approved' | 'photo-removed', at: string) => todayJson({ ...S.CALM, acts: [...(S.CALM.acts as OwnerAct[]), { kind, at, ref: 'species:betta-splendens' }] }).lastAction
  expect(act('photo-approved', '2026-11-04T08:00:00.000Z')).toMatchObject({ text: 'You approved a reader photo on Cá betta (cá xiêm)', when: 'Wed 4 Nov, 15:00', section: 'anh-ban-doc' })
  expect(act('photo-removed', '2026-11-04T08:00:00.000Z')!.text).toBe('You removed a reader photo on Cá betta (cá xiêm)')
  expect(act('comment-shown', '2026-11-04T02:00:00.000Z')!.text).toBe('You showed a comment on Cá betta (cá xiêm)')
  // A time past now (a clock ahead) isn't the last action.
  expect(act('photo-approved', '2026-11-05T08:00:00.000Z')!.text).toBe('You hid a comment on Ikan neon (Indonesian)')
  expect(todayJson({ ...S.CALM, acts: [], hidden: {} }).lastAction).toBeNull()
  expect(todayJson({ ...S.CALM, acts: F, hidden: F }).lastAction).toBeNull()
})

test('what needs you: each title one line at regular size (the thing, not its detail), its detail under it, dates as "Thu 5 Nov, 9:00"', () => {
  const late = { ...S.TODAY, waiting: { comments: 2, photos: 1, oldest: '2026-11-02T20:00:00.000Z' } }
  const longName = { ...S.TODAY, content: { ...S.STATS, engine: { ...S.STATS.engine!, sources: [{ ...S.STATS.engine!.sources[0]!, name: 'The Planted Tank Forum Archive' }] } } as typeof S.STATS }
  const all = [S.TODAY, S.SPENDING, late, longName, { ...S.TODAY, keys: F }, { ...S.TODAY, keys: undefined }, { ...S.TODAY, beacon: F, held: F, waitingPhotos: F, kept: F, crashes: F, lastReport: F, changes: F, fish: F, readers: F, clicks: F, photos: F, waiting: F, wanted: F, accounts: F, hidden: F, content: F, snapshots: F }]
  const needs = all.flatMap(t => todayJson(t).needs)
  expect(new Set(needs.map(x => x.kind))).toEqual(new Set(['key', 'spend', 'engine', 'moderation', 'comments', 'photos', 'failed']))
  for (const x of needs) expect(x.text.length, x.text).toBeLessThanOrEqual(36)
  // A date is the weekday, the day, the month and the time, in the viewer's zone.
  const dated = needs.flatMap(x => (x.sub?.match(/[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}(?: \d{4})?, \d{1,2}:\d\d/g) ?? []))
  expect(dated).toEqual(expect.arrayContaining(['Wed 4 Nov, 16:30', 'Wed 4 Nov, 5:00', 'Tue 3 Nov, 3:00']))
  for (const x of needs) expect(x.sub ?? '', x.text).not.toMatch(/\d\d\/\d\d/)
  expect(todayJson(longName).needs.find(x => x.kind === 'engine')).toMatchObject({ text: 'A source needs a browser check', sub: 'The Planted Tank Forum Archive since Wed 4 Nov, 5:00' })
  expect(todayJson(late).needs.find(x => x.kind === 'moderation')).toMatchObject({ text: 'Moderation hasn’t run', sub: '2 comments, 1 photo waiting since Tue 3 Nov, 3:00.' })
})

test('the overview\'s version 2: the tiles add up to their parts, found an answer is the scoreboard\'s, and each place it opens is a section', () => {
  const anchors = (key: string) => VARIANTS[key]![0]![2]().blocks.flatMap(b => (b.kind === 'heading' && b.anchor ? [b.anchor] : []))
  const t = todayJson(S.TODAY)
  // Found an answer: the scoreboard's star this week, never more than the day's readers; the tile's bars are the chart's.
  const star = S.SCOREBOARD.metrics.find(m => m.key === S.SCOREBOARD.northStar)!
  const ch = t.answers.chart as Extract<Block, { kind: 'chart' }>
  expect(t.tiles.map(x => x.key)).toEqual(['needs', 'answers', 'shipped', 'cost'])
  expect(t.tiles[1]).toMatchObject({ value: String(star.now), bars: { days: ch.days, values: ch.series[0]!.values, readouts: ch.readouts, today: ch.today } })
  expect(ch.series[0]!.values.reduce<number>((a, v) => a + (v ?? 0), 0)).toBe(star.now)
  // Readers are said with each day (not drawn): never fewer than the day's answers.
  ch.series[0]!.values.forEach((v, i) => expect(v ?? 0).toBeLessThanOrEqual(Number(ch.readouts[i]!.detail.match(/(\d+) readers?/)?.[1] ?? 0)))
  expect(ch.today).toBe(2) // Wednesday: Thursday to Sunday still to come
  expect(ch.series[0]!.values.slice(3)).toEqual([null, null, null, null])
  // Needs: faults first, then what waits on the owner; the tile counts the items.
  // The video guides added nothing since the first save while 200 videos wait: the engine's, a fault (admin/publishing.ts).
  expect(t.needs.map(x => [x.kind, x.tone, x.section])).toEqual([['key', 'bad', 'nhan-dien-ca'], ['engine', 'bad', 'noi-dung'], ['engine', 'bad', 'noi-dung'], ['comments', 'wait', 'binh-luan'], ['photos', 'wait', 'anh-ban-doc']])
  expect(t.needs.find(x => x.kind === 'photos')!.photos).toEqual(S.WAITING.map(w => w.id))
  expect(t.tiles[0]).toMatchObject({ value: '10', sub: '7 to review · 3 to fix', tone: 'bad' })
  expect(t.needs.map(x => [x.text, x.sub])).toEqual([
    ['Fish ID and chat are down', 'Every key resting, the first until Wed 4 Nov, 16:30.'], ['2Hr Aquarist needs a browser check', '2Hr Aquarist since Wed 4 Nov, 5:00'],
    ['No new video guides', 'Since Tue 27 Oct, 3:17'], ['5 comments held for review', 'Cá neon vua · Cá betta (cá xiêm)'], ['2 reader photos to approve', 'Cá betta (cá xiêm) · Betta halfmoon'],
  ])
  // A part that didn't load is a fault before the engine's pages stopped.
  expect(todayJson({ ...S.TODAY, beacon: F }).needs.map(x => x.text).slice(0, 4)).toEqual(['Fish ID and chat are down', '2Hr Aquarist needs a browser check', 'Readers’ beacon didn’t load', 'No new video guides'])
  // Every kind still for 30 hours: the engine's one line, and no kind stalled on its own (admin/publishing.ts).
  const quiet = todayJson(S.QUIET)
  expect(quiet.needs).toEqual([{ kind: 'engine', text: 'Nothing new published', sub: 'Since Tue 3 Nov, 3:17', label: 'See engine', tone: 'bad', section: 'noi-dung', anchor: 'engine' }])
  expect(quiet.publishing).toMatchObject({ quiet: { since: '2026-11-02T20:17:00.000Z', text: 'Nothing new since Tue 3 Nov, 3:17' } })
  expect(quiet.publishing!.kinds.some(k => 'stalled' in k)).toBe(false)
  expect(quiet.tiles[0]).toMatchObject({ value: '1', sub: '1 to fix', tone: 'bad' })
  // A day's AI spend near its cap waits on the owner: to review, not a fault.
  const spend = todayJson(S.SPENDING)
  expect(spend.needs).toEqual([{ kind: 'spend', text: 'AI spend at 85% of its cap', sub: 'Fish ID and chat: $1.70 of the $2 cap today.', label: 'See costs', tone: 'wait', section: 'nhan-dien-ca' }])
  expect(spend.tiles[0]).toMatchObject({ value: '1', sub: '1 to review', tone: 'wait' })
  // Fish ID's cost this week is the section's "This week", and its 30 days the section's: the same sums, the same figures.
  const fig = (sec: Section, label: string) => (sec.blocks.find(b => b.kind === 'figures') as Extract<Block, { kind: 'figures' }>).items.find(x => x.label === label)!.value
  const week = fishIdSection(S.FISH)
  expect(t.tiles[3]).toMatchObject({ label: 'Fish ID cost, this week', value: fig(week, 'Claude cost'), sub: `${fig(week, 'Claude calls')} Claude calls` })
  expect(t.costs.lines[0]).toMatchObject({ value: fig(week, 'Claude cost'), sub: `${fig(week, 'Claude calls')} Claude calls` })
  expect(t.costs.lines[1]).toMatchObject({ label: 'Fish ID, 30 days', value: fig(fishIdSection(S.FISH_30), 'Claude cost'), sub: `${fig(fishIdSection(S.FISH_30), 'Claude calls')} Claude calls` })
  // Today's AI spend is a little more than fish ID's calls since the keys' day began: chat's cents on top.
  const keys = S.FISH.keys
  expect(keys.spend[0]!.usd).toBeGreaterThan(keys.today * 0.0109)
  expect(keys.spend[0]!.usd).toBeLessThan(keys.today * 0.0109 + 0.1)
  expect(keys.rows.reduce((a, r) => a + r.calls, 0)).toBe(keys.today)
  // Shipped: the change log's last 24 hours; the costs, fish ID's.
  expect(t.tiles[2]).toMatchObject({ value: '3', sub: '1 site · 1 app · 1 engine' })
  expect(t.shipped).toMatchObject({ section: 'thay-doi', link: 'Changelog · 3 in 24 h' })
  expect(t.costs.keys).toMatchObject({ text: '2 of 2 resting', tone: 'bad', section: 'nhan-dien-ca', anchor: 'key' })
  // The last action: kept for the all clear, sent always.
  expect(t.lastAction).toMatchObject({ text: 'You hid a comment on Ikan neon (Indonesian)', section: 'binh-luan' })
  // Every section once, in NAV's order; every place a section, an anchor one of its headings.
  expect(t.pages.flatMap(g => g.pages.map(p => p.key))).toEqual(KEYS)
  expect(PAGE_GROUPS.flatMap(([, ps]) => ps.map(([k]) => k))).toEqual(KEYS)
  for (const x of [...t.needs, t.shipped, t.costs.keys, ...t.days]) {
    if (!x.section) continue
    expect(KEYS).toContain(x.section)
    if ('anchor' in x && x.anchor) expect(anchors(x.section), `${x.section}#${x.anchor}`).toContain(x.anchor)
  }
  expect(t.days.map(d => d.title)).toEqual(['Today so far', 'Yesterday', 'Monday 2 Nov'])
  // Nothing needs the owner.
  const calm = todayJson(S.CALM)
  expect(calm.needs).toEqual([])
  expect(calm.tiles[0]).toMatchObject({ value: 'All clear', sub: 'Nothing to review or fix', tone: 'good' }) // the mockup's green tick
  // The beacon down: the answers say so, the rest comes.
  const down = todayJson({ ...S.TODAY, beacon: F })
  expect(down.answers).toEqual({ title: 'Readers who found an answer', note: { kind: 'note', text: `Couldn’t load the readers’ beacon: ${F.failed}`, tone: 'bad' } })
  expect(down.needs.map(x => x.kind)).toContain('failed')
})

// ——— The Worker: who opens it, and the replies ———

/** The fixture build's content.json and reviews.json (pnpm test builds the site first), as the Worker reads them through ASSETS. */
const builtFile = (name: string) => readFileSync(fileURLToPath(new URL(`../../dist/_ab/${name}`, import.meta.url).href), 'utf8')
const DASH_TOKEN = 'dashtoken-0123456789abcdefABCDEF'
function kv() {
  const m = new Map<string, { value: string; metadata?: unknown }>()
  const ns = {
    get: async (k: string, o?: string | { type?: string }) => {
      const v = m.get(k)?.value
      if (v === undefined) return null
      return (typeof o === 'string' ? o : o?.type) === 'json' ? JSON.parse(v) : v
    },
    put: async (k: string, value: string, o?: { metadata?: unknown }) => { m.set(k, { value, metadata: o?.metadata }) },
    delete: async (k: string) => { m.delete(k) },
    list: async ({ prefix = '' }: { prefix?: string } = {}) => ({ keys: [...m].filter(([k]) => k.startsWith(prefix)).map(([name, x]) => ({ name, metadata: x.metadata })), list_complete: true }),
  } as unknown as KVNamespace
  return { m, ns }
}
/** A Worker with the owner's account and a reader's, each signed in on the web and in the app; a photo waiting and one shown; two kept fish-ID photos. */
async function worker(over: Partial<Record<string, unknown>> = {}) {
  const { createSession, sha256 } = await import('../accounts/session')
  const db = testD1()
  const now = new Date()
  for (const id of ['owner-1', 'reader-1']) await db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind(id, '2026-11-01T00:00:00Z').run()
  const sessions = {
    ownerApp: await createSession(db, 'owner-1', 'app', now), ownerWeb: await createSession(db, 'owner-1', 'web', now),
    readerApp: await createSession(db, 'reader-1', 'app', now), readerWeb: await createSession(db, 'reader-1', 'web', now), ended: await createSession(db, 'owner-1', 'app', now),
  }
  await db.prepare('UPDATE sessions SET expires_at = ? WHERE id = (SELECT id FROM sessions ORDER BY rowid DESC LIMIT 1)').bind('2026-01-01T00:00:00.000Z').run()
  // Signed out: its row gone, as signing out leaves it.
  const signedOut = await createSession(db, 'owner-1', 'app', now)
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(signedOut)).run()
  const at = new Date(now.getTime() - 3_600_000).toISOString()
  await db.prepare("INSERT INTO photos (id, entity_ref, name, status, delete_hash, created_at) VALUES (?, 'species:betta-splendens', 'Lan', 'pending', 'h', ?)").bind(S.PHOTO_WAITING, at).run()
  await db.prepare("INSERT INTO photos (id, entity_ref, name, status, url, thumb, delete_hash, created_at) VALUES (?, 'species:x', 'Minh', 'approved', 'https://media.aquatome.com/readers/x.webp', 'https://media.aquatome.com/readers/x-480.webp', 'h', ?)").bind(S.PHOTO_LIVE, at).run()
  await db.prepare("INSERT INTO clicks_daily VALUES (?, 'shopee', 'thuc-an', 'species:x', 'search', 4)").bind(now.toISOString().slice(0, 10)).run()
  const uploads = memoryR2()
  const media = memoryR2()
  await uploads.bucket.put(`pending/${S.PHOTO_WAITING}`, new Uint8Array([0xff, 0xd8, 9]), { httpMetadata: { contentType: 'image/jpeg' } })
  await media.bucket.put(`readers/${S.PHOTO_LIVE}.webp`, new Uint8Array([1]))
  await media.bucket.put(`readers/${S.PHOTO_LIVE}-480.webp`, new Uint8Array([2]))
  const meta = (verdict: string, created: string) => ({ customMetadata: { created, verdict, guesses: '[]', model: 'm', lang: 'vi' } })
  await uploads.bucket.put(`fish-id/reader-1/${S.KEPT_ID}`, new Uint8Array([0xff, 0xd8, 1]), meta('fish', at))
  await uploads.bucket.put(`fish-id/anon/${S.KEPT_ANON}`, new Uint8Array([0xff, 0xd8, 2]), meta('other', new Date(now.getTime() - 7_200_000).toISOString()))
  const ab = kv()
  await ab.ns.put('hidden', JSON.stringify({ '/ca/ca-x/': { at: '2026-11-03T03:00:00.000Z', note: 'ảnh nhầm loài' } }))
  const files: Record<string, string> = { '/_ab/content.json': builtFile('content.json'), '/_ab/reviews.json': builtFile('reviews.json') }
  const assets = { fetch: async (r: Request) => { const body = files[new URL(r.url).pathname]; return body ? new Response(body, { headers: { 'content-type': 'application/json' } }) : new Response('<h1>404</h1>', { status: 404, headers: { 'content-type': 'text/html' } }) } }
  const e = {
    ASSETS: assets, AB: ab.ns, DB: db, UPLOADS: uploads.bucket, MEDIA: media.bucket, EVENTS: { writeDataPoint: () => {} },
    TURNSTILE_SECRET: 's', TURNSTILE_SITEKEY: 'k', COMMENT_HMAC_KEY: 'h', AB_DASH_TOKEN: DASH_TOKEN, OWNER_ACCOUNTS: 'owner-1', ...over,
  } as unknown as Env
  return { e, db, ab, uploads, media, signedOut, ...sessions }
}
const bearer = (t: string) => ({ authorization: `Bearer ${t}` })
const call = (e: Env, method: string, path: string, headers: Record<string, string> = {}, body?: unknown) =>
  handle(new Request(`https://x.test${path}`, { method, headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }), e)
/** The contract's path for a request's path. */
const opOf = (path: string) => {
  const p = path.split('?')[0]!
  return Object.keys(api.paths).find(k => new RegExp(`^${k.replace(/\{[a-z]+\}/g, '[^/]+')}$`).test(p))!
}
const contracted = async (r: Response, method: 'get' | 'post' | 'delete', path: string) => {
  expect([r.headers.get('cache-control'), r.headers.get('x-robots-tag'), r.headers.get('content-type')], `${method} ${path}`).toEqual(['no-store', 'noindex, nofollow', 'application/json; charset=utf-8'])
  return answer(opOf(path), method, r)
}
afterEach(() => vi.restoreAllMocks())

test('only the owner\'s app session opens it: without a live app session 401 signed_out, another account\'s app 404, before any other check; nothing changes for them', async () => {
  const w = await worker()
  const ACTIONS: [string, string, unknown][] = [
    ['POST', `/api/owner/photos/${S.PHOTO_WAITING}`, { action: 'remove' }], ['POST', '/api/owner/hidden', { path: '/ca/y/', hide: true }],
    ['DELETE', `/api/owner/fishid-shots/anon/${S.KEPT_ANON}`, undefined],
  ]
  // In the contract, and not: a wrong method, a key that isn't a section, a path that isn't one.
  const CALLS = [['GET', '/api/owner/dashboard', undefined], ...KEYS.map(k => ['GET', `/api/owner/sections/${k}`, undefined]), ...ACTIONS] as [string, string, unknown][]
  const ELSE = [['POST', '/api/owner/dashboard', {}], ['GET', `/api/owner/photos/${S.PHOTO_WAITING}`, undefined], ['GET', '/api/owner/sections/tong-quan', undefined], ['GET', '/api/owner', undefined], ['GET', '/api/owner/nothing', undefined]] as [string, string, unknown][]
  const signedOut: Record<string, string>[] = [
    {}, { cookie: `__Host-aq_session=${w.ownerWeb}` }, bearer(w.ownerWeb), { cookie: `__Host-aq_session=${w.readerWeb}` }, bearer(w.readerWeb), bearer(DASH_TOKEN),
    bearer(w.ended), bearer(w.signedOut), bearer('x'.repeat(43)), { authorization: 'Basic b3duZXI6eA==' }, { authorization: `bearer ${w.ownerApp}` }, { authorization: `Bearer ${w.ownerApp}!` },
  ]
  for (const [h, status, error] of [...signedOut.map(h => [h, 401, 'signed_out']), [bearer(w.readerApp), 404, 'not_found']] as [Record<string, string>, number, string][]) {
    for (const [method, path, body] of CALLS) {
      const r = await call(w.e, method, path, h, body)
      expect(r.status, `${JSON.stringify(h)} ${method} ${path}`).toBe(status)
      expect(await contracted(r, method.toLowerCase() as 'get', path)).toEqual({ error })
    }
    for (const [method, path, body] of ELSE) {
      const r = await call(w.e, method, path, h, body)
      expect([r.status, await r.json(), r.headers.get('cache-control'), r.headers.get('x-robots-tag'), r.headers.get('allow')], `${JSON.stringify(h)} ${method} ${path}`).toEqual([status, { error }, 'no-store', 'noindex, nofollow', null])
    }
  }
  // Nothing was done for them.
  expect((await w.db.prepare('SELECT status FROM photos WHERE id = ?').bind(S.PHOTO_WAITING).first())).toEqual({ status: 'pending' })
  expect(JSON.parse(w.ab.m.get('hidden')!.value)).not.toHaveProperty(['/ca/y/'])
  expect(w.uploads.m.has(`fish-id/anon/${S.KEPT_ANON}`)).toBe(true)
  // The owner's app: the overview and every section.
  const dash = await call(w.e, 'GET', '/api/owner/dashboard', bearer(w.ownerApp))
  expect(dash.status).toBe(200)
  const d = await contracted(dash, 'get', '/api/owner/dashboard')
  expect(d.sections).toEqual(SECTIONS.map(({ key, name }) => ({ key, name })))
  // No owner named: nobody is, and the owner's app is just another account's.
  const none = await worker({ OWNER_ACCOUNTS: undefined })
  expect((await call(none.e, 'GET', '/api/owner/dashboard', bearer(none.ownerApp))).status).toBe(404)
})

test('a part that throws (D1, KV, R2) is 503 unavailable, as JSON, never stored or indexed, and changes nothing', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const boom = () => { throw new Error('storage down') }
  const w = await worker()
  const over = (o: Record<string, unknown>) => ({ ...w.e, ...o }) as unknown as Env
  const unavailable = async (e: Env, method: string, path: string, body?: unknown) => {
    const r = await call(e, method, path, bearer(w.ownerApp), body)
    expect(r.status, `${method} ${path}`).toBe(503)
    expect(await contracted(r, method.toLowerCase() as 'get', path), `${method} ${path}`).toEqual({ error: 'unavailable', message: expect.any(String) })
  }
  // D1 down: not even the session reads.
  const d1Down = over({ DB: { prepare: boom, batch: boom } })
  await unavailable(d1Down, 'GET', '/api/owner/dashboard')
  await unavailable(d1Down, 'GET', '/api/owner/sections/an-trang')
  // After the owner check: D1 for the photo, KV for the hidden pages, R2 for a kept photo.
  const photosDown = { prepare: (sql: string) => (/\bphotos\b/.test(sql) ? boom() : w.db.prepare(sql)), batch: boom } as unknown as D1Database
  await unavailable(over({ DB: photosDown }), 'POST', `/api/owner/photos/${S.PHOTO_WAITING}`, { action: 'approve' })
  await unavailable(over({ DB: photosDown }), 'POST', `/api/owner/photos/${S.PHOTO_WAITING}`, { action: 'remove' })
  await unavailable(over({ AB: Object.assign(Object.create(w.ab.ns), { put: async () => boom() }) }), 'POST', '/api/owner/hidden', { path: '/ca/y/', hide: true })
  await unavailable(over({ UPLOADS: Object.assign(Object.create(w.uploads.bucket), { delete: async () => boom() }) }), 'DELETE', `/api/owner/fishid-shots/anon/${S.KEPT_ANON}`)
  expect(errors).toHaveBeenCalled()
  expect((await w.db.prepare('SELECT status FROM photos WHERE id = ?').bind(S.PHOTO_WAITING).first())).toEqual({ status: 'pending' })
  expect(w.ab.m.has(`photo-ok:${S.PHOTO_WAITING}`)).toBe(false)
  expect(JSON.parse(w.ab.m.get('hidden')!.value)).not.toHaveProperty(['/ca/y/'])
  expect(w.uploads.m.has(`fish-id/anon/${S.KEPT_ANON}`)).toBe(true)
})

test('every section through the Worker: the contract\'s shape, as its page says it, from the Worker\'s own loaders', async () => {
  const w = await worker({ AE_API_TOKEN: 'ae', CF_ACCOUNT_ID: 'acc' })
  // Analytics Engine answers every query with no rows; GitHub has no issues.
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u: string | URL | Request) => Response.json(String(u instanceof Request ? u.url : u).startsWith('https://api.github.com/') ? [] : { data: [] }))
  for (const key of KEYS) {
    for (const q of key === 'ung-dung' ? ['', '?test=1'] : ['']) {
      const r = await call(w.e, 'GET', `/api/owner/sections/${key}${q}`, bearer(w.ownerApp))
      expect(r.status, key).toBe(200)
      const s = (await contracted(r, 'get', `/api/owner/sections/${key}`)) as unknown as Section & { tz: string }
      expect(s.tz).toBe('Asia/Ho_Chi_Minh')
      expect(norm(s.title), key).toBe(fromHtml(VARIANTS[key]![0]![1]()).title)
      expect(s.blocks.some(b => b.kind === 'note' && b.tone === 'bad'), `${key}: ${JSON.stringify(s.blocks.filter(b => b.kind === 'note' && b.tone === 'bad'))}`).toBe(false)
      if (key === 'ung-dung') {
        // The switch reads the other builds' section from its href, where the switch is flipped.
        const sw = { kind: 'switch', label: 'Test builds only (debug, TestFlight)', on: Boolean(q), href: `/api/owner/sections/ung-dung${q ? '' : '?test=1'}` }
        expect(s.blocks[1]).toEqual(sw)
        const flipped = (await (await call(w.e, 'GET', sw.href, bearer(w.ownerApp))).json()) as Section
        expect(flipped.blocks[1]).toMatchObject({ kind: 'switch', on: !q })
      }
    }
  }
  // The content page's pages out of search for their score, from the build's reviews.json: the fixture's four, lowest
  // first (Analytics Engine has no readers), none with a review (no engine state beside the fixture's content).
  const content = (await (await call(w.e, 'GET', '/api/owner/sections/noi-dung', bearer(w.ownerApp))).json()) as Section
  const at = content.blocks.findIndex(b => b.kind === 'heading' && b.text === 'Out of search for a low score')
  const low = content.blocks.slice(at).find(b => b.kind === 'table')
  const none = 'No review kept yet.'
  expect(low?.kind === 'table' && low.rows.map(r => r.map(c => c.href ?? c.text))).toEqual([
    ['/ca/ca-la-han/', 'Breeds', '0.60', '0', none], ['/huong-dan/thay-nuoc-dung-cach/', 'Guides', '0.60', '0', none],
    ['/thuat-ngu/gh/', 'Glossary', '0.60', '0', none], ['/ca/ca-boraras-do/', 'Fish', '0.61', '0', none],
  ])
  const photos = (await (await call(w.e, 'GET', '/api/owner/sections/anh-ban-doc', bearer(w.ownerApp))).json()) as Section
  const items = photos.blocks.filter(b => b.kind === 'photos').flatMap(b => (b.kind === 'photos' ? b.items : []))
  expect(items.map(p => [p.id, p.src, p.actions.map(a => a.label)])).toEqual([[S.PHOTO_WAITING, `/_ab/anh/${S.PHOTO_WAITING}`, ['Approve', 'Remove']], [S.PHOTO_LIVE, 'https://media.aquatome.com/readers/x-480.webp', ['Remove']]])
  const kept = (await (await call(w.e, 'GET', '/api/owner/sections/anh-nhan-dien', bearer(w.ownerApp))).json()) as Section
  expect(kept.blocks[1]).toMatchObject({ kind: 'photos', items: [{ src: `/_ab/anh-nhan-dien/anh/reader-1/${S.KEPT_ID}` }, { src: `/_ab/anh-nhan-dien/anh/anon/${S.KEPT_ANON}`, actions: [{ label: 'Delete', method: 'DELETE', path: `/api/owner/fishid-shots/anon/${S.KEPT_ANON}` }] }] })
  // The overview too; a key that isn't a section, a path that isn't one, and the wrong method.
  expect((await call(w.e, 'GET', '/api/owner/dashboard', bearer(w.ownerApp))).status).toBe(200)
  for (const p of ['/api/owner/sections/tong-quan', '/api/owner/sections/', '/api/owner', '/api/owner/', '/api/owner/nothing']) {
    const r = await call(w.e, 'GET', p, bearer(w.ownerApp))
    expect([r.status, await r.json(), r.headers.get('cache-control'), r.headers.get('x-robots-tag')], p).toEqual([404, { error: 'not_found' }, 'no-store', 'noindex, nofollow'])
  }
  const wrong = await call(w.e, 'POST', '/api/owner/dashboard', bearer(w.ownerApp), {})
  expect([wrong.status, wrong.headers.get('allow')]).toEqual([405, 'GET'])
  expect(await contracted(wrong, 'get', '/api/owner/dashboard')).toEqual({ error: 'method' })
  const parts = await worker()
  // Without Analytics Engine set up, the parts that need it say so, and the rest comes.
  const readers = (await (await call(parts.e, 'GET', '/api/owner/sections/doc-gia', bearer(parts.ownerApp))).json()) as Section
  expect(readers.blocks).toEqual([{ kind: 'note', text: 'Not set up: AE_API_TOKEN and CF_ACCOUNT_ID, so there are no figures yet (Analytics Engine).', tone: 'muted' }])
})

test('days and times in the zone the app sends (Time-Zone), else Vietnam\'s; the reply says which', async () => {
  const w = await worker()
  const since = async (h: Record<string, string>) => {
    const s = (await (await call(w.e, 'GET', '/api/owner/sections/an-trang', { ...bearer(w.ownerApp), ...h })).json()) as Section & { tz: string }
    const b = s.blocks.find(x => x.kind === 'hidden')
    return [s.tz, b?.kind === 'hidden' ? b.items[0]!.since : '']
  }
  // The year only when it isn't this one.
  const vn = expect.stringMatching(/^Tue 3 Nov(?: 2026)?, 10:00$/)
  expect(await since({})).toEqual(['Asia/Ho_Chi_Minh', vn])
  expect(await since({ 'time-zone': 'America/New_York' })).toEqual(['America/New_York', expect.stringMatching(/^Mon 2 Nov(?: 2026)?, 22:00$/)])
  expect(await since({ 'time-zone': 'Mars/Olympus_Mons' })).toEqual(['Asia/Ho_Chi_Minh', vn])
  expect(await since({ 'time-zone': "Asia/Saigon'; DROP" })).toEqual(['Asia/Ho_Chi_Minh', vn])
  const d = (await (await call(w.e, 'GET', '/api/owner/dashboard', { ...bearer(w.ownerApp), 'time-zone': 'Europe/Paris' })).json()) as { tz: string }
  expect(d.tz).toBe('Europe/Paris')
})

test('a reader\'s photo: approved (the next pass publishes it) or removed now, by the owner\'s app only; a bad request says what it takes', async () => {
  const w = await worker()
  const post = (id: string, body: unknown, t = w.ownerApp) => call(w.e, 'POST', `/api/owner/photos/${id}`, bearer(t), body)
  const ok = await post(S.PHOTO_WAITING, { action: 'approve' })
  expect(await contracted(ok, 'post', `/api/owner/photos/${S.PHOTO_WAITING}`)).toEqual({ ok: true, changed: true })
  expect(w.ab.m.has(`photo-ok:${S.PHOTO_WAITING}`)).toBe(true)
  // Approved again: nothing to do, and its 30 days don't start over.
  w.ab.m.set(`photo-ok:${S.PHOTO_WAITING}`, { value: '2026-10-20T00:00:00.000Z' })
  expect(await (await post(S.PHOTO_WAITING, { action: 'approve' })).json()).toEqual({ ok: true, changed: false })
  expect(w.ab.m.get(`photo-ok:${S.PHOTO_WAITING}`)!.value).toBe('2026-10-20T00:00:00.000Z')
  // The page shows it approved, and its blocks too.
  const s = (await (await call(w.e, 'GET', '/api/owner/sections/anh-ban-doc', bearer(w.ownerApp))).json()) as Section
  expect(s.blocks.find(b => b.kind === 'photos')).toMatchObject({ items: [{ id: S.PHOTO_WAITING, meta: ['species:betta-splendens', expect.any(String), 'Approved · goes up at the next pass'], actions: [{ label: 'Remove' }] }] })
  // A photo shown: removed now, every file with it.
  expect(await contracted(await post(S.PHOTO_LIVE, { action: 'remove' }), 'post', `/api/owner/photos/${S.PHOTO_LIVE}`)).toEqual({ ok: true, changed: true })
  expect(await w.db.prepare('SELECT status FROM photos WHERE id = ?').bind(S.PHOTO_LIVE).first()).toEqual({ status: 'removed' })
  expect(w.media.m.size).toBe(0)
  // The overview's last action is that removal, read back from what it kept.
  const dash = (await (await call(w.e, 'GET', '/api/owner/dashboard', bearer(w.ownerApp))).json()) as { lastAction: { text: string; section: string } | null }
  expect(dash.lastAction).toMatchObject({ text: expect.stringMatching(/^You removed a reader photo/), section: 'anh-ban-doc' })
  // Nothing left to do: said, not refused.
  expect(await (await post(S.PHOTO_LIVE, { action: 'remove' })).json()).toEqual({ ok: true, changed: false })
  expect(await (await post(S.PHOTO_LIVE, { action: 'approve' })).json()).toEqual({ ok: true, changed: false })
  for (const bad of [{}, { action: 'publish' }, 'not json', [], null]) {
    const r = await post(S.PHOTO_WAITING, bad)
    expect(r.status, JSON.stringify(bad)).toBe(400)
    expect(await contracted(r, 'post', `/api/owner/photos/${S.PHOTO_WAITING}`)).toMatchObject({ error: 'bad_request', message: expect.any(String) })
  }
  const get = await call(w.e, 'GET', `/api/owner/photos/${S.PHOTO_WAITING}`, bearer(w.ownerApp))
  expect([get.status, get.headers.get('allow')]).toEqual([405, 'POST'])
  // Readers' photos not set up: unavailable, and only after the owner check.
  const off = await worker({ MEDIA: undefined })
  const r = await call(off.e, 'POST', `/api/owner/photos/${S.PHOTO_WAITING}`, bearer(off.ownerApp), { action: 'remove' })
  expect([r.status, (await contracted(r, 'post', `/api/owner/photos/${S.PHOTO_WAITING}`)).error]).toEqual([503, 'unavailable'])
  expect((await call(off.e, 'POST', `/api/owner/photos/${S.PHOTO_WAITING}`, bearer(off.readerApp), { action: 'remove' })).status).toBe(404)
})

test('hiding a page and bringing it back, as the page\'s form does; a home page or a non-page refused with the page\'s words', async () => {
  const w = await worker()
  const post = (body: unknown) => call(w.e, 'POST', '/api/owner/hidden', bearer(w.ownerApp), body)
  const hidden = () => JSON.parse(w.ab.m.get('hidden')!.value)
  expect(await contracted(await post({ path: 'https://aquatome.com/vi/ca/y/', hide: true, note: '  sai loài  ' }), 'post', '/api/owner/hidden')).toEqual({ ok: true, path: '/ca/y/', hidden: true })
  expect(hidden()['/ca/y/']).toEqual({ at: expect.any(String), note: 'sai loài' })
  expect(await (await post({ path: '/id/ikan/z/', hide: true })).json()).toEqual({ ok: true, path: '/id/ikan/z/', hidden: true })
  expect(hidden()['/id/ikan/z/']).toEqual({ at: expect.any(String) })
  // The hidden section lists them, each with its button back.
  const s = (await (await call(w.e, 'GET', '/api/owner/sections/an-trang', bearer(w.ownerApp))).json()) as Section
  const list = s.blocks.find(b => b.kind === 'hidden')
  expect(list?.kind === 'hidden' && list.items.map(x => x.path).sort()).toEqual(['/ca/ca-x/', '/ca/y/', '/id/ikan/z/'])
  expect(list?.kind === 'hidden' && list.items.at(-1)!.path).toBe('/ca/ca-x/') // newest first
  expect(list?.kind === 'hidden' && list.items.find(x => x.path === '/ca/y/')!.note).toBe('sai loài')
  expect(list?.kind === 'hidden' && list.items.find(x => x.path === '/ca/y/')!.actions).toEqual([{ label: 'Show again', method: 'POST', path: '/api/owner/hidden', body: { path: '/ca/y/', hide: false } }])
  expect(await (await post({ path: '/ca/y/', hide: false })).json()).toEqual({ ok: true, path: '/ca/y/', hidden: false })
  expect(Object.keys(hidden())).toEqual(['/ca/ca-x/', '/id/ikan/z/'])
  for (const path of ['/', '/id/', 'https://other.site/', '/_ab/']) {
    const r = await post({ path, hide: true })
    expect(r.status, path).toBe(400)
    expect(await contracted(r, 'post', '/api/owner/hidden'), path).toEqual({ error: 'not_a_page', message: 'Only one page of the site can be hidden, and not the home page.' })
  }
  for (const bad of [{ path: '/ca/y/' }, { path: '/ca/y/', hide: 'yes' }, { path: 1, hide: true }, { path: '/ca/y/', hide: true, note: 3 }, 'x']) {
    const r = await post(bad)
    expect([r.status, (await contracted(r, 'post', '/api/owner/hidden')).error], JSON.stringify(bad)).toEqual([400, 'bad_request'])
  }
})

test('a kept fish-ID photo deleted from the app; only one an account or no one sent, by its id', async () => {
  const w = await worker()
  const del = (who: string, id: string, t = w.ownerApp) => call(w.e, 'DELETE', `/api/owner/fishid-shots/${who}/${id}`, bearer(t))
  expect(await contracted(await del('anon', S.KEPT_ANON), 'delete', `/api/owner/fishid-shots/anon/${S.KEPT_ANON}`)).toEqual({ ok: true, changed: true })
  expect(await (await del('reader-1', S.KEPT_ID)).json()).toEqual({ ok: true, changed: true })
  expect(w.uploads.m.has(`fish-id/reader-1/${S.KEPT_ID}`)).toBe(false)
  expect(await (await del('reader-1', S.KEPT_ID)).json()).toEqual({ ok: true, changed: false })
  // Never a key built from anything else: only under fish-id/, by an account and a photo id.
  for (const [who, id] of [['..', S.KEPT_ID], ['reader-1', '../x'], ['reader-1', 'x']]) expect((await del(who!, id!)).status, `${who} ${id}`).toBe(404)
  expect(await (await del('pending', S.PHOTO_WAITING)).json()).toEqual({ ok: true, changed: false })
  expect(w.uploads.m.has(`pending/${S.PHOTO_WAITING}`)).toBe(true)
  const post = await call(w.e, 'POST', `/api/owner/fishid-shots/anon/${S.KEPT_ANON}`, bearer(w.ownerApp), {})
  expect([post.status, post.headers.get('allow')]).toEqual([405, 'DELETE'])
  const off = await worker({ UPLOADS: undefined })
  expect((await call(off.e, 'DELETE', `/api/owner/fishid-shots/anon/${S.KEPT_ANON}`, bearer(off.ownerApp))).status).toBe(503)
})

test('the two private images take the owner\'s app session too, never stored or indexed; a reader\'s, the dashboard token, an ended session or nobody get 404', async () => {
  const w = await worker()
  const get = (path: string, h: Record<string, string>) => call(w.e, 'GET', path, h)
  for (const [path, bytes] of [[`/_ab/anh/${S.PHOTO_WAITING}`, [0xff, 0xd8, 9]], [`/_ab/anh-nhan-dien/anh/reader-1/${S.KEPT_ID}`, [0xff, 0xd8, 1]], [`/_ab/anh-nhan-dien/anh/anon/${S.KEPT_ANON}`, [0xff, 0xd8, 2]]] as [string, number[]][]) {
    for (const h of [bearer(w.ownerApp), { cookie: `__Host-aq_session=${w.ownerWeb}` }]) {
      const r = await get(path, h)
      expect([r.status, r.headers.get('cache-control'), r.headers.get('x-robots-tag'), [...new Uint8Array(await r.arrayBuffer())]], path).toEqual([200, 'private, no-store', 'noindex, nofollow', bytes])
    }
    for (const h of [{}, bearer(w.readerApp), bearer(w.ownerWeb), bearer(DASH_TOKEN), bearer(w.ended), bearer(w.signedOut), { cookie: `__Host-aq_session=${w.readerWeb}` }] as Record<string, string>[]) expect((await get(path, h)).status, `${path} ${JSON.stringify(h)}`).toBe(404)
  }
  // The pages' own forms stay the cookie's: the app's bearer can't post them.
  const form = (path: string, fields: Record<string, string>) => handle(new Request(`https://x.test${path}`, { method: 'POST', headers: bearer(w.ownerApp), body: new URLSearchParams(fields) }), w.e)
  expect((await form('/_ab/photos', { id: S.PHOTO_WAITING, action: 'remove' })).status).toBe(404)
  expect((await form('/_ab/hidden', { url: '/ca/y/', action: 'hide' })).status).toBe(404)
  expect((await form('/_ab/anh-nhan-dien/xoa', { who: 'anon', id: S.KEPT_ANON })).status).toBe(404)
  expect(w.uploads.m.size).toBe(3)
})

// ——— The daily report's delivery: /api/owner/report-settings and /api/owner/push-token ———

test('bao-cao: every block its section sends, in each of its states, is one the contract describes', () => {
  for (const [name, , json] of VARIANTS['bao-cao']!) {
    const blocks = json().blocks
    for (const b of blocks) expect(misfits(b, { $ref: '#/components/schemas/Block' }), `${name}: ${JSON.stringify(b)}`).toEqual([])
    // Its buttons are the actions block's alone, each a POST of one switch.
    for (const b of blocks) if (b.kind === 'actions') for (const a of b.actions) expect([a.method, a.path, Object.keys(a.body!).length, a.tone], name).toEqual(['POST', '/api/owner/report-settings', 1, undefined])
  }
})

// ——— Readers' comments: the binh-luan section, GET /api/owner/comments and POST /api/owner/comments/{id} ———

test('binh-luan: every block its section sends, in each of its states, is one the contract describes', () => {
  for (const [name, , json] of VARIANTS['binh-luan']!) for (const b of json().blocks) expect(misfits(b, { $ref: '#/components/schemas/Block' }), `${name}: ${JSON.stringify(b).slice(0, 300)}`).toEqual([])
})

const DIA = 'species:symphysodon-aequifasciatus'
const FILLER = S.COMMENT_FILLER
const NO_COMMENT = '99999999-9999-4999-8999-999999999999'
/** The second page of held comments as seeded: the fillers, posted at one moment, go by id. */
const HELD_CURSOR = S.COMMENT_MORE
/**
 * Comments in D1: held by a rule and after a signed-in reader's report (two reports) on a page the fixture build has,
 * 50 more held on a page it doesn't (at one moment, so the paging goes by id); one shown; hidden a day ago and past its 30 days.
 */
async function seedComments(db: D1Database) {
  const add = (id: string, ref: string, status: string, reason: string | null, created: string, decided: string | null = null) =>
    db.prepare('INSERT INTO comments (id, entity_ref, name, body, status, helpful, reason, created_at, decided_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)').bind(id, ref, `Reader ${id.slice(-2)}`, `Comment ${id.slice(-4)}`, status, reason, created, decided).run()
  await add(S.COMMENT_HELD, DIA, 'held', 'blocked term: zalo:', '2026-11-04T07:00:00.000Z')
  await add(S.COMMENT_REPORTED, DIA, 'held', 'reported by a reader', '2026-11-04T06:00:00.000Z')
  for (let i = 0; i < 50; i++) await add(FILLER(i), 'guide:gone-guide', 'held', 'more than one link', '2026-11-01T00:00:00.000Z')
  await add(S.COMMENT_SHOWN, DIA, 'approved', null, '2026-11-03T02:00:00.000Z')
  await add(S.COMMENT_HIDDEN, DIA, 'removed', 'Hidden by the owner', '2026-11-03T05:00:00.000Z', new Date(Date.now() - 86_400_000).toISOString())
  await add(S.COMMENT_EXPIRED, DIA, 'removed', 'Spam: a betting site.', '2026-09-20T05:00:00.000Z', '2026-01-01T00:00:00.000Z')
  for (const [who, why, at] of [['r1', 'off topic', '2026-11-04T06:30:00.000Z'], ['r2', null, '2026-11-04T06:40:00.000Z']]) {
    await db.prepare("INSERT INTO reports (kind, item_id, reporter, reason, created_at) VALUES ('comment', ?, ?, ?, ?)").bind(S.COMMENT_REPORTED, who, why, at).run()
  }
}
const commentsIn = (s: Section) => s.blocks.find((b): b is CommentsBlock => b.kind === 'comments')!

test('binh-luan through the Worker: one state at a time from D1, newest first, each on its page from the build; 50, then the rest from GET /api/owner/comments', async () => {
  const w = await worker()
  await seedComments(w.db)
  const section = async (q = '') => {
    const r = await call(w.e, 'GET', `/api/owner/sections/binh-luan${q}`, bearer(w.ownerApp))
    expect(r.status, q).toBe(200)
    const s = (await contracted(r, 'get', '/api/owner/sections/binh-luan')) as unknown as Section
    expect(s.blocks.filter(b => b.kind === 'note' && b.tone === 'bad'), q).toEqual([])
    return s
  }
  const held = commentsIn(await section())
  expect(held.state).toBe('held')
  expect(held.filters).toEqual([
    { state: 'held', label: 'Held', count: 52, href: '/api/owner/sections/binh-luan?state=held' },
    { state: 'shown', label: 'Shown', count: 1, href: '/api/owner/sections/binh-luan?state=shown' },
    { state: 'hidden', label: 'Hidden', count: 2, href: '/api/owner/sections/binh-luan?state=hidden' },
  ])
  expect(held.items.map(c => c.id)).toEqual([S.COMMENT_HELD, S.COMMENT_REPORTED, ...Array.from({ length: 48 }, (_, i) => FILLER(49 - i))])
  const button = (id: string, label: string, action: string, tone?: string) => ({ label, method: 'POST', path: `/api/owner/comments/${id}`, body: { action }, ...(tone ? { tone } : {}) })
  expect(held.items[0]).toEqual({
    id: S.COMMENT_HELD, at: '2026-11-04T07:00:00.000Z', name: 'Reader 4f', page: { path: '/ca/ca-dia/', title: 'Cá đĩa' }, text: 'Comment 3e4f', state: 'held',
    reason: 'Held when posted: it has “zalo:”, a blocked term', actions: [button(S.COMMENT_HELD, 'Show', 'show'), button(S.COMMENT_HELD, 'Hide', 'hide', 'bad')],
  })
  expect(held.items[1]).toMatchObject({ reason: 'Held after a report', reports: ['off topic', ''] })
  // A page this build doesn't have: said so, never its key, and no address.
  expect(held.items[2]).toMatchObject({ page: { title: 'a page no longer on the site' }, reason: 'Held when posted: it has more than one link' })
  expect(held.items[2]!.page).not.toHaveProperty('path')
  expect(held.next).toBe(HELD_CURSOR)
  // The rest, from the block's `next`: none twice, none missed, the last page without `next`.
  const more = await call(w.e, 'GET', `/api/owner/comments?state=held&cursor=${held.next}`, { ...bearer(w.ownerApp), 'time-zone': 'Europe/Paris' })
  const rest = (await contracted(more, 'get', '/api/owner/comments')) as { tz: string; items: CommentItem[]; next?: string }
  expect([rest.tz, rest.items.map(c => c.id), rest.next]).toEqual(['Europe/Paris', [FILLER(1), FILLER(0)], undefined])
  // Each filter's address reads its state.
  for (const f of held.filters) expect(commentsIn(await section(f.href.slice('/api/owner/sections/binh-luan'.length))).state).toBe(f.state)
  expect(commentsIn(await section('?state=shown')).items).toEqual([expect.objectContaining({ id: S.COMMENT_SHOWN, reason: '', actions: [button(S.COMMENT_SHOWN, 'Hide', 'hide', 'bad')] })])
  // Hidden: shown again within its 30 days; past them, no button (it waits to be deleted).
  expect(commentsIn(await section('?state=hidden')).items.map(c => [c.id, c.reason, c.actions])).toEqual([
    [S.COMMENT_HIDDEN, 'Hidden by the owner', [button(S.COMMENT_HIDDEN, 'Show again', 'show')]], [S.COMMENT_EXPIRED, 'Spam: a betting site.', []],
  ])
  // What the section and the path don't take: 400, with what they do.
  for (const q of ['?state=removed', '?state=', '?state=held&state=shown', '?x=1', `?cursor=${held.next}`, '?test=1']) {
    const r = await call(w.e, 'GET', `/api/owner/sections/binh-luan${q}`, bearer(w.ownerApp))
    expect([r.status, await contracted(r, 'get', '/api/owner/sections/binh-luan')], q).toEqual([400, { error: 'bad_request', message: expect.stringContaining('"held"') }])
  }
  for (const q of ['', '?state=held', `?cursor=${held.next}`, `?state=removed&cursor=${held.next}`, '?state=held&cursor=nope', `?state=held&cursor=${held.next}&x=1`, `?state=held&cursor=${held.next}&cursor=${held.next}`]) {
    const r = await call(w.e, 'GET', `/api/owner/comments${q}`, bearer(w.ownerApp))
    expect([r.status, await contracted(r, 'get', '/api/owner/comments')], q).toEqual([400, { error: 'bad_request', message: expect.stringContaining('cursor') }])
  }
  const post = await call(w.e, 'POST', '/api/owner/comments', bearer(w.ownerApp), {})
  expect([post.status, post.headers.get('allow'), await contracted(post, 'get', '/api/owner/comments')]).toEqual([405, 'GET', { error: 'method' }])
  // The web page from the same load: the next page by the same cursor.
  const page = async (q: string) => {
    const r = await call(w.e, 'GET', `/_ab/binh-luan/${q}`, { cookie: `__Host-aq_session=${w.ownerWeb}` })
    expect(r.status, q).toBe(200)
    return commentsOf(dom(await r.text()).querySelector('section.comments')!)
  }
  const first = await page('')
  expect([first.state, first.items.length, first.next]).toEqual(['held', 50, held.next])
  expect((await page(`?state=held&cursor=${held.next}`)).items.map(c => c.id)).toEqual([FILLER(1), FILLER(0)])
  // A bad state or cursor on the web: the newest held.
  expect((await page('?state=x&cursor=nope')).items[0]!.id).toBe(S.COMMENT_HELD)
})

test('a comment shown, hidden and shown again from the app or the page\'s form; past its 30 days, expired; the moderation leaves the owner\'s decision alone', async () => {
  const w = await worker()
  await seedComments(w.db)
  const row = async (id: string) => w.db.prepare('SELECT status, reason, decided_at FROM comments WHERE id = ?').bind(id).first<{ status: string; reason: string; decided_at: string }>()
  const path = (id: string) => `/api/owner/comments/${id}`
  const act = (id: string, body: unknown, h = bearer(w.ownerApp)) => call(w.e, 'POST', path(id), h, body)
  // Nobody else: 401 signed_out without a live app session, 404 for another account's, before anything else; nothing changes.
  for (const [h, status, error] of [[{}, 401, 'signed_out'], [bearer(w.ownerWeb), 401, 'signed_out'], [{ cookie: `__Host-aq_session=${w.ownerWeb}` }, 401, 'signed_out'], [bearer(DASH_TOKEN), 401, 'signed_out'], [bearer(w.readerApp), 404, 'not_found']] as [Record<string, string>, number, string][]) {
    for (const [method, p, body] of [['POST', path(S.COMMENT_HELD), { action: 'show' }], ['POST', path(NO_COMMENT), 'x'], ['GET', `/api/owner/comments?state=held&cursor=${HELD_CURSOR}`, undefined], ['GET', '/api/owner/sections/binh-luan?x=1', undefined]] as [string, string, unknown][]) {
      const r = await call(w.e, method, p, h, body)
      expect([r.status, await contracted(r, method.toLowerCase() as 'get', p)], `${JSON.stringify(h)} ${method} ${p}`).toEqual([status, { error }])
    }
  }
  expect(await row(S.COMMENT_HELD)).toMatchObject({ status: 'held', decided_at: null })

  // Held → shown, with the owner's reason and the time; again, nothing written.
  expect(await contracted(await act(S.COMMENT_HELD, { action: 'show' }), 'post', path(S.COMMENT_HELD))).toEqual({ ok: true, changed: true })
  const shown = await row(S.COMMENT_HELD)
  expect(shown).toEqual({ status: 'approved', reason: 'Shown by the owner', decided_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) })
  await new Promise(r => setTimeout(r, 5))
  expect(await (await act(S.COMMENT_HELD, { action: 'show' })).json()).toEqual({ ok: true, changed: false })
  expect(await row(S.COMMENT_HELD)).toEqual(shown)
  // Shown → hidden; hidden → shown again, within its 30 days.
  expect(await (await act(S.COMMENT_SHOWN, { action: 'hide' })).json()).toEqual({ ok: true, changed: true })
  expect(await row(S.COMMENT_SHOWN)).toMatchObject({ status: 'removed', reason: 'Hidden by the owner' })
  expect(await (await act(S.COMMENT_HIDDEN, { action: 'show' })).json()).toEqual({ ok: true, changed: true })
  expect(await row(S.COMMENT_HIDDEN)).toMatchObject({ status: 'approved', reason: 'Shown by the owner' })
  // Past its 30 days: refused, said why; hiding it again changes nothing.
  const expired = await act(S.COMMENT_EXPIRED, { action: 'show' })
  expect([expired.status, await contracted(expired, 'post', path(S.COMMENT_EXPIRED))]).toEqual([409, { error: 'expired', message: EXPIRED }])
  expect(await (await act(S.COMMENT_EXPIRED, { action: 'hide' })).json()).toEqual({ ok: true, changed: false })
  expect(await row(S.COMMENT_EXPIRED)).toEqual({ status: 'removed', reason: 'Spam: a betting site.', decided_at: '2026-01-01T00:00:00.000Z' })
  // No such comment (or one deleted); neither action; not JSON; the wrong method.
  const gone = await act(NO_COMMENT, { action: 'hide' })
  expect([gone.status, await contracted(gone, 'post', path(NO_COMMENT))]).toEqual([404, { error: 'not_found', message: GONE }])
  for (const bad of [{}, { action: 'approve' }, { action: 'remove' }, 'not json', [], null]) {
    const r = await act(S.COMMENT_REPORTED, bad)
    expect([r.status, await contracted(r, 'post', path(S.COMMENT_REPORTED))], JSON.stringify(bad)).toEqual([400, { error: 'bad_request', message: 'action: "show" or "hide".' }])
  }
  const get = await call(w.e, 'GET', path(S.COMMENT_HELD), bearer(w.ownerApp))
  expect([get.status, get.headers.get('allow')]).toEqual([405, 'POST'])
  // The nightly moderation doesn't take up what the owner decided; the rest of the held still wait for it.
  const queued = (await moderationQueue(w.db, new Date())).map(q => q.id)
  for (const id of [S.COMMENT_HELD, S.COMMENT_SHOWN, S.COMMENT_HIDDEN, S.COMMENT_EXPIRED]) expect(queued, id).not.toContain(id)
  expect(queued).toContain(S.COMMENT_REPORTED)

  // The page's form: the cookie's, the same decision, back to the state it was on.
  const form = (fields: Record<string, string>, h: Record<string, string> = { cookie: `__Host-aq_session=${w.ownerWeb}` }) =>
    handle(new Request('https://x.test/_ab/comments', { method: 'POST', headers: h, body: new URLSearchParams(fields) }), w.e)
  for (const h of [bearer(w.ownerApp), { cookie: `__Host-aq_session=${w.readerWeb}` }, {}] as Record<string, string>[]) expect((await form({ id: S.COMMENT_REPORTED, action: 'hide', state: 'held' }, h)).status).toBe(404)
  expect(await row(S.COMMENT_REPORTED)).toMatchObject({ status: 'held' })
  const hid = await form({ id: S.COMMENT_REPORTED, action: 'hide', state: 'held' })
  expect([hid.status, hid.headers.get('location')]).toEqual([303, '/_ab/binh-luan/?state=held'])
  expect(await row(S.COMMENT_REPORTED)).toMatchObject({ status: 'removed', reason: 'Hidden by the owner' })
  expect((await form({ id: S.COMMENT_REPORTED, action: 'show', state: 'hidden' })).headers.get('location')).toBe('/_ab/binh-luan/?state=hidden')
  const late = await form({ id: S.COMMENT_EXPIRED, action: 'show', state: 'hidden' })
  expect([late.status, await late.text()]).toEqual([409, EXPIRED])
  expect((await form({ id: S.COMMENT_HELD, action: 'publish' })).status).toBe(400)

  // D1 down after the owner check: 503, nothing changed.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const down = { ...w.e, DB: { prepare: (sql: string) => (/\bcomments\b/.test(sql) ? (() => { throw new Error('D1 down') })() : w.db.prepare(sql)) } } as unknown as Env
  const r = await call(down, 'POST', path(S.COMMENT_SHOWN), bearer(w.ownerApp), { action: 'show' })
  expect([r.status, (await contracted(r, 'post', path(S.COMMENT_SHOWN))).error]).toEqual([503, 'unavailable'])
  expect(await row(S.COMMENT_SHOWN)).toMatchObject({ status: 'removed' })
})

/** An error as the accounts API says them: `{error, message?}`, the contract's Error. */
const errorOf = async (r: Response) => {
  expect([r.headers.get('cache-control'), r.headers.get('x-robots-tag')]).toEqual(['no-store', 'noindex, nofollow'])
  const b = await r.json()
  expect(misfits(b, { $ref: '#/components/schemas/Error' })).toEqual([])
  return b as { error: string; message?: string }
}
const TOKEN_A = 'a1'.repeat(32)
const TOKEN_B = 'b2'.repeat(32)

test('the report\'s delivery and the phones it notifies: only the owner\'s app session; without a live one 401 signed_out, another account\'s 404, and nothing changes', async () => {
  const w = await worker()
  const calls: [string, string, unknown][] = [
    ['POST', '/api/owner/report-settings', { push: true }], ['POST', '/api/owner/push-token', { token: TOKEN_A, environment: 'production' }], ['DELETE', '/api/owner/push-token', { token: TOKEN_A }],
  ]
  const who: [Record<string, string>, number, string][] = [
    [{}, 401, 'signed_out'], [bearer(w.ownerWeb), 401, 'signed_out'], [{ cookie: `__Host-aq_session=${w.ownerWeb}` }, 401, 'signed_out'], [bearer(DASH_TOKEN), 401, 'signed_out'],
    [bearer(w.ended), 401, 'signed_out'], [bearer(w.signedOut), 401, 'signed_out'], [bearer(w.readerApp), 404, 'not_found'],
  ]
  for (const [h, status, error] of who) {
    for (const [method, path, body] of calls) {
      const r = await call(w.e, method, path, h, body)
      expect([r.status, await errorOf(r)], `${JSON.stringify(h)} ${method} ${path}`).toEqual([status, { error }])
    }
  }
  expect(w.ab.m.has('report-settings')).toBe(false)
  expect(w.ab.m.has('push-tokens')).toBe(false)
  // The web page's form stays the cookie's: the app's bearer can't post it.
  const form = await handle(new Request('https://x.test/_ab/bao-cao/cai-dat', { method: 'POST', headers: bearer(w.ownerApp), body: new URLSearchParams({ push: '1' }) }), w.e)
  expect(form.status).toBe(404)
  expect(w.ab.m.has('report-settings')).toBe(false)
})

test('the report\'s delivery from the app: the section\'s buttons set it as the page\'s form does, and the section says it after', async () => {
  const w = await worker()
  const section = async () => (await (await call(w.e, 'GET', '/api/owner/sections/bao-cao', bearer(w.ownerApp))).json()) as Section
  const how = (s: Section) => s.blocks.slice(s.blocks.findIndex(b => b.kind === 'heading' && b.text === 'How it reaches you') + 1, s.blocks.findIndex(b => b.kind === 'heading' && b.text === 'Reports'))
  // Unset: email on, push off, as before push.
  expect(how(await section())).toEqual([
    { kind: 'note', text: 'Email: on. Phone notifications: off.', tone: 'plain' },
    { kind: 'actions', actions: [{ label: 'Turn off email', method: 'POST', path: '/api/owner/report-settings', body: { email: false } }, { label: 'Turn on notifications', method: 'POST', path: '/api/owner/report-settings', body: { push: true } }] },
  ])
  // Each button pressed as the app presses it.
  for (const a of (how(await section())[1] as { actions: Action[] }).actions) {
    const r = await call(w.e, a.method, a.path, bearer(w.ownerApp), a.body)
    expect([r.status, r.headers.get('cache-control')]).toEqual([200, 'no-store'])
    expect(await r.json()).toEqual({ ok: true, changed: true, email: false, push: a.body!.push === true })
  }
  expect(JSON.parse(w.ab.m.get('report-settings')!.value)).toEqual({ email: false, push: true })
  // Push on with no phone registered, and no APNs key: said, with what to do; the buttons turn them back.
  expect(how(await section())).toEqual([
    { kind: 'note', text: 'Email: off. Phone notifications: on, but no phone has signed up and there is no APNs key, so none can go. Open the AquaTome app on the phone and turn on “Nhận thông báo báo cáo trên máy này”.', tone: 'bad' },
    { kind: 'actions', actions: [{ label: 'Turn on email', method: 'POST', path: '/api/owner/report-settings', body: { email: true } }, { label: 'Turn off notifications', method: 'POST', path: '/api/owner/report-settings', body: { push: false } }] },
  ])
  // A phone registered and the key set: where it goes.
  await call(w.e, 'POST', '/api/owner/push-token', bearer(w.ownerApp), { token: TOKEN_A, environment: 'production' })
  const keyed = { ...w.e, APNS_KEY: 'k', APNS_KEY_ID: 'K1', APPLE_TEAM_ID: 'T1' } as unknown as Env
  const s = (await (await call(keyed, 'GET', '/api/owner/sections/bao-cao', bearer(w.ownerApp))).json()) as Section
  expect(how(s)[0]).toEqual({ kind: 'note', text: 'Email: off. Phone notifications: on, to 1 phone.', tone: 'plain' })
  // Already so: nothing written, said so.
  expect(await (await call(w.e, 'POST', '/api/owner/report-settings', bearer(w.ownerApp), { email: false, push: true })).json()).toEqual({ ok: true, changed: false, email: false, push: true })
  for (const bad of [{}, { email: 'no' }, { push: 1 }, { email: true, quiet: true }, 'x', [], null]) {
    const r = await call(w.e, 'POST', '/api/owner/report-settings', bearer(w.ownerApp), bad)
    expect([r.status, await errorOf(r)], JSON.stringify(bad)).toEqual([400, { error: 'bad_request', message: 'email and/or push (true or false).' }])
  }
  // Read as they are now (the app's bell): the same two switches the POST answers with.
  const get = await call(w.e, 'GET', '/api/owner/report-settings', bearer(w.ownerApp))
  expect([get.status, get.headers.get('cache-control'), await get.json()]).toEqual([200, 'no-store', { email: false, push: true }])
  const del = await call(w.e, 'DELETE', '/api/owner/report-settings', bearer(w.ownerApp))
  expect([del.status, del.headers.get('allow'), await errorOf(del)]).toEqual([405, 'GET, POST', { error: 'method' }])
  // KV down: unavailable, and nothing changes.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const down = { ...w.e, AB: Object.assign(Object.create(w.ab.ns), { put: async () => { throw new Error('KV down') } }) } as unknown as Env
  const r = await call(down, 'POST', '/api/owner/report-settings', bearer(w.ownerApp), { email: true })
  expect([r.status, (await errorOf(r)).error]).toEqual([503, 'unavailable'])
  expect(JSON.parse(w.ab.m.get('report-settings')!.value)).toEqual({ email: false, push: true })
})

test('a phone registers for the report\'s notification: kept once with its environment and the last time it said so; DELETE removes it; a bad token is refused', async () => {
  const w = await worker()
  const tokens = () => JSON.parse(w.ab.m.get('push-tokens')?.value ?? '{}') as Record<string, { environment: string; seen: string; session: string }>
  const send = (method: string, body: unknown) => call(w.e, method, '/api/owner/push-token', bearer(w.ownerApp), body)
  expect(await (await send('POST', { token: TOKEN_A, environment: 'production' })).json()).toEqual({ ok: true, changed: true })
  const first = tokens()[TOKEN_A]!
  // Tied to the session it came in: its id (the bearer's hash), never the bearer.
  const { sha256 } = await import('../accounts/session')
  expect(first).toEqual({ environment: 'production', seen: expect.stringMatching(/^\d{4}-\d\d-\d\dT/), session: await sha256(w.ownerApp) })
  expect(JSON.stringify(tokens())).not.toContain(w.ownerApp)
  // Each launch posts it again: the time moves, no second copy.
  await new Promise(r => setTimeout(r, 5))
  expect(await (await send('POST', { token: TOKEN_A, environment: 'production' })).json()).toEqual({ ok: true, changed: false })
  expect(Object.keys(tokens())).toEqual([TOKEN_A])
  expect(tokens()[TOKEN_A]!.seen > first.seen).toBe(true)
  // A debug build on another phone; then the first phone moves to a debug build.
  expect(await (await send('POST', { token: TOKEN_B, environment: 'sandbox' })).json()).toEqual({ ok: true, changed: true })
  expect(await (await send('POST', { token: TOKEN_A, environment: 'sandbox' })).json()).toEqual({ ok: true, changed: true })
  expect(Object.fromEntries(Object.entries(tokens()).map(([t, d]) => [t, d.environment]))).toEqual({ [TOKEN_A]: 'sandbox', [TOKEN_B]: 'sandbox' })
  // Turned off on a phone, or signed out: removed; again, nothing to remove.
  expect(await (await send('DELETE', { token: TOKEN_A })).json()).toEqual({ ok: true, changed: true })
  expect(await (await send('DELETE', { token: TOKEN_A })).json()).toEqual({ ok: true, changed: false })
  expect(Object.keys(tokens())).toEqual([TOKEN_B])
  const POST_SAYS = 'token (lowercase hex), environment ("sandbox" or "production").'
  for (const bad of [
    { token: TOKEN_A.toUpperCase(), environment: 'production' }, { token: 'a1b2', environment: 'production' }, { token: `${TOKEN_A}a`, environment: 'production' }, { token: 'zz'.repeat(32), environment: 'production' },
    { token: 'a1'.repeat(101), environment: 'production' }, { token: TOKEN_A }, { token: TOKEN_A, environment: 'development' }, { token: TOKEN_A, environment: 'production', name: 'x' }, 'x', [], null,
  ]) {
    const r = await send('POST', bad)
    expect([r.status, await errorOf(r)], JSON.stringify(bad)).toEqual([400, { error: 'bad_request', message: POST_SAYS }])
  }
  for (const bad of [{ token: 'nope' }, { token: TOKEN_B, environment: 'sandbox' }, {}]) {
    const r = await send('DELETE', bad)
    expect([r.status, await errorOf(r)], JSON.stringify(bad)).toEqual([400, { error: 'bad_request', message: 'token (lowercase hex).' }])
  }
  expect(Object.keys(tokens())).toEqual([TOKEN_B])
  const get = await call(w.e, 'GET', '/api/owner/push-token', bearer(w.ownerApp))
  expect([get.status, get.headers.get('allow'), await errorOf(get)]).toEqual([405, 'POST, DELETE', { error: 'method' }])
})

// ——— The app's samples: protocols/owner-dashboard-vectors.json ———

type Reply = { name: string; request: { method: string; path: string; headers?: Record<string, string>; body?: unknown }; status: number; body: unknown }
/** The replies the app's fake server serves: the sample's overview and sections, and each action and error as the Worker answers it. */
async function replies(): Promise<Reply[]> {
  const tz = { 'Time-Zone': S.TZ }
  const json = (x: unknown) => JSON.parse(JSON.stringify(x)) as unknown
  const out: Reply[] = [
    ...([['dashboard', S.TODAY], ['dashboard: nothing needs you', S.CALM], ['dashboard: the readers\' beacon down', { ...S.TODAY, beacon: F }], ['dashboard: the AI spend near its cap', S.SPENDING], ['dashboard: the engine quiet', S.QUIET]] as const).map(([name, t]) => (
      { name, request: { method: 'GET', path: '/api/owner/dashboard', headers: tz }, status: 200, body: json({ tz: S.TZ, ...dashboardJson(t), sections: SECTIONS.map(({ key, name }) => ({ key, name })) }) })),
    ...KEYS.map(key => ({ name: `section ${key}`, request: { method: 'GET', path: `/api/owner/sections/${key}`, headers: tz }, status: 200, body: json({ tz: S.TZ, ...paged(VARIANTS[key]![0]![2]()) }) })),
    // The other two comment lists, from the section's filter: the comments the action replies show and hide are in them.
    ...(['shown', 'hidden'] as const).map(state => ({
      name: `comments: ${state}`, request: { method: 'GET', path: `/api/owner/sections/binh-luan?state=${state}`, headers: tz }, status: 200,
      body: json({ tz: S.TZ, ...paged(VARIANTS['binh-luan']!.find(([name]) => name.startsWith(state))![2]()) }),
    })),
  ]
  // A period, a folded table opened, and a long table's last page, as the Worker reads them (owner-api.ts).
  const fish30 = fishIdSection(S.FISH_30)
  out.push({ name: 'period: fish ID, 30 days', request: { method: 'GET', path: '/api/owner/sections/nhan-dien-ca?period=d30', headers: tz }, status: 200, body: json({ tz: S.TZ, ...paged(fish30) }) })
  const fish = fishIdSection(S.FISH)
  for (const b of paged(fish).blocks) {
    if (b.kind !== 'table' || !b.id) continue
    const name = b.folded ? `table: fish ID's folded "${b.folded}"` : 'table: fish ID\'s recent calls, the last page'
    const path = `/api/owner/sections/nhan-dien-ca/tables/${b.id}${b.next ? `?cursor=${b.next}` : ''}`
    const first = tablePage(fish, b.id, b.next ?? null) as { next?: string }
    out.push({ name, request: { method: 'GET', path, headers: tz }, status: 200, body: json({ tz: S.TZ, ...first }) })
    // A long folded table, opened: its next 50 rows by the first page's `next`.
    if (b.folded && first.next) {
      out.push({ name: `${name}, the next page`, request: { method: 'GET', path: `${path}?cursor=${first.next}`, headers: tz }, status: 200, body: json({ tz: S.TZ, ...(tablePage(fish, b.id, first.next) as object) }) })
    }
  }
  const w = await worker()
  await seedComments(w.db)
  const actions: [string, string, string, unknown][] = [
    ['approve a waiting photo', 'POST', `/api/owner/photos/${S.PHOTO_WAITING}`, { action: 'approve' }],
    ['remove a photo', 'POST', `/api/owner/photos/${S.PHOTO_LIVE}`, { action: 'remove' }],
    ['remove a photo already removed', 'POST', `/api/owner/photos/${S.PHOTO_LIVE}`, { action: 'remove' }],
    ['a photo action that is neither', 'POST', `/api/owner/photos/${S.PHOTO_WAITING}`, { action: 'publish' }],
    ['hide a page', 'POST', '/api/owner/hidden', { path: '/ca/ca-y/', hide: true, note: 'sai loài' }],
    ['bring a page back', 'POST', '/api/owner/hidden', { path: '/ca/ca-y/', hide: false }],
    ['hide the home page', 'POST', '/api/owner/hidden', { path: '/', hide: true }],
    ['delete a kept fish-ID photo', 'DELETE', `/api/owner/fishid-shots/anon/${S.KEPT_ANON}`, undefined],
    // Readers' comments.
    ['show a held comment', 'POST', `/api/owner/comments/${S.COMMENT_HELD}`, { action: 'show' }],
    ['hide a shown comment', 'POST', `/api/owner/comments/${S.COMMENT_SHOWN}`, { action: 'hide' }],
    ['show again a hidden comment', 'POST', `/api/owner/comments/${S.COMMENT_HIDDEN}`, { action: 'show' }],
    ['show a comment hidden more than 30 days ago', 'POST', `/api/owner/comments/${S.COMMENT_EXPIRED}`, { action: 'show' }],
    ['a comment that doesn\'t exist', 'POST', `/api/owner/comments/${NO_COMMENT}`, { action: 'hide' }],
    ['a comment action that is neither', 'POST', `/api/owner/comments/${S.COMMENT_REPORTED}`, { action: 'approve' }],
    ['more comments', 'GET', `/api/owner/comments?state=held&cursor=${HELD_CURSOR}`, undefined],
    ['signed out', 'GET', '/api/owner/dashboard', undefined],
    ['not the owner', 'GET', '/api/owner/dashboard', undefined],
    ['storage down', 'GET', '/api/owner/dashboard', undefined],
    // The daily report's phones and delivery.
    ['register a phone', 'POST', '/api/owner/push-token', { token: S.PUSH_TOKEN, environment: 'production' }],
    ['register the same phone again', 'POST', '/api/owner/push-token', { token: S.PUSH_TOKEN, environment: 'production' }],
    ['register a phone: a token that isn\'t lowercase hex', 'POST', '/api/owner/push-token', { token: S.PUSH_TOKEN.toUpperCase(), environment: 'production' }],
    ['register a phone: another field', 'POST', '/api/owner/push-token', { token: S.PUSH_TOKEN, environment: 'production', name: 'iPhone' }],
    ['register a phone: an environment that is neither', 'POST', '/api/owner/push-token', { token: S.PUSH_TOKEN, environment: 'development' }],
    ['signed out: register a phone', 'POST', '/api/owner/push-token', { token: S.PUSH_TOKEN, environment: 'production' }],
    ['not the owner: register a phone', 'POST', '/api/owner/push-token', { token: S.PUSH_TOKEN, environment: 'production' }],
    ['unregister a phone', 'DELETE', '/api/owner/push-token', { token: S.PUSH_TOKEN }],
    ['unregister a phone: a token that isn\'t lowercase hex', 'DELETE', '/api/owner/push-token', { token: S.PUSH_TOKEN.toUpperCase() }],
    ['the report\'s delivery', 'GET', '/api/owner/report-settings', undefined],
    ['turn the report\'s notification on', 'POST', '/api/owner/report-settings', { push: true }],
    ['the report\'s delivery, its notification on', 'GET', '/api/owner/report-settings', undefined],
    ['a report setting that isn\'t true or false', 'POST', '/api/owner/report-settings', { push: 'yes' }],
    ['report settings that change neither', 'POST', '/api/owner/report-settings', {}],
    // Periods and tables the section doesn't have.
    ['a period the section doesn\'t offer', 'GET', '/api/owner/sections/nhan-dien-ca?period=year', undefined],
    ['a period on a section with none', 'GET', '/api/owner/sections/an-trang?period=d7', undefined],
    ['a table that isn\'t one', 'GET', '/api/owner/sections/an-trang/tables/t9', undefined],
    ['a table\'s cursor that isn\'t one', 'GET', '/api/owner/sections/affiliate/tables/t1?cursor=x', undefined],
  ]
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  for (const [name, method, path, body] of actions) {
    const h = name.startsWith('signed out') ? {} : name.startsWith('not the owner') ? bearer(w.readerApp) : bearer(w.ownerApp)
    const e = name === 'storage down' ? ({ ...w.e, DB: { prepare: () => { throw new Error('D1 down') } } } as unknown as Env) : w.e
    const r = await call(e, method, path, h, body)
    out.push({ name, request: { method, path, ...(body === undefined ? {} : { body }) }, status: r.status, body: await r.json() })
  }
  errors.mockRestore()
  return out
}

test('the samples the app\'s fake server serves are the Worker\'s replies, and the contract\'s (UPDATE_VECTORS=1 rewrites them)', async () => {
  const now = { replies: await replies() }
  const file = {
    $comment: 'Generated by apps/site/worker/test/owner-api.test.ts from apps/site/worker/test/owner-sample.ts (UPDATE_VECTORS=1 pnpm test): the owner dashboard\'s replies (protocols/owner-dashboard.openapi.json) at 2026-11-04T09:00:00Z in Asia/Ho_Chi_Minh, for the app\'s fake server and UI tests. Each `request` is what the app sends (with the owner\'s bearer; "signed out" with none, "not the owner" with another account\'s, "storage down" while D1 is down), each `body` what the Worker answers. Photo and page ids are the sample\'s.',
    ...now,
  }
  if (process.env.UPDATE_VECTORS) writeFileSync(VECTORS, `${JSON.stringify(file, null, 2)}\n`)
  const kept = JSON.parse(readFileSync(VECTORS, 'utf8')) as typeof file
  expect(kept.replies, 'protocols/owner-dashboard-vectors.json is out of date: UPDATE_VECTORS=1 rewrites it').toEqual(now.replies)
  // One reply per section, the overview, and each action; every one the contract's.
  expect(kept.replies.filter(r => r.name.startsWith('section ')).map(r => r.request.path.split('/').at(-1))).toEqual(KEYS)
  for (const r of kept.replies) {
    const op = api.paths[opOf(r.request.path)][r.request.method.toLowerCase()]
    const res = op.responses[String(r.status)]
    expect(res, `${r.name}: ${r.status}`).toBeDefined()
    expect(misfits(r.body, res.content['application/json'].schema), r.name).toEqual([])
    if (r.request.body !== undefined) {
      // What's refused as a bad request is what the contract doesn't allow (a token that isn't hex, another field): one
      // thing, when it's neither of the choices. Anything else fits it, taken or refused for another reason.
      const m = misfits(r.request.body, op.requestBody.content['application/json'].schema)
      if (r.status === 400 && (r.body as { error?: string }).error === 'bad_request') {
        expect(m.length, r.name).toBeGreaterThan(0)
        if (r.name.includes('neither')) expect(m, r.name).toEqual([expect.any(String)])
      } else expect(m, r.name).toEqual([])
    }
  }
})
