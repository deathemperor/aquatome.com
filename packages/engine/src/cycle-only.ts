import { SOURCES, type SourceConfig } from './sources'
import { sourceBlockedSince, sourcesOnArchive } from './state'

/**
 * Hosts that hold other copies of any page, each a way round the cycle's pace (the Writing Lead, 14 Nov 2026): the Internet
 * Archive's, archive.today's names, Google's cache and a reader proxy. A WebFetch domain rule matches one host only, so each
 * is listed.
 */
const COPY_HOSTS = [
  'web.archive.org', 'wayback.archive.org', 'archive.org',
  'archive.ph', 'archive.is', 'archive.today', 'archive.li', 'archive.md', 'archive.vn',
  'webcache.googleusercontent.com',
  'r.jina.ai',
]

/** Every host a source's pages stand on: its discovery addresses' and those its address pattern names, bare. */
function hostsOf(s: SourceConfig): string[] {
  const d = s.discover
  const urls = d.kind === 'sitemap' ? d.urls : d.kind === 'crawl' ? d.start : [`https://${d.prefix}`]
  // A host starts the pattern or follows "//": "species.php" further on is a path.
  const named = [...s.include.source.matchAll(/(?:^\^?|\\\/\\\/)((?:[a-z0-9-]+\\\.)+[a-z]{2,})/gi)].map(m => m[1]!.replace(/\\\./g, '.'))
  return [...new Set([...urls.map(u => new URL(u).hostname), ...named].map(h => h.toLowerCase().replace(/^www\./, '')))]
}

/** Google Translate's proxy host for a host: "www.the-site.com" is read through "www-the--site-com.translate.goog". */
const translateProxy = (host: string) => `${host.replace(/-/g, '--').replace(/\./g, '-')}.translate.goog`

/**
 * The hosts web research never reads (the chief of staff, 14 Nov 2026, on the owner's rule: a source that challenges us is
 * read only the way the engine's cycle reads it, at its pace, and nothing goes round that). These are the sources the engine
 * reads only through the Internet Archive, by their config or moved there by the engine itself, and those with a browser
 * check's block on record (`blockedAt`, cleared by the next good run, so a source the owner has cleared comes back), all
 * from the engine's own list, so a new one is covered. Each host is given bare, with "www." and through Google Translate's
 * proxy, plus the hosts that hold other copies of any page.
 */
export async function cycleOnlyHosts(root: string): Promise<string[]> {
  const archived = await sourcesOnArchive(root)
  const out = new Set<string>(COPY_HOSTS)
  for (const s of SOURCES) {
    if (s.via !== 'archive' && !archived.has(s.id) && !(await sourceBlockedSince(root, s.id))) continue
    for (const h of hostsOf(s)) for (const x of [h, `www.${h}`]) { out.add(x); out.add(translateProxy(x)) }
  }
  return [...out].sort()
}
