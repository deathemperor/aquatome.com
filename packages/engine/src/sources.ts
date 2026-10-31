import type { SourceId } from '@aq/schema'

export type SourceConfig = {
  id: SourceId
  discover: { kind: 'sitemap'; urls: string[] } | { kind: 'crawl'; start: string[]; scope?: string } | { kind: 'archive'; prefix: string }
  /** 'archive': read through the Internet Archive's latest copies (the site's own pages sit behind a browser check). */
  via?: 'archive'
  /** The query string names the page (species.php?species_id=12), so it stays in the URL. */
  keepQuery?: boolean
  include: RegExp
  exclude?: RegExp
  contentSelector?: string
  /** Part of the URL that varies between copies of one item (e.g. product formats); stripped to form the dedupe key. */
  dedupe?: RegExp
  /** Photos kept on pages of their own, linked from thumbnails on the species page (URLs matching this). */
  photoPages?: RegExp
  /** Narrowest photo taken from this source (default 600 px). */
  minPhotoWidth?: number
  /** Its species profiles, named "genus-epithet" in the address: a thin species' profile here is fetched first (depth.ts). */
  profiles?: RegExp
  /** Its own search, for a thin species it lists under another name (depth.ts searchThin). */
  search?: (scientificName: string) => string
  delayMs: number
}

const POLITE = 5000
const SCOTCAT_FAMILIES = ['ailiidae', 'akysid', 'amblycip', 'amphill', 'anchar', 'andinich', 'arid', 'aspred', 'astroblep', 'auchenog', 'auch', 'austroglan', 'bagrid', 'callich', 'cetop', 'chaca', 'clariidae', 'clarot', 'cranoglan', 'diplomy', 'dorad', 'heptapt', 'heterop', 'horabag', 'ictal', 'krypto', 'lacant', 'loricar', 'malapt', 'moch', 'nematogen', 'pangas', 'phreat', 'pim', 'plotos', 'pseudopim', 'ritidae', 'schilb', 'scolop', 'silur', 'sisorid', 'trichomy']

/** Recon 2026-10-28; include patterns are tuned against live sitemaps (see plan 2 ledger). */
export const SOURCES: SourceConfig[] = [
  { id: 'seriouslyfish', discover: { kind: 'sitemap', urls: ['https://www.seriouslyfish.com/sitemap.xml'] }, include: /seriouslyfish\.com\/(species|articles)\/[a-z0-9-]+\/?$/, exclude: /\/articles\/all\/?$/, contentSelector: 'main', profiles: /\/species\//, search: n => `https://www.seriouslyfish.com/search?q=${encodeURIComponent(n)}`, delayMs: POLITE },
  // Cloudflare challenges every request (2026-10-29), so the Cat-eLog is read from the Internet Archive's copies.
  { id: 'planetcatfish', discover: { kind: 'archive', prefix: 'planetcatfish.com/common/species.php' }, via: 'archive', keepQuery: true, contentSelector: '#main-page', include: /^https:\/\/www\.planetcatfish\.com\/common\/species\.php\?species_id=\d+$/, delayMs: POLITE },
  { id: 'loachesonline', discover: { kind: 'crawl', start: ['https://www.loaches.com/species-index', 'https://www.loaches.com/articles', 'https://www.loaches.com/care'] }, include: /loaches\.com\/(species-index|articles|care|disease-treatment)\/[a-z0-9-]+/, exclude: /\/species-index\/(photos|photo-search|pictorial-species-search-index|species-index|loach-species-index-front-page)(\/|$)|\/(images|sendto_form|@@[a-z-]+|login_form|search)(\/|$)/, contentSelector: '#content', profiles: /\/species-index\//, delayMs: POLITE },
  { id: 'glaser', discover: { kind: 'sitemap', urls: ['https://www.aquariumglaser.de/sitemap_index.xml'] }, include: /aquariumglaser\.de\/en\/[a-z0-9-]+\/[a-z0-9-]+/, exclude: /\/(category|tag|page|author)\//, delayMs: POLITE },
  { id: 'bwaquatics', discover: { kind: 'sitemap', urls: ['https://bwaquatics.com/sitemap.xml'] }, include: /bwaquatics\.com\/products\/[a-z0-9-]+$/, exclude: /\/products\/test$/, delayMs: POLITE },
  { id: '2hraquarist', discover: { kind: 'sitemap', urls: ['https://www.2hraquarist.com/sitemap.xml'] }, include: /2hraquarist\.com\/blogs\/[a-z0-9-]+\/[a-z0-9-]+$/, delayMs: POLITE },
  { id: 'aquariumcoop', discover: { kind: 'sitemap', urls: ['https://www.aquariumcoop.com/sitemap.xml'] }, include: /aquariumcoop\.com\/blogs\/aquarium\/[a-z0-9-]+$/, delayMs: POLITE },
  // Spruce: 416xxxx ids are category hubs (dogs, cats, …), not articles.
  { id: 'sprucepets', discover: { kind: 'crawl', start: ['https://www.thesprucepets.com/freshwater-fish-breeds-4162057'], scope: 'main' }, include: /thesprucepets\.com\/[a-z0-9-]+-\d{7,}$/, exclude: /-416\d{4}$/, delayMs: POLITE },
  { id: 'aquariumbreeder', discover: { kind: 'sitemap', urls: ['https://aquariumbreeder.com/sitemap_index.xml'] }, include: /aquariumbreeder\.com\/[a-z0-9-]+\/?$/, exclude: /\/(category|tag|page|author|shop|cart|contact|about|blog)/, delayMs: POLITE },
  // Old static site, ~4,000 catfish factsheets listed on one page per family; robots.txt asks 10 s between requests.
  // Each photo (500 px) has its own page with the photographer's credit.
  { id: 'scotcat', discover: { kind: 'crawl', start: SCOTCAT_FAMILIES.map(f => `https://www.scotcat.com/${f}family.htm`) }, include: /^https:\/\/www\.scotcat\.com\/[a-z]+idae\/[a-z0-9_]+\.htm$/, contentSelector: '.top-padding-10', photoPages: /^https:\/\/www\.scotcat\.com\/[a-z]+idae\/[a-z0-9_]+\d\.htm$/, minPhotoWidth: 500, profiles: /scotcat\.com\/[a-z]+idae\//, delayMs: 10_000 },
  { id: 'tropica', discover: { kind: 'crawl', start: ['https://tropica.com/en/plants/'] }, include: /tropica\.com\/en\/plants\/plantdetails\//, dedupe: /\([^)]*\)\/\d+$/, contentSelector: '.content', delayMs: POLITE },
]

export const sourceById = (id: SourceId): SourceConfig => {
  const s = SOURCES.find(x => x.id === id)
  if (!s) throw new Error(`unknown source ${id}`)
  return s
}
