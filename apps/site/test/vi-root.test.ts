import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { APP_VI_ROOT } from '../src/lib/i18n'
import { VI_SECTIONS } from '../worker/paths'
import { DIST, page, sitemapText } from './dist'

// Vietnamese pages live at the root (/ca/x/), and nothing the site builds links to the old /vi/… addresses, which the
// Worker 301s (worker/test/handler.test.ts). The apps' files keep the /vi/ form until the app reads both (APP_VI_ROOT).
const APP_FILES = /^\/app\//
const files = (dir: string, at = ''): string[] =>
  readdirSync(dir).flatMap(f => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f), `${at}/${f}`) : [`${at}/${f}`]))
/** A /vi/ address: root-relative, or absolute on any host but YouTube's thumbnails (i.ytimg.com/vi/…). */
const VI_LINK = /(?:^|[\s"'(=,>\\])(?:https?:\/\/(?!i\.ytimg\.com)[^\s"'/<>]+)?\/vi(?:\/|["'?#\s<\\]|$)/m

test('no page, feed or file the site builds links to /vi/…, apart from the apps\' files', () => {
  const built = files(DIST).filter(f => /\.(html|xml|json|txt|md)$/.test(f) && !f.startsWith('/pagefind/'))
  expect(built.length).toBeGreaterThan(100)
  const linking = built.filter(f => !APP_FILES.test(f) && VI_LINK.test(readFileSync(join(DIST, f), 'utf8')))
  expect(linking).toEqual([])
  // The check finds such a link where there is one: the apps' files still have them.
  expect(VI_LINK.test(readFileSync(join(DIST, 'app/vi.json'), 'utf8'))).toBe(!APP_VI_ROOT)
  expect(VI_LINK.test('<a href="/data/vi/species.json"> <img src="https://i.ytimg.com/vi/x/hq.jpg">')).toBe(false)
  expect(['<a href="/vi/">', '"url":"https://aquatome.com/vi/ca/x/"', '<a href="/vi/ca/?q=1">'].every(s => VI_LINK.test(s))).toBe(true)
})

test('the home page is the Vietnamese one, at the root; nothing is built under /vi/', () => {
  expect(existsSync(join(DIST, 'vi'))).toBe(false)
  const { dom } = page('/')
  expect(dom.querySelector('html')?.getAttribute('lang')).toBe('vi')
  expect(dom.querySelector('a.logo')?.getAttribute('href')).toBe('/')
})

test('canonical, hreflang and x-default name the root addresses; the other languages\' stay', () => {
  const links = (path: string) => Object.fromEntries(page(path).dom.querySelectorAll('link[rel="canonical"], link[rel="alternate"][hreflang]').map(l => [l.getAttribute('hreflang') ?? 'canonical', new URL(l.getAttribute('href')!).pathname]))
  expect(links('/')).toEqual({ canonical: '/', vi: '/', id: '/id/', th: '/th/', ms: '/ms/', 'x-default': '/' })
  expect(links('/cong-cu/the-tich-be/')).toEqual({ canonical: '/cong-cu/the-tich-be/', vi: '/cong-cu/the-tich-be/', id: '/id/alat/volume-akuarium/', th: '/th/tools/tank-volume/', ms: '/ms/alat/isi-padu-tangki/', 'x-default': '/cong-cu/the-tich-be/' })
  expect(links('/id/alat/volume-akuarium/')).toMatchObject({ canonical: '/id/alat/volume-akuarium/', vi: '/cong-cu/the-tich-be/', 'x-default': '/cong-cu/the-tich-be/' })
  // The language menu takes a reader to the root address too.
  expect(page('/id/').dom.querySelector('[data-lang-menu] a[data-lang="vi"]')?.getAttribute('href')).toBe('/')
})

test('the sitemap and redirects.json give the root addresses', () => {
  const locs = [...sitemapText().matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]!).pathname)
  expect(locs).toContain('/')
  expect(locs).toContain('/ca/ca-neon-vua/')
  expect(locs).toContain('/id/')
  expect(locs.filter(p => p.startsWith('/vi/'))).toEqual([])
  // An old address of a renamed page, by its root form: the Worker reads an old /vi/… one without /vi.
  expect(JSON.parse(readFileSync(join(DIST, 'redirects.json'), 'utf8'))).toEqual({ '/ca/ca-neon-vua-super-red/': '/ca/ca-neon-vua/?tu=ca-neon-vua-super-red', '/ca/ca-neon-vua-super-red/anh/': '/ca/ca-neon-vua/anh/' })
})

test('the Vietnamese sections are the page folders, and the Worker runs first on each (wrangler.jsonc)', () => {
  const pages = new URL('../src/pages/', import.meta.url)
  const folders = readdirSync(pages, { withFileTypes: true }).filter(d => d.isDirectory() && !['.well-known', 'app', 'data', 'go'].includes(d.name)).map(d => d.name)
  expect([...VI_SECTIONS].sort()).toEqual(folders.sort())
  // Whole-line comments only: the config's strings hold "//" (https://).
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''))
  const first: string[] = config.assets.run_worker_first
  for (const p of ['/', '/vi', '/vi/*', ...VI_SECTIONS.map(s => `/${s}/*`)]) expect(first, p).toContain(p)
})
