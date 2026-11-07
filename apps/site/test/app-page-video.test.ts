import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import type { HTMLElement } from 'node-html-parser'
import type { Content } from '@aq/schema'
import { PageDoc, type Block, type Inline } from '@aq/schema/app-page'
import { appSeries } from '../src/lib/app-index'
import { videoDoc } from '../src/lib/app-page'
import { getContent } from '../src/lib/content'
import { smallSrc } from '../src/lib/img'
import { guideImage } from '../src/lib/mentions'
import { pagePictures } from '../src/lib/pictures'
import { seriesParts } from '../src/lib/series-page'
import { appHref, appPage } from './dist'

// The app draws a video series' page from this copy (once the index counts the kind): what it holds must be the page.
type B<T extends Block['t']> = Extract<Block, { t: T }>
const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const text = (c: Inline[] = []) => c.map(r => (typeof r === 'string' ? r : r.text)).join('')
const links = (c: Inline[] = []) => c.flatMap(r => (typeof r === 'string' || !r.href ? [] : [[r.text, r.href]]))
const txt = (el: HTMLElement | null | undefined) => clean(el?.textContent ?? '')
const cardsOf = (d: PageDoc) => d.blocks.find((b): b is B<'cards'> => b.t === 'cards')

test('each video series\' copy reads as its built page: name, its line of counts, playlist and channel, intro, its guides in order, each picture credited', async () => {
  const c = await getContent('vi')
  const series = appSeries('vi', c)
  expect(series.length).toBeGreaterThan(0)
  for (const { s } of series) {
    const d = videoDoc('vi', c, s)
    expect(PageDoc.safeParse(d).error, d.path).toBeUndefined()
    const { dom } = appPage(d.path)
    expect(d.title, d.path).toBe(txt(dom.querySelector('h1')))
    // The page's one line, whole, is the copy's credit: its counts, then the playlist and channel it follows, both linked.
    expect([d.meta, text(d.credit)], d.path).toEqual([undefined, txt(dom.querySelector('.meta'))])
    expect(links(d.credit), d.path).toEqual(dom.querySelectorAll('.meta a').map(a => [txt(a), a.getAttribute('href')]))
    const intro = dom.querySelector('.intro')
    expect(d.blocks.map(b => b.t), d.path).toEqual([...(intro ? ['p'] : []), 'cards'])
    if (intro) expect(text((d.blocks[0] as B<'p'>).c), d.path).toBe(txt(intro))
    // Each guide as the page lists it: its page, name, subject, parts and length, and picture.
    const cards = cardsOf(d)!
    expect(cards.items.map(i => [i.path, i.name, i.sub, i.img?.src]), d.path).toEqual(dom.querySelectorAll('.parts li').map(l => [
      appHref(l.querySelector('a')!.getAttribute('href')!), txt(l.querySelector('strong')), `${txt(l.querySelector('small'))} · ${txt(l.querySelector('.dur'))}`, l.querySelector('img')?.getAttribute('src'),
    ]))
    // Every picture credited, as the footer's "Nguồn ảnh" credits the page's.
    const imgs = cards.items.flatMap(i => (i.img ? [i.img] : []))
    expect(imgs.length, d.path).toBe(dom.querySelectorAll('.parts img').length)
    for (const img of imgs) {
      expect(img.credit?.text, `${d.path} ${img.src}`).toMatch(/^Ảnh: \S/)
      expect(img.credit?.licence, `${d.path} ${img.src}`).toBeTruthy()
    }
    expect(new Set(imgs.map(i => i.credit?.url)), d.path).toEqual(new Set(dom.querySelectorAll('#photo-credits li a').map(a => a.getAttribute('href'))))
    // No readers' comments or photos on the page: none in the copy.
    expect([d.talk, dom.querySelector('[data-comments], [data-reader-photos]')], d.path).toEqual([undefined, null])
  }
})

