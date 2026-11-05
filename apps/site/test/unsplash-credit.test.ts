import { expect, test } from 'vitest'
import { photoCredit, photoMark } from '../src/lib/cite'
import { groupCredits } from '../src/lib/credits'
import { figureHtml } from '../src/lib/figures'
import { htmlBlocks } from '../src/lib/page-blocks'
import { page } from './dist'

// Unsplash's API guidelines: wherever an Unsplash photo shows, "Photo by <name> on Unsplash", the name linking the
// photographer's Unsplash page and "Unsplash" its home, both with our UTM. The fixture has one as the Pigeon Blood
// discus's photo (its photographer's page known) and two in the flowerhorn's gallery (one known, one not yet).
const UTM = 'utm_source=aquatome&utm_medium=referral'
const HOME = `https://unsplash.com/?${UTM}`
const MAI = { author: 'Mai Lin', authorUrl: `https://unsplash.com/@mailin?${UTM}`, licence: 'Unsplash License', sourceUrl: `https://unsplash.com/photos/a-red-discus-fish-Pb1Fixture1?${UTM}` }
const amp = (s: string) => s.replace(/&/g, '&amp;')
const noCid = (h: string) => h.replace(/ data-astro-cid-\w+(="")?/g, '')

test('an Unsplash photo\'s mark is its line in view: the photographer\'s page and Unsplash, both with the UTM', () => {
  expect(photoMark('vi', MAI)).toBe(`<span class="pic-by" data-src="${amp(MAI.sourceUrl)}"> Ảnh: <a class="author" href="${amp(MAI.authorUrl)}" rel="noopener">Mai Lin</a> trên <a class="site" href="${amp(HOME)}" rel="noopener">Unsplash</a></span>`)
  // Before the engine has the photographer's page: the name links the photo's own, and Unsplash is still named, linked.
  const { authorUrl, ...noPage } = MAI
  expect(photoMark('vi', noPage)).toBe(`<span class="pic-by" data-src="${amp(MAI.sourceUrl)}"> Ảnh: <a href="${amp(MAI.sourceUrl)}" rel="noopener">Mai Lin</a> trên <a class="site" href="${amp(HOME)}" rel="noopener">Unsplash</a></span>`)
  expect(photoMark('id', MAI)).toContain('> Foto: <a class="author"')
  expect(photoMark('id', MAI)).toContain('</a> di <a class="site"')
  expect(photoMark('th', MAI)).toContain('</a> บน <a class="site"')
  // The app's copy: the same line, and the photographer's page.
  expect(photoCredit('vi', MAI)).toEqual({ text: 'Ảnh: Mai Lin trên Unsplash', licence: 'Unsplash License', url: MAI.sourceUrl, authorUrl: MAI.authorUrl })
  expect(photoCredit('vi', noPage)).toEqual({ text: 'Ảnh: Mai Lin trên Unsplash', licence: 'Unsplash License', url: MAI.sourceUrl })
})

test('in the app\'s copy, a figure of an Unsplash photo has its credit as the page does, and not in its caption', () => {
  const photo = { ...MAI, url: 'https://images.unsplash.com/photo-1?ixid=x&w=1280', width: 1280, height: 960 }
  for (const p of [photo, { ...photo, authorUrl: undefined }]) {
    const [b] = htmlBlocks(figureHtml('vi', { photo: p, label: 'Cá đĩa Pigeon Blood', href: '/vi/ca/ca-dia-pigeon-blood/' })).blocks
    expect(b).toMatchObject({ t: 'figure', img: { credit: photoCredit('vi', p) }, caption: [{ text: 'Cá đĩa Pigeon Blood', href: '/vi/ca/ca-dia-pigeon-blood/' }] })
  }
})

test('a CC photo\'s mark and credit are as before', () => {
  const cc = { author: 'Bo', licence: 'CC BY 4.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:A.jpg' }
  expect(photoMark('vi', cc)).toBe('<a class="cite pic" href="https://commons.wikimedia.org/wiki/File:A.jpg" rel="noopener" data-term="Ảnh: Bo" data-tip="CC BY 4.0" data-more="Xem ảnh gốc ↗" aria-label="Ảnh: Bo, CC BY 4.0">©</a>')
  expect(photoCredit('vi', cc)).toEqual({ text: 'Ảnh: Bo', licence: 'CC BY 4.0', url: cc.sourceUrl })
})

test('credits group by author and licence, and by photographer\'s page: two of Unsplash\'s can share a name', () => {
  const c = (author: string, licence: string, sourceUrl: string, authorUrl?: string) => ({ author, licence, sourceUrl, what: 'Ảnh', ...(authorUrl ? { authorUrl } : {}) })
  expect(groupCredits([c('Ann', 'Unsplash License', 'u1', 'p1'), c('Ann', 'Unsplash License', 'u2', 'p2'), c('Ann', 'Unsplash License', 'u3', 'p1'), c('Ann', 'CC0', 'u4')])).toEqual([
    { author: 'Ann', authorUrl: 'p1', licence: 'Unsplash License', urls: ['u1', 'u3'] },
    { author: 'Ann', authorUrl: 'p2', licence: 'Unsplash License', urls: ['u2'] },
    { author: 'Ann', licence: 'CC0', urls: ['u4'] },
  ])
})

