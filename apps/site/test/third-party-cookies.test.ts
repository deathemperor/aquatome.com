import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { parse } from 'node-html-parser'
import { noCookies, noCookiesHtml } from '../src/lib/no-cookies'
import { DIST } from './dist'

// Wikimedia's image hosts set cookies with every picture: a hot-linked Commons photo gave aquatome.com/vi/ third-party
// cookies, and Lighthouse's best-practices score fell to 78 (#276). Asked for without credentials, the picture comes
// without them.
const html = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? html(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : [])

test('every Wikimedia picture in the build is asked for without cookies', () => {
  const files = html(DIST)
  const found = files.flatMap(f => parse(readFileSync(f, 'utf8')).querySelectorAll('img').filter(i => noCookies(i.getAttribute('src') ?? '')).map(i => ({ f, img: i })))
  expect(found.length, 'the fixture build has Wikimedia pictures to check').toBeGreaterThan(0)
  expect(found.filter(({ img }) => img.getAttribute('crossorigin') !== 'anonymous').map(({ f, img }) => `${f.slice(DIST.length)}: ${img.getAttribute('src')}`)).toEqual([])
})

test('only Wikimedia, which answers CORS, is asked without cookies: our media host has no CORS headers', () => {
  expect(noCookies('https://thumb.wikimedia.org/wikipedia/commons/thumb/7/76/Blue_Discus.jpg/500px-Blue_Discus.jpg')).toBe(true)
  expect(noCookies('https://upload.wikimedia.org/wikipedia/commons/2/28/A.jpg')).toBe(true)
  expect(noCookies('https://media.aquatome.com/commons/e6935fc1e0ed7998-480.webp')).toBe(false)
  expect(noCookies('https://images.unsplash.com/photo-1?w=480')).toBe(false)
  expect(noCookies('/vi/ca/')).toBe(false)
  const out = noCookiesHtml('<img src="https://thumb.wikimedia.org/a.jpg" alt=""><img alt="" src="https://media.aquatome.com/a.webp"><img crossorigin="anonymous" src="https://upload.wikimedia.org/b.jpg">')
  expect(out).toBe('<img src="https://thumb.wikimedia.org/a.jpg" alt="" crossorigin="anonymous"><img alt="" src="https://media.aquatome.com/a.webp"><img crossorigin="anonymous" src="https://upload.wikimedia.org/b.jpg">')
  expect(noCookiesHtml('<img src="https://upload.wikimedia.org/c.jpg" />')).toBe('<img src="https://upload.wikimedia.org/c.jpg" crossorigin="anonymous" />')
  // An alt text may hold a ">": the attribute goes after it, not inside it.
  expect(noCookiesHtml('<img src="https://upload.wikimedia.org/d.jpg" alt="a > b" loading="lazy">')).toBe('<img src="https://upload.wikimedia.org/d.jpg" alt="a > b" loading="lazy" crossorigin="anonymous">')
})
