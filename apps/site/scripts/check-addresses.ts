/**
 * At build (package.json "build", after astro build): every address the sitemaps give search engines is a page the build
 * made, and every redirect in /redirects.json (renamed pages, a country's other id, in every language) lands on one.
 * The live checks of 14 Nov found a plant's photo page in the sitemap that the build never made (lib/photo-page.ts):
 * such an address is a failed build here, not a 404 for a reader or a crawler.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'node-html-parser'
import { CATALOGUE_PATH } from '../src/lib/catalogue.ts'

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]!).pathname)
const built = (dist: string, path: string) => existsSync(join(dist, decodeURIComponent(path), 'index.html'))
const sitemapPaths = (dist: string) => {
  const top = readFileSync(join(dist, 'sitemap.xml'), 'utf8')
  // /sitemap.xml is the index of one sitemap per kind; an older build's was the list itself.
  return top.includes('<sitemapindex') ? locs(top).flatMap(s => locs(readFileSync(join(dist, s), 'utf8'))) : locs(top)
}

/** The sitemaps' addresses and the redirects' targets that have no page in `dist`. */
export function missingAddresses(dist: string): { sitemap: string[]; redirects: string[] } {
  const pages = sitemapPaths(dist)
  const redirects = Object.values(JSON.parse(readFileSync(join(dist, 'redirects.json'), 'utf8')) as Record<string, string>).map(to => to.replace(/[?#].*$/, ''))
  return { sitemap: pages.filter(p => !built(dist, p)), redirects: [...new Set(redirects)].filter(p => !built(dist, p)) }
}

/** Follow only ordinary links from the home page to the catalogue and between its pages. */
export function unlinkedSitemapPages(dist: string): string[] {
  const links = (path: string, selector: string) => {
    if (!built(dist, path)) return []
    const html = readFileSync(join(dist, decodeURIComponent(path), 'index.html'), 'utf8')
    return parse(html).querySelectorAll(selector).flatMap(a => {
      const href = a.getAttribute('href')!
      return !a.closest('template') && !a.closest('[hidden]') && href.startsWith('/') && !href.startsWith('//')
        ? [new URL(href, 'https://aquatome.com').pathname] : []
    })
  }
  const queue = links('/', 'a[href]').filter(p => p === CATALOGUE_PATH).slice(0, 1)
  const visited = new Set(queue)
  const targets = new Set<string>()
  for (const page of queue) for (const path of links(page, 'main a[href]')) {
    targets.add(path)
    if (path.startsWith(CATALOGUE_PATH) && /^\d+\/$/.test(path.slice(CATALOGUE_PATH.length)) && !visited.has(path)) {
      visited.add(path)
      queue.push(path)
    }
  }
  return sitemapPaths(dist).filter(path => !targets.has(path))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = fileURLToPath(new URL('../dist', import.meta.url))
  const { sitemap, redirects } = missingAddresses(dist)
  const unlinked = unlinkedSitemapPages(dist)
  if (sitemap.length || redirects.length || unlinked.length) {
    console.error(`check-addresses: ${sitemap.length} sitemap address(es) and ${redirects.length} redirect target(s) the build made no page for:`)
    for (const p of sitemap) console.error(`  sitemap   ${p}`)
    for (const p of redirects) console.error(`  redirect  ${p}`)
    if (unlinked.length) console.error(`check-addresses: ${unlinked.length} sitemap address(es) without an HTML catalogue link: ${unlinked.slice(0, 20).join(', ')}`)
    process.exit(1)
  }
  console.log('check-addresses: every sitemap address has a catalogue link, and every address lands on a page the build made')
}
