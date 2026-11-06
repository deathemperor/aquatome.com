import { LANGS, OTHER_LANGS, prefixedLang, type Lang } from '@aq/schema/langs'
import type { ContentReads, ContentStats, EntityKind, GapKey, KindClicks, LastReview, LowPage, LowScores, PageKind, Snapshot, Talk, Totals } from './content'
import { dayChart, dayLabel, esc, fmt, lastDays, meter, rankTable, tiles, type DayChart, type Ranked, type Tile } from './chart'
import { cellOf, chart, failedNote, figures, heading, note, rankBlock, table, textOf, type Block, type Cell, type Section } from './blocks'
import { failedBox, isFailed, page, type Soft } from './shell'
import { HOME_TZ, hourMinute, localDay, sameClock, timeTag } from './time'

/** The dashboard's Nội dung page: what the site holds (the build's content.json), how it grows, what the engine is doing, what's missing, and how readers use it. */

export const KIND: Record<PageKind, string> = {
  fish: 'Cá', breed: 'Giống cá', plant: 'Cây thủy sinh', guide: 'Bài viết', videoGuide: 'Bài từ video', series: 'Loạt video', glossary: 'Thuật ngữ',
  equipment: 'Thiết bị', place: 'Địa điểm', product: 'Sản phẩm', gallery: 'Trang ảnh', taxon: 'Phân loại', group: 'Nhóm', tool: 'Công cụ', list: 'Danh sách', other: 'Trang khác',
}
const ENTITY: EntityKind[] = ['fish', 'plant', 'breed', 'guide', 'videoGuide', 'series', 'glossary', 'equipment', 'place', 'product']
/** What the home page counts as the handbook's items: the pages a reader comes for. */
export const MAIN: EntityKind[] = ['fish', 'plant', 'breed', 'guide', 'videoGuide']
const OTHER: EntityKind[] = ['glossary', 'place', 'equipment', 'series', 'product']
const GAP: Record<GapKey, string> = {
  noPhoto: 'Chưa có ảnh', noViName: 'Tên tiếng Việt còn là tên khoa học', noSummary: 'Chưa có tóm tắt nhanh', noKeyFacts: 'Thiếu nhiệt độ, pH hoặc kích thước',
  thin: 'Trang mỏng, ẩn khỏi tìm kiếm', oldVi: 'Tiếng Việt chưa viết lại', noId: 'Chưa có tiếng Indonesia', noTh: 'Chưa có tiếng Thái',
}
const FACT: Record<string, string> = { tempC: 'nhiệt độ', ph: 'pH', sizeCm: 'kích thước' }

/** Each language as the dashboard names it: "tiếng Việt", and the others bare ("Có tiếng Indonesia", "Chọn Thái"). */
export const LANG_VI: Record<Lang, string> = { vi: 'tiếng Việt', id: 'Indonesia', th: 'Thái' }

/** Items of the main kinds in a day's totals, in one language. */
export const inLang = (t: Totals, lang: Lang) => MAIN.reduce((s, k) => s + (t.kinds[k]?.[lang] ?? 0), 0)
/** Items (Vietnamese) of the main kinds in a day's totals. */
export const items = (t: Totals) => inLang(t, 'vi')
const pct = (a: number, b: number) => (b ? `${fmt((100 * a) / b)}%` : '—')

/**
 * Each of `days`, the day's totals less the last kept before it: what the day added. A day without a snapshot, or with
 * none before it to compare, is null (not recorded, not "nothing added"); the next one kept carries the gap. `pick` reads
 * the figure.
 */
export function perDay(snaps: Snapshot[], days: string[], pick: (t: Totals) => number): (number | null)[] {
  const at = new Map(snaps.map(s => [s.day, s.totals]))
  return days.map(d => {
    const t = at.get(d)
    const before = snaps.filter(s => s.day < d).at(-1)
    return t && before ? pick(t) - pick(before.totals) : null
  })
}
/** The nightly totals are kept at 20:17 UTC (wrangler.jsonc's cron) under that UTC day: when that is for the viewer. */
const SAVED = '20:17'
const savedNote = (now: Date, tz: string) => {
  const day = now.toISOString().slice(0, 10)
  const at = `${day}T${SAVED}:00Z`
  return `lúc ${hourMinute(at, tz)} ${localDay(at, tz) > day ? 'sáng hôm sau' : 'cùng ngày'}`
}

export type ContentPage = {
  now: Date; stats: Soft<ContentStats>; reads: Soft<ContentReads>; talk: Soft<Talk>; clicks: Soft<KindClicks>; snapshots: Soft<Snapshot[]>
  /** The pages out of search for their score (dist/_ab/reviews.json); none drawn without it, as a build before it. */
  low?: Soft<LowScores | undefined>
  /** The viewer's time zone (admin/time.ts). */ tz?: string
}

const JUMP = [['tong', 'Tổng'], ['tang', 'Tăng thêm'], ['engine', 'Engine'], ['thieu', 'Còn thiếu'], ['anh', 'Ảnh'], ['doc', 'Người đọc'], ['binh-luan', 'Bình luận'], ['affiliate', 'Affiliate'], ['nguon', 'Nguồn']] as const
const link = (path: string, title: string) => `<a href="${esc(path)}">${esc(title)}</a>`

