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
