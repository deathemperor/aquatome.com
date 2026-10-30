import { expect, test } from 'vitest'
import { page } from './dist'

/** CSS is inlined into every page (astro build.inlineStylesheets: 'always'). */
const bundledCss = () => page('/vi/').dom.querySelectorAll('style').map(s => s.text).join('\n')

test('one look for everyone: no skin attribute, no skin CSS, no skin preview script', () => {
  const { dom, html } = page('/vi/ca/ca-neon-vua/')
  expect(dom.querySelector('html')?.getAttribute('data-skin')).toBeFalsy()
  expect(bundledCss()).not.toContain('data-skin')
  expect(html).not.toContain('data-skin-preview')
})

test('handbook tokens are the defaults: Newsreader display, warm paper', () => {
  const css = bundledCss()
  expect(css).toMatch(/--f-display:\s*['"]?Newsreader Variable/)
  expect(css).toMatch(/--c-paper:\s*#f3eee3/)
})

test('beacon is on every page, small, sends no skin, and tracks sponsored clicks', () => {
  const { dom } = page('/vi/ca/ca-neon-vua/')
  const js = dom.querySelector('script[data-beacon]')?.text ?? ''
  expect(js.length).toBeLessThan(1500)
  expect(js).toContain("a[rel~=sponsored]")
  expect(js).toContain("'/_e'")
  expect(js).not.toContain('skin')
  expect(dom.querySelector('a[rel~="sponsored"]')).not.toBeNull()
})

test('Vietnamese letters come from the vietnamese font files: their faces are declared after latin-ext, so latin-ext is not downloaded', () => {
  const css = bundledCss()
  for (const [ext, vi] of [['be-vietnam-pro-latin-ext-400-normal', 'be-vietnam-pro-vietnamese-400-normal'], ['be-vietnam-pro-latin-ext-600-normal', 'be-vietnam-pro-vietnamese-600-normal'], ['newsreader-latin-ext-wght-normal', 'newsreader-vietnamese-wght-normal'], ['newsreader-latin-ext-wght-italic', 'newsreader-vietnamese-wght-italic']]) {
    expect(css.lastIndexOf(vi), vi).toBeGreaterThan(css.lastIndexOf(ext))
  }
})