const contentLede = (s: ContentStats, now: Date, tz: string) => `Từ bản build lúc ${timeTag(s.builtAt, tz, now)}${s.publicBuild ? '' : ', không phải bản công khai'}. Engine cập nhật nội dung 3 giờ một lần; mỗi lần đăng, số liệu này đổi theo.`
const NO_STATS = 'số liệu nội dung (content.json)'

export function contentPage(c: ContentPage): string {
  const tz = c.tz ?? HOME_TZ
  let body = `<h1>Nội dung</h1>`
  if (isFailed(c.stats)) return page('/_ab/noi-dung/', 'Nội dung', `${body}${failedBox(NO_STATS, c.stats)}`, c.now, tz)
  const s = c.stats
  body += `<p class="lede">${contentLede(s, c.now, tz)}</p>
<nav class="jump" aria-label="Các phần của trang"><ul>${JUMP.map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`).join('')}</ul></nav>`
  body += totalsHtml(s) + growthHtml(c.now, s, c.snapshots, tz) + engineHtml(c.now, s, tz) + gapsHtml(s, c.low, c.reads, tz) + photosHtml(s) + readsHtml(c.reads) + talkHtml(c.talk) + clicksHtml(c.clicks, c.now, tz) + sourcesHtml(s)
  return page('/_ab/noi-dung/', 'Nội dung', body, c.now, tz)
}

/** The page as blocks, part by part in the page's order (its jump links aside). */
export function contentSection(c: ContentPage): Section {
  const tz = c.tz ?? HOME_TZ
  if (isFailed(c.stats)) return { title: 'Nội dung', blocks: [failedNote(NO_STATS, c.stats)] }
  const s = c.stats
  return {
    title: 'Nội dung',
    blocks: [note(textOf(contentLede(s, c.now, tz))), ...totalsBlocks(s), ...growthBlocks(c.now, s, c.snapshots, tz), ...engineBlocks(c.now, s, tz), ...gapsBlocks(s, c.low, c.reads, tz), ...photosBlocks(s), ...readsBlocks(c.reads), ...talkBlocks(c.talk), ...clicksBlocks(c.clicks, c.now, tz), ...sourcesBlocks(s)],
  }
}

const TOTALS_HEAD = ['Loại', 'Bài', ...OTHER_LANGS.map(l => `Có tiếng ${LANG_VI[l]}`)]
function totalsParts(s: ContentStats) {
  const main = MAIN.reduce((n, k) => n + (s.inventory[k]?.total ?? 0), 0)
  const built = s.built ? LANGS.reduce((a, l) => a + s.built!.total[l], 0) : null
  return {
    tiles: [
      { label: 'Bài (cá, cây, giống, bài viết)', value: fmt(main) },
      { label: 'Trang đã build', value: built === null ? '—' : fmt(built), sub: s.built ? LANGS.map(l => `${LANG_VI[l]} ${fmt(s.built!.total[l])}`).join(' · ') : undefined },
      { label: 'Ảnh trên trang', value: fmt(s.photos.pages), sub: `${fmt(s.photos.gallery.photos)} ảnh ở ${fmt(s.photos.gallery.pages)} trang ảnh` },
      { label: 'Mục khác', value: fmt(OTHER.reduce((n, k) => n + (s.inventory[k]?.total ?? 0), 0)), sub: OTHER.filter(k => s.inventory[k]?.total).map(k => `${KIND[k].toLowerCase()} ${fmt(s.inventory[k]!.total)}`).join(' · ') },
    ] as Tile[],
    rows: ENTITY.filter(k => s.inventory[k]?.total).map(k => {
      const inv = s.inventory[k]!
      return [esc(KIND[k]), fmt(inv.total), ...OTHER_LANGS.map(l => fmt(inv[l]))]
    }),
  }
}
/** A row of HTML cells: the first a row heading, the rest plain cells. */
const rowHtml = (c: string[]) => `<tr><th>${c[0]}</th>${c.slice(1).map(x => `<td>${x}</td>`).join('')}</tr>`
const headHtml = (head: string[]) => `<thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>`
const cells = (rows: string[][]): Cell[][] => rows.map(r => r.map(c => cellOf(c)))

function totalsHtml(s: ContentStats): string {
  const p = totalsParts(s)
  return `<section aria-labelledby="tong"><h2 id="tong">Tổng</h2>${tiles(p.tiles)}
