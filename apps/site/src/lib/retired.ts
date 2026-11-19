import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { retiredTo, type Content } from '@aq/schema'
import { LANGS, localizePath, type Lang } from './i18n'

const PREFIX = { species: 'ca', breeds: 'ca', plants: 'cay', guides: 'huong-dan' } as const

/**
 * Each retired guide's address (@aq/schema retired.ts: off the site for good), in each language it was written in and
 * under each old address it had, → its fish's page (or the guide it names) in that language, or that language's guides
 * list where that page isn't there (none, or held). The guide's files stay, held, so its addresses are read from them.
 */
export async function retiredForwards(content: string, contentOf: (lang: Lang) => Promise<Pick<Content, 'species' | 'breeds' | 'plants' | 'guides'>>): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const dir = join(content, 'guides')
  const ids = existsSync(dir) ? readdirSync(dir).filter(id => retiredTo(id)) : []
  for (const lang of LANGS) {
    const c = await contentOf(lang)
    for (const id of ids) {
      const file = join(dir, id, `${lang}.json`)
      if (!existsSync(file)) continue
      const t = JSON.parse(readFileSync(file, 'utf8')) as { slug: string; redirectFrom?: { slug: string }[] }
      const to = retiredTo(id)!
      const page = to === 'guides' ? undefined : c[to.kind].find(x => x.id === to.id)
      const target = page && to !== 'guides' ? localizePath(lang, `/vi/${PREFIX[to.kind]}/${page.t.slug}/`) : localizePath(lang, '/vi/huong-dan/')
      for (const slug of [t.slug, ...(t.redirectFrom ?? []).map(r => r.slug)]) out[localizePath(lang, `/vi/huong-dan/${slug}/`)] = target
    }
  }
  return out
}
