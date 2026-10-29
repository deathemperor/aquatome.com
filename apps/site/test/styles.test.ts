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
