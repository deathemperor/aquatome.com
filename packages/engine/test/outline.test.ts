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

// WordPress's comments sit inside `main`, after the article: a heading with their count, each commenter's name, picture and
// words, then the reply box. Aquarium Breeder's were read as its text until 16 Nov. Every word here is made up.
test("a page's comments leave no text or images: the page reads as it does without them", () => {
  const page = (comments: string) => `<html><head><title>Cherry shrimp</title></head><body><main><article>
    <h1>Cherry shrimp</h1><p>A hardy dwarf shrimp for planted tanks.</p>
    <img src="/wp-content/uploads/2020/01/cherry-shrimp.jpg" alt="Cherry shrimp on moss" width="1000" height="700"><p>Keep them in soft water.</p>
  </article>${comments}</main></body></html>`
  const comments = `<div id="comments" class="comments-area"><h2 class="comments-title">3 thoughts on “Cherry shrimp”</h2>
    <ol class="comment-list"><li class="comment"><footer><img alt="" src="https://secure.gravatar.com/avatar/0123456789abcdef0123456789abcdef?s=800&d=mm" class="avatar avatar-800 photo" width="800" height="800">
    <b class="fn">Sample Reader</b> says:</footer><p>Mine bred within a month at 24 degrees.</p></li></ol>
    <div id="respond" class="comment-respond"><h3 id="reply-title" class="comment-reply-title">Leave a Reply <small><a href="#respond">Cancel reply</a></small></h3>
    <p class="comment-notes">Your email address will not be published.</p></div></div>`
  const clean = htmlToOutline(page(''))
  const drawn = htmlToOutline(page(comments))
  expect(drawn.outline).not.toMatch(/Sample Reader|bred within|thoughts on|Leave a Reply|email address/)
  expect(drawn.images.map(i => i.src)).toEqual(['/wp-content/uploads/2020/01/cherry-shrimp.jpg'])
  expect(drawn).toEqual(clean)
})

test("a theme's own comment headings end the article: a count of thoughts, comments or replies on the page, and the reply box", () => {
  const article = '# Cherry shrimp\nKeep them in soft water.'
  for (const heading of ['## 3 thoughts on “Cherry shrimp”', '## One thought on "Cherry shrimp"', '### 12 Responses to ‘Cherry shrimp’', '### Leave a Reply Cancel reply', '## Leave a comment'])
    expect(denoise(`${article}\n${heading}\nMine bred within a month.`)).toBe(article)
  // An article's own heading that only starts with a count stays.
  expect(denoise(`${article}\n## 5 thoughts on feeding\nFeed twice a day.`)).toBe(`${article}\n## 5 thoughts on feeding\nFeed twice a day.`)
})

// A forum post's header names its writer's email address, and an article may ask readers to write to one: a person's,
// never the article's, and never stored (six stored files held one on 17 Nov). Made-up addresses only.
test('an email address is never kept: in a post header its brackets go too; a picture named "@2x" stays', () => {
  const html = `<html><head><title>Loaches (someone@example.com)</title></head><body><main>
    <h1>Botia rostrata</h1>
    <p>From: A Writer (a.writer@mail.example.org) Date: May 17th, 2002</p>
    <p>From: A Writer (one@example.net) / Another (two@example.co.uk) Date: August 4th, 2002</p>
    <p>If anyone knows, please e-mail me at someone+fish@example.com Also, ask away.</p>
    <p><a href="mailto:someone@example.com">someone@example.com</a> / Getty Images</p>
    <p>The file loach@2x.png is the larger picture.</p>
  </main></body></html>`
  const o = htmlToOutline(html)
  expect(`${o.title}\n${o.outline}`).not.toMatch(/example\.(com|org|net|co\.uk)|mailto/)
  expect(o.title).toBe('Loaches')
  expect(o.outline).toContain('From: A Writer Date: May 17th, 2002')
  expect(o.outline).toContain('From: A Writer / Another Date: August 4th, 2002')
  expect(o.outline).toContain('please e-mail me at Also, ask away.')
  expect(o.outline).toContain('loach@2x.png')
  // A stored copy cleaned by the same rule reads as a fresh read would: a second pass changes nothing.
  expect(denoise(o.outline)).toBe(o.outline)
})
