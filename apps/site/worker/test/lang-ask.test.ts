import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { OTHER_LANGS } from '@aq/schema/langs'
import { asksLang, LINE, summariseAsks } from '../lang-ask'
import { SESSIONS_SQL } from '../readers'
import { readersPage, readersSection } from '../admin/pages'

const ui = (lang: string) => JSON.parse(readFileSync(new URL(`../../src/i18n/${lang}.json`, import.meta.url).pathname, 'utf8')) as Record<string, string>

test("each language's line on the chooser is its home page's subtitle, as the site translates it", () => {
  expect(LINE.vi).toBe('Cẩm nang cá cảnh & thủy sinh')
  for (const l of OTHER_LANGS) expect(LINE[l], l).toBe(ui(l)[LINE.vi])
})

test('asked to choose: a country Cloudflare placed, with none of our languages', () => {
  expect(['GB', 'US', 'KR', 'PH'].every(asksLang)).toBe(true)
  expect(['VN', 'ID', 'TH', 'MY', 'BN', 'XX', 'T1', '', 'gb', 'GBR'].some(asksLang)).toBe(false)
})

test('the counts: shown and picked by country, most shown first; the readers\' sessions leave the chooser\'s rows out', () => {
  const a = summariseAsks([
    { cc: 'US', p: '/', n: '3' }, { cc: 'US', p: '/?lang=vi', n: 2 }, { cc: 'GB', p: '/', n: 5 },
    { cc: 'GB', p: '/?lang=th', n: '1' }, { cc: 'GB', p: '/?lang=id', n: 1 }, { cc: 'GB', p: '/?lang=ms', n: 2 }, { cc: 'KR', p: '/?lang=vi', n: 1 }, { cc: 'KR', p: '/x', n: 9 },
  ], 14)
  expect(a).toEqual({ days: 14, rows: [
    { cc: 'GB', shown: 5, picked: { vi: 0, id: 1, th: 1, ms: 2 } },
    { cc: 'US', shown: 3, picked: { vi: 2, id: 0, th: 0, ms: 0 } },
    { cc: 'KR', shown: 0, picked: { vi: 1, id: 0, th: 0, ms: 0 } },
  ] })
  expect(SESSIONS_SQL(14)).toContain("blob2 != 'lang'")
})

test('the readers page shows the chooser\'s counts, and says so when they failed', () => {
  const now = new Date('2026-11-06T05:00:00Z')
  const asks = summariseAsks([{ cc: 'GB', p: '/', n: 5 }, { cc: 'GB', p: '/?lang=th', n: 1 }], 14)
  const html = readersPage(now, undefined, 'Asia/Ho_Chi_Minh', asks)
  expect(html).toContain('<h2>The language chooser</h2>')
  expect(html).toContain('Chose Thai')
  expect(html).toMatch(/GB<\/span>.*<td>5<\/td><td>0<\/td><td>0<\/td><td>1<\/td>/s)
  expect(readersSection(now, undefined, 'Asia/Ho_Chi_Minh', asks).blocks.map(b => b.kind)).toEqual(['note', 'heading', 'note', 'table'])
  expect(readersPage(now, undefined, 'Asia/Ho_Chi_Minh', { failed: 'AE down' })).toContain('AE down')
  expect(readersPage(now, undefined, 'Asia/Ho_Chi_Minh')).not.toContain('The language chooser')
})
