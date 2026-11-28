import type { ChangelogEntry } from '@aq/schema'
import { localizePath, served, type Lang } from './i18n'

const CONTEXT = 'https://schema.org'
const publisher = (site: URL) => ({
  '@type': 'Organization', name: 'AquaTome', url: new URL('/', site).href, logo: new URL('/favicon.png', site).href,
})

const pageUrl = (site: URL, lang: Lang, path: string) => new URL(localizePath(served(lang, path) ? lang : 'vi', path), site).href

/** The engine's changelog records a new entity, and does not date individual translations. */
export function firstPublished(entries: ChangelogEntry[], lang: Lang, kind: ChangelogEntry['kind'], id: string): string | undefined {
  if (lang !== 'vi') return undefined
  return entries.filter(e => e.kind === kind && e.id === id && e.action === 'new' && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
    .map(e => e.date).sort()[0]
}

type Article = {
  headline: string
  alternativeHeadline?: string
  datePublished?: string
  dateModified?: string
  image?: string
  description?: string
  about?: object
  citation?: string[]
}

export function articleLd(site: URL, lang: Lang, path: string, { dateModified, datePublished, ...article }: Article) {
  const published = datePublished && (!dateModified || datePublished <= dateModified) ? datePublished : undefined
  return {
    '@context': CONTEXT, '@type': 'Article', ...article, datePublished: published, dateModified,
    inLanguage: lang, mainEntityOfPage: pageUrl(site, lang, path), publisher: publisher(site),
  }
}

export const taxonLd = (scientificName: string, commonName: string, alt: string[]) => ({
  '@type': 'Taxon', name: scientificName, taxonRank: 'species', alternateName: [commonName, ...alt],
})

export function websiteLd(site: URL, lang: Lang, path: string) {
  return { '@context': CONTEXT, '@type': 'WebSite', name: 'AquaTome', url: pageUrl(site, lang, path), inLanguage: lang, publisher: publisher(site) }
}

export function breadcrumbLd(site: URL, lang: Lang, trail: readonly (readonly [path: string, name: string])[]) {
  return {
    '@context': CONTEXT, '@type': 'BreadcrumbList',
    itemListElement: trail.map(([path, name], i) => ({ '@type': 'ListItem', position: i + 1, name, item: pageUrl(site, lang, path) })),
  }
}
