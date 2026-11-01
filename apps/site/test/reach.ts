import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { allPages } from '../e2e/pages'

const ITEM = /^\/(vi\/(ca|cay|huong-dan)|id\/(ikan|tanaman|panduan)|th\/(fish|plants|guides))\/[^/]+\/$/

/**
 * Every species, breed, plant and guide page in a build that no chain of links from the home pages leads to, as a crawler
 * follows them. Their lists link only their first page of cards (the rest are built in the browser), so every item must
 * be linked from somewhere a crawler finds: a numbered page of a list, its group's, genus's or family's page, related
 * species. `items`: how many item pages the build has (to be sure there were some).
 */
export function unreached(dist: string): { items: number; unreached: string[] } {
  const pages = new Set(allPages(dist))
  const html = (p: string) => readFileSync(join(dist, p, 'index.html'), 'utf8')
  const seen = new Set<string>()
  let next = ['/vi/', '/id/', '/th/'].filter(p => pages.has(p))
  while (next.length) {
    for (const p of next) seen.add(p)
    next = [...new Set(next.flatMap(p => [...html(p).matchAll(/<a\b[^>]*?\shref="(\/[^"]*)"/g)].map(m => m[1]!.replace(/[?#].*$/, ''))))]
      .filter(p => pages.has(p) && !seen.has(p))
  }
  // A redirect stub (an old address) is not a page of its own.
  const items = [...pages].filter(p => ITEM.test(p) && !/http-equiv="refresh"/.test(html(p)))
  return { items: items.length, unreached: items.filter(p => !seen.has(p)) }
}