test('a breed\'s Unsplash photo: its line under it, both links with the UTM, no © mark', () => {
  const cap = page('/ca/ca-dia-pigeon-blood/').dom.querySelector('figure.gallery figcaption')!
  expect(cap.querySelector('a.cite.pic')).toBeNull()
  expect(cap.querySelector('.pic-by')!.textContent.trim()).toBe('Ảnh: Mai Lin trên Unsplash')
  expect(cap.querySelector('.pic-by a.author')!.getAttribute('href')).toBe(MAI.authorUrl)
  expect(cap.querySelector('.pic-by a.site')!.getAttribute('href')).toBe(HOME)
})

test('the credits list: an Unsplash row is its line, each photo\'s own page a number; a CC row as before', () => {
  // The fish list, whose script adds rows later (data-author…): the breed card's photo.
  const rows = page('/ca/').dom.querySelectorAll('#photo-credits li').map(li => noCid(li.outerHTML))
  expect(rows).toContain(`<li data-author="Mai Lin" data-licence="Unsplash License" data-author-url="${amp(MAI.authorUrl)}">Ảnh: <a class="author" href="${amp(MAI.authorUrl)}" rel="noopener">Mai Lin</a> trên <a class="site" href="${amp(HOME)}" rel="noopener">Unsplash</a><span class="lic"> · Unsplash License · 1 ảnh</span><span class="nums"><a href="${amp(MAI.sourceUrl)}" rel="noopener" aria-label="Mai Lin, ảnh 1">1</a></span></li>`)
  // The flowerhorn's gallery: one photographer's page known, one not yet (the name links the photo); a CC photo's row.
  const g = page('/ca/ca-la-han/anh/').dom
  const gallery = g.querySelectorAll('#photo-credits li').map(li => noCid(li.outerHTML))
  expect(gallery).toContain(`<li>Ảnh: <a class="author" href="https://unsplash.com/@jopark?${amp(UTM)}" rel="noopener">Jo Park</a> trên <a class="site" href="${amp(HOME)}" rel="noopener">Unsplash</a><span class="lic"> · Unsplash License · 1 ảnh</span><span class="nums"><a href="https://unsplash.com/photos/a-flowerhorn-in-a-tank-Fh7Fixture-?${amp(UTM)}" rel="noopener" aria-label="Jo Park, ảnh 1">1</a></span></li>`)
  expect(gallery).toContain(`<li>Ảnh: <a href="https://unsplash.com/photos/flowerhorn-cichlid-close-up-Fh8Fixture_?${amp(UTM)}" rel="noopener">Sam Reyes</a> trên <a class="site" href="${amp(HOME)}" rel="noopener">Unsplash</a><span class="lic"> · Unsplash License</span></li>`)
  expect(gallery).toContain('<li><a href="https://commons.wikimedia.org/wiki/File:Breed2.jpg" rel="noopener">Người chụp 2</a><span class="lic"> · CC BY 2.0</span></li>')
  // The button counts photos, not the photographers' and Unsplash's links.
  expect(g.querySelector('footer button[popovertarget="photo-credits"]')!.textContent).toBe('Nguồn ảnh (7)')
  expect(g.querySelectorAll('#photo-credits li a:not(.author):not(.site)').length).toBe(7)
})

test('the gallery page: each Unsplash photo carries its photographer\'s page for the viewer, and its structured data names it', () => {
  const { dom } = page('/ca/ca-la-han/anh/')
  const tiles = dom.querySelectorAll('[data-gallery] a[data-i]')
  expect(tiles.map(a => [a.getAttribute('data-unsplash'), a.getAttribute('data-by')])).toEqual([
    ...Array.from({ length: 5 }, () => [undefined, undefined]),
    ['', `https://unsplash.com/@jopark?${UTM}`],
    ['', undefined],
  ])
  const ld = dom.querySelectorAll('script[type="application/ld+json"]').map(s => JSON.parse(s.textContent)).flat().find((x: { '@type': string }) => x['@type'] === 'ImageGallery')
  expect(ld.image.map((i: { creator: unknown }) => i.creator)).toEqual([
    ...[2, 3, 4, 5, 6].map(n => ({ '@type': 'Person', name: `Người chụp ${n}` })),
    { '@type': 'Person', name: 'Jo Park', url: `https://unsplash.com/@jopark?${UTM}` },
    { '@type': 'Person', name: 'Sam Reyes' },
  ])
})