<div class="scroll"><table>${headHtml(TOTALS_HEAD)}<tbody>${p.rows.map(rowHtml).join('')}</tbody></table></div></section>`
}
function totalsBlocks(s: ContentStats): Block[] {
  const p = totalsParts(s)
  return [heading('Tổng', 2, 'tong'), figures(p.tiles), table(TOTALS_HEAD, cells(p.rows))]
}

const GROWTH_NONE = 'Mỗi đêm lưu tổng số một lần; cần ít nhất hai ngày để thấy tăng thêm bao nhiêu.'
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`
const BY_SOURCE_HEAD = ['Nguồn', 'Bài thêm']
/** What "Tăng thêm" draws once two nights are kept: two charts, what each source added, and the note on how it's kept. */
function growthParts(now: Date, s: ContentStats, snaps: Snapshot[], tz: string) {
  const days = lastDays(now, 30, tz)
  const v = (k: EntityKind) => (t: Totals) => t.kinds[k]?.vi ?? 0
  const missing = 'chưa lưu số liệu ngày này'
  // New translations come in bursts: columns per day, not lines drawn between days as if they flowed.
  const charts: DayChart[] = [{
    id: 'n-added', title: 'Bài mới mỗi ngày (tiếng Việt)', days, partialLast: true, missing,
    series: [{ label: 'Cá', values: perDay(snaps, days, v('fish')) }, { label: 'Cây', values: perDay(snaps, days, v('plant')) }, { label: 'Bài viết, bài từ video', values: perDay(snaps, days, t => v('guide')(t) + v('videoGuide')(t)) }],
    empty: 'Chưa có bài mới nào trong những ngày đã lưu.',
  }, {
    id: 'n-langs', title: 'Bài tiếng Indonesia và tiếng Thái mới mỗi ngày', days, partialLast: true, missing,
    series: OTHER_LANGS.map(l => ({ label: LANG_VI[l], values: perDay(snaps, days, t => inLang(t, l)) })),
    empty: 'Chưa có bài dịch mới nào trong những ngày đã lưu.',
  }]
  // What each source added over the last 7 days kept (or since the first day kept).
  const last = snaps.at(-1)!
  const weekAgo = new Date(Date.parse(`${last.day}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10)
  const from = snaps.filter(x => x.day <= weekAgo).at(-1) ?? snaps[0]!
  const bySource = Object.entries(last.totals.sources).map(([id, n]) => ({ id, n: n - (from.totals.sources[id] ?? 0) })).filter(x => x.n).sort((a, b) => b.n - a.n)
  return {
    charts,
    sourceTitle: `Theo nguồn, từ ${esc(from.day.slice(8, 10))}/${esc(from.day.slice(5, 7))}`,
    sources: bySource.map(x => ({ label: esc(s.sources[x.id]?.name ?? x.id), value: x.n })) as Ranked[],
    note: `Mỗi đêm lưu tổng số một lần, ${savedNote(now, tz)} (giờ của bạn): cột một ngày là những gì thêm trong 24 giờ tới lần lưu đó. Một ngày không lưu được thì lần lưu sau gộp cả phần đó; ngày chưa có số liệu được gạch chéo.`,
  }
}

function growthHtml(now: Date, s: ContentStats, snaps: Soft<Snapshot[]>, tz: string): string {
  let out = '<section aria-labelledby="tang"><h2 id="tang">Tăng thêm</h2>'
  if (isFailed(snaps)) return `${out}${failedBox('số liệu từng ngày', snaps)}</section>`
  if (snaps.length < 2) return `${out}<p class="muted">${GROWTH_NONE}</p></section>`
  const p = growthParts(now, s, snaps, tz)
  out += `<div class="charts">${p.charts.map(dayChart).join('')}`
  out += `<figure class="chart" aria-labelledby="n-src"><figcaption><h3 id="n-src">${p.sourceTitle}</h3></figcaption>${rankTable(p.sources, BY_SOURCE_HEAD, signed)}</figure></div>
<p class="note">${p.note}</p></section>`
  return out
}
function growthBlocks(now: Date, s: ContentStats, snaps: Soft<Snapshot[]>, tz: string): Block[] {
  const out = [heading('Tăng thêm', 2, 'tang')]
  if (isFailed(snaps)) return [...out, failedNote('số liệu từng ngày', snaps)]
  if (snaps.length < 2) return [...out, note(GROWTH_NONE, 'muted')]
  const p = growthParts(now, s, snaps, tz)
  return [...out, ...p.charts.map(chart), heading(textOf(p.sourceTitle), 3), rankBlock(p.sources, BY_SOURCE_HEAD, signed), note(p.note)]
}

const NO_ENGINE = 'Bản build này không có engine-state.'
const ENGINE_HEAD = ['Nguồn', 'Còn chờ', 'Lỗi 3 lần', 'Bị chặn', 'Đổi gần nhất', 'Địa chỉ đã gặp', 'Thành trang', 'Bỏ qua']
/** What "Engine" draws: the sources waiting on the owner, the video queue, the rewrite, each page source and the last run. */
function engineParts(now: Date, e: NonNullable<ContentStats['engine']>, tz: string) {
  const name = (id: string) => e.sources.find(r => r.id === id)?.name ?? id
  const human = new Set(e.needsHuman.map(n => n.source))
  const v = e.videos
  const days = lastDays(now, 31, tz)
  const written = writtenPerDay(v.writtenAt, days, tz)
  const written7 = written.slice(-8, -1).reduce((a, b) => a + b, 0)
  // What's stuck first: a source waiting on the owner, then the most still to do.
  const sources = e.sources.slice().sort((a, b) => Number(human.has(b.id)) - Number(human.has(a.id)) || b.waiting - a.waiting || b.found - a.found)
  return {
    human: e.needsHuman.length ? `Cần bạn qua kiểm tra trình duyệt (Cloudflare, Turnstile) trong hồ sơ Chrome của engine: ${e.needsHuman.map(n => `<b>${esc(name(n.source))}</b> từ ${timeTag(n.since, tz, now)}`).join(', ')}.` : '',
    videoTiles: [
      { label: 'Video chờ viết', value: fmt(v.waiting), sub: `trong ${fmt(v.listed)} video đã xếp hàng` },
      { label: 'Đã viết', value: fmt(v.written), sub: `${fmt(written7)} bài trong 7 ngày gần nhất` },
      { label: 'Bỏ qua', value: fmt(v.skipped), sub: 'không phải bài hướng dẫn, quá ngắn, chỉ cho hội viên…' },
      { label: 'Lỗi 3 lần', value: fmt(v.failed) },
    ] as Tile[],
    chart: { id: 'n-videos', title: 'Bài từ video viết mỗi ngày · 30 ngày', days: days.slice(1), series: [{ label: 'Bài', values: written.slice(1) }], partialLast: true, empty: 'Chưa viết bài nào trong 30 ngày.' } as DayChart,
    rewriteTiles: [{ label: 'Đã viết lại', value: fmt(e.rewrite.done), meter: rewriteShare(e.rewrite), sub: `${pct(e.rewrite.done, e.rewrite.done + e.rewrite.waiting + e.rewrite.failed)} số trang cần viết lại` }, { label: 'Còn chờ', value: fmt(e.rewrite.waiting), sub: `${fmt(e.rewrite.failed)} lỗi` }] as Tile[],
    // The source, marked when it waits on the owner; the rest of its row as the page writes it.
    rows: sources.map(r => ({ source: { text: r.name, ...(human.has(r.id) ? { sub: 'cần bạn', tone: 'bad' as const } : {}) } as Cell, cells: [fmt(r.waiting), fmt(r.failed), fmt(r.blocked), r.lastAt ? timeTag(r.lastAt, tz, now) : '—', `${fmt(r.found)}${r.discovered ? ` <span class="muted">/ ${fmt(r.discovered)}</span>` : ''}`, fmt(r.done), fmt(r.skipped)] })),
    note: `Thành trang: viết thành trang, hoặc gộp vào một trang có sẵn. Bỏ qua: trang danh mục, trùng, không phải cá. Lỗi 3 lần: thôi thử cho tới khi trang nguồn đổi.${e.lastRun ? ` Lần chạy gần nhất trên máy build: ${timeTag(e.lastRun.startedAt, tz, now)}–${esc(hourMinute(e.lastRun.finishedAt, tz))}, đổi ${fmt(e.lastRun.changed)} mục, ${fmt(e.lastRun.errors)} lỗi.` : ''}`,
  }
}

function engineHtml(now: Date, s: ContentStats, tz: string): string {
  let out = '<section aria-labelledby="engine"><h2 id="engine">Engine</h2>'
  const e = s.engine
  if (!e) return `${out}<p class="muted">${NO_ENGINE}</p></section>`
  const p = engineParts(now, e, tz)
  if (p.human) out += `<div class="failed" role="status">${p.human}</div>`
  out += `<h3 class="sub-h">Bài từ video YouTube</h3>${tiles(p.videoTiles)}
<div class="charts">${dayChart(p.chart)}
<figure class="chart" aria-labelledby="n-rw"><figcaption><h3 id="n-rw">Viết lại tiếng Việt cũ</h3></figcaption>${tiles(p.rewriteTiles)}</figure></div>`
  out += `<h3 class="sub-h">Nguồn trang</h3><div class="scroll"><table class="wide">${headHtml(ENGINE_HEAD)}<tbody>${p.rows.map(r => rowHtml([`${esc(r.source.text)}${r.source.sub ? ` <span class="chip bad">${esc(r.source.sub)}</span>` : ''}`, ...r.cells])).join('') || '<tr><td colspan="8" class="none">Chưa có.</td></tr>'}</tbody></table></div>
<p class="note">${p.note}</p></section>`
  return out
}
function engineBlocks(now: Date, s: ContentStats, tz: string): Block[] {
  const out = [heading('Engine', 2, 'engine')]
  const e = s.engine
  if (!e) return [...out, note(NO_ENGINE, 'muted')]
  const p = engineParts(now, e, tz)
  if (p.human) out.push(note(textOf(p.human), 'bad'))
  const rows = p.rows.map(r => [r.source, ...r.cells.map(c => cellOf(c))])
  return [...out, heading('Bài từ video YouTube', 3), figures(p.videoTiles), chart(p.chart), heading('Viết lại tiếng Việt cũ', 3), figures(p.rewriteTiles),
    heading('Nguồn trang', 3), table(ENGINE_HEAD, rows, { empty: 'Chưa có.' }), note(textOf(p.note))]
}

/** Guides written on each of `days`, counted by the viewer's day. */
export const writtenPerDay = (at: string[], days: string[], tz: string) => {
  const per = new Map(days.map(d => [d, 0]))
  for (const t of at) {
    const d = localDay(t, tz)
    if (per.has(d)) per.set(d, per.get(d)! + 1)
  }
  return days.map(d => per.get(d)!)
}
const rewriteShare = (r: { done: number; waiting: number; failed: number }) => (r.done + r.waiting + r.failed ? r.done / (r.done + r.waiting + r.failed) : undefined)

const GAPS_NOTE = 'Đếm trên những trang đang có. Danh sách xếp loài phổ biến và loài cơ bản lên trước.'
/** Each kind with something missing: what's missing, how many and what share, and the first pages to fix. */
function gapsParts(s: ContentStats) {
  const kinds = (Object.keys(s.gaps) as EntityKind[]).filter(k => Object.keys(s.gaps[k] ?? {}).length)
  return kinds.map(k => {
    const total = s.inventory[k]?.total ?? 0
    const gaps = (Object.entries(s.gaps[k]!) as [GapKey, NonNullable<ContentStats['gaps'][EntityKind]>[GapKey]][]).filter(([, g]) => g && g.n).map(([key, g]) => ({
      n: g!.n, label: esc(GAP[key] ?? key), share: pct(g!.n, total), meter: total ? g!.n / total : undefined,
      by: g!.by ? `(${Object.entries(g!.by).map(([f, n]) => `${FACT[f] ?? f} ${fmt(n)}`).join(' · ')})` : '',
      summary: g!.top.length ? (g!.n > g!.top.length ? `${fmt(g!.top.length)} trang đầu` : 'Xem các trang') : '',
      top: g!.top,
    }))
    return { kind: k, total, title: `${esc(KIND[k])} <span class="muted">· ${fmt(total)} bài</span>`, gaps }
  }).filter(x => x.gaps.length)
}

function gapsHtml(s: ContentStats, low: ContentPage['low'], reads: Soft<ContentReads>, tz: string): string {
  const block = (x: ReturnType<typeof gapsParts>[number]) => {
    const rows = x.gaps.map(g => {
      const by = g.by ? ` <span class="muted">${g.by}</span>` : ''
      const list = g.summary ? `<details><summary>${g.summary}</summary><ol class="pages">${g.top.map(([path, name]) => `<li>${link(path, name)}</li>`).join('')}</ol></details>` : ''
      return `<li><p><b>${fmt(g.n)}</b> ${g.label}${by} <span class="muted">· ${g.share}</span></p>${g.meter !== undefined ? meter(g.meter, 'warn') : ''}${list}</li>`
    }).join('')
    return `<section class="gap"><h3 class="sub-h">${x.title}</h3><ul class="gaps">${rows}</ul></section>`
  }
  return `<section aria-labelledby="thieu"><h2 id="thieu">Còn thiếu</h2><p class="note">${GAPS_NOTE}</p><div class="split">${gapsParts(s).map(block).join('')}</div>${lowHtml(s, low, reads, tz)}</section>`
}
/** Each kind: its heading, then each gap as a figure and, folded under it, the first pages to fix. */
function gapsBlocks(s: ContentStats, low: ContentPage['low'], reads: Soft<ContentReads>, tz: string): Block[] {
  return [heading('Còn thiếu', 2, 'thieu'), note(GAPS_NOTE), ...gapsParts(s).flatMap(x => [
    heading(textOf(x.title), 3),
    ...x.gaps.flatMap(g => [
      figures([{ label: textOf(`${g.label}${g.by ? ` ${g.by}` : ''}`), value: fmt(g.n), sub: g.share, meter: g.meter }]),
      ...(g.summary ? [table(['Trang'], g.top.map(([path, name]) => [{ text: name, href: path }]), { folded: g.summary })] : []),
    ]),
  ]), ...lowBlocks(s, low, reads, tz)]
}

/** The pages out of search for their score listed, the rest counted. */
const LOW_LIST = 30
const LOW_TITLE = 'Ẩn khỏi tìm kiếm vì điểm thấp'
const NO_LOW = 'danh sách trang điểm thấp (reviews.json)'
const LOW_NONE = 'Không có trang nào.'
const NO_REVIEW = 'Chưa lưu lần đánh giá nào.'
const NO_NOTES = 'Không có nhận xét.'
/** What each of the engine's reviews read (scripts/content-stats.ts SCORE_REVIEWS). */
const REVIEWED: Record<string, string> = {
  'video-guide': 'bài viết từ video', translation: 'bản dịch từ nguồn', 'vi-rewrite': 'bản viết lại tiếng Việt', breed: 'trang giống cá', topic: 'bài AquaTome',
  product: 'trang sản phẩm', localize: 'bản dịch', glossary: 'bản dịch thuật ngữ', equipment: 'bản dịch hướng dẫn thiết bị',
}
const langName = (l: Lang) => (l === 'vi' ? LANG_VI.vi : `tiếng ${LANG_VI[l]}`)

/**
 * "Ẩn khỏi tìm kiếm vì điểm thấp": how many pages of each kind, then the first LOW_LIST, the most read first when the
 * readers loaded (else the lowest score), each with its kind and language, score, readers, and what its last review found.
 */
function lowParts(s: ContentStats, low: LowScores, reads: Soft<ContentReads>, tz: string) {
  const title = new Map(Object.values(s.pages ?? {}).flatMap(rows => rows.map(r => [r[0], r[1]] as const)))
  const readers = isFailed(reads) ? undefined : reads.readersOf
  const langOf = (p: LowPage) => prefixedLang(p.path) ?? 'vi'
  const kinds = new Map<PageKind, Partial<Record<Lang, number>>>()
  for (const p of low.pages) {
    const k = kinds.get(p.kind) ?? {}
    k[langOf(p)] = (k[langOf(p)] ?? 0) + 1
    kinds.set(p.kind, k)
  }
  const count = (by: Partial<Record<Lang, number>>) => LANGS.reduce((n, l) => n + (by[l] ?? 0), 0)
  const read = (p: LowPage) => readers?.[p.path] ?? 0
  const pages = [...low.pages].sort((a, b) => read(b) - read(a) || a.score - b.score || a.path.localeCompare(b.path))
  const meta = (r: LastReview, score: number) => `Đánh giá ${REVIEWED[r.kind] ?? r.kind}, ${dayLabel(localDay(r.at, tz))}${r.score !== score ? `, ${fmt(r.score, 2)} điểm` : ''}${r.notes.length > 1 ? ` · ${fmt(r.notes.length)} nhận xét` : ''}${r.kept ? '' : ' · bản này không được giữ'}`
  return {
    note: `Lần đánh giá chất lượng cho dưới ${fmt(low.bar, 2)} điểm, nên trang không có trong Google và sitemap cho tới khi được viết lại đạt điểm. Nhận xét là của bước đánh giá tự động, bằng tiếng Anh. ${readers && !isFailed(reads) ? `Trang nhiều người đọc nhất trong ${reads.days} ngày lên trước, rồi điểm thấp nhất.` : 'Chưa có số người đọc: điểm thấp nhất lên trước.'}`,
    tiles: [...kinds].sort((a, b) => count(b[1]) - count(a[1])).map(([kind, by]) => ({ label: KIND[kind], value: fmt(count(by)), sub: LANGS.filter(l => by[l]).map(l => `${LANG_VI[l]} ${fmt(by[l]!)}`).join(' · ') })) as Tile[],
    head: ['Trang', 'Loại', 'Điểm', ...(readers ? ['Người đọc'] : []), 'Nhận xét gần nhất'],
    rows: pages.slice(0, LOW_LIST).map(p => ({
      path: p.path, title: title.get(p.path) ?? p.path, kind: KIND[p.kind], lang: langName(langOf(p)), score: fmt(p.score, 2),
      readers: readers ? fmt(read(p)) : undefined, notes: p.review?.notes, meta: p.review && meta(p.review, p.score),
    })),
    rest: low.pages.length > LOW_LIST ? `Và ${fmt(low.pages.length - LOW_LIST)} trang khác.` : '',
  }
}

/** A review's notes: the first, two lines of it until opened, the rest under it; then which review, when. */
function whyHtml(notes: string[] | undefined, meta: string | undefined): string {
  if (!notes || meta === undefined) return `<td class="why muted">${NO_REVIEW}</td>`
  const [first, ...rest] = notes
  const body = !first ? `<p class="muted">${NO_NOTES}</p>`
    : !rest.length ? `<p>${esc(first)}</p>`
    : `<details><summary data-more="Xem cả ${fmt(notes.length)} nhận xét"><span>${esc(first)}</span></summary>\n<ul>${rest.map(n => `<li>${esc(n)}</li>`).join('\n')}</ul></details>`
  return `<td class="why">${body}\n<small>${esc(meta)}</small></td>`
}

function lowHtml(s: ContentStats, low: ContentPage['low'], reads: Soft<ContentReads>, tz: string): string {
  if (low === undefined) return ''
  const out = `<section class="low"><h3 class="sub-h">${LOW_TITLE}</h3>`
  if (isFailed(low)) return `${out}${failedBox(NO_LOW, low)}</section>`
  if (!low.pages.length) return `${out}<p class="muted">${LOW_NONE}</p></section>`
  const p = lowParts(s, low, reads, tz)
  const rows = p.rows.map(r => `<tr><th>${link(r.path, r.title)}</th><td class="k">${esc(r.kind)} <span class="muted">${esc(r.lang)}</span></td><td class="s">${r.score}</td>${r.readers === undefined ? '' : `<td class="r">${r.readers}</td>`}${whyHtml(r.notes, r.meta)}</tr>`).join('')
  return `${out}<p class="note">${esc(p.note)}</p>${tiles(p.tiles)}
<div class="scroll"><table class="low-t">${headHtml(p.head)}<tbody>${rows}</tbody></table></div>${p.rest ? `<p class="note">${p.rest}</p>` : ''}</section>`
}
function lowBlocks(s: ContentStats, low: ContentPage['low'], reads: Soft<ContentReads>, tz: string): Block[] {
  if (low === undefined) return []
  const out = [heading(LOW_TITLE, 3)]
  if (isFailed(low)) return [...out, failedNote(NO_LOW, low)]
  if (!low.pages.length) return [...out, note(LOW_NONE, 'muted')]
  const p = lowParts(s, low, reads, tz)
  const rows = p.rows.map((r): Cell[] => [
    { text: r.title, href: r.path }, { text: r.kind, sub: r.lang }, { text: r.score }, ...(r.readers === undefined ? [] : [{ text: r.readers }]),
    r.notes && r.meta !== undefined ? { text: r.notes.length ? r.notes.join('\n') : NO_NOTES, sub: r.meta } : { text: NO_REVIEW, tone: 'muted' },
  ])
  return [...out, note(p.note), figures(p.tiles), table(p.head, rows), ...(p.rest ? [note(p.rest)] : [])]
}

const LICENCE_HEAD = ['Giấy phép', 'Ảnh']
const ORIGIN_HEAD = ['Nơi lấy', 'Ảnh']
function photosParts(s: ContentStats) {
  const p = s.photos
  const cov = (['fish', 'plant', 'breed'] as const).filter(k => p.covered[k]).map(k => ({ label: `${KIND[k]} có ảnh`, value: pct(p.covered[k]!.with, p.covered[k]!.of), meter: p.covered[k]!.of ? p.covered[k]!.with / p.covered[k]!.of : undefined, sub: `${fmt(p.covered[k]!.with)} trên ${fmt(p.covered[k]!.of)}` }))
  const rank = (m: Record<string, number>): Ranked[] => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label: esc(label), value }))
  return { tiles: [...cov, { label: 'Chờ sao chép về máy chủ ảnh', value: fmt(p.waitingMirror), sub: 'chưa hiện ở bản công khai' }] as Tile[], licences: rank(p.byLicence), origins: rank(p.byOrigin) }
}
function photosHtml(s: ContentStats): string {
  const p = photosParts(s)
  return `<section aria-labelledby="anh"><h2 id="anh">Ảnh</h2>${tiles(p.tiles)}
<div class="split"><section><h3 class="sub-h">Theo giấy phép</h3>${rankTable(p.licences, LICENCE_HEAD)}</section><section><h3 class="sub-h">Theo nơi lấy</h3>${rankTable(p.origins, ORIGIN_HEAD)}</section></div></section>`
}
function photosBlocks(s: ContentStats): Block[] {
  const p = photosParts(s)
  return [heading('Ảnh', 2, 'anh'), figures(p.tiles), heading('Theo giấy phép', 3), rankBlock(p.licences, LICENCE_HEAD), heading('Theo nơi lấy', 3), rankBlock(p.origins, ORIGIN_HEAD)]
}

const READS_HEAD = ['Loại', 'Trang', 'Có người đọc', 'Người đọc', 'Lượt xem']
const READ_TOP_HEAD = ['Trang', 'Người đọc', 'Lượt xem']
function readsParts(r: ContentReads) {
  return {
    lede: `${r.days} ngày gần nhất · người đọc: phiên cuộn ≥ 50% hoặc ở lại ≥ 30 giây, như trang Người đọc.`,
    // Pages with a reader, and their share under it.
    rows: r.byKind.map((k): Cell[] => [{ text: KIND[k.kind] }, { text: fmt(k.pages) }, { text: fmt(k.read), ...(k.read ? { sub: pct(k.read, k.pages) } : {}) }, { text: fmt(k.readers) }, { text: fmt(k.views) }]),
    top: r.top.map(x => ({ label: link(x.path, x.title), value: x.readers, cells: [fmt(x.views)] })) as Ranked[],
    unreadTitle: `${fmt(r.unread.n)} trang chưa ai đọc trong ${r.days} ngày`,
    unread: Object.entries(r.unread.byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${KIND[k as PageKind]} ${fmt(n)}`).join(' · '),
    unreadSummary: `${fmt(r.unread.pages.length)} trang đầu`,
    elsewhere: r.elsewhere.views ? `${fmt(r.elsewhere.views)} lượt xem ở ${fmt(r.elsewhere.paths)} địa chỉ bản build này không có (địa chỉ cũ, trang đã gỡ, gõ sai).` : '',
  }
}
function readsHtml(r: Soft<ContentReads>): string {
  const out = '<section aria-labelledby="doc"><h2 id="doc">Người đọc theo loại trang</h2>'
  if (isFailed(r)) return `${out}${failedBox('người đọc theo trang', r)}</section>`
  const p = readsParts(r)
  return `${out}<p class="lede">${p.lede}</p>
<div class="scroll"><table>${headHtml(READS_HEAD)}<tbody>${p.rows.map(r => rowHtml(r.map(c => `${esc(c.text)}${c.sub ? ` <span class="muted">${esc(c.sub)}</span>` : ''}`))).join('') || '<tr><td colspan="5" class="none">Chưa có.</td></tr>'}</tbody></table></div>
<div class="split"><section><h3 class="sub-h">Trang nhiều người đọc nhất</h3>${rankTable(p.top, READ_TOP_HEAD)}</section>
<section><h3 class="sub-h">${p.unreadTitle}</h3><p class="note">${esc(p.unread)}</p>${r.unread.pages.length ? `<details><summary>${p.unreadSummary}</summary><ol class="pages">${r.unread.pages.map(x => `<li>${link(x.path, x.title)}</li>`).join('')}</ol></details>` : ''}
${p.elsewhere ? `<p class="note">${p.elsewhere}</p>` : ''}</section></div></section>`
}
function readsBlocks(r: Soft<ContentReads>): Block[] {
  const out = [heading('Người đọc theo loại trang', 2, 'doc')]
  if (isFailed(r)) return [...out, failedNote('người đọc theo trang', r)]
  const p = readsParts(r)
  return [...out, note(p.lede), table(READS_HEAD, p.rows, { empty: 'Chưa có.' }), heading('Trang nhiều người đọc nhất', 3), rankBlock(p.top, READ_TOP_HEAD),
    heading(p.unreadTitle, 3), note(p.unread), ...(r.unread.pages.length ? [table(['Trang'], r.unread.pages.map(x => [{ text: x.title, href: x.path }]), { folded: p.unreadSummary })] : []),
    ...(p.elsewhere ? [note(p.elsewhere)] : [])]
}

