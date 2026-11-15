import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { denoise, htmlToOutline, isChallenge } from '../src/outline'
import { pickSourcePhotos } from '../src/source-photos'

const fx = (n: string) => readFileSync(new URL(`./fixtures/pages/${n}`, import.meta.url), 'utf8')

test('Seriously Fish profile becomes a heading outline without navigation', () => {
  const o = htmlToOutline(fx('seriouslyfish-cardinal.html'), 'main')
  expect(o.title).toContain('Paracheirodon axelrodi')
  expect(o.outline).toMatch(/^#+ Habitat$/m)
  expect(o.outline).toMatch(/^#+ Reproduction$/m)
  expect(o.outline).toContain('Paracheirodon axelrodi')
  expect(o.outline).not.toMatch(/Every species\s*\n\s*By classification/)
  expect(o.outline.length).toBeGreaterThan(3000)
})
test('lists and tables keep their structure', () => {
  const o = htmlToOutline('<main><h2>Foods</h2><ul><li>Artemia</li><li>Daphnia</li></ul><table><tr><th>pH</th><td>4.0–6.0</td></tr></table><nav>Menu</nav></main>')
  expect(o.outline).toBe('## Foods\n- Artemia\n- Daphnia\n| pH | 4.0–6.0 |')
})
test('scripts, styles and forms never appear', () => {
  const o = htmlToOutline('<body><script>evil()</script><style>p{}</style><form>Login</form><p>Real text</p></body>')
  expect(o.outline).toBe('Real text')
})
test('images are collected with alt text', () => {
  expect(htmlToOutline('<main><img src="/a.jpg" alt="Cardinal"><p>x</p></main>').images).toEqual([{ src: '/a.jpg', alt: 'Cardinal' }])
})

// Aquarium Breeder as Chrome reads it (15 Nov 2026): a page that loads its images late keeps a 1-pixel placeholder in each
// image's own address, and the photo in a lazy attribute or only in the link to its full-size file.
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const PAGE = 'https://aquariumbreeder.com/driftwood-in-shrimp-tank/'
const LATE = `<main><h2>Types of Wood for Shrimp Tank</h2><h3>3. Mopani Wood</h3>
  <a href="https://aquariumbreeder.com/wp-content/uploads/2019/05/Mopani-Wood.jpg"><img src="${BLANK}" alt="Mopani Wood for shrimp" width="300" height="207"></a>
  <h3>4. Spider wood</h3><img src="${BLANK}" data-lazy-src="/wp-content/uploads/2019/05/Spider-wood.jpg" alt="Spider wood for shrimp tank">
  <img src="${BLANK}" data-src="/c.jpg" alt="C">
  <a href="/another-article/"><img src="${BLANK}" alt="Read next"></a>
  <img src="${BLANK}" alt="Nothing behind it"></main>`
test('an image loaded late is read at its real address: a lazy attribute, or the link to its full-size file; a blank alone is no image', () => {
  const o = htmlToOutline(LATE, undefined, PAGE)
  expect(o.images.map(i => i.src)).toEqual(['https://aquariumbreeder.com/wp-content/uploads/2019/05/Mopani-Wood.jpg', '/wp-content/uploads/2019/05/Spider-wood.jpg', '/c.jpg'])
  expect(o.images[0]).toMatchObject({ alt: 'Mopani Wood for shrimp', displayWidth: 300, displayHeight: 207, heading: '3. Mopani Wood' })
  expect(o.images[1]).toMatchObject({ heading: '4. Spider wood' })
})
test('an image read late goes to the picker as a photo of the page, to be sized when it is fetched', () => {
  const picked = pickSourcePhotos(htmlToOutline(LATE, undefined, PAGE).images, PAGE, [], Infinity, 'guide')
  // One laid out at 300 px comes after those with no layout width, and is kept only if its file is big enough.
  expect(picked.map(p => p.src)).toEqual([
    'https://aquariumbreeder.com/wp-content/uploads/2019/05/Spider-wood.jpg',
    'https://aquariumbreeder.com/c.jpg',
    'https://aquariumbreeder.com/wp-content/uploads/2019/05/Mopani-Wood.jpg',
  ])
  expect(picked[2]).toMatchObject({ extra: true, probe: true })
})
test("a blank image's link is its photo only when it is an image file on the page's own site", () => {
  const linked = (href: string, pageUrl?: string) => htmlToOutline(`<main><a href="${href}"><img src="${BLANK}" alt="x"></a></main>`, undefined, pageUrl).images.map(i => i.src)
  expect(linked('https://media.aquariumbreeder.com/2019/05/a.jpg', PAGE)).toEqual(['https://media.aquariumbreeder.com/2019/05/a.jpg'])
  expect(linked('https://www.aquariumbreeder.com/b.webp', PAGE)).toEqual(['https://www.aquariumbreeder.com/b.webp'])
  expect(linked('/wp-content/uploads/c.png')).toEqual(['/wp-content/uploads/c.png'])
  // A third site, a shop, another page of the site, and an absolute link with no page address to hold it to: none.
  expect(linked('https://images.example-photos.com/a.jpg', PAGE)).toEqual([])
  expect(linked('https://shop.example.com/products/driftwood.jpg', PAGE)).toEqual([])
  expect(linked('https://aquariumbreeder.com/shrimp-food/', PAGE)).toEqual([])
  expect(linked('https://aquariumbreeder.com/wp-content/uploads/a.jpg')).toEqual([])
  expect(linked('https://notaquariumbreeder.com/a.jpg', PAGE)).toEqual([])
})
test("an image's own address wins over its lazy ones; a placeholder file gives way, and a lazy set of sizes over a blank one", () => {
  expect(htmlToOutline('<main><img src="/own.jpg" data-src="/lazy.jpg" alt="A"></main>').images[0]!.src).toBe('/own.jpg')
  expect(htmlToOutline('<main><img src="/photos/placeholder-tetra.jpg" data-src="/lazy.jpg" alt="A"></main>').images[0]!.src).toBe('/photos/placeholder-tetra.jpg')
  expect(htmlToOutline('<main><img src="/wp-includes/images/blank.gif" data-src="/lazy.jpg" alt="A"></main>').images[0]!.src).toBe('/lazy.jpg')
  expect(htmlToOutline('<main><img src="/img/lazy-placeholder.png" data-lazy-src="/lazy2.jpg" alt="A"></main>').images[0]!.src).toBe('/lazy2.jpg')
  expect(htmlToOutline(`<main><img src="${BLANK}" srcset="${BLANK} 1w" data-lazy-srcset="/big.jpg 1200w, /small.jpg 300w" width="300" alt="B"></main>`).images[0])
    .toEqual({ src: '/big.jpg', alt: 'B', width: 1200, displayWidth: 300 })
})
test('a real file whose name only starts like a placeholder is a photo; a stray % and a blank among the sizes break nothing', () => {
  const one = (html: string) => htmlToOutline(`<main>${html}</main>`, undefined, PAGE).images.map(i => i.src)
  expect(one('<img src="/up/transparent-shrimp-300x200.png" alt="a">')).toEqual(['/up/transparent-shrimp-300x200.png'])
  expect(one('<img src="/up/Lazy-Susan.webp" alt="a">')).toEqual(['/up/Lazy-Susan.webp'])
  expect(one('<img src="/up/pixel-shrimp.webp" data-src="/other.jpg" alt="a">')).toEqual(['/up/pixel-shrimp.webp'])
  expect(one('<a href="/shop/x.jpg"><img src="/up/blank-tank.png" alt="a"></a>')).toEqual(['/up/blank-tank.png'])
  expect(one('<img src="/i/pixel-1x1.png" data-src="/real.jpg" alt="a">')).toEqual(['/real.jpg'])
  const pct = htmlToOutline('<main><p>Half off.</p><img src="/img/50%off.jpg" alt="a"></main>')
  expect([pct.outline, pct.images.map(i => i.src)]).toEqual(['Half off.', ['/img/50%off.jpg']])
  expect(one(`<img src="/own.jpg" srcset="${BLANK} 1w, /b.jpg 900w" alt="a">`)).toEqual(['/b.jpg'])
  expect(one('<img src="/own.jpg" srcset="/a.jpg 600w, /i/pixel.png 1000w" alt="a">')).toEqual(['/a.jpg'])
})
test('a link around two blank images is neither one\'s file', () => {
  expect(htmlToOutline(`<main><a href="/wp-content/uploads/w.jpg"><img src="${BLANK}" alt="icon"><img src="${BLANK}" alt="Mopani"></a></main>`, undefined, PAGE).images).toEqual([])
})
test('each photo read late keeps its own alt text and caption credit, even beside a blank that reads as none', () => {
  const figure = (file: string, alt: string, credit: string) => `<figure><a href="/wp-content/uploads/${file}"><img src="${BLANK}" alt="${alt}"></a><figcaption>${alt}. <span class="photo-credit">${credit}</span></figcaption></figure>`
  const o = htmlToOutline(`<main>${figure('malaysian.jpg', 'Malaysian driftwood', 'Photo A')}<figure><img src="${BLANK}" alt="Lost"><figcaption>Lost. <span class="photo-credit">Photo L</span></figcaption></figure>${figure('mopani.jpg', 'Mopani wood', 'Photo B')}</main>`, undefined, PAGE)
  expect(o.images.map(i => [i.src, i.alt, i.credit])).toEqual([
    ['/wp-content/uploads/malaysian.jpg', 'Malaysian driftwood', 'Photo A'],
    ['/wp-content/uploads/mopani.jpg', 'Mopani wood', 'Photo B'],
  ])
})
test('challenge pages are detected', () => {
  const o = htmlToOutline(fx('challenge.html'))
  expect(isChallenge(o.title, o.outline)).toBe(true)
  expect(isChallenge('Paracheirodon axelrodi', 'Habitat ...')).toBe(false)
  expect(isChallenge('Robot Challenge Screen', '')).toBe(true)
})

test('denoise drops prices, stock words and trailing page furniture', () => {
  const o = denoise('Alien Betta Regular price $27.94 USD Sale price $27.94 USD Sold out Shipping calculated at checkout.\nCare text.\n### Subscribe\nGet weekly…\n### Featured Products\n$7.99')
  expect(o).toBe('Alien Betta\nCare text.')
  expect(denoise('# Title\nBody\n## Related Articles\n- a\n- b')).toBe('# Title\nBody')
  expect(denoise('Price changed $9.99\nBody')).toBe(denoise('Price changed $12.49\nBody'))
})

// Seriously Fish as Chrome draws it on a home connection (2026-11-03): Ezoic's video player sits inside the profile, with
// its playlist's titles and a placeholder image whose src is "undefined", and its display ads with their "Ezoic" label.
// None of it is the page's own.
test('ads inside the article (a video player, display ads) leave no text or images: the page reads as it does without them', () => {
  const page = (ad: string) => `<html><head><title>Opsarius bendelisis</title></head><body><main><article>
    <h1>Opsarius bendelisis</h1><p>A schooling cyprinid of fast hill streams.</p>${ad}
    <img src="/images/2012/03/opsarius-bendelisis.jpg" alt="Adult male." width="684" height="513"><p>Keep a group of eight or more.</p>
  </article></main></body></html>`
  const ad = `<span class="humix-universal-js-insert"><div id="ez-video-wrap-ez-4998" class="ez-video-wrap"><div class="ez-video-center">
    <ol class="vjs-playlist-item-list"><li><picture class="video-js vjs-playlist-thumbnail"><img id="floating-placeholder-thumbnail" alt="" src="undefined"></picture></li>
    <li><img src="https://video-meta.open.video/poster/PzBKhh9yQV1I/t1782390744_poster.005.jpg" alt="video of: Fish Barbecue"><span class="vjs-playlist-now-playing-text">Now Playing</span>
    <cite>The Fish'n Canada Show</cite><span>23:12</span><span>Up Next</span><cite>Olympic Peninsula Salmon Fishing</cite></li></ol></div></div></span>
    <div id="ezoic-pub-ad-placeholder-112"><span class="ezoic-ad"><span class="reportline"><span class="ezoicwhat"><img src="https://go.ezodn.com/utilcave_com/ezoic.png" alt="Ezoic"></span>report this ad</span></span></div>
    <span class="ezoic-ad ezads-sticky-intradiv"><span class="reportline">report this ad</span></span>`
  const clean = htmlToOutline(page(''))
  const drawn = htmlToOutline(page(ad))
  expect(drawn.outline).not.toMatch(/Now Playing|Up Next|Fish'n Canada|report this ad/)
  expect(drawn.images.map(i => i.src)).toEqual(['/images/2012/03/opsarius-bendelisis.jpg'])
  expect(drawn).toEqual(clean)
})
