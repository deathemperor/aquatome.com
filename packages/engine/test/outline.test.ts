import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { denoise, htmlToOutline, isChallenge } from '../src/outline'

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
