import { deltaOf, fmt, type DayChart, type Ranked, type Tile } from './chart'
import type { Failed } from './shell'

/**
 * The dashboard's pages as data, for the iOS app to draw natively (protocols/owner-dashboard.openapi.json): each /_ab/
 * page is a title and a list of blocks. A page's HTML and its blocks read the same loaded data (dashboard.ts), and
 * share what both draw: the same tiles, charts, ranked rows and texts. The rest is written twice from the same data,
 * and worker/test/owner-api.test.ts holds the two to each other. Text comes as the page writes it, in Vietnamese and
 * the viewer's time zone; a chart's numbers stay raw.
 */

export type TextTone = 'plain' | 'muted' | 'good' | 'bad'
/** A table's cell: its text, a second line under it, the site page it opens, its tone. */
export type Cell = { text: string; sub?: string; href?: string; tone?: TextTone }
/** A request the app makes as it is described: a button needs no code of its own in the app. */
export type Action = { label: string; method: 'POST' | 'DELETE'; path: string; body?: Record<string, unknown>; tone?: TextTone }
export type Figure = { label: string; value: string; sub?: string; delta?: { text: string; tone: TextTone }; meter?: number }
export type ChartBlock = { kind: 'chart' } & Omit<DayChart, 'format' | 'tickPrefix'>
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
  /** `folded`: drawn closed under this label, as the page's <details>. `empty`: what the page says when there are no rows. */
  | { kind: 'table'; columns: string[]; rows: Cell[][]; empty?: string; folded?: string }
  | { kind: 'note'; text: string; tone: TextTone }
  | { kind: 'photos'; items: PhotoItem[]; empty?: string }
  | { kind: 'hidden'; items: HiddenItem[]; empty?: string }
  /** A form: its fields' values and `body` sent as one JSON object, as an Action is. */
  | { kind: 'form'; method: 'POST'; path: string; fields: FormField[]; body?: Record<string, unknown>; submit: string }
  /** A switch between two forms of the section: `href` is the section with it flipped, read and shown in its place. */
  | { kind: 'switch'; label: string; on: boolean; href: string }
  /** Buttons on their own, in a row: each makes its request, then the section is read again. */
  | { kind: 'actions'; actions: Action[] }
export type Section = { title: string; blocks: Block[] }

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }
/** The text a piece of the pages' HTML shows: tags dropped (a line break a space), entities read, spaces collapsed. */
export const textOf = (html: string) =>
  html.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ENTITY[e]!).replace(/\s+/g, ' ').trim()

export const heading = (text: string, level: 2 | 3 = 2, anchor?: string): Block => ({ kind: 'heading', text, level, ...(anchor ? { anchor } : {}) })
export const note = (text: string, tone: TextTone = 'plain'): Block => ({ kind: 'note', text, tone })
/** A part that didn't load, as failedBox says it. */
export const failedNote = (what: string, f: Failed): Block => note(`Không tải được ${what}. ${f.failed}`, 'bad')

/** KPI tiles as figures: the same tiles the page draws. */
export function figures(xs: Tile[]): Block {
  return {
    kind: 'figures',
    items: xs.map(t => {
      const f: Figure = { label: t.label, value: t.value }
      if (t.sub) f.sub = t.sub
      if (t.delta) {
        const d = deltaOf(t.delta)
        f.delta = { text: d.text, tone: d.tone === 'good' || d.tone === 'bad' ? d.tone : 'plain' }
      }
      // Clamped as the page's meter() draws it.
      if (t.meter !== undefined && Number.isFinite(t.meter)) f.meter = Math.min(1, Math.max(0, t.meter))
      return f
    }),
  }
}

/** A chart: the same object the page draws, less its functions (a money chart says so with `unit`). */
export function chart(c: DayChart): Block {
  const { format: _f, tickPrefix: _t, ...data } = c
  return { kind: 'chart', ...data }
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
