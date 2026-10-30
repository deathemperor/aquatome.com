import { resolve } from 'node:path'
import { loadAll, type Content } from '@aq/schema'
import { dropHidden, readHidden } from './hidden'
import type { Lang } from './i18n'

const cache = new Map<Lang, Promise<Content>>()

/** Everything with a page in this language (an entity without <lang>.json has none). */
export function getContent(lang: Lang): Promise<Content> {
  let c = cache.get(lang)
  if (!c) {
    c = loadAll({
      root: process.env.CONTENT_ROOT ?? resolve(process.cwd(), '../../content'),
      lang,
      publicBuild: process.env.PUBLIC_BUILD === '1',
    }).then(c => dropHidden(c, readHidden(), lang))
    cache.set(lang, c)
  }
  return c
}
