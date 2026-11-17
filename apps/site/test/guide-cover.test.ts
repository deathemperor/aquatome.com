import { FIRST_GUIDES, type Content, type GuideEntity, type Localized } from '@aq/schema'
import { expect, test } from 'vitest'
import { appGuideImage, appIndex } from '../src/lib/app-index'
import { guideDoc, listedPaths } from '../src/lib/app-page'
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
  expect(parts.appNext.every(x => appGuideImage(c2, x))).toBe(true)
  expect(appIndex('vi', c2).home.guides).not.toContain(`/vi/huong-dan/${g.t.slug}/`)
  expect(appIndex('vi', c).home.guides).toContain(`/vi/huong-dan/${g.t.slug}/`)
}, 120_000)

// Grok's read of #1384: Khám phá's guide shelf (Curation's list first) and a series' next parts reached the app with no
// picture. Until the app draws covers, every guide it shelves or offers next has one; the site keeps them, with a cover.
test("the app's Khám phá shelf and a series' next parts keep to guides with a picture", async () => {
  const c = await getContent('vi')
  const g = leadGuides(c)[1]!
  const path = `/vi/huong-dan/${g.t.slug}/`
  const first = (x: typeof g) => ({ ...c, guides: c.guides.map(y => (y.id === g.id ? { ...x, id: FIRST_GUIDES[0]! } : y)) }) as Content
  expect(appIndex('vi', first(g)).home.browse!.guides[0]).toBe(path)
  const bare = first({ ...g, photos: [], t: { ...g.t, name: 'Thay nước cho bể' } })
  expect(guideImage(bare, bare.guides.find(y => y.id === FIRST_GUIDES[0])!)).toBeUndefined()
  expect(appIndex('vi', bare).home.browse!.guides).not.toContain(path)

  const one = c.guides.find(y => y.video?.series?.id === 'PLtest')!
  const two = { ...one, id: 'youtube-part-two', photos: [], t: { ...one.t, slug: 'phan-hai', name: 'Phần hai' }, video: { ...one.video!, youtubeId: 'part-two', series: { id: 'PLtest', position: 1 }, figures: [] } }
  const c2 = { ...c, guides: [...c.guides, two] } as Content
  expect(guideImage(c2, two)).toBeUndefined()
  const parts = guideParts('vi', c2, one)
  expect(parts.next[0]!.id).toBe(two.id)
  expect(parts.appNext.map(x => x.id)).not.toContain(two.id)
  expect(parts.appNext.every(x => appGuideImage(c2, x))).toBe(true)
}, 120_000)

// Fable's read of #1384: what the app is sent, not only guideParts. A guide page's next reads keep to guides with a
// picture, and where a series' next part has none, the guides read instead are "Bài tiếp theo", not "Phần tiếp theo".
test("the app's copy of a guide page reads next only guides with a picture, under the heading they take", async () => {
  const c = await getContent('vi')
  const nextReads = (c: Content, g: Localized<GuideEntity>) => {
    const b = guideDoc('vi', c, g, listedPaths('vi', c)).blocks.find(b => b.t === 'pages' && ['Phần tiếp theo', 'Bài tiếp theo'].includes(b.title))
    return b?.t === 'pages' ? { title: b.title, paths: b.paths } : undefined
  }
  const has = (r: ReturnType<typeof nextReads>, slug: string) => !!r?.paths.some(p => p.includes(`/${slug}/`))
  const lead = leadGuides(c)
  const [first, g] = [lead[0]!, lead[1]!]
  expect(has(nextReads(c, first), g.t.slug)).toBe(true)
  const c2 = { ...c, guides: c.guides.map(x => (x.id === g.id ? { ...g, photos: [], t: { ...g.t, name: 'Thay nước cho bể' } } : x)) } as Content
  expect(has(nextReads(c2, c2.guides.find(x => x.id === first.id)!), g.t.slug)).toBe(false)

  const one = c.guides.find(y => y.video?.series?.id === 'PLtest')!
  const part = (photos: typeof one.photos) => ({ ...one, id: 'youtube-part-two', photos, t: { ...one.t, slug: 'phan-hai', name: 'Phần hai' }, video: { ...one.video!, youtubeId: 'part-two', series: { id: 'PLtest', position: 1 }, figures: [] } })
  const pictured = { ...c, guides: [...c.guides, part([guideImage(c, one)!])] } as Content
  expect(nextReads(pictured, one)).toMatchObject({ title: 'Phần tiếp theo' })
  expect(has(nextReads(pictured, one), 'phan-hai')).toBe(true)
  const bare = { ...c, guides: [...c.guides, part([])] } as Content
  expect(guideImage(bare, bare.guides.at(-1)!)).toBeUndefined()
  expect(has(nextReads(bare, one), 'phan-hai')).toBe(false)
  expect(nextReads(bare, one)?.title ?? 'Bài tiếp theo').toBe('Bài tiếp theo')
}, 120_000)
