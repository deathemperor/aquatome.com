import { esc } from '../admin/chart'
import { CHANGELOG_NAME, CHANGELOG_PATH, failedBox, isFailed, page, soft, type Soft } from '../admin/shell'
import { localDay, WEEKDAY } from '../admin/time'
import { cleaned } from './compose'
import { AREAS, type Area, type Change } from './github'

/**
 * The product change log, /_ab/thay-doi/: what each merged pull request changed for readers, app users and the engine's
 * content, in its own plain words (scripts/changelog.mjs), by the day it merged, newest first. The daily report adds the
 * day's changes to one key in KV `AB` when it is made (daily/api.ts), so the page reads that key and never GitHub. A year
 * is kept. A change sent again (a run retried, or one started by hand within 24 hours of the last) is kept once. The
 * entries are in English, as the report is; the page's own words are Vietnamese, as the rest of the dashboard.
 */
export const CHANGELOG_KEY = 'changelog'
const KEEP_MS = 366 * 86_400_000

const isChange = (x: unknown): x is Change => {
  const c = x as Change
  return typeof c?.text === 'string' && typeof c.at === 'string' && (AREAS as readonly string[]).includes(c.area)
}
/** Every change kept, newest first. */
export async function readChanges(kv: KVNamespace): Promise<Change[]> {
  const v = await kv.get<unknown>(CHANGELOG_KEY, 'json')
  return Array.isArray(v) ? v.filter(isChange) : []
}

const id = (c: Change) => `${c.at}\n${c.area}\n${c.text}`
/**
 * Adds a report's changes, with what the report would cut from them cut here too (an address, another site's link),
 * and drops what is over a year old. Writes only when something is new; returns how many were.
 */
export async function addChanges(kv: KVNamespace, changes: Change[], now: Date): Promise<number> {
  if (!changes.length) return 0
  const kept = await readChanges(kv)
  const seen = new Set(kept.map(id))
  const fresh: Change[] = []
  for (const c of changes) {
    const x = { area: c.area, text: cleaned(c.text), at: c.at }
    if (seen.has(id(x))) continue
    seen.add(id(x))
    fresh.push(x)
  }
  if (!fresh.length) return 0
  const from = now.getTime() - KEEP_MS
  const all = [...kept, ...fresh].filter(c => Date.parse(c.at) >= from).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  await kv.put(CHANGELOG_KEY, JSON.stringify(all))
  return fresh.length
}

export type ChangelogData = { now: Date; tz: string; xs: Soft<Change[]> }
export const loadChangelog = async (kv: KVNamespace, now: Date, tz: string): Promise<ChangelogData> => ({ now, tz, xs: await soft('change log', readChanges(kv)) })

const LEDE = 'Người đọc, người dùng ứng dụng và nội dung được gì từ mỗi thay đổi đã gộp, theo ngày gộp, mới nhất trước. Báo cáo hằng ngày ghi thêm vào đây mỗi sáng; lưu một năm. Mỗi dòng bằng tiếng Anh, như báo cáo.'
const EMPTY = 'Chưa có thay đổi nào. Báo cáo lúc 7 giờ sáng (giờ Việt Nam) sẽ ghi những thay đổi đầu tiên.'
const AREA_NAME: Record<Area, string> = { Site: 'Trang web', App: 'Ứng dụng', Engine: 'Engine nội dung' }
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const dayHeading = (day: string) => `${WEEKDAY[WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]!]} · ${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`

/** Each day in the viewer's zone, its changes by area (the site, the app, the engine), each line once. */
export function changelogPage({ now, tz, xs }: ChangelogData): string {
  let body: string
  if (isFailed(xs)) body = failedBox('nhật ký thay đổi', xs)
  else if (!xs.length) body = `<p class="muted">${EMPTY}</p>`
  else {
    const days = new Map<string, Change[]>()
    for (const c of [...xs].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
      const day = localDay(c.at, tz)
      days.set(day, [...(days.get(day) ?? []), c])
    }
    body = `<div class="log">${[...days].map(([day, cs]) => {
      const items = AREAS.flatMap(area => [...new Set(cs.filter(c => c.area === area).map(c => c.text))].map(text => `<li><p>${esc(text)}</p><small>${AREA_NAME[area]}</small></li>`))
      return `<section><h3>${dayHeading(day)}</h3><ol>${items.join('')}</ol></section>`
    }).join('')}</div>`
  }
  return page(CHANGELOG_PATH, CHANGELOG_NAME, `<h1>${CHANGELOG_NAME}</h1><p class="lede">${LEDE}</p>${body}`, now, tz)
}
