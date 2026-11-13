import type { SourceId } from '@aq/schema'
import { ARCHIVE_POLITE } from './archive'

export type SourceConfig = {
  id: SourceId
  /**
   * What kind of site it is, for whose word counts on where a species lives (range.ts): `specialist`, a species database
   * or a scientific or aquarium-specialist site (an aquarium shop, importer or breeder's site included); `general`, a
   * general pet-care site, whose countries count only for a species no specialist source covers.
   */
  tier: 'specialist' | 'general'
  /**
   * A shop's or importer's own pages (its products, its stock news): a block that speaks as the shop or sells stays off
   * species and plant pages (species-sources.ts shopTalk).
   */
  shop?: true
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
  /** Its photos come from a step of their own (Tropica: tropica-photos.ts), so reading its pages neither takes nor drops any. */
  photoStep?: true
  /** Width of its "read next" card images: a guide's unplaced photo this wide or narrower is a card, not the article's (sweep.ts). */
  cardWidth?: number
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
  { id: 'seriouslyfish', tier: 'specialist', discover: { kind: 'sitemap', urls: ['https://www.seriouslyfish.com/sitemap.xml'] }, include: /seriouslyfish\.com\/(species|articles)\/[a-z0-9-]+\/?$/, exclude: /\/articles\/all\/?$/, contentSelector: 'main', profiles: /\/species\//, search: n => `https://www.seriouslyfish.com/search?q=${encodeURIComponent(n)}`, delayMs: POLITE },
  // Cloudflare challenges every request (2026-10-29), so the Cat-eLog is read from the Internet Archive's copies.
  { id: 'planetcatfish', tier: 'specialist', discover: { kind: 'archive', prefix: 'planetcatfish.com/common/species.php' }, via: 'archive', keepQuery: true, contentSelector: '#main-page', include: /^https:\/\/www\.planetcatfish\.com\/common\/species\.php\?species_id=\d+$/, delayMs: ARCHIVE_POLITE },
  { id: 'loachesonline', tier: 'specialist', discover: { kind: 'crawl', start: ['https://www.loaches.com/species-index', 'https://www.loaches.com/articles', 'https://www.loaches.com/care'] }, include: /loaches\.com\/(species-index|articles|care|disease-treatment)\/[a-z0-9-]+/, exclude: /\/species-index\/(photos|photo-search|pictorial-species-search-index|species-index|loach-species-index-front-page)(\/|$)|\/(images|sendto_form|@@[a-z-]+|login_form|search)(\/|$)/, contentSelector: '#content', profiles: /\/species-index\//, delayMs: POLITE },
  { id: 'glaser', tier: 'specialist', shop: true, discover: { kind: 'sitemap', urls: ['https://www.aquariumglaser.de/sitemap_index.xml'] }, include: /aquariumglaser\.de\/en\/[a-z0-9-]+\/[a-z0-9-]+/, exclude: /\/(category|tag|page|author)\//, delayMs: POLITE },
  { id: 'bwaquatics', tier: 'specialist', shop: true, discover: { kind: 'sitemap', urls: ['https://bwaquatics.com/sitemap.xml'] }, include: /bwaquatics\.com\/products\/[a-z0-9-]+$/, exclude: /\/products\/test$/, delayMs: POLITE },
  // Cloudflare challenges the engine's browser on every request (2026-10-29 on), so its articles are read from the Internet Archive's copies.
  { id: '2hraquarist', tier: 'specialist', discover: { kind: 'archive', prefix: '2hraquarist.com/blogs/' }, via: 'archive', include: /^https:\/\/www\.2hraquarist\.com\/blogs\/[a-z0-9-]+\/[a-z0-9-]+$/, delayMs: ARCHIVE_POLITE },
  { id: 'aquariumcoop', tier: 'specialist', discover: { kind: 'sitemap', urls: ['https://www.aquariumcoop.com/sitemap.xml'] }, include: /aquariumcoop\.com\/blogs\/aquarium\/[a-z0-9-]+$/, delayMs: POLITE },
  // Spruce: 416xxxx ids are category hubs (dogs, cats, …), not articles.
  // Cloudflare's browser check doesn't clear, for the engine or for a person (the owner, 2026-11-10), so its articles are read from the Internet Archive's copies.
  { id: 'sprucepets', tier: 'general', discover: { kind: 'crawl', start: ['https://www.thesprucepets.com/freshwater-fish-breeds-4162057'], scope: 'main' }, via: 'archive', include: /thesprucepets\.com\/[a-z0-9-]+-\d{7,}$/, exclude: /-416\d{4}$/, cardWidth: 600, delayMs: ARCHIVE_POLITE },
  { id: 'aquariumbreeder', tier: 'specialist', discover: { kind: 'sitemap', urls: ['https://aquariumbreeder.com/sitemap_index.xml'] }, include: /aquariumbreeder\.com\/[a-z0-9-]+\/?$/, exclude: /\/(category|tag|page|author|shop|cart|contact|about|blog)/, delayMs: POLITE },
  // Old static site, ~4,000 catfish factsheets listed on one page per family; robots.txt asks 10 s between requests.
  // Each photo (500 px) has its own page with the photographer's credit.
  { id: 'scotcat', tier: 'specialist', discover: { kind: 'crawl', start: SCOTCAT_FAMILIES.map(f => `https://www.scotcat.com/${f}family.htm`) }, include: /^https:\/\/www\.scotcat\.com\/[a-z]+idae\/[a-z0-9_]+\.htm$/, contentSelector: '.top-padding-10', photoPages: /^https:\/\/www\.scotcat\.com\/[a-z]+idae\/[a-z0-9_]+\d\.htm$/, minPhotoWidth: 500, profiles: /scotcat\.com\/[a-z]+idae\//, delayMs: 10_000 },
  { id: 'tropica', tier: 'specialist', discover: { kind: 'crawl', start: ['https://tropica.com/en/plants/'] }, include: /tropica\.com\/en\/plants\/plantdetails\//, dedupe: /\([^)]*\)\/\d+$/, contentSelector: '.content', photoStep: true, delayMs: POLITE },
]

export const sourceById = (id: SourceId): SourceConfig => {
  const s = SOURCES.find(x => x.id === id)
  if (!s) throw new Error(`unknown source ${id}`)
  return s
}
