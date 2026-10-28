import type { SourceId } from '@aq/schema'

export type SourceConfig = {
  id: SourceId
  discover: { kind: 'sitemap'; urls: string[] } | { kind: 'crawl'; start: string[]; scope?: string }
  include: RegExp
  exclude?: RegExp
  contentSelector?: string
  delayMs: number
}

const POLITE = 5000

/** Recon 2026-10-28; include patterns are tuned against live sitemaps (see plan 2 ledger). */
export const SOURCES: SourceConfig[] = [
  { id: 'seriouslyfish', discover: { kind: 'sitemap', urls: ['https://www.seriouslyfish.com/sitemap.xml'] }, include: /seriouslyfish\.com\/(species|articles)\/[a-z0-9-]+\/?$/, exclude: /\/articles\/all\/?$/, contentSelector: 'main', delayMs: POLITE },
  { id: 'planetcatfish', discover: { kind: 'crawl', start: ['https://www.planetcatfish.com/'] }, include: /planetcatfish\.com\/.*species/, delayMs: POLITE },
  { id: 'loachesonline', discover: { kind: 'crawl', start: ['https://www.loaches.com/species-index', 'https://www.loaches.com/articles', 'https://www.loaches.com/care'] }, include: /loaches\.com\/(species-index|articles|care|disease-treatment)\/[a-z0-9-]+/, exclude: /\/species-index\/(photos|photo-search|pictorial-species-search-index|species-index)(\/|$)/, delayMs: POLITE },
  { id: 'glaser', discover: { kind: 'sitemap', urls: ['https://www.aquariumglaser.de/sitemap_index.xml'] }, include: /aquariumglaser\.de\/en\/[a-z0-9-]+\/[a-z0-9-]+/, exclude: /\/(category|tag|page|author)\//, delayMs: POLITE },
  { id: 'bwaquatics', discover: { kind: 'sitemap', urls: ['https://bwaquatics.com/sitemap.xml'] }, include: /bwaquatics\.com\/products\/[a-z0-9-]+$/, exclude: /\/products\/test$/, delayMs: POLITE },
  { id: '2hraquarist', discover: { kind: 'sitemap', urls: ['https://www.2hraquarist.com/sitemap.xml'] }, include: /2hraquarist\.com\/blogs\/[a-z0-9-]+\/[a-z0-9-]+$/, delayMs: POLITE },
  { id: 'aquariumcoop', discover: { kind: 'sitemap', urls: ['https://www.aquariumcoop.com/sitemap.xml'] }, include: /aquariumcoop\.com\/blogs\/aquarium\/[a-z0-9-]+$/, delayMs: POLITE },
  // Spruce: 416xxxx ids are category hubs (dogs, cats, …), not articles.
  { id: 'sprucepets', discover: { kind: 'crawl', start: ['https://www.thesprucepets.com/freshwater-fish-breeds-4162057'], scope: 'main' }, include: /thesprucepets\.com\/[a-z0-9-]+-\d{7,}$/, exclude: /-416\d{4}$/, delayMs: POLITE },
  { id: 'aquariumbreeder', discover: { kind: 'sitemap', urls: ['https://aquariumbreeder.com/sitemap_index.xml'] }, include: /aquariumbreeder\.com\/[a-z0-9-]+\/?$/, exclude: /\/(category|tag|page|author|shop|cart|contact|about|blog)/, delayMs: POLITE },
  { id: 'tropica', discover: { kind: 'crawl', start: ['https://tropica.com/en/plants/'] }, include: /tropica\.com\/en\/plants\/plantdetails\//, delayMs: POLITE },
]

export const sourceById = (id: SourceId): SourceConfig => {
  const s = SOURCES.find(x => x.id === id)
  if (!s) throw new Error(`unknown source ${id}`)
  return s
}
