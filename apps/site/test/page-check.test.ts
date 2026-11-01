import { readFileSync } from 'node:fs'
import { PictureSet } from '@aq/schema'
import { describe, expect, test } from 'vitest'
import { checkDist, checkPage, fishSections, loadFacts, type Facts } from '../scripts/page-check'
import { DIST, page } from './dist'

const facts = await loadFacts(process.env.CONTENT_ROOT!)

// Every page of the fixture build passes every check. A real exception goes into the check, with its reason.
test('no built page shows a picture twice, a wrong fish, a wrong link, a fish without its photo, wrong contents or an empty section', () => {
  expect(checkDist(DIST, facts)).toEqual([])
})

// 2026-11-02, the check on aquatome.com: "rêu Java (Vesicularia dubyana)", "Amazon sword (Echinodorus amazonicus)" linked
// the right plants under old names their pages didn't list. A plant's former scientific names (`synonyms`) are its own:
// the fixture's "ráy nana (Anubias nana)" in the setup guide fails the test above without them.
test("a plant's former scientific names are its names, for the checks and for the links", () => {
  expect(facts.living.get('plant:anubias-barteri-nana')!.names).toContain('anubias nana')
  expect(facts.targets.vi.find(t => t.key === 'plant:anubias-barteri-nana')!.names).toContain('Anubias nana')
  const { dom } = page('/vi/huong-dan/setup-be-thuy-sinh-dau-tien/')
  const a = dom.querySelector('.prose a[href="/vi/cay/ray-nana/"]')!
  expect([a.text, a.nextSibling?.rawText.slice(0, 15)]).toEqual(['ráy nana', ' (Anubias nana)'])
})

// A list's cards show one picture wherever they are built: the HTML's first page, and the cards the browser builds from
// the list's data file for "Xem thêm" or a filter. None shows a picture the page shows already (above the list, or an
// earlier card), so the page the browser adds to keeps the rule too (lib/pictures.ts listPictures).
test.each([
  ['/vi/huong-dan/', 'guides', '#guide-start img', '#guide-list > a'],
  ['/vi/ca/', 'species', 'section.breeds img', 'main div[data-slug]'],
  ['/vi/cay/', 'plants', '', 'main article.pc[data-slug]'],
])('the cards of %s and of its data file show the same pictures, none twice', (path, file, above, cards) => {
  const { dom } = page(path)
  const items = JSON.parse(readFileSync(`${DIST}/data/vi/${file}.json`, 'utf8')) as { photo?: { src: string } }[]
  const html = dom.querySelectorAll(cards).filter(x => !x.closest('template')).map(x => x.querySelector('img')?.getAttribute('src'))
  expect(html.length).toBeGreaterThan(0)
  expect(html).toEqual(items.slice(0, html.length).map(i => i.photo?.src))
  const pics = new PictureSet(facts.hashes)
  for (const src of [...(above ? dom.querySelectorAll(above).map(x => x.getAttribute('src')!) : []), ...items.flatMap(i => i.photo ? [i.photo.src] : [])]) {
    expect(pics.has(src), src).toBe(false)
    pics.add(src)
  }
})