const TALK_KIND_HEAD = ['Loại', 'Bình luận', 'Ảnh']
const TALK_TOP_HEAD = ['Trang', 'Bình luận', 'Ảnh']
function talkParts(t: Talk) {
  return {
    lede: `Đang hiện: ${fmt(t.comments)} bình luận, ${fmt(t.photos)} ảnh bạn đọc${t.elsewhere.comments || t.elsewhere.photos ? ` · ${fmt(t.elsewhere.comments)} bình luận và ${fmt(t.elsewhere.photos)} ảnh ở mục không còn trang` : ''}.`,
    kinds: t.byKind.map(k => ({ label: esc(KIND[k.kind]), value: k.comments, cells: [fmt(k.photos)] })) as Ranked[],
    top: t.top.map(x => ({ label: link(x.path, x.title), value: x.comments, cells: [fmt(x.photos)] })) as Ranked[],
  }
}
function talkHtml(t: Soft<Talk>): string {
  const out = '<section aria-labelledby="binh-luan"><h2 id="binh-luan">Bình luận và ảnh bạn đọc theo trang</h2>'
  if (isFailed(t)) return `${out}${failedBox('bình luận theo trang', t)}</section>`
  const p = talkParts(t)
  return `${out}<p class="lede">${p.lede}</p>
<div class="split"><section><h3 class="sub-h">Theo loại</h3>${rankTable(p.kinds, TALK_KIND_HEAD)}</section>
<section><h3 class="sub-h">Trang nhiều nhất</h3>${rankTable(p.top, TALK_TOP_HEAD)}</section></div></section>`
}
function talkBlocks(t: Soft<Talk>): Block[] {
  const out = [heading('Bình luận và ảnh bạn đọc theo trang', 2, 'binh-luan')]
  if (isFailed(t)) return [...out, failedNote('bình luận theo trang', t)]
  const p = talkParts(t)
  return [...out, note(p.lede), heading('Theo loại', 3), rankBlock(p.kinds, TALK_KIND_HEAD), heading('Trang nhiều nhất', 3), rankBlock(p.top, TALK_TOP_HEAD)]
}

