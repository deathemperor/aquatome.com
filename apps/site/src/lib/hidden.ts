import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Content } from '@aq/schema'

/** Paths hidden from the /_ab/ dashboard, fetched by deploy.sh into .hidden.json; none when the file is absent. */
export function readHidden(file = process.env.HIDDEN_FILE ?? resolve(process.cwd(), '.hidden.json')): Set<string> {
  return existsSync(file) ? new Set(Object.keys(JSON.parse(readFileSync(file, 'utf8')))) : new Set()
}

/** Drop hidden pages from the content, so every list, the sitemap, search and index.md follow. */
export function dropHidden(c: Content, hidden: Set<string>): Content {
  if (!hidden.size) return c
  const keep = (prefix: string) => (x: { t: { slug: string } }) => !hidden.has(`/vi/${prefix}/${x.t.slug}/`)
  return { ...c, species: c.species.filter(keep('ca')), breeds: c.breeds.filter(keep('ca')), plants: c.plants.filter(keep('cay')), guides: c.guides.filter(keep('huong-dan')), glossary: c.glossary.filter(keep('thuat-ngu')) }
}
