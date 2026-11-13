import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { beforeAll, expect, test } from 'vitest'
import { OTHER_LANGS } from '@aq/schema/langs'
import { asksLang, chooserPage, LANG_SQL, LINE, summariseAsks } from '../lang-ask'
import { SESSIONS_SQL, summariseReaders } from '../readers'
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
  expect(html).toContain('<h2>Chooser views, not visitors</h2>')
  expect(html).toContain('Chose Thai')
  expect(html).toMatch(/GB<\/span>.*<td>5<\/td><td>0<\/td><td>0<\/td><td>1<\/td>/s)
  expect(readersSection(now, undefined, 'Asia/Ho_Chi_Minh', asks).blocks.map(b => b.kind)).toEqual(['note', 'heading', 'note', 'table'])
  expect(readersPage(now, undefined, 'Asia/Ho_Chi_Minh', { failed: 'AE down' })).toContain('AE down')
  expect(readersPage(now, undefined, 'Asia/Ho_Chi_Minh')).not.toContain('Chooser views')
})

test('the table says "since 5 Nov" while the chooser is younger than its days, and that a view needs the script while older rows are in it', () => {
  const asks = summariseAsks([{ cc: 'GB', p: '/', n: 5 }], 14)
  const young = readersPage(new Date('2026-11-12T05:00:00Z'), undefined, 'UTC', asks)
  expect(young).toContain('since 5 Nov')
  expect(young).toContain('views from before that change counted every request')
  const grown = readersPage(new Date('2026-11-30T05:00:00Z'), undefined, 'UTC', asks)
  expect(grown).toContain('the last 14 days')
  expect(grown).not.toContain('since 5 Nov')
  expect(grown).not.toContain('views from before that change')
  expect(grown).toContain('A view counts only when a small script on the page runs')
})

test('our Lighthouse runs of 5 Nov are out of the chooser\'s count and listed with the other left-out runs while in the page\'s days', () => {
  expect(LANG_SQL(14)).toContain("NOT (blob6 = 'US' AND timestamp >= toDateTime('2026-11-05 19:07:00') AND timestamp < toDateTime('2026-11-05 20:26:00'))")
  const r = summariseReaders([], [], 14)
  expect(readersPage(new Date('2026-11-10T14:00:00Z'), r, 'UTC')).toMatch(/Chooser views from our Lighthouse check before it was marked: US, [^<]*19:07[^<]* to [^<]*20:26<\/[^>]+>(?:<[^>]+>)*87\b/)
  expect(readersPage(new Date('2026-11-25T14:00:00Z'), r, 'UTC')).not.toContain('Chooser views from our Lighthouse check')
  expect(readersPage(new Date('2026-11-04T09:00:00Z'), r, 'UTC')).not.toContain('Chooser views from our Lighthouse check') // not yet happened
})

function runChooser(o: { nocount?: boolean; storage?: 'blocked'; prerendering?: boolean } = {}) {
  const sent: unknown[] = []
  const listen: Record<string, ((e: unknown) => void)[]> = {}
  const document = { prerendering: o.prerendering ?? false, addEventListener: (t: string, f: (e: unknown) => void) => { (listen[t] ??= []).push(f) } }
  const window: Record<string, unknown> = { document, URL, JSON, navigator: { sendBeacon: (_: string, b: string) => { sent.push(JSON.parse(b)); return true } } }
  Object.defineProperty(window, 'localStorage', { get: () => { if (o.storage) throw new Error('SecurityError'); return { getItem: () => (o.nocount ? '1' : null) } } })
  runInNewContext(chooserHtml.match(/<script>(.*)<\/script>/s)![1]!, window)
  const fire = (t: string, e: unknown = {}) => (listen[t] ?? []).forEach(f => f(e))
  return { sent, fire, click: (lang: string) => fire('click', { target: { closest: () => ({ href: `https://aquatome.com/?lang=${lang}&utm_source=x` }) } }), document }
}
let chooserHtml = ''
beforeAll(async () => { chooserHtml = await chooserPage(new URLSearchParams()).text() })

test('the chooser\'s script: one view when shown, the language on a click, nothing after «Không đếm tôi», and only once shown if preloaded', () => {
  const a = runChooser()
  expect(a.sent).toEqual([{ chooser: '/' }])
  a.click('th')
  expect(a.sent).toEqual([{ chooser: '/' }, { chooser: '/?lang=th' }])
  const off = runChooser({ nocount: true })
  off.click('id')
  expect(off.sent).toEqual([])
  expect(runChooser({ storage: 'blocked' }).sent).toEqual([{ chooser: '/' }]) // a blocked store isn't a choice not to be counted
  const pre = runChooser({ prerendering: true })
  expect(pre.sent).toEqual([])
  pre.fire('prerenderingchange')
  expect(pre.sent).toEqual([{ chooser: '/' }])
})
