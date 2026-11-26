import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { unlinkedSitemapPages } from '../scripts/check-addresses'
import { CATALOGUE_PATH, cataloguePagePath } from '../src/lib/catalogue'

test('only reachable, visible HTML links count for a sitemap address', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-catalogue-'))
  const page = (path: string, html: string) => {
    const parent = join(dir, path)
    mkdirSync(parent, { recursive: true })
    writeFileSync(join(parent, 'index.html'), html)
  }
  const a = (href: string) => `<a href="${href}">${href}</a>`
  try {
    const paths = ['/ca/ca-sao/', '/ms/tumbuhan/plant/']
    writeFileSync(join(dir, 'sitemap.xml'), `<sitemapindex><sitemap><loc>https://aquatome.com/sitemap-other.xml</loc></sitemap></sitemapindex>`)
    writeFileSync(join(dir, 'sitemap-other.xml'), `<urlset>${paths.map(p => `<url><loc>https://aquatome.com${p}</loc></url>`).join('')}</urlset>`)
    page('/', `<footer>${a(CATALOGUE_PATH)}</footer>`)
    page(CATALOGUE_PATH, `<main>${a(paths[0]!)}<template>${a(paths[1]!)}</template></main>`)
    page(cataloguePagePath(2), `<main>${a(paths[1]!)}</main>`)
    expect(unlinkedSitemapPages(dir)).toEqual([paths[1]])
    page(CATALOGUE_PATH, `<main>${a(paths[0]!)}${a(cataloguePagePath(2))}</main>`)
    expect(unlinkedSitemapPages(dir)).toEqual([])
    page('/', `<footer><div hidden>${a(CATALOGUE_PATH)}</div></footer>`)
    expect(unlinkedSitemapPages(dir)).toEqual(paths)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