describe('each check, on a page made to fail it', () => {
  const T = { key: 'species:a', href: '/vi/ca/a/', names: ['Aus bus', 'Cá a'] }
  const U = { key: 'species:b', href: '/vi/ca/b/', names: ['Aus cus', 'Cá b'] }
  const f: Facts = {
    hashes: { 'https://m/1.webp': '0d4367a7830b31d1', 'https://m/2.webp': '0d4367a7830b31d3' },
    byPath: new Map([['/vi/ca/a/', 'species:a'], ['/vi/ca/b/', 'species:b']]),
    living: new Map([['species:a', { names: new Set(['aus bus', 'cá a']), photos: new Set(['https://m/a.webp']) }], ['species:b', { names: new Set(['aus cus', 'cá b']), photos: new Set(['https://m/b.webp', 'https://m/b2.webp']) }]]),
    owner: new Map([['https://m/a.webp', 'species:a'], ['https://m/b.webp', 'species:b']]),
    targets: { vi: [T, U], id: [T, U], th: [T, U] },
    genera: new Set(['Aus']),
  }
  const fig = (src: string, href?: string) => `<figure class="inl"><img src="${src}" width="1" height="1" alt=""><figcaption>${href ? `<a href="${href}">x</a>` : ''}</figcaption></figure>`
  const checks = (html: string) => checkPage('/vi/huong-dan/x/', html, f).map(p => p.check)
  test('one picture in two files, a card\'s thumb of it, a video\'s two thumbnails', () => {
    expect(checks(`<img src="https://m/1.webp"><img src="https://m/2-480.webp"><img src="https://i.ytimg.com/vi/v/hq.jpg"><img src="https://i.ytimg.com/vi_webp/v/mq.webp"><template><img src="https://m/1.webp"></template>`)).toEqual(['repeat', 'repeat'])
  })
  test('a figure of another fish under a fish\'s heading; a fish\'s section with no photo', () => {
    expect(checks(`<div class="prose"><h3>1. Cá a (Aus bus)</h3><p>…</p>${fig('https://m/b.webp')}<h3>2. Cá b (Aus cus)</h3><p>…</p></div>`)).toEqual(['wrong-fish', 'missing-photo'])
    expect(checks(`<div class="prose"><h3>1. Cá a (Aus bus)</h3><p>…</p>${fig('https://m/x.webp', '/vi/ca/b/')}<h3>2. Cá b (Aus cus)</h3><p>…</p>${fig('https://m/b.webp')}</div>`)).toEqual(['wrong-fish'])
  })
  test('a name linked to another fish than its scientific name in brackets, in the text or in the heading', () => {
    expect(checks(`<div class="prose"><p><a href="/vi/ca/a/">Cá a</a> (Aus cus) và <a href="/vi/ca/a/">Cá a</a> (Aus bus).</p></div>`)).toEqual(['wrong-link'])
    expect(checks(`<div class="prose"><h3>Cá xanh (Aus cus)</h3><p><a href="/vi/ca/a/">cá xanh</a> đẹp.</p></div>`)).toEqual(['wrong-link'])
    expect(checks(`<div class="prose"><p><a href="/vi/ca/a/">Cá a</a> (German blue ram).</p></div>`)).toEqual([]) // not a scientific name
  })
  test('contents that disagree with the headings; numbers out of order', () => {
    const toc = (items: string) => `<nav class="toc"><ol>${items}</ol></nav>`
    expect(checks(`${toc('<li><a href="#a">Một</a></li><li><a href="#b">Hai</a></li>')}<div class="prose"><h3 id="b">Hai</h3><p>…</p><h3 id="a">Một</h3><p>…</p></div>`)).toEqual(['toc', 'toc'])
    expect(checks(`${toc('<li><a href="#a">Một</a></li>')}<div class="prose"><h3 id="a">Mốt</h3><p>…</p></div>`)).toEqual(['toc'])
    // The list's own number must be the heading's: an unnumbered heading first shifts every number after it.
    expect(checks(`${toc('<li><a href="#i">Giới thiệu</a></li><li><a href="#a">Cá</a></li>')}<div class="prose"><h3 id="i">Giới thiệu</h3><p>…</p><h3 id="a">1. Cá</h3><p>…</p></div>`)).toEqual(['toc'])
    expect(checks(`${toc('<li class="un"><a href="#i">Giới thiệu</a></li><li value="1"><a href="#a">Cá</a></li>')}<div class="prose"><h3 id="i">Giới thiệu</h3><p>…</p><h3 id="a">1. Cá</h3><p>…</p></div>`)).toEqual([])
    expect(checks(`<div class="prose"><h3>1. A</h3><p>…</p><h3>3. B</h3><p>…</p><h3>1. C</h3><p>…</p></div>`)).toEqual(['toc']) // a new list may start again at 1
    expect(checks(`<div class="prose"><h3>Mở đầu</h3><p>…</p><h3>3. A</h3><p>…</p><h3>2. B</h3><p>…</p><h3>1. C</h3><p>…</p></div>`)).toEqual([]) // a countdown
  })
  test('a heading with nothing under it', () => {
    expect(checks(`<div class="prose"><h3>Ưu điểm</h3><h3>Nhược điểm</h3><p>…</p><h3>Để lại bình luận</h3></div>`)).toEqual(['empty-section', 'empty-section'])
  })
})

// 2026-11-01, aquarium Co-op's 5-gallon guide: the pea puffer 4 times (the guide's own photo and the puffer page's, one
// picture in two files; the cards; the next guide's borrowed cover), the green neon tetra linked to the neon tetra.
describe('the nano guide (the owner\'s report)', () => {
  const path = '/vi/huong-dan/ca-nano-cho-be-19-lit/'
  const { html, dom } = page(path)
  test('shows no picture twice', () => {
    expect(checkPage(path, html, facts).filter(p => p.check === 'repeat')).toEqual([])
  })
  test('its own angelfish photo sits in the angelfish\'s section, the page\'s copy of it nowhere', () => {
    const h = dom.querySelectorAll('.prose h3')
    const under = (i: number) => { const out: string[] = []; for (let n = h[i]!.nextElementSibling; n && n.tagName !== 'H3'; n = n.nextElementSibling) out.push(...n.querySelectorAll('img').map(x => x.getAttribute('src')!), ...(n.tagName === 'IMG' ? [n.getAttribute('src')!] : [])); return out }
    expect(under(0)).toEqual(['https://media.aquatome.com/aquariumcoop/00000000000000b1.webp'])
    expect(under(2)).toEqual(['https://media.aquatome.com/aquariumcoop/00000000000000b2.webp']) // "celestial pearl danios"
    expect(html).not.toContain('commons/0c21cb038569ae13')
  })
  test('the name before a scientific name in brackets links that species', () => {
    expect(dom.querySelector('.prose a[href="/vi/ca/ca-neon-vua/"]')?.text).toBe('cá neon xanh')
    expect(dom.querySelector('.prose a[href="/vi/ca/ca-neon-xanh/"]')).toBeNull()
  })
})

// 2026-11-01, Spruce Pets' "11 easiest fish": 4 of 11 fish sections had a photo; the goldfish under the molly, the tiger
// barb (named in passing) under the cherry barb.
test('the easy-fish guide (the owner\'s report): each fish section shows that fish', () => {
  const path = '/vi/huong-dan/ca-de-nuoi-nhat-cho-nguoi-moi/'
  const { html, dom } = page(path)
  expect(fishSections(path, html, facts).map(x => [x.fish, x.photo])).toEqual([
    ['species:symphysodon-aequifasciatus', true], ['species:mikrogeophagus-ramirezi', true], ['species:boraras-brigittae', true], ['species:neocaridina-davidi', true],
  ])
  expect(checkPage(path, html, facts)).toEqual([])
  // The guide's own photo in its section, captioned with the fish's name and its page.
  const own = dom.querySelector('img[src="https://media.aquatome.com/sprucepets/00000000000000c3.webp"]')!.closest('figure')!
  expect(own.querySelector('figcaption a')?.getAttribute('href')).toBe('/vi/ca/ca-boraras-do/')
  expect(dom.querySelector('.prose')!.innerHTML).not.toContain('Cacatuoides') // the apisto, named in passing, shows nowhere in the text
})
