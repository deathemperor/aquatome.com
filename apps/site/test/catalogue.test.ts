import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { unlinkedSitemapPages } from '../scripts/check-addresses'
import { CATALOGUE_PATH, cataloguePagePath } from '../src/lib/catalogue'
import { localizePath, OTHER_LANGS, translator } from '../src/lib/i18n'
import { sitemapEntries } from '../src/lib/sitemap'
import { page as builtPage } from './dist'

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


test('every catalogue entry has its page name, using the translated heading for hubs and tools', async () => {
  const entries = await sitemapEntries()
  expect(entries.length).toBeGreaterThan(0)
  for (const { path, label } of entries) {
    expect(label?.trim(), path).toBeTruthy()
    expect(label, path).not.toMatch(/^(?:\/|https?:)/)
  }
  const labels = new Map(entries.map(({ path, label }) => [path, label]))
  for (const lang of ['vi', ...OTHER_LANGS] as const) {
    const t = translator(lang)
    expect(labels.get(localizePath(lang, '/vi/ca/'))).toBe(t('Tất cả loài'))
    expect(labels.get(localizePath(lang, '/vi/cong-cu/the-tich-be/'))).toBe(t('Bể bao nhiêu lít?'))
    expect(labels.get(localizePath(lang, '/vi/nguon-goc/'))).toBe(t('Nguồn gốc'))
  }
})

test('every catalogue hub, tool and equipment link uses the built page heading', async () => {
  for (const { path, kind, label } of await sitemapEntries()) {
    if (kind !== 'other' && kind !== 'equipment') continue
    expect(label, path).toBe(builtPage(path).dom.querySelector('h1')?.text.trim())
  }
})
