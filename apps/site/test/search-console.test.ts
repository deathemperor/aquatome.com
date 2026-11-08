import { expect, test } from 'vitest'
import { payload, sitePath, windows } from '../../../scripts/search-console.mjs'

// scripts/search-console.mjs: Search Console's rows as the site keeps them (worker/admin/quality.ts Gsc).

test('the windows: the last 28 days Google has (two days behind), and the 28 before them', () => {
  expect(windows(Date.parse('2026-11-08T05:00:00Z'))).toEqual({ from: '2026-10-10', to: '2026-11-06', prevFrom: '2026-09-12', prevTo: '2026-10-09' })
})

test('an address as the site\'s path: any scheme or www, no query or hash, an old /vi/ address as its page now', () => {
  expect(sitePath('https://aquatome.com/ca/ca-betta/')).toBe('/ca/ca-betta/')
  expect(sitePath('http://www.aquatome.com/vi/ca/ca-betta/?aqcheck=1#cham-soc')).toBe('/ca/ca-betta/')
  expect(sitePath('https://aquatome.com/vi')).toBe('/')
  expect(sitePath('https://aquatome.com/id/ikan/cupang')).toBe('/id/ikan/cupang/')
  expect(sitePath('https://aquatome.com/video/x.mp4')).toBe('/video/x.mp4')
  expect(sitePath('https://dashboard.aquatome.com/noi-dung/')).toBeNull()
  expect(sitePath('not an address')).toBeNull()
})

test('rows that are one page add up, with the position weighted by impressions; queries likewise, most seen first', () => {
  const w = windows(Date.parse('2026-11-08T05:00:00Z'))
  const row = (keys: string[], impressions: number, clicks: number, position: number) => ({ keys, impressions, clicks, ctr: 0, position })
  const g = payload(w,
    [row(['https://aquatome.com/ca/ca-betta/'], 300, 30, 2), row(['https://aquatome.com/vi/ca/ca-betta/'], 100, 2, 6), row(['https://other.example/'], 9, 9, 1)],
    [row(['https://aquatome.com/ca/ca-betta/'], 50, 5, 4), row(['https://aquatome.com/cay/old/'], 20, 1, 9)],
    [row(['https://aquatome.com/ca/ca-betta/', 'cá betta'], 200, 20, 2), row(['https://aquatome.com/vi/ca/ca-betta/', 'cá betta'], 100, 2, 5), row(['https://aquatome.com/cay/old/', 'cây cũ'], 350, 0, 40)],
    '2026-11-08T05:00:00Z')
  expect(g).toEqual({
    v: 1, at: '2026-11-08T05:00:00Z', ...w,
    pages: { '/ca/ca-betta/': [400, 32, 3, 50, 5], '/cay/old/': [0, 0, 0, 20, 1] },
    queries: [['cây cũ', '/cay/old/', 350, 0, 40], ['cá betta', '/ca/ca-betta/', 300, 22, 3]],
  })
})
