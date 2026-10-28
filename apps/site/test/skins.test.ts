import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { DIST, page } from './dist'

const SKINS = ['a', 'b', 'c']
const skinDir = fileURLToPath(new URL('../src/styles/skins/', import.meta.url))
const bundledCss = () => readdirSync(`${DIST}/_astro`).filter(f => f.endsWith('.css')).map(f => readFileSync(`${DIST}/_astro/${f}`, 'utf8')).join('\n')

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