const CLICK_KIND_HEAD = ['Loại', 'Lượt bấm']
const CLICK_TOP_HEAD = ['Trang', 'Lượt bấm']
function clicksParts(k: KindClicks, now: Date, tz: string) {
  return {
    lede: `${fmt(k.clicks)} lượt bấm sang sàn trong ${k.days} ngày (từ ${esc(k.since.slice(8, 10))}/${esc(k.since.slice(5, 7))}${sameClock(tz, HOME_TZ, now) ? '' : ', ngày theo giờ Việt Nam'})${k.elsewhere ? ` · ${fmt(k.elsewhere)} từ liên kết không gắn trang` : ''}.`,
    kinds: k.byKind.map(x => ({ label: esc(KIND[x.kind]), value: x.clicks })) as Ranked[],
    top: k.top.map(x => ({ label: link(x.path, x.title), value: x.clicks })) as Ranked[],
  }
}
function clicksHtml(k: Soft<KindClicks>, now: Date, tz: string): string {
  const out = '<section aria-labelledby="affiliate"><h2 id="affiliate">Affiliate theo loại trang</h2>'
  if (isFailed(k)) return `${out}${failedBox('lượt bấm theo trang', k)}</section>`
  const p = clicksParts(k, now, tz)
  return `${out}<p class="lede">${p.lede}</p>
<div class="split"><section><h3 class="sub-h">Theo loại</h3>${rankTable(p.kinds, CLICK_KIND_HEAD)}</section>
<section><h3 class="sub-h">Trang dẫn nhiều nhất</h3>${rankTable(p.top, CLICK_TOP_HEAD)}</section></div></section>`
}
function clicksBlocks(k: Soft<KindClicks>, now: Date, tz: string): Block[] {
  const out = [heading('Affiliate theo loại trang', 2, 'affiliate')]
  if (isFailed(k)) return [...out, failedNote('lượt bấm theo trang', k)]
  const p = clicksParts(k, now, tz)
  return [...out, note(textOf(p.lede)), heading('Theo loại', 3), rankBlock(p.kinds, CLICK_KIND_HEAD), heading('Trang dẫn nhiều nhất', 3), rankBlock(p.top, CLICK_TOP_HEAD)]
}

