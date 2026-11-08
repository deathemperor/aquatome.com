import { barWords, deltaOf, fmt, todayOf, type DashLang, type DayChart, type Delta, type Ranked, type Readout, type Series, type Tile } from './chart'
import type { CommentsBlock } from './comments'
import type { Failed } from './shell'

/**
 * The dashboard's pages as data, for the iOS app to draw natively (protocols/owner-dashboard.openapi.json): each /_ab/
 * page is a title and a list of blocks. A page's HTML and its blocks read the same loaded data (dashboard.ts), and
 * share what both draw: the same tiles, charts, ranked rows and texts. The rest is written twice from the same data,
 * and worker/test/owner-api.test.ts holds the two to each other. Text comes as the page writes it, in Vietnamese and
 * the viewer's time zone; a chart's numbers stay raw.
 */

/** wait: waits on the owner (orange, rust on the web); bad: a fault, a drop, or a button that deletes (red). */
export type TextTone = 'plain' | 'muted' | 'good' | 'wait' | 'bad'
/** A table's cell: its text, a second line under it, the site page it opens, its tone. */
export type Cell = { text: string; sub?: string; href?: string; tone?: TextTone }
/** A request the app makes as it is described: a button needs no code of its own in the app. */
export type Action = { label: string; method: 'POST' | 'DELETE'; path: string; body?: Record<string, unknown>; tone?: TextTone }
export type Figure = { label: string; value: string; sub?: string; delta?: { text: string; tone: TextTone }; meter?: number }
/** `labels` and `readouts`: each bar's words (barWords), so the app says what the web says. */
export type ChartBlock = { kind: 'chart'; labels: string[]; readouts: Readout[] } & Omit<DayChart, 'format' | 'tickPrefix'>
/** A photo with its buttons. `src`: a path on this site (sent with the owner's session) or a public address. */
export type PhotoItem = { id: string; src: string; caption: string; meta: string[]; actions: Action[] }
export type HiddenItem = { path: string; note?: string; since: string; actions: Action[] }
/** A field of a form: its value goes into the request's JSON under `name`. */
export type FormField = { name: string; label: string; kind: 'text' | 'textarea'; required?: boolean; placeholder?: string }
export type Block =
  /** `anchor`: the place a to-do or an area opens the section at (the page's #key, #engine…). */
  | { kind: 'heading'; text: string; level: 2 | 3; anchor?: string }
  | { kind: 'figures'; items: Figure[] }
  | ChartBlock
  /**
   * `folded`: drawn closed under this label, as the page's <details>; `figure`, on its row. `empty`: what the page says
   * when there are no rows. `id`, `count`, `next`: as the app reads it (paged), a folded table without its rows and a
   * long one 50 rows at a time.
   */
  | { kind: 'table'; columns: string[]; rows: Cell[][]; empty?: string; folded?: string; figure?: string; id?: string; count?: number; next?: string }
  | { kind: 'note'; text: string; tone: TextTone }
  | { kind: 'photos'; items: PhotoItem[]; empty?: string }
  | { kind: 'hidden'; items: HiddenItem[]; empty?: string }
  /** A form: its fields' values and `body` sent as one JSON object, as an Action is. */
  | { kind: 'form'; method: 'POST'; path: string; fields: FormField[]; body?: Record<string, unknown>; submit: string }
  /** A switch between two forms of the section: `href` is the section with it flipped, read and shown in its place. */
  | { kind: 'switch'; label: string; on: boolean; href: string }
  /** Buttons on their own, in a row: each makes its request, then the section is read again. */
  | { kind: 'actions'; actions: Action[] }
  /** Readers' comments in one state, with their filter and buttons (admin/comments.ts). */
  | CommentsBlock
/** `periods`: what the period menu offers, and `period` the one every figure is for (the request's `?period=`). */
export type Section = { title: string; blocks: Block[]; periods?: { key: string; label: string }[]; period?: string }

/** Rows the app gets at a time. */
export const PAGE_ROWS = 50
/**
 * The section as the app reads it: a folded table without its rows (`count` says how many: it reads them when opened),
 * a long one with its first 50 and `next`. A table's `id` is its place among the section's tables, so the same load
 * finds it again (tablePage).
 */
