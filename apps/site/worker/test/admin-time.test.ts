import { expect, test } from 'vitest'
import { accountStats, clicksByDay } from '../admin/data'
import { hiddenPage, photosPage } from '../admin/pages'
import { clock, dayStart, localDay, sqlOffset, stamp, timeTag, validZone, viewerZone, zoneName } from '../admin/time'
import { summariseReaders } from '../readers'
import { testD1 } from './d1'

const VN = 'Asia/Ho_Chi_Minh'
const NOW = new Date('2026-11-04T09:00:00Z')

test('a moment reads in the viewer\'s zone: 08:34 UTC is 15:34 in Vietnam, 03:34 in New York', () => {
  expect(timeTag('2026-11-04T08:34:00Z', VN, NOW)).toBe('<time datetime="2026-11-04T08:34:00.000Z">04/11 15:34</time>')
  expect(timeTag('2026-11-04T08:34:00Z', 'America/New_York', NOW)).toBe('<time datetime="2026-11-04T08:34:00.000Z">04/11 03:34</time>')
  // Analytics Engine's own form is UTC too.
  expect(clock('2026-11-04 08:34:01', VN, NOW)).toBe('04/11 15:34')
  // Another year says its year; a moment that can't be read says so.
  expect(clock('2025-12-31T20:00:00Z', VN, NOW)).toBe('01/01 03:00')
  expect(clock('2025-12-31T16:00:00Z', VN, NOW)).toBe('31/12/2025 23:00')
  expect(timeTag('not a time', VN, NOW)).toBe('—')
  expect(stamp(NOW, VN)).toBe('<time datetime="2026-11-04T09:00:00.000Z" data-f="stamp"><span>Thứ Tư, </span>04/11 · 16:00</time>')
  expect([zoneName(VN, NOW), zoneName('America/New_York', NOW), zoneName('Asia/Kolkata', NOW)]).toEqual(['GMT+7', 'GMT−5', 'GMT+5:30'])
})

test('a day is the viewer\'s: 23:30 UTC on the 3rd counts as the 4th in Vietnam', () => {
  expect(localDay('2026-11-03T23:30:00Z', VN)).toBe('2026-11-04')
  expect(localDay('2026-11-03T23:30:00Z', 'UTC')).toBe('2026-11-03')
  expect(sqlOffset(VN, NOW)).toBe('+420 minutes')
  expect(sqlOffset('America/New_York', NOW)).toBe('-300 minutes')
  expect(dayStart('2026-11-04', VN)).toBe('2026-11-03T17:00:00.000Z')
  // Readers: a session's first event late on the 3rd (UTC) is the 4th's.
  const r = summariseReaders([{ sid: 'a', first: '2026-11-03 23:30:00', pages: 1, t: 60, scroll: 0 }], [], 14, VN)
  expect(r.daily).toEqual([{ day: '2026-11-04', sessions: 1, readers: 1 }])
})

test('accounts and comments per day follow the zone in D1 too', async () => {
  const db = testD1()
  for (const [id, at] of [['u1', '2026-11-03T23:30:00Z'], ['u2', '2026-11-03T10:00:00Z'], ['u3', '2026-10-05T16:30:00Z']]) await db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind(id, at).run()
  const vn = await accountStats(db, NOW, VN)
  expect(vn.days.at(-1)).toBe('2026-11-04')
  expect(vn.newUsers.slice(-2)).toEqual([1, 1])
  // 05/10 16:30 UTC is 05/10 23:30 in Vietnam: before the 30 days (06/10–04/11), left out.
  expect(vn.newUsers.reduce((a, b) => a + b, 0)).toBe(2)
  const utc = await accountStats(db, NOW, 'UTC')
  expect(utc.newUsers.slice(-2)).toEqual([2, 0])
})

test('the zone: the device\'s from the cookie, else Cloudflare\'s, else Vietnam\'s; a bad cookie falls back', () => {
  const req = (cookie?: string, cf?: string) => Object.assign(new Request('https://x.test/_ab/', { headers: cookie ? { cookie } : {} }), cf ? { cf: { timezone: cf } } : {})
  expect(viewerZone(req('a=1; aq_tz=Europe%2FBerlin', 'Asia/Bangkok'))).toBe('Europe/Berlin')
  expect(viewerZone(req(undefined, 'Asia/Bangkok'))).toBe('Asia/Bangkok')
  expect(viewerZone(req())).toBe(VN)
  for (const bad of ['Mars/Olympus', "Asia/Ho_Chi_Minh'; DROP", '%E0%A4%A', '']) expect(viewerZone(req(`aq_tz=${bad}`, 'Asia/Jakarta'))).toBe('Asia/Jakarta')
  expect(viewerZone(req('aq_tz=Mars%2FOlympus', 'Nowhere/Else'))).toBe(VN)
  expect(validZone('Asia/Ho_Chi_Minh')).toBe('Asia/Ho_Chi_Minh')
  expect(validZone("x' OR 1")).toBeUndefined()
})

test('pages print times in the viewer\'s zone, never "(UTC)", with the script that keeps the device\'s zone', () => {
  const photos = photosPage([{ id: 'p', entity_ref: 'species:x', name: 'A', thumb: '/t.webp', created_at: '2026-11-04T08:34:00.000Z' }], NOW, VN)
  expect(photos).toContain('<time datetime="2026-11-04T08:34:00.000Z">04/11 15:34</time>')
  expect(photos).not.toContain('UTC')
  expect(photos).toContain('<html lang="vi" data-tz="Asia/Ho_Chi_Minh">')
  expect(photos).toContain("document.cookie=c+'; Path=/_ab; Max-Age=31536000; SameSite=Lax; Secure'")
  const hidden = hiddenPage({ '/ca/x/': { at: '2026-11-04T08:34:00.000Z' } }, NOW, 'Europe/Berlin')
  expect(hidden).toContain('>04/11 09:34</time>')
  expect(hidden).toContain('data-tz="Europe/Berlin"')
})

test('affiliate clicks, kept by Vietnam\'s day, are read by Vietnam\'s day: at 03:00 there, today\'s clicks are on the chart', async () => {
  const db = testD1()
  await db.prepare("INSERT INTO clicks_daily VALUES ('2026-11-04','shopee','thuc-an','species:x','search',5), ('2026-11-03','shopee','thuc-an','species:x','search',2)").run()
  // 2026-11-03T20:00Z is 03:00 on the 4th in Vietnam; the UTC day is still the 3rd.
  const c = await clicksByDay(db, new Date('2026-11-03T20:00:00Z'), 3)
  expect(c.days).toEqual(['2026-11-02', '2026-11-03', '2026-11-04'])
  expect(c.clicks).toEqual([0, 2, 5])
})
