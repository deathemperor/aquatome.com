import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { discover, parseSitemap } from '../src/discover'
import type { SourceConfig } from '../src/sources'

const fx = (n: string) => readFileSync(new URL(`./fixtures/sitemaps/${n}`, import.meta.url), 'utf8')
const sf: SourceConfig = { id: 'seriouslyfish', discover: { kind: 'sitemap', urls: ['https://www.seriouslyfish.com/sitemap.xml'] }, include: /\/species\/[a-z0-9-]+$/, delayMs: 0 }

test('parses a urlset with lastmod', () => {
  const r = parseSitemap(fx('urlset.xml'))
  expect(r.sitemaps).toEqual([])
  expect(r.urls[0]).toEqual({ loc: 'https://www.seriouslyfish.com/species/paracheirodon-axelrodi', lastmod: '2026-10-01T10:00:00Z' })
  expect(r.urls).toHaveLength(5)
})
test('parses a sitemap index', () => {
  expect(parseSitemap(fx('index.xml')).sitemaps).toEqual(['https://www.seriouslyfish.com/sitemap-species.xml'])
})
test('follows sitemap indexes, filters and dedupes urls', async () => {
  const pages: Record<string, string> = { 'https://www.seriouslyfish.com/sitemap.xml': fx('index.xml'), 'https://www.seriouslyfish.com/sitemap-species.xml': fx('urlset.xml') }
  const out = await discover(sf, async u => pages[u]!, async () => [])
  expect(out).toEqual([
    { url: 'https://www.seriouslyfish.com/species/paracheirodon-axelrodi', lastmod: '2026-10-01T10:00:00Z' },
    { url: 'https://www.seriouslyfish.com/species/paracheirodon-innesi', lastmod: '2026-09-01' },
  ])
})
test('crawl mode filters page links', async () => {
  const src: SourceConfig = { id: 'tropica', discover: { kind: 'crawl', start: ['https://tropica.com/en/plants/'] }, include: /\/en\/plants\/plantdetails\//, exclude: /print/, delayMs: 0 }
  const links = ['https://tropica.com/en/plants/plantdetails/anubias-nana/1/', 'https://tropica.com/en/plants/plantdetails/anubias-nana/1/#top', 'https://tropica.com/en/plants/plantdetails/x/print/', 'https://tropica.com/en/inspiration/']
  expect((await discover(src, async () => '', async () => links)).map(x => x.url)).toEqual(['https://tropica.com/en/plants/plantdetails/anubias-nana/1/'])
})
