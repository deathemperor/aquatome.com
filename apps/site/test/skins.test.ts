import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { page } from './dist'

const SKINS = ['a', 'b', 'c']
const skinDir = fileURLToPath(new URL('../src/styles/skins/', import.meta.url))
/** CSS is inlined into every page (astro build.inlineStylesheets: 'always'). */
const bundledCss = () => page('/vi/').dom.querySelectorAll('style').map(s => s.text).join('\n')

test('default markup carries no skin; Mix is the unscoped default', () => {
  const { dom } = page('/vi/ca/ca-neon-vua/')
  expect(dom.querySelector('html')?.getAttribute('data-skin')).toBeFalsy()
})

test('every skin ships in the bundle, scoped by html[data-skin]', () => {
  const css = bundledCss()
  for (const s of SKINS) expect(css).toMatch(new RegExp(`\\[data-skin=["']?${s}["']?\\]`))
})

test('skin stylesheets never style anything outside their own scope', () => {
  for (const s of SKINS) {
    const src = readFileSync(`${skinDir}${s}.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const selectors = [...src.matchAll(/(^|[{}])\s*([^\s{}@][^{}]*)\{/g)].map(m => m[2]!.trim())
    expect(selectors.length).toBeGreaterThan(0)
    for (const sel of selectors) for (const part of sel.split(',')) expect(part.trim(), `${s}.css: ${part}`).toMatch(new RegExp(`^:root\\[data-skin="${s}"\\]`))
  }
})

test('preview script honours ?skin= before first paint', () => {
  const { html } = page('/vi/')
  const head = html.slice(0, html.indexOf('</head>'))
  expect(head).toMatch(/data-skin-preview/)
})

test('A/B beacon is on every page, small, and tracks sponsored clicks', () => {
  const { dom } = page('/vi/ca/ca-neon-vua/')
  const js = dom.querySelector('script[data-beacon]')?.text ?? ''
  expect(js.length).toBeLessThan(1500)
  expect(js).toContain("a[rel~=sponsored]")
  expect(js).toContain("'/_e'")
  expect(dom.querySelector('a[rel~="sponsored"]')).not.toBeNull()
})