export function paged(s: Section): Section {
  let n = 0
  return {
    ...s,
    blocks: s.blocks.map(b => {
      if (b.kind !== 'table') return b
      const id = `t${++n}`
      if (b.folded) return { ...b, id, count: b.rows.length, rows: [] }
      if (b.rows.length > PAGE_ROWS) return { ...b, id, count: b.rows.length, rows: b.rows.slice(0, PAGE_ROWS), next: String(PAGE_ROWS) }
      return b
    }),
  }
}
/** Table `id`'s rows from `cursor` (a `next`; none: the first): 50, and where the next start. A table that isn't one, or a cursor that isn't one of its: what's wrong. */
export function tablePage(s: Section, id: string, cursor: string | null): { rows: Cell[][]; next?: string } | 'no_table' | 'bad_cursor' {
  const t = s.blocks.filter(b => b.kind === 'table')[Number(/^t([1-9]\d*)$/.exec(id)?.[1] ?? 0) - 1]
  if (!t || t.kind !== 'table') return 'no_table'
  const from = cursor === null ? 0 : /^(0|[1-9]\d*)$/.test(cursor) ? Number(cursor) : NaN
  if (!(from >= 0 && (from < t.rows.length || from === 0))) return 'bad_cursor'
  const rows = t.rows.slice(from, from + PAGE_ROWS)
  return from + PAGE_ROWS < t.rows.length ? { rows, next: String(from + PAGE_ROWS) } : { rows }
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }
/** The text a piece of the pages' HTML shows: tags dropped (a line break a space), entities read, spaces collapsed. */
export const textOf = (html: string) =>
  html.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ENTITY[e]!).replace(/\s+/g, ' ').trim()

export const heading = (text: string, level: 2 | 3 = 2, anchor?: string): Block => ({ kind: 'heading', text, level, ...(anchor ? { anchor } : {}) })
export const note = (text: string, tone: TextTone = 'plain'): Block => ({ kind: 'note', text, tone })
/** A part that didn't load, as failedBox says it. */
export const failedNote = (what: string, f: Failed): Block => note(`Không tải được ${what}. ${f.failed}`, 'bad')

/** A change as the app reads it: coloured past 5% where more is plainly better (deltaOf), muted otherwise. */
export function deltaJson(d: Delta, lang: DashLang = 'vi'): NonNullable<Figure['delta']> {
  const x = deltaOf(d, lang)
  return { text: x.text, tone: x.tone === 'good' || x.tone === 'bad' ? x.tone : 'muted' }
}

/** KPI tiles as figures: the same tiles the page draws. */
export function figures(xs: Tile[], lang: DashLang = 'vi'): Block {
  return {
    kind: 'figures',
    items: xs.map(t => {
      const f: Figure = { label: t.label, value: t.value }
      if (t.sub) f.sub = t.sub
      if (t.delta) f.delta = deltaJson(t.delta, lang)
      // Clamped as the page's meter() draws it.
      if (t.meter !== undefined && Number.isFinite(t.meter)) f.meter = Math.min(1, Math.max(0, t.meter))
      return f
    }),
  }
}

/** A chart: the same object the page draws, less its functions (a money chart says so with `unit`), with each bar's words. */
export function chart(c: DayChart, lang: DashLang = 'vi', also: Series[] = []): Block {
  const { format: _f, tickPrefix: _t, lastSays: _l, ...data } = c
  const today = todayOf(c)
  return { kind: 'chart', ...data, ...(today >= 0 ? { today } : {}), ...barWords(c, lang, also) }
}

export function table(columns: string[], rows: Cell[][], o: { empty?: string; folded?: string } = {}): Block {
  return { kind: 'table', columns, rows, ...(o.empty ? { empty: o.empty } : {}), ...(o.folded ? { folded: o.folded } : {}) }
}

/** Cell text, and the page it links to when the HTML is one link. */
export function cellOf(html: string, more: Omit<Cell, 'text'> = {}): Cell {
  const a = /^<a href="([^"]*)">([^<]*)<\/a>$/.exec(html.trim())
  return { text: textOf(html), ...(a ? { href: textOf(a[1]!) } : {}), ...more }
}

/** A ranked row; `cell`: its label as data, where the page's HTML for it was drawn from that data (a name and a second line). */
export type RankRow = Ranked & { cell?: Cell }
/** A ranked table (rankTable) from the same rows: the label, the value as the page writes it, then the cells. */
export const rankBlock = (rows: RankRow[], head: string[], format: (n: number) => string = n => fmt(n)): Block =>
  table(head, rows.map(r => [r.cell ?? cellOf(r.label), { text: format(r.value) }, ...(r.cells ?? []).map(c => cellOf(c))]), { empty: 'Chưa có.' })
