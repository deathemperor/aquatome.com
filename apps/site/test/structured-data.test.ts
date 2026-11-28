import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ChangelogEntry } from '@aq/schema'
import { expect, test } from 'vitest'
import { getContent } from '../src/lib/content'
import { langOf, localizePath } from '../src/lib/i18n'
import { OFF_LIST_GROUPS } from '../src/lib/format'
import { lastChanged, pageDateFiles } from '../src/lib/page-dates'
import { articleLd, breadcrumbLd, firstPublished } from '../src/lib/structured-data'
import { DIST, page, sitemapText } from './dist'

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
  expect(articleLd(SITE, 'vi', '/', { headline: 'Guide', datePublished, dateModified: '2026-11-19' }))
    .toMatchObject({ datePublished: undefined, dateModified: '2026-11-19' })
})

test('the Article uses the last change to its entity, its own translation or its Vietnamese summary', () => {
  const dates = {
    'species/x/entity.json': '2026-11-19 000000000001',
    'species/x/th.json': '2026-11-20 000000000002',
    'species/x/vi.json': '2026-11-21 000000000003',
    'summaries/x.json': '2026-11-22 000000000004',
  }
  const date = (lang: 'vi' | 'th' | 'id') => lastChanged(dates, pageDateFiles('species', 'x', lang))
  expect(date('vi')).toBe('2026-11-22')
  expect(date('th')).toBe('2026-11-20')
  expect(date('id')).toBe('2026-11-19')
  expect(lastChanged(dates, pageDateFiles('guides', 'x', 'vi'))).toBeUndefined()
})

test('breadcrumbs keep their order, use local addresses and fall back to an existing hub', () => {
  const trail = breadcrumbLd(SITE, 'th', [['/vi/video/', 'Video'], ['/vi/huong-dan/a/', 'Guide']])
  expect(trail.itemListElement.map(x => [x.position, x.item])).toEqual([
    [1, 'https://aquatome.com/video/'], [2, 'https://aquatome.com/th/guides/a/'],
  ])
})

const ld = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m => JSON.parse(m[1]!))

test('every supported built page has the expected structured data in its own language', async () => {
  const covered = new Set<string>()
  const datedLocales = new Set<string>()
  const lastmod = new Map([...sitemapText().matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)]
    .map(([, url, date]) => [new URL(url!).pathname, date]))
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
    const html = readFileSync(join(DIST, file), 'utf8')
    const data = ld(html)
    if (articleKind === 'nhom' && OFF_LIST_GROUPS.includes(path.slice(section('nhom').length, -1))) {
      expect(data, path).toHaveLength(0)
      continue
    }
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
    expect(canonical, path).toBeDefined()
    const site = new URL(canonical!)
    expect(site.pathname, path).toBe(path)
    const publisher = { ...PUBLISHER, url: new URL('/', site).href, logo: new URL('/favicon.png', site).href }
    const nodeOf = (kind: string) => data.find(x => x['@type'] === kind)
    const article = nodeOf('Article')
    if (articleKind) {
      expect(article, path).toMatchObject({ inLanguage: lang, mainEntityOfPage: canonical, publisher })
      expect(article, path).not.toHaveProperty('author')
      if (lastmod.has(path)) {
        expect(article.dateModified, path).toBe(lastmod.get(path))
        if (lastmod.get(path)) datedLocales.add(lang)
      }
      covered.add(articleKind)
    }
    if (home) {
      expect(nodeOf('WebSite'), path).toMatchObject({ name: 'AquaTome', url: canonical, inLanguage: lang, publisher })
      covered.add('home')
    } else {
      const crumbs = nodeOf('BreadcrumbList')?.itemListElement
      expect(crumbs, path).toBeDefined()
      expect(crumbs.length, path).toBeGreaterThanOrEqual(2)
      expect(crumbs.at(-1).item, path).toBe(canonical)
    }
    if (articleKind === 'cay') expect(article.about?.['@type'], path).toBe('Taxon')
    if (articleKind === 'thuat-ngu') expect(article.about?.['@type'], path).toBe('DefinedTerm')
    const videoObject = nodeOf('VideoObject')
    if (videoObject) {
      expect(article, path).toBeDefined()
      const slug = path.slice(section('huong-dan').length, -1)
      const video = (await getContent(lang)).guides.find(guide => guide.t.slug === slug)?.video
      expect(video, path).toBeDefined()
      expect(videoObject.author, path).toEqual({ '@type': 'Person', name: video!.channel, url: video!.channelUrl })
      covered.add('video')
    }
    expect(JSON.stringify(data), path).not.toContain('"@type":"HowTo"')
  }
  expect([...datedLocales]).toEqual(expect.arrayContaining(['vi', 'ms']))
  expect([...covered]).toEqual(expect.arrayContaining([...articles, 'home', 'video']))
  const guide = ld(page('/huong-dan/setup-be-thuy-sinh-dau-tien/').html).find(x => x['@type'] === 'Article')
  expect(guide.datePublished).toBe('2026-10-27')
})
