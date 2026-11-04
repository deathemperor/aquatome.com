/**
 * The dashboard's clock: every time and day it shows is in the viewer's time zone. The zone is the device's, which
 * shell.ts's script keeps in the `aq_tz` cookie; before that cookie exists, the one Cloudflare places the request in;
 * else Vietnam's. Days are counted in it too, where the data keeps times; data kept by day (affiliate clicks, the nightly
 * content totals, the fish-ID key counter) says which day it keeps.
 */
export const HOME_TZ = 'Asia/Ho_Chi_Minh'
export const TZ_COOKIE = 'aq_tz'

/** `z` when it is a time zone this runtime knows, written only with the characters zone names use (it goes into SQL). */
export function validZone(z: unknown): string | undefined {
  if (typeof z !== 'string' || z.length > 64 || !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(z)) return undefined
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: z })
    return z
  } catch {
    return undefined
  }
}

/** The viewer's zone: the device's (cookie), else where Cloudflare places the request, else Vietnam's. */
export function viewerZone(req: Request): string {
  const raw = /(?:^|;\s*)aq_tz=([^;]*)/.exec(req.headers.get('cookie') ?? '')?.[1]
  let cookie: string | undefined
  try {
    cookie = raw === undefined ? undefined : decodeURIComponent(raw)
  } catch {}
  return validZone(cookie) ?? validZone((req as { cf?: { timezone?: unknown } }).cf?.timezone) ?? HOME_TZ
}

const FORMATS = new Map<string, Intl.DateTimeFormat>()
const format = (tz: string) => {
  let f = FORMATS.get(tz)
  if (!f) FORMATS.set(tz, (f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })))
  return f
}
type Parts = { year: string; month: string; day: string; hour: string; minute: string; weekday: string }
const parts = (ms: number, tz: string) => Object.fromEntries(format(tz).formatToParts(new Date(ms)).map(p => [p.type, p.value])) as Parts

/** A moment as milliseconds: a Date, a number, ISO text, or Analytics Engine's "2026-11-02 09:58:01" (UTC). */
export const msOf = (t: Date | number | string) => (t instanceof Date ? t.getTime() : typeof t === 'number' ? t : Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t.replace(' ', 'T')}Z`))

/** The day it is at `t` in `tz`, as 2026-11-04. */
export function localDay(t: Date | number | string, tz: string): string {
  const p = parts(msOf(t), tz)
  return `${p.year}-${p.month}-${p.day}`
}

/** Minutes `tz` is ahead of UTC at `t` (420 for Vietnam). */
export function offsetMinutes(tz: string, t: Date | number = Date.now()): number {
  const ms = Math.floor(msOf(t) / 60_000) * 60_000
  const p = parts(ms, tz)
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ms) / 60_000)
}
/** SQLite's modifier from UTC to `tz` at `t`: Vietnam, Indonesia and Thailand keep one offset all year. */
export const sqlOffset = (tz: string, t: Date | number = Date.now()) => `${offsetMinutes(tz, t) >= 0 ? '+' : ''}${offsetMinutes(tz, t)} minutes`
/** The moment `day` begins in `tz`, as ISO (UTC): the lower bound for rows kept in UTC. */
export const dayStart = (day: string, tz: string) => new Date(Date.parse(`${day}T00:00:00Z`) - offsetMinutes(tz, Date.parse(`${day}T12:00:00Z`)) * 60_000).toISOString()
/** Whether two zones show the same clock at `t` (Bangkok and Jakarta keep Vietnam's). */
export const sameClock = (a: string, b: string, t: Date | number = Date.now()) => offsetMinutes(a, t) === offsetMinutes(b, t)

/** "GMT+7": the zone as an offset, which reads the same in any language. */
export function zoneName(tz: string, t: Date | number = Date.now()): string {
  const m = offsetMinutes(tz, t)
  const h = Math.floor(Math.abs(m) / 60)
  const min = Math.abs(m) % 60
  return `GMT${m < 0 ? '−' : '+'}${h}${min ? `:${String(min).padStart(2, '0')}` : ''}`
}

export const WEEKDAY: Record<string, string> = { Sun: 'Chủ nhật', Mon: 'Thứ Hai', Tue: 'Thứ Ba', Wed: 'Thứ Tư', Thu: 'Thứ Năm', Fri: 'Thứ Sáu', Sat: 'Thứ Bảy' }
/** 15:34 */
export const hourMinute = (t: Date | number | string, tz: string) => {
  const p = parts(msOf(t), tz)
  return `${p.hour}:${p.minute}`
}
/** "04/11 15:34", with the year when it isn't `now`'s ("28/12/2025 09:10"). */
export function clock(t: Date | number | string, tz: string, now: Date | number = Date.now()): string {
  const p = parts(msOf(t), tz)
  return `${p.day}/${p.month}${p.year !== parts(msOf(now), tz).year ? `/${p.year}` : ''} ${p.hour}:${p.minute}`
}
/** A moment as text, in the viewer's zone ("04/11 15:34"); '—' for one that can't be read. */
export const timeText = (t: Date | number | string, tz: string, now: Date | number = Date.now()) => (Number.isFinite(msOf(t)) ? clock(msOf(t), tz, now) : '—')
/** A moment for the page: `<time>` with the instant, written in the viewer's zone (the script rewrites it if the device's differs). */
export function timeTag(t: Date | number | string, tz: string, now: Date | number = Date.now()): string {
  const ms = msOf(t)
  if (!Number.isFinite(ms)) return '—'
  return `<time datetime="${new Date(ms).toISOString()}">${clock(ms, tz, now)}</time>`
}
/** The bar's stamp: "Thứ Tư, 04/11 · 15:34", the weekday dropped on a narrow phone. */
export function stamp(now: Date, tz: string): string {
  const p = parts(now.getTime(), tz)
  return `<time datetime="${now.toISOString()}" data-f="stamp"><span>${WEEKDAY[p.weekday] ?? ''}, </span>${p.day}/${p.month} · ${p.hour}:${p.minute}</time>`
}
