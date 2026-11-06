import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse, type HTMLElement } from 'node-html-parser'
import { afterEach, expect, test, vi } from 'vitest'
import { handle, type Env } from '../index'
import { appPage, appSection, summariseApp } from '../admin/app'
import type { Action, Block, FormField, Section } from '../admin/blocks'
import { contentPage, contentSection, type ContentPage } from '../admin/content-page'
import {
  accountsPage, accountsSection, affiliatePage, affiliateSection, fishIdPage, fishIdSection, hiddenPage, hiddenSection, keptPage, keptSection, overviewJson,
  overviewPage, photosPage, photosSection, readersPage, readersSection, wantedPage, wantedSection,
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
    ['parts failed', () => contentPage({ ...S.CONTENT, reads: F, talk: F, clicks: F, snapshots: F }), () => contentSection({ ...S.CONTENT, reads: F, talk: F, clicks: F, snapshots: F })],
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
      const asks = { days: 14, rows: [{ cc: 'GB', shown: 5, picked: { vi: 2, id: 0, th: 1 } }, { cc: 'US', shown: 3, picked: { vi: 0, id: 0, th: 0 } }] }
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
  'nhan-dien-ca': [
    ['sample', () => fishIdPage(S.FISH), () => fishIdSection(S.FISH)],
    ['failed', () => fishIdPage({ ...S.FISH, stats: F, keys: F }), () => fishIdSection({ ...S.FISH, stats: F, keys: F })],
    ['no keys', () => fishIdPage({ ...S.FISH, keys: undefined }), () => fishIdSection({ ...S.FISH, keys: undefined })],
    ['bad key lines, elsewhere', () => fishIdPage({ ...S.FISH, tz: 'America/New_York', keys: { rows: [], bad: 2, today: 0, model: 'm', counts: { fallback: 0, callLimit: 0, later400: 0, facts: 0, refunds: 0 }, mostRefunds: 0 } }), () => fishIdSection({ ...S.FISH, tz: 'America/New_York', keys: { rows: [], bad: 2, today: 0, model: 'm', counts: { fallback: 0, callLimit: 0, later400: 0, facts: 0, refunds: 0 }, mostRefunds: 0 } })],
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
  for (let p = el.parentNode as HTMLElement | null; p; p = p.parentNode as HTMLElement | null) if (p.tagName === 'DETAILS' && txt(p.querySelector('summary')) === 'Bảng số liệu') return true
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
/** What owner-api.ts does for each of the pages' forms: the request, from the form's fields and the button pressed. */
const REQUEST: Record<string, (v: Record<string, string>) => Omit<Req, 'label'>> = {
  '/_ab/photos': v => ({ method: 'POST', path: `/api/owner/photos/${v.id}`, body: { action: v.action } }),
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
  const out = { title: txt(main.querySelector('h1')), headings: [] as string[], figures: [] as Fig[], charts: [] as string[], tables: [] as Tab[], acts: [] as ActRow[], actsEmpty: [] as string[], forms: [] as Form[], actions: [] as Req[], links: main.querySelectorAll('a').map(a => a.getAttribute('href') ?? ''), text: txt(main) }
  const cell = (c: HTMLElement) => {
    const a = c.querySelectorAll('a')
    return { text: txt(c), ...(a.length === 1 && txt(a[0]) === txt(c) ? { href: a[0]!.getAttribute('href')! } : {}) }
  }
  const walk = (el: HTMLElement) => {
    for (const n of el.childNodes as HTMLElement[]) {
      if (n.nodeType !== 1) continue
      const tag = n.tagName
      if ((tag === 'H2' || tag === 'H3') && !n.id.endsWith('-t')) out.headings.push(`${tag[1]} ${txt(n)}${tag === 'H2' && n.id ? ` #${n.id}` : ''}`)
      else if (tag === 'FORM') {
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
      } else if (tag === 'LI' && (n.parentNode as HTMLElement).classList.contains('gaps')) {
        const p = n.querySelector('p')!
        const value = txt(p.querySelector('b'))
        const sub = txt(p.querySelectorAll('span.muted').at(-1))
        const all = txt(p)
        out.figures.push({ label: norm(all.slice(value.length, all.length - sub.length)), value, sub })
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
  const out = { title: norm(s.title), headings: [] as string[], figures: [] as Fig[], charts: [] as string[], tables: [] as Tab[], acts: [] as ActRow[], actsEmpty: [] as string[], forms: [] as Form[], actions: [] as Req[], switches: [] as { on: boolean; href: string }[], notes: [] as string[] }
  for (const b of s.blocks as Block[]) {
    if (b.kind === 'heading') out.headings.push(`${b.level} ${norm(b.text)}${b.anchor ? ` #${b.anchor}` : ''}`)
    else if (b.kind === 'figures') out.figures.push(...b.items.map(f => ({ label: norm(f.label), value: f.value, ...(f.sub ? { sub: norm(f.sub) } : {}), ...(f.delta ? { delta: norm(f.delta.text) } : {}) })))
    else if (b.kind === 'chart') out.charts.push(`${b.id} ${norm(b.title)}`)
    else if (b.kind === 'table') {
      const t: Tab = { columns: b.columns.map(norm), rows: b.rows.map(r => r.map(c => ({ text: norm(`${c.text} ${c.sub ?? ''}`), ...(c.href ? { href: c.href } : {}) }))), ...(b.rows.length || !b.empty ? {} : { empty: b.empty }), ...(b.folded ? { folded: b.folded } : {}) }
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
  }
  return out
}

for (const [key, variants] of Object.entries(VARIANTS)) {
  test(`${key}: the blocks say what the page shows, from the same data`, () => {
    for (const [name, html, json] of variants) {
      const h = fromHtml(html())
      // A page's list of pages, and the report log's list of reports, have no column heads; their tables do.
      const j = fromJson(json(), t => (t.folded ? t.columns?.[0] !== 'Trang' : t.columns?.[0] !== 'Báo cáo'))
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
      // The page's link to its other form (the app's test builds) is a switch: on when that link goes back to the plain page.
      const own = h.links.filter(l => l === `/_ab/${key}/` || l.startsWith(`/_ab/${key}/?`))
      expect(j.switches, at).toEqual(own.map(l => ({ on: !l.includes('?'), href: `/api/owner/sections/${key}${l.slice(`/_ab/${key}/`.length)}` })))
      // Every note is on the page, word for word.
      for (const n of j.notes) expect(h.text.replace(/\s/g, ''), `${at}: ${n}`).toContain(norm(n).replace(/\s/g, '').replace(/·/g, ''))
    }
  })
}

test('the overview: its to-dos, areas, their note and the last days are the page\'s; each opens a section (at one of its headings) or an address', () => {
  const anchors = (key: string) => VARIANTS[key]![0]![2]().blocks.flatMap(b => (b.kind === 'heading' && b.anchor ? [b.anchor] : []))
  const hrefOf = (p: { section: string; anchor?: string } | { url: string }) => ('url' in p ? p.url : `/_ab/${p.section}/${p.anchor ? `#${p.anchor}` : ''}`)
  const failed = { ...S.OVERVIEW, readers: F, clicks: F, fish: F, keys: F, photos: F, waiting: F, wanted: F, accounts: F, hidden: F, content: F, snapshots: F }
  for (const o of [S.OVERVIEW, failed, { ...S.OVERVIEW, tz: 'America/New_York' }]) {
    const j = overviewJson(o)
    const page = dom(overviewPage(o))
    expect(page.querySelectorAll('ul.todo > li').map(li => [txt(li.querySelector('b')), txt(li.querySelector('p'))])).toEqual(j.todos.map(t => [norm(t.title), norm(t.text)]))
    expect(page.querySelectorAll('ul.todo a.act').map(a => [txt(a), a.getAttribute('href')])).toEqual(j.todos.map(t => [t.action.label, hrefOf(t.action)]))
    const rows = page.querySelectorAll('a.area')
    expect(rows.map(a => [txt(a.querySelector('.name')), txt(a.querySelector('.fig')), txt(a.querySelector('.sub')), a.getAttribute('href'), Boolean(a.querySelector('.dot'))]))
      .toEqual(j.areas.map(a => [a.name, a.fig, norm(a.sub), hrefOf(a), a.warn]))
    expect(rows.map(a => txt(a.querySelector('.chip')))).toEqual(j.areas.map(a => a.chip?.text ?? ''))
    expect(txt(page.querySelector('section[aria-labelledby="h-areas"] p.note'))).toBe(norm(j.areasNote))
    // The last days: each day's heading, then its entries (text, the line under it); a quiet day says so, muted.
    expect(txt(page.querySelector('#h-log'))).toBe(j.log.title)
    const days = page.querySelectorAll('.log > section').map(d => ({
      at: txt(d.querySelector('h3')),
      items: d.querySelector('ol') ? d.querySelectorAll('li').map(li => [txt(li.querySelector('p')), txt(li.querySelector('small')), '']) : [[txt(d.querySelector('p.muted')), '', 'muted']],
    }))
    const entries: typeof days = []
    for (const e of j.log.entries) {
      const item = [norm(e.text), norm(e.sub ?? ''), e.tone ?? '']
      if (entries.at(-1)?.at === norm(e.at)) entries.at(-1)!.items.push(item)
      else entries.push({ at: norm(e.at), items: [item] })
    }
    expect(entries).toEqual(days)
    // Every place is a section, and an anchor one of that section's headings.
    for (const x of [...j.todos.map(t => t.action), ...j.areas, ...j.log.entries]) {
      if (!('section' in x) || !x.section) continue
      expect(KEYS).toContain(x.section)
      if ('anchor' in x && x.anchor) expect(anchors(x.section), `${x.section}#${x.anchor}`).toContain(x.anchor)
    }
  }
  const j = overviewJson(S.OVERVIEW)
  expect(j.todos.map(t => t.action)).toEqual([{ label: 'Xem key', section: 'nhan-dien-ca', anchor: 'key' }, { label: 'Xem engine', section: 'noi-dung', anchor: 'engine' }])
  expect(j.areas.find(a => a.name === 'Engine')).toMatchObject({ section: 'noi-dung', anchor: 'engine' })
  expect(j.log.entries.filter(e => e.section).length).toBeGreaterThan(2)
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
  // Analytics Engine answers every query with no rows.
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ data: [] }))
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
        const sw = { kind: 'switch', label: 'Chỉ các bản thử (bản debug, TestFlight)', on: Boolean(q), href: `/api/owner/sections/ung-dung${q ? '' : '?test=1'}` }
        expect(s.blocks[1]).toEqual(sw)
        const flipped = (await (await call(w.e, 'GET', sw.href, bearer(w.ownerApp))).json()) as Section
        expect(flipped.blocks[1]).toMatchObject({ kind: 'switch', on: !q })
      }
    }
  }
  // The content page's pages out of search for their score, from the build's reviews.json: the fixture's four, lowest
  // first (Analytics Engine has no readers), none with a review (no engine state beside the fixture's content).
  const content = (await (await call(w.e, 'GET', '/api/owner/sections/noi-dung', bearer(w.ownerApp))).json()) as Section
  const at = content.blocks.findIndex(b => b.kind === 'heading' && b.text === 'Ẩn khỏi tìm kiếm vì điểm thấp')
  const low = content.blocks.slice(at).find(b => b.kind === 'table')
  const none = 'Chưa lưu lần đánh giá nào.'
  expect(low?.kind === 'table' && low.rows.map(r => r.map(c => c.href ?? c.text))).toEqual([
    ['/ca/ca-la-han/', 'Giống cá', '0,60', '0', none], ['/huong-dan/thay-nuoc-dung-cach/', 'Bài viết', '0,60', '0', none],
    ['/thuat-ngu/gh/', 'Thuật ngữ', '0,60', '0', none], ['/ca/ca-boraras-do/', 'Cá', '0,61', '0', none],
  ])
  const photos = (await (await call(w.e, 'GET', '/api/owner/sections/anh-ban-doc', bearer(w.ownerApp))).json()) as Section
  const items = photos.blocks.filter(b => b.kind === 'photos').flatMap(b => (b.kind === 'photos' ? b.items : []))
  expect(items.map(p => [p.id, p.src, p.actions.map(a => a.label)])).toEqual([[S.PHOTO_WAITING, `/_ab/anh/${S.PHOTO_WAITING}`, ['Duyệt', 'Gỡ']], [S.PHOTO_LIVE, 'https://media.aquatome.com/readers/x-480.webp', ['Gỡ']]])
  const kept = (await (await call(w.e, 'GET', '/api/owner/sections/anh-nhan-dien', bearer(w.ownerApp))).json()) as Section
  expect(kept.blocks[1]).toMatchObject({ kind: 'photos', items: [{ src: `/_ab/anh-nhan-dien/anh/reader-1/${S.KEPT_ID}` }, { src: `/_ab/anh-nhan-dien/anh/anon/${S.KEPT_ANON}`, actions: [{ label: 'Xóa', method: 'DELETE', path: `/api/owner/fishid-shots/anon/${S.KEPT_ANON}` }] }] })
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
  expect(readers.blocks).toEqual([{ kind: 'note', text: 'Chưa cấu hình AE_API_TOKEN và CF_ACCOUNT_ID: chưa đọc được dữ liệu (Analytics Engine).', tone: 'muted' }])
})

test('days and times in the zone the app sends (Time-Zone), else Vietnam\'s; the reply says which', async () => {
  const w = await worker()
  const since = async (h: Record<string, string>) => {
    const s = (await (await call(w.e, 'GET', '/api/owner/sections/an-trang', { ...bearer(w.ownerApp), ...h })).json()) as Section & { tz: string }
    const b = s.blocks.find(x => x.kind === 'hidden')
    return [s.tz, b?.kind === 'hidden' ? b.items[0]!.since : '']
  }
  expect(await since({})).toEqual(['Asia/Ho_Chi_Minh', '03/11 10:00'])
  expect(await since({ 'time-zone': 'America/New_York' })).toEqual(['America/New_York', '02/11 22:00'])
  expect(await since({ 'time-zone': 'Mars/Olympus_Mons' })).toEqual(['Asia/Ho_Chi_Minh', '03/11 10:00'])
  expect(await since({ 'time-zone': "Asia/Saigon'; DROP" })).toEqual(['Asia/Ho_Chi_Minh', '03/11 10:00'])
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
  expect(s.blocks.find(b => b.kind === 'photos')).toMatchObject({ items: [{ id: S.PHOTO_WAITING, meta: ['species:betta-splendens', expect.any(String), 'Đã duyệt · đăng trong lượt duyệt tới'], actions: [{ label: 'Gỡ' }] }] })
  // A photo shown: removed now, every file with it.
  expect(await contracted(await post(S.PHOTO_LIVE, { action: 'remove' }), 'post', `/api/owner/photos/${S.PHOTO_LIVE}`)).toEqual({ ok: true, changed: true })
  expect(await w.db.prepare('SELECT status FROM photos WHERE id = ?').bind(S.PHOTO_LIVE).first()).toEqual({ status: 'removed' })
  expect(w.media.m.size).toBe(0)
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
  expect(list?.kind === 'hidden' && list.items.find(x => x.path === '/ca/y/')!.actions).toEqual([{ label: 'Hiện lại', method: 'POST', path: '/api/owner/hidden', body: { path: '/ca/y/', hide: false } }])
  expect(await (await post({ path: '/ca/y/', hide: false })).json()).toEqual({ ok: true, path: '/ca/y/', hidden: false })
  expect(Object.keys(hidden())).toEqual(['/ca/ca-x/', '/id/ikan/z/'])
  for (const path of ['/', '/id/', 'https://other.site/', '/_ab/']) {
    const r = await post({ path, hide: true })
    expect(r.status, path).toBe(400)
    expect(await contracted(r, 'post', '/api/owner/hidden'), path).toEqual({ error: 'not_a_page', message: 'Chỉ ẩn được một trang của trang web (không phải trang chủ).' })
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
  const how = (s: Section) => s.blocks.slice(s.blocks.findIndex(b => b.kind === 'heading' && b.text === 'Nhận báo cáo') + 1, s.blocks.findIndex(b => b.kind === 'heading' && b.text === 'Các báo cáo'))
  // Unset: email on, push off, as before push.
  expect(how(await section())).toEqual([
    { kind: 'note', text: 'Email: đang bật. Thông báo trên điện thoại: đang tắt.', tone: 'plain' },
    { kind: 'actions', actions: [{ label: 'Tắt email', method: 'POST', path: '/api/owner/report-settings', body: { email: false } }, { label: 'Bật thông báo', method: 'POST', path: '/api/owner/report-settings', body: { push: true } }] },
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
    { kind: 'note', text: 'Email: đang tắt. Thông báo trên điện thoại: đang bật, nhưng chưa có điện thoại nào đăng ký và chưa có khóa APNs nên chưa gửi được. Mở ứng dụng AquaTome trên điện thoại và bật “Nhận thông báo trên máy này”.', tone: 'bad' },
    { kind: 'actions', actions: [{ label: 'Bật email', method: 'POST', path: '/api/owner/report-settings', body: { email: true } }, { label: 'Tắt thông báo', method: 'POST', path: '/api/owner/report-settings', body: { push: false } }] },
  ])
  // A phone registered and the key set: where it goes.
  await call(w.e, 'POST', '/api/owner/push-token', bearer(w.ownerApp), { token: TOKEN_A, environment: 'production' })
  const keyed = { ...w.e, APNS_KEY: 'k', APNS_KEY_ID: 'K1', APPLE_TEAM_ID: 'T1' } as unknown as Env
  const s = (await (await call(keyed, 'GET', '/api/owner/sections/bao-cao', bearer(w.ownerApp))).json()) as Section
  expect(how(s)[0]).toEqual({ kind: 'note', text: 'Email: đang tắt. Thông báo trên điện thoại: đang bật, gửi đến 1 điện thoại.', tone: 'plain' })
  // Already so: nothing written, said so.
  expect(await (await call(w.e, 'POST', '/api/owner/report-settings', bearer(w.ownerApp), { email: false, push: true })).json()).toEqual({ ok: true, changed: false, email: false, push: true })
  for (const bad of [{}, { email: 'no' }, { push: 1 }, { email: true, quiet: true }, 'x', [], null]) {
    const r = await call(w.e, 'POST', '/api/owner/report-settings', bearer(w.ownerApp), bad)
    expect([r.status, await errorOf(r)], JSON.stringify(bad)).toEqual([400, { error: 'bad_request', message: 'email và/hoặc push (true/false).' }])
  }
  const get = await call(w.e, 'GET', '/api/owner/report-settings', bearer(w.ownerApp))
  expect([get.status, get.headers.get('allow'), await errorOf(get)]).toEqual([405, 'POST', { error: 'method' }])
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
  const POST_SAYS = 'token (hex chữ thường), environment ("sandbox" hoặc "production").'
  for (const bad of [
    { token: TOKEN_A.toUpperCase(), environment: 'production' }, { token: 'a1b2', environment: 'production' }, { token: `${TOKEN_A}a`, environment: 'production' }, { token: 'zz'.repeat(32), environment: 'production' },
    { token: 'a1'.repeat(101), environment: 'production' }, { token: TOKEN_A }, { token: TOKEN_A, environment: 'development' }, { token: TOKEN_A, environment: 'production', name: 'x' }, 'x', [], null,
  ]) {
    const r = await send('POST', bad)
    expect([r.status, await errorOf(r)], JSON.stringify(bad)).toEqual([400, { error: 'bad_request', message: POST_SAYS }])
  }
  for (const bad of [{ token: 'nope' }, { token: TOKEN_B, environment: 'sandbox' }, {}]) {
    const r = await send('DELETE', bad)
    expect([r.status, await errorOf(r)], JSON.stringify(bad)).toEqual([400, { error: 'bad_request', message: 'token (hex chữ thường).' }])
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
    { name: 'dashboard', request: { method: 'GET', path: '/api/owner/dashboard', headers: tz }, status: 200, body: json({ tz: S.TZ, ...overviewJson(S.OVERVIEW), sections: SECTIONS.map(({ key, name }) => ({ key, name })) }) },
    ...KEYS.map(key => ({ name: `section ${key}`, request: { method: 'GET', path: `/api/owner/sections/${key}`, headers: tz }, status: 200, body: json({ tz: S.TZ, ...VARIANTS[key]![0]![2]() }) })),
  ]
  const w = await worker()
  const actions: [string, string, string, unknown][] = [
    ['approve a waiting photo', 'POST', `/api/owner/photos/${S.PHOTO_WAITING}`, { action: 'approve' }],
    ['remove a photo', 'POST', `/api/owner/photos/${S.PHOTO_LIVE}`, { action: 'remove' }],
    ['remove a photo already removed', 'POST', `/api/owner/photos/${S.PHOTO_LIVE}`, { action: 'remove' }],
    ['a photo action that is neither', 'POST', `/api/owner/photos/${S.PHOTO_WAITING}`, { action: 'publish' }],
    ['hide a page', 'POST', '/api/owner/hidden', { path: '/ca/ca-y/', hide: true, note: 'sai loài' }],
    ['bring a page back', 'POST', '/api/owner/hidden', { path: '/ca/ca-y/', hide: false }],
    ['hide the home page', 'POST', '/api/owner/hidden', { path: '/', hide: true }],
    ['delete a kept fish-ID photo', 'DELETE', `/api/owner/fishid-shots/anon/${S.KEPT_ANON}`, undefined],
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
    ['turn the report\'s notification on', 'POST', '/api/owner/report-settings', { push: true }],
    ['a report setting that isn\'t true or false', 'POST', '/api/owner/report-settings', { push: 'yes' }],
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
      // What's taken fits the contract; a refusal may be of what the contract doesn't allow (a token that isn't hex).
      const m = misfits(r.request.body, op.requestBody.content['application/json'].schema)
      if (r.status < 400) expect(m, r.name).toEqual([])
      else if (r.name.includes('neither')) expect(m, r.name).toEqual([expect.any(String)])
    }
  }
})