test('a series\' guides go in its order, with their counts; a guide of one part says no parts', async () => {
  // The fixture's series has one guide: a second, listed first in the content but second in the playlist.
  const c0 = await getContent('vi')
  const { s, guides: [first] } = appSeries('vi', c0)[0]!
  const second = { ...first!, id: 'youtube-phan-hai', t: { ...first!.t, slug: 'phan-hai', name: 'Phần hai' }, video: { ...first!.video, youtubeId: 'bbbbbbbbbbb', thumb: undefined, chapters: first!.video.chapters.slice(0, 1), series: { id: s.id, position: 1 } } }
  const c = { ...c0, guides: [second, ...c0.guides] } as Content
  const d = videoDoc('vi', c, s)
  expect(text(d.credit)).toMatch(/^2 bài · 59 phút video · theo playlist “/)
  expect(cardsOf(d)!.items.map(i => [i.path, i.name, i.sub])).toEqual([
    ['/vi/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/', 'Cách hạn chế rêu hại trong bể thủy sinh', 'Chăm cây · 3 đoạn · 29:15'],
    ['/vi/huong-dan/phan-hai/', 'Phần hai', 'Chăm cây · 29:15'],
  ])
})

test('a series\' copy in Indonesian has the Indonesian pages\' paths only', async () => {
  // No language but Vietnamese has video series pages yet: the Vietnamese ones, made as an Indonesian page would be.
  const c = await getContent('vi')
  for (const { s } of appSeries('vi', c)) {
    const d = videoDoc('id', c, s)
    expect(PageDoc.safeParse(d).error, s.id).toBeUndefined()
    expect(d.path).toBe(`/id/video/${s.vi.slug}/`)
    expect(cardsOf(d)!.items.every(i => i.path.startsWith('/id/panduan/')), s.id).toBe(true)
    const paths = JSON.stringify(d).match(/"(href|path)":"[^"]*"/g) ?? []
    for (const p of paths) expect(p, `${s.id}: ${p}`).not.toMatch(/"\/vi\//)
  }
})

test('the series page and the app\'s copy are put together by the same code', () => {
  const astro = readFileSync(new URL('../src/pages/video/[slug].astro', import.meta.url), 'utf8')
  expect(astro).toContain("from '../../lib/series-page'")
  for (const own of ['seriesGuides(', 'seriesSeconds(', 'guideImage(', 'clock(', 'GUIDE_KIND_LABELS']) expect(astro, own).not.toContain(own)
})

// Found 2026-11-07 (#683): two videos of a series illustrate a section with the same Commons photo, each kept under its
// own video's address, and the series page showed it on both cards (page-check "repeat"). Each card takes the first of
// its guide's pictures the page doesn't show yet (lib/pictures.ts), as every other list of cards does.
test('a series\' cards show no picture twice, even from two files of one photo', async () => {
  const c0 = await getContent('vi')
  const { s, guides: [first] } = appSeries('vi', c0)[0]!
  const photo = first!.video.figures!.find(f => f.photo)!.photo!
  const copy = { ...photo, url: photo.url.replace(first!.video.youtubeId, 'bbbbbbbbbbb') }
  const figures = [{ heading: 'Phần hai', moments: [], photo: copy }]
  const second = { ...first!, id: 'youtube-phan-hai', t: { ...first!.t, slug: 'phan-hai', name: 'Phần hai' }, video: { ...first!.video, youtubeId: 'bbbbbbbbbbb', figures, series: { id: s.id, position: 1 } } }
  const c = { ...c0, guides: [...c0.guides, second], pictureHashes: { ...c0.pictureHashes, [copy.url]: c0.pictureHashes[photo.url] ?? '0b4d37cf2f190603', [photo.url]: c0.pictureHashes[photo.url] ?? '0b4d37cf2f190603' } } as Content
  const [a, b] = seriesParts('vi', c, s).guides.map(x => x.photo)
  expect(a?.url).toBe(guideImage(c, first!)?.url)
  expect(b, 'the second card has a picture').toBeTruthy()
  const seen = pagePictures(c)
  seen.add(a?.url)
  expect(seen.has(b!.url), b!.url).toBe(false)
  // The app's copy shows the same pictures.
  expect(cardsOf(videoDoc('vi', c, s))!.items.map(i => i.img?.src)).toEqual(seriesParts('vi', c, s).guides.map(x => x.photo && smallSrc(x.photo)))
})
