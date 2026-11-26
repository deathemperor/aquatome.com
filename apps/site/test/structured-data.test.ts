import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ChangelogEntry } from '@aq/schema'
import { expect, test } from 'vitest'
import { langOf, localizePath } from '../src/lib/i18n'
import { articleLd, breadcrumbLd, firstPublished } from '../src/lib/structured-data'
import { DIST, page } from './dist'

const SITE = new URL('https://aquatome.com/')
const PUBLISHER = { '@type': 'Organization', name: 'AquaTome', url: SITE.href, logo: new URL('/favicon.png', SITE).href }

test('the Article names only AquaTome and uses a retained new date where known', () => {
  const entries: ChangelogEntry[] = [
    { kind: 'guide', id: 'g', action: 'updated', date: '2026-11-23', source: 'aquatome' },
    { kind: 'guide', id: 'g', action: 'new', date: '2026-11-21', source: 'aquatome' },
    { kind: 'guide', id: 'g', action: 'new', date: '2026-11-20', source: 'seriouslyfish' },
    { kind: 'guide', id: 'g', action: 'new', date: 'unknown', source: 'aquatome' },
  ]
  const datePublished = firstPublished(entries, 'vi', 'guide', 'g')
  expect(datePublished).toBe('2026-11-20')
  expect(firstPublished(entries, 'id', 'guide', 'g')).toBeUndefined()
  expect(firstPublished(entries, 'vi', 'plant', 'g')).toBeUndefined()
  const article = articleLd(SITE, 'vi', '/vi/huong-dan/g/', { headline: 'Guide', datePublished, dateModified: '2026-11-23' })
  expect(article).toMatchObject({ datePublished: '2026-11-20', dateModified: '2026-11-23', mainEntityOfPage: 'https://aquatome.com/huong-dan/g/', publisher: PUBLISHER })
  expect(article).not.toHaveProperty('author')
  expect(articleLd(SITE, 'vi', '/', { headline: 'Guide', datePublished, dateModified: '2026-11-19' }).dateModified).toBeUndefined()
})

test('breadcrumbs keep their order, use local addresses and fall back to an existing hub', () => {
  const trail = breadcrumbLd(SITE, 'th', [['/vi/video/', 'Video'], ['/vi/huong-dan/a/', 'Guide']])
  expect(trail.itemListElement.map(x => [x.position, x.item])).toEqual([
    [1, 'https://aquatome.com/video/'], [2, 'https://aquatome.com/th/guides/a/'],
  ])
})

const ld = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m => JSON.parse(m[1]!))

test('every supported built page has the expected structured data in its own language', () => {
  const covered = new Set<string>()
  const articles = ['ca', 'cay', 'thuat-ngu', 'huong-dan', 'nhom']
  const hubs = ['ca', 'cay', 'thuat-ngu', 'huong-dan', 'kham-pha']
  for (const file of readdirSync(DIST, { recursive: true }) as string[]) {
    if (!file.endsWith('index.html')) continue
    const path = `/${file.replace(/index\.html$/, '')}`
    const lang = langOf(path)
    const section = (key: string) => localizePath(lang, `/vi/${key}/`)
    const articleKind = articles.find(key => path.startsWith(section(key)) && /^[^/]+\/$/.test(path.slice(section(key).length)))
    const home = path === localizePath(lang, '/vi/')
    const hub = hubs.some(key => path === section(key)) || ['phan-loai', 'nguon-goc'].some(key => path.startsWith(section(key)))
    if (!articleKind && !home && !hub) continue
    const data = ld(readFileSync(join(DIST, file), 'utf8'))
    const nodeOf = (kind: string) => data.find(x => x['@type'] === kind)
    const canonical = new URL(path, SITE).href
    const article = nodeOf('Article')
    if (articleKind) {
      expect(article, path).toMatchObject({ inLanguage: lang, mainEntityOfPage: canonical, publisher: PUBLISHER })
      expect(article, path).not.toHaveProperty('author')
      covered.add(articleKind)
    }
    if (home) {
      expect(nodeOf('WebSite'), path).toMatchObject({ name: 'AquaTome', url: canonical, inLanguage: lang, publisher: PUBLISHER })
      covered.add('home')
    } else {
      const crumbs = nodeOf('BreadcrumbList')?.itemListElement
      expect(crumbs, path).toBeDefined()
      expect(crumbs.length, path).toBeGreaterThanOrEqual(2)
      expect(crumbs.at(-1).item, path).toBe(canonical)
    }
    if (articleKind === 'cay') expect(article.about?.['@type'], path).toBe('Taxon')
    if (articleKind === 'thuat-ngu') expect(article.about?.['@type'], path).toBe('DefinedTerm')
    if (nodeOf('VideoObject')) {
      expect(article, path).toBeDefined()
      expect(nodeOf('VideoObject'), path).not.toHaveProperty('author')
      covered.add('video')
    }
    expect(JSON.stringify(data), path).not.toContain('"@type":"HowTo"')
  }
  expect([...covered]).toEqual(expect.arrayContaining([...articles, 'home', 'video']))
  const guide = ld(page('/huong-dan/setup-be-thuy-sinh-dau-tien/').html).find(x => x['@type'] === 'Article')
  expect(guide.datePublished).toBe('2026-10-27')
})