const SOURCES_HEAD = ['Nguồn', 'Cá', 'Cây', 'Bài viết']
const SOURCES_NOTE = 'Bài có chữ từ mỗi nguồn, như bản build cho thấy; một bài hai nguồn tính cho cả hai.'
const sourceRows = (s: ContentStats) => Object.values(s.sources).filter(x => x.fish + x.plant + x.guide).sort((a, b) => b.fish + b.plant + b.guide - (a.fish + a.plant + a.guide))
  .map(x => [esc(x.name), fmt(x.fish), fmt(x.plant), fmt(x.guide)])
function sourcesHtml(s: ContentStats): string {
  return `<section aria-labelledby="nguon"><h2 id="nguon">Nguồn nội dung</h2><p class="note">${SOURCES_NOTE}</p>
<div class="scroll"><table>${headHtml(SOURCES_HEAD)}<tbody>${sourceRows(s).map(rowHtml).join('') || '<tr><td colspan="4" class="none">Chưa có.</td></tr>'}</tbody></table></div></section>`
}
function sourcesBlocks(s: ContentStats): Block[] {
  return [heading('Nguồn nội dung', 2, 'nguon'), note(SOURCES_NOTE), table(SOURCES_HEAD, cells(sourceRows(s)), { empty: 'Chưa có.' })]
}
