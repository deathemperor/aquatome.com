import type { SourceConfig } from './sources'

export type Discovered = { url: string; lastmod?: string }

const tag = (block: string, name: string) => block.match(new RegExp(`<${name}>\\s*(?:<!\\[CDATA\\[)?([^<\\]]+)`, 'i'))?.[1]?.trim()

export function parseSitemap(xml: string): { urls: { loc: string; lastmod?: string }[]; sitemaps: string[] } {
  const blocks = (name: string) => [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'gi'))].map(m => m[1]!)
  const sitemaps = blocks('sitemap').map(b => tag(b, 'loc')).filter((x): x is string => !!x)
  const urls = blocks('url').flatMap(b => {
    const loc = tag(b, 'loc')
    const lastmod = tag(b, 'lastmod')
    return loc ? [lastmod ? { loc, lastmod } : { loc }] : []
  })
  return { urls, sitemaps }
}

const canonical = (u: string) => {
  const x = new URL(u.replace(/&amp;/g, '&'))
  x.hash = ''
  x.search = ''
  return x.href
}

export async function discover(
  src: SourceConfig,
  getText: (url: string) => Promise<string>,
  getLinks: (url: string) => Promise<string[]>,
): Promise<Discovered[]> {
  const found = new Map<string, Discovered>()
  const keep = (url: string, lastmod?: string) => {
    let u: string
    try { u = canonical(url) } catch { return }
    if (!src.include.test(u) || src.exclude?.test(u)) return
    const prev = found.get(u)
    if (!prev || (lastmod && (!prev.lastmod || lastmod > prev.lastmod))) found.set(u, lastmod ? { url: u, lastmod } : { url: u })
  }
  if (src.discover.kind === 'sitemap') {
    const walk = async (url: string, depth: number): Promise<void> => {
      const { urls, sitemaps } = parseSitemap(await getText(url))
      for (const u of urls) keep(u.loc, u.lastmod)
      if (depth < 2) for (const s of sitemaps) await walk(s, depth + 1)
    }
    for (const u of src.discover.urls) await walk(u, 0)
  } else {
    for (const start of src.discover.start) for (const l of await getLinks(start)) keep(l)
  }
  return [...found.values()]
}
