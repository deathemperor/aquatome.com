/**
 * At build (package.json "build", after astro build): every address the sitemaps give search engines is a page the build
 * made, and every redirect in /redirects.json (renamed pages, a country's other id, in every language) lands on one.
 * The live checks of 14 Nov found a plant's photo page in the sitemap that the build never made (lib/photo-page.ts):
 * such an address is a failed build here, not a 404 for a reader or a crawler.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]!).pathname)
const built = (dist: string, path: string) => existsSync(join(dist, decodeURIComponent(path), 'index.html'))

/** The sitemaps' addresses and the redirects' targets that have no page in `dist`. */
export function missingAddresses(dist: string): { sitemap: string[]; redirects: string[] } {
  const top = readFileSync(join(dist, 'sitemap.xml'), 'utf8')
  // /sitemap.xml is the index of one sitemap per kind; an older build's was the list itself.
  const pages = top.includes('<sitemapindex') ? locs(top).flatMap(s => locs(readFileSync(join(dist, s), 'utf8'))) : locs(top)
  const redirects = Object.values(JSON.parse(readFileSync(join(dist, 'redirects.json'), 'utf8')) as Record<string, string>).map(to => to.replace(/[?#].*$/, ''))
  return { sitemap: pages.filter(p => !built(dist, p)), redirects: [...new Set(redirects)].filter(p => !built(dist, p)) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { sitemap, redirects } = missingAddresses(fileURLToPath(new URL('../dist', import.meta.url)))
  if (sitemap.length || redirects.length) {
    console.error(`check-addresses: ${sitemap.length} sitemap address(es) and ${redirects.length} redirect target(s) the build made no page for:`)
    for (const p of sitemap) console.error(`  sitemap   ${p}`)
    for (const p of redirects) console.error(`  redirect  ${p}`)
    process.exit(1)
  }
  console.log('check-addresses: every sitemap address and every redirect lands on a page the build made')
}
