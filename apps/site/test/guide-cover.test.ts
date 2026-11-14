import type { Content } from '@aq/schema'
import { expect, test } from 'vitest'
import { appIndex } from '../src/lib/app-index'
import { getContent } from '../src/lib/content'
import { coverStyle } from '../src/lib/cover-style'
import { guideParts } from '../src/lib/guide-page'
import { leadGuides } from '../src/lib/home'
import { guideImage } from '../src/lib/mentions'

// The Design Lead's board, 15 Nov 2026: a guide with no picture draws a cover whose rings and tone come from its address,
// so no two in a list are alike, and the browser's card (scripts/guide-card.ts) draws the one the server does.
test("a cover's rings and tone come from the guide's address, within the board's ranges", () => {
  const vars = (slug: string) => Object.fromEntries(coverStyle(slug).split(';').map(d => d.split(':') as [string, string]))
  const a = vars('ca-bi-thoi-vay-thoi-duoi')
  expect(vars('ca-bi-thoi-vay-thoi-duoi')).toEqual(a)
  expect(Object.keys(a)).toEqual(['--x1', '--y1', '--x2', '--y2', '--s1', '--s2', '--dl', '--dh'])
  const slugs = Array.from({ length: 200 }, (_, n) => `huong-dan-${n}`)
  const within = (v: string, lo: number, hi: number) => { const n = parseFloat(v); return n >= lo && n <= hi }
  for (const s of slugs) {
    const v = vars(s)
    expect([within(v['--x1']!, 4, 37), within(v['--y1']!, 6, 93), within(v['--x2']!, 62, 95), within(v['--y2']!, 6, 93), within(v['--s1']!, 5, 7), within(v['--s2']!, 8, 11)], s).toEqual([true, true, true, true, true, true])
    expect(['-0.035', '0', '0.035']).toContain(v['--dl'])
    expect(['-10', '0', '10']).toContain(v['--dh'])
  }
  // No two alike: 200 addresses, 200 covers.
  expect(new Set(slugs.map(coverStyle)).size).toBe(200)
})

// The site's lists keep a guide with no picture (its card draws a cover); the app's don't yet, until the app draws covers
// too (the Design Lead's app half). Before, both left it out.
test("a guide with no picture stays in the site's guides to read next, and off the app's shelf and read-next", async () => {
  const c = await getContent('vi')
  const lead = leadGuides(c)
  const [first, g] = [lead[0]!, lead[1]!]
  const bare = { ...g, photos: [], t: { ...g.t, name: 'Thay nước cho bể' } }
  const c2 = { ...c, guides: c.guides.map(x => (x.id === g.id ? bare : x)) } as Content
  expect(guideImage(c2, bare)).toBeUndefined()
  const parts = guideParts('vi', c2, c2.guides.find(x => x.id === first.id)!)
  // The lead guide after this one reads next on the site; the app reads the next with a picture.
  expect(parts.next[0]!.id).toBe(g.id)
  expect(parts.appNext.map(x => x.id)).not.toContain(g.id)
  expect(parts.appNext.every(x => guideImage(c2, x))).toBe(true)
  expect(appIndex('vi', c2).home.guides).not.toContain(`/vi/huong-dan/${g.t.slug}/`)
  expect(appIndex('vi', c).home.guides).toContain(`/vi/huong-dan/${g.t.slug}/`)
}, 120_000)
