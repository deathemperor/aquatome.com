import { SOURCES, type SourceConfig } from './sources'
import { sourceBlockedSince, sourcesOnArchive } from './state'

/** The Internet Archive's own hosts: research reading a copy there would go round the cycle's pace. */
const ARCHIVE_HOSTS = ['web.archive.org', 'archive.org']

const hostsOf = (s: SourceConfig) => {
  const d = s.discover
  const urls = d.kind === 'sitemap' ? d.urls : d.kind === 'crawl' ? d.start : [`https://${d.prefix}`]
  return urls.map(u => new URL(u).hostname.toLowerCase().replace(/^www\./, ''))
}

/**
 * The hosts web research never reads (the chief of staff, 14 Nov 2026, on the owner's rule: a source that challenges us is
 * read only the way the engine's cycle reads it, at its pace, and nothing goes round that). These are the sources the engine
 * reads only through the Internet Archive, by their config or moved there by the engine itself, and those with a browser
 * check's block on record, waiting for a person. All of them come from the engine's own list, so a new one is covered.
 * Each host is given with and without "www.", plus the Archive's own hosts.
 */
export async function cycleOnlyHosts(root: string): Promise<string[]> {
  const archived = await sourcesOnArchive(root)
  const out = new Set<string>(ARCHIVE_HOSTS)
  for (const s of SOURCES) {
    if (s.via !== 'archive' && !archived.has(s.id) && !(await sourceBlockedSince(root, s.id))) continue
    for (const h of hostsOf(s)) { out.add(h); out.add(`www.${h}`) }
  }
  return [...out].sort()
}
