import type { ContentStats, Totals } from './content'
import { openDay, perDay, SAVED } from './content-page'
import { dayName, fmt, type Readout } from './chart'
import { clock } from './time'

/**
 * The overview's "New pages" (protocols/owner-dashboard.openapi.json `Publishing`, Design's board of 14 Nov 2026): for each
 * of four kinds, what each night's save added in Vietnamese, today so far, the total now, and whether it has stalled.
 *
 * - A day's bar is that night's save less the save before it (content-page.ts perDay, the Growth chart's own count); today's
 *   is this build's totals less the last save. A day with no save is null; a loss draws no bar, its readout says so.
 * - A kind has stalled when it has added nothing for 24 hours and still has work waiting (fish and plants: a page source
 *   of theirs with pages waiting; video guides: the video queue). A kind with no such reading (written guides) never is.
 * - When every kind has added nothing for 24 hours, that's the engine, not four kinds: one line (`quiet`), no kind stalled
 *   (Design, 14 Nov: on Thu 12 every kind added 0).
 */
export type PublishingKey = 'fish' | 'guide' | 'videoGuide' | 'plant'
export type Bars = { days: string[]; values: (number | null)[]; readouts: Readout[]; today?: number }
export type Stall = { since: string; text: string }
export type PublishingJson = {
  title: string
  kinds: { key: PublishingKey; label: string; total: string; bars: Bars; stalled?: Stall }[]
  /** Why a day has no bar, when one hasn't. */
  missing?: string
  /** Every kind still for 24 hours: one line for the engine. */
  quiet?: Stall
}

export const PUBLISHING_DAYS = 28
const STALL_MS = 24 * 3_600_000
const KINDS: readonly (readonly [PublishingKey, string, string])[] = [
  ['fish', 'Species pages', 'species page'], ['guide', 'Guides', 'guide'], ['videoGuide', 'Video guides', 'video guide'], ['plant', 'Plant pages', 'plant page'],
]
const vi = (k: PublishingKey) => (t: Totals) => t.kinds[k]?.vi ?? 0
const plural = (n: number, one: string) => `${fmt(n)} ${one}${n === 1 ? '' : 's'}`
/** When a night's save was kept (the cron at SAVED UTC, under that UTC day). */
const savedAt = (day: string) => `${day}T${SAVED}:00Z`

/** Whether the engine has work waiting for a kind: true, false, or undefined when nothing says. */
function waiting(k: PublishingKey, s: ContentStats): boolean | undefined {
  const e = s.engine
  if (!e) return undefined
  if (k === 'videoGuide') return e.videos.waiting > 0
  if (k === 'guide') return undefined
  const field = k === 'fish' ? 'fish' : 'plant'
  const mine = e.sources.filter(r => (s.sources[r.id]?.[field] ?? 0) > 0)
  return mine.length ? mine.some(r => r.waiting > 0) : undefined
}

/**
 * The last time a kind's count was seen higher than the time before: each save in turn, then this build. Before any growth
 * on record, the first save.
 */
function lastGrew(snaps: { at: string; totals: Totals }[], pick: (t: Totals) => number): string | undefined {
  for (let i = snaps.length - 1; i > 0; i--) if (pick(snaps[i]!.totals) > pick(snaps[i - 1]!.totals)) return snaps[i]!.at
  return snaps[0]?.at
}

export function publishingOf(now: Date, tz: string, s: ContentStats, snaps: { day: string; totals: Totals }[]): PublishingJson | undefined {
  if (!snaps.length) return undefined
  const open = openDay(now)
  const days = Array.from({ length: PUBLISHING_DAYS }, (_, i) => new Date(Date.parse(`${open}T00:00:00Z`) - (PUBLISHING_DAYS - 1 - i) * 86_400_000).toISOString().slice(0, 10))
  const saved = snaps.filter(x => x.day < open)
  const kept = [...saved, { day: open, totals: s.totals }]
  const seen = [...saved.map(x => ({ at: savedAt(x.day), totals: x.totals })), { at: s.builtAt, totals: s.totals }]
  const still = (k: PublishingKey) => {
    const since = lastGrew(seen, vi(k))
    return since && now.getTime() - Date.parse(since) >= STALL_MS ? since : undefined
  }
  // A day counted but with no count before it to compare (the first save): its bar is null too, though a count was kept.
  const first = (day: string) => kept.some(x => x.day === day) && !kept.some(x => x.day < day)
  const quietSince = KINDS.map(([k]) => still(k))
  const allQuiet = quietSince.every(Boolean)
  const kinds = KINDS.map(([key, label, one], i) => {
    const raw = perDay(kept, days, vi(key))
    const readouts: Readout[] = raw.map((v, j) => {
      const when = `${dayName(days[j]!)}${j === days.length - 1 ? ' so far' : ''}`
      if (v === null) return { title: 'Not counted', detail: `${when} · ${first(days[j]!) ? 'the first count, with none before it' : 'no count was kept that night'}` }
      return { title: v > 0 ? `+${plural(v, one)}` : v < 0 ? `${fmt(-v)} fewer` : 'None added', detail: when }
    })
    const since = quietSince[i]
    const stalled = !allQuiet && since && waiting(key, s) ? { since: new Date(since).toISOString(), text: `No new ${one}s since ${clock(since, tz, now)}` } : undefined
    return {
      key, label, total: fmt(vi(key)(s.totals)),
      bars: { days, values: raw.map(v => (v === null ? null : Math.max(0, v))), readouts, today: days.length - 1 },
      ...(stalled ? { stalled } : {}),
    }
  })
  const newest = quietSince.filter((x): x is string => !!x).sort().at(-1)
  return {
    title: 'New pages',
    kinds,
    ...(days.some(d => !first(d) && !kept.some(x => x.day === d)) ? { missing: 'No count was kept that night.' } : {}),
    ...(allQuiet && newest ? { quiet: { since: new Date(newest).toISOString(), text: `Nothing new since ${clock(newest, tz, now)}` } } : {}),
  }
}
